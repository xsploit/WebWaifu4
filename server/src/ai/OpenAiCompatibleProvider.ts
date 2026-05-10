import type { ChatProvider, ChatProviderRequest, ChatProviderResponse } from './ChatProvider.js';

export type OpenAiCompatibleProviderOptions = {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export class OpenAiCompatibleProvider implements ChatProvider {
  constructor(private readonly options: OpenAiCompatibleProviderOptions) {}

  getModel() {
    return this.options.model;
  }

  setModel(model: string) {
    const nextModel = model.trim();
    if (nextModel) {
      this.options.model = nextModel;
    }
  }

  async complete(request: ChatProviderRequest): Promise<ChatProviderResponse> {
    const baseUrl = this.options.apiBaseUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: request.messages,
        max_tokens: request.maxTokens ?? this.options.maxTokens,
        temperature: request.temperature ?? this.options.temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI provider failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('AI provider returned an empty response.');
    }

    return { text };
  }
}
