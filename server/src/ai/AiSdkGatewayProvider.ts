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
  provider: 'openrouter-responses' | 'vercel-gateway';
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

function appendSystemInstruction(messages: ModelMessage[], instruction: string): ModelMessage[] {
  const trimmed = instruction.trim();
  if (!trimmed) {
    return messages;
  }

  const firstSystemIndex = messages.findIndex((message) => message.role === 'system');
  if (firstSystemIndex === -1) {
    return [{ role: 'system', content: trimmed }, ...messages];
  }

  return messages.map((message, index) =>
    index === firstSystemIndex && message.role === 'system'
      ? { ...message, content: `${message.content}\n\n${trimmed}` }
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

function responseFormatHasMessageField(request: ChatProviderRequest) {
  return (
    request.stateScope !== 'memory' &&
    request.responseFormat?.type === 'json_schema' &&
    request.responseFormat.schema.type === 'object' &&
    Object.prototype.hasOwnProperty.call(request.responseFormat.schema.properties, 'message')
  );
}

function buildStructuredJsonTextInstruction(request: ChatProviderRequest) {
  if (!responseFormatHasMessageField(request) || request.responseFormat?.type !== 'json_schema') {
    return '';
  }

  return [
    'The active reply format is strict JSON.',
    'Return exactly one complete JSON object matching the schema and nothing else.',
    'Do not use markdown, code fences, XML tags, hidden blocks, commentary, or partial fragments.',
    'Put all spoken dialogue in the message field.',
    `Use this exact JSON schema: ${JSON.stringify(request.responseFormat.schema)}`,
  ].join('\n');
}

function isOpenAiGpt5Model(model: string) {
  const normalized = model.trim().toLowerCase();
  const provider = normalized.includes('/') ? normalized.split('/')[0] : 'openai';
  const leaf = (normalized.split('/').pop() ?? normalized).replace(/[_ .]+/g, '-');
  return provider === 'openai' && leaf.startsWith('gpt-5');
}

function createProviderOptions(options: AiSdkGatewayProviderOptions): Record<string, any> | undefined {
  const providerOptions: Record<string, any> = {};
  if (isOpenAiGpt5Model(options.model)) {
    providerOptions.openai = {
      reasoningEffort: 'minimal',
      reasoningSummary: 'auto',
    };
  }

  const gatewayOptions: GatewayProviderOptions = {};
  if (options.byokOpenAiApiKey?.trim()) {
    gatewayOptions.byok = {
      openai: [{ apiKey: options.byokOpenAiApiKey.trim() }],
    };
  }
  if (Object.keys(gatewayOptions).length > 0) {
    providerOptions.gateway = gatewayOptions;
  }

  return Object.keys(providerOptions).length > 0 ? providerOptions : undefined;
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getPartialMessage(value: unknown) {
  if (!value || typeof value !== 'object') {
    return '';
  }
  const message = (value as Record<string, unknown>)['message'];
  return typeof message === 'string' ? message : '';
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
    const structuredTextStream = responseFormatHasMessageField(request);
    const structuredOutput = createStructuredOutput(request);
    let structuredOutputFallbackError: string | null = null;
    let messages = toAiSdkMessages(request, toolsAvailable);
    messages = appendSystemInstruction(messages, buildStructuredJsonTextInstruction(request));
    const result = streamText({
      abortSignal: request.signal,
      allowSystemInMessages: true,
      maxOutputTokens: request.maxTokens ?? this.options.maxTokens,
      messages,
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
      providerOptions: createProviderOptions({ ...this.options, model: this.model }),
      stopWhen: stepCountIs(normalizeMaxToolRounds(request.maxToolRounds)),
      temperature: request.temperature ?? this.options.temperature,
      toolChoice: toolsAvailable && request.toolChoiceMode === 'required' ? 'required' : 'auto',
      tools,
    });
    let structuredStreamedMessageLength = 0;
    let structuredStreamError: string | null = null;
    const structuredMessageStreamDone =
      structuredTextStream && structuredOutput
        ? (async () => {
            let previousMessage = '';
            for await (const partial of result.partialOutputStream as AsyncIterable<unknown>) {
              const nextMessage = getPartialMessage(partial);
              if (!nextMessage || nextMessage.length <= previousMessage.length) {
                continue;
              }
              if (!nextMessage.startsWith(previousMessage)) {
                previousMessage = nextMessage;
                continue;
              }
              const delta = nextMessage.slice(previousMessage.length);
              previousMessage = nextMessage;
              structuredStreamedMessageLength += delta.length;
              handlers.onTextDelta?.(delta);
            }
          })().catch((error) => {
            structuredStreamError = getErrorMessage(error);
          })
        : null;

    let text: string;
    if (structuredOutput) {
      try {
        text = JSON.stringify(await result.output);
      } catch (error) {
        structuredOutputFallbackError = getErrorMessage(error);
        text = (await result.text).trim();
      }
    } else {
      text = (await result.text).trim();
    }
    if (structuredMessageStreamDone) {
      await structuredMessageStreamDone;
      if (structuredStreamError) {
        throw new Error(structuredStreamError);
      }
      if (structuredStreamedMessageLength === 0) {
        throw new Error('Structured reply did not stream message text.');
      }
    }
    if (!text) {
      throw new Error(structuredOutputFallbackError || 'AI Gateway returned an empty response.');
    }

    return {
      meta: {
        provider: this.options.provider,
        toolNames: toolsAvailable ? TAVILY_OPENAI_TOOLS.map((item) => item.name) : [],
        toolsAvailable,
        toolsUsed,
        transport: 'http-stream',
        ...(structuredOutputFallbackError
          ? {
              structuredOutputFallback: true,
              structuredOutputFallbackError,
            }
          : {}),
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
    return createGateway({ apiKey: this.options.apiKey })(this.model);
  }
}
