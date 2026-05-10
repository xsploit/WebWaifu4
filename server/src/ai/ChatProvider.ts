import type { TwitchChatMessage } from '../twitch/TwitchChatSource.js';

export type ChatProviderMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatProviderRequest = {
  mode: 'direct' | 'batch';
  activeChatters: number;
  messages: ChatProviderMessage[];
  sourceMessages: TwitchChatMessage[];
  disableState?: boolean;
  responseFormat?: {
    type: 'json_object';
  };
  stateKey?: string;
  stateScope?: 'chat' | 'memory';
  target?: TwitchChatMessage;
  maxTokens?: number;
  temperature?: number;
};

export type ChatProviderResponse = {
  text: string;
  meta?: Record<string, unknown>;
};

export type ChatProviderStreamHandlers = {
  onTextDelta?: (delta: string) => void;
};

export interface ChatProvider {
  complete(request: ChatProviderRequest): Promise<ChatProviderResponse>;
  completeStream?(
    request: ChatProviderRequest,
    handlers?: ChatProviderStreamHandlers,
  ): Promise<ChatProviderResponse>;
  getModel?(): string;
  setModel?(model: string): void;
  getState?(): Record<string, unknown>;
  resetState?(): void;
}
