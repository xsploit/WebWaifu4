import type { ChatProvider, ChatProviderRequest, ChatProviderResponse } from './ChatProvider.js';

function compact(text: string, maxLength = 120) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}...`;
}

export class MockChatProvider implements ChatProvider {
  private model = 'mock';

  getModel() {
    return this.model;
  }

  setModel(model: string) {
    this.model = model.trim() || 'mock';
  }

  async complete(request: ChatProviderRequest): Promise<ChatProviderResponse> {
    if (request.mode === 'direct' && request.target) {
      return {
        text: `@${request.target.displayName} I heard you. ${compact(request.target.text, 80)}`,
      };
    }

    const strongest = request.sourceMessages.find((message) => message.text.trim().length > 0);
    return {
      text: strongest
        ? `Chat, I see the topic. ${compact(strongest.text, 90)}`
        : 'Chat, I am here and watching.',
    };
  }
}
