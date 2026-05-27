import {
  jsonSchema,
  Output as aiOutput,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { createGateway, type GatewayProviderOptions } from '@ai-sdk/gateway';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { ChatProvider, ChatProviderRequest, ChatProviderResponse } from './ChatProvider.js';
import {
  TAVILY_OPENAI_TOOLS,
  buildTavilyToolInstruction,
  runTavilyToolCall,
  type TavilyToolOptions,
} from './TavilyTools.js';

export type AiSdkGatewayProviderOptions = {
  apiKey: string;
  apiBaseUrl?: string;
  byokOpenAiApiKey?: string;
  maxTokens: number;
  model: string;
  provider: 'openai-responses' | 'openrouter-responses' | 'vercel-gateway';
  tavilyTools?: TavilyToolOptions;
  temperature: number;
};

function normalizeMaxToolRounds(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 15;
  }
  return Math.max(1, Math.min(30, Math.round(parsed)));
}

function toAiSdkMessages(request: ChatProviderRequest, toolsAvailable: boolean): ModelMessage[] {
  const messages = request.messages.map((message): ModelMessage => {
    if (message.role === 'user' && message.images?.length) {
      return {
        role: 'user',
        content: [
          { type: 'text', text: message.content },
          ...message.images.map((image) => ({
            type: 'image' as const,
            image: image.imageUrl,
            providerOptions: image.detail ? { openai: { imageDetail: image.detail } } : undefined,
          })),
        ],
      };
    }
    return {
      role: message.role,
      content: message.content,
    };
  });

  if (!toolsAvailable) {
    return messages;
  }

  const firstSystemIndex = messages.findIndex((message) => message.role === 'system');
  if (firstSystemIndex === -1) {
    return [{ role: 'system', content: buildTavilyToolInstruction() }, ...messages];
  }

  return messages.map((message, index) =>
    index === firstSystemIndex && message.role === 'system'
      ? { ...message, content: `${message.content}\n\n${buildTavilyToolInstruction()}` }
      : message,
  );
}

function createTavilyToolSet(options?: TavilyToolOptions): ToolSet | undefined {
  if (!options) {
    return undefined;
  }

  return Object.fromEntries(
    TAVILY_OPENAI_TOOLS.map((definition) => [
      definition.name,
      tool({
        description: definition.description,
        inputSchema: jsonSchema(definition.parameters),
        execute: async (input) =>
          runTavilyToolCall(options, {
            arguments: JSON.stringify(input ?? {}),
            name: definition.name,
            type: 'function',
          }),
      }),
    ]),
  ) as ToolSet;
}

function createGatewayProviderOptions(options: AiSdkGatewayProviderOptions): Record<string, any> | undefined {
  const gatewayOptions: GatewayProviderOptions = {};
  if (options.byokOpenAiApiKey?.trim()) {
    gatewayOptions.byok = {
      openai: [{ apiKey: options.byokOpenAiApiKey.trim() }],
    };
  }
  return Object.keys(gatewayOptions).length > 0 ? { gateway: gatewayOptions } : undefined;
}

function createStructuredOutput(request: ChatProviderRequest) {
  if (request.responseFormat?.type === 'json_schema') {
    return aiOutput.object({
      name: request.responseFormat.name,
      schema: jsonSchema(request.responseFormat.schema),
    });
  }
  if (request.responseFormat?.type === 'json_object') {
    return aiOutput.json();
  }
  return undefined;
}

export class AiSdkGatewayProvider implements ChatProvider {
  private model: string;

  constructor(private readonly options: AiSdkGatewayProviderOptions) {
    this.model = options.model;
  }

  getModel() {
    return this.model;
  }

  setModel(model: string) {
    this.model = model;
  }

  getState() {
    return {
      provider: this.options.provider,
      transport: 'http-stream',
      websocketConfigured: false,
      websocketConnected: false,
      websocketLifecycle: 'disabled',
      websocketStatus: 'disabled',
      stateMode: 'stateless',
      model: this.model,
    };
  }

  async complete(request: ChatProviderRequest): Promise<ChatProviderResponse> {
    return this.completeStream(request);
  }

  async completeStream(
    request: ChatProviderRequest,
    handlers: { onTextDelta?: (delta: string) => void } = {},
  ): Promise<ChatProviderResponse> {
    const toolsAvailable = request.stateScope !== 'memory' && Boolean(this.options.tavilyTools);
    const tools = createTavilyToolSet(toolsAvailable ? this.options.tavilyTools : undefined);
    const toolsUsed: string[] = [];
    const model = this.createModel();
    const structuredOutput = createStructuredOutput(request);
    const result = streamText({
      abortSignal: request.signal,
      allowSystemInMessages: true,
      maxOutputTokens: request.maxTokens ?? this.options.maxTokens,
      messages: toAiSdkMessages(request, toolsAvailable),
      model,
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta') {
          handlers.onTextDelta?.(chunk.text);
        }
      },
      output: structuredOutput,
      experimental_onToolCallStart: ({ toolCall }) => {
        toolsUsed.push(toolCall.toolName);
      },
      providerOptions: createGatewayProviderOptions(this.options),
      stopWhen: stepCountIs(normalizeMaxToolRounds(request.maxToolRounds)),
      temperature: request.temperature ?? this.options.temperature,
      toolChoice: request.toolChoiceMode === 'required' ? 'required' : 'auto',
      tools,
    });

    const text = structuredOutput
      ? JSON.stringify(await result.output)
      : (await result.text).trim();
    if (!text) {
      throw new Error('AI Gateway returned an empty response.');
    }

    return {
      meta: {
        provider: this.options.provider,
        toolNames: toolsAvailable ? TAVILY_OPENAI_TOOLS.map((item) => item.name) : [],
        toolsAvailable,
        toolsUsed,
        transport: 'http-stream',
      },
      text,
    };
  }

  private createModel() {
    if (this.options.provider === 'vercel-gateway') {
      return createGateway({ apiKey: this.options.apiKey })(this.model);
    }
    if (this.options.provider === 'openrouter-responses') {
      return createOpenRouter({
        apiKey: this.options.apiKey,
        ...(this.options.apiBaseUrl ? { baseURL: this.options.apiBaseUrl } : {}),
        ...(this.options.byokOpenAiApiKey?.trim()
          ? { api_keys: { openai: this.options.byokOpenAiApiKey.trim() } }
          : {}),
      })(this.model);
    }
    const openai = createOpenAI({
      apiKey: this.options.apiKey,
      ...(this.options.apiBaseUrl ? { baseURL: this.options.apiBaseUrl } : {}),
    });
    return openai.responses(this.model);
  }
}
