import type {
  ChatMessage,
  PersonaProfile,
  RelationshipMemory,
  RuntimeContextSnapshot,
} from './types';

type CompletionMessage = {
  role: string;
  content: string;
};

type BuildChatCompletionMessagesOptions = {
  history: ChatMessage[];
  includeHostContext: boolean;
  maxHistoryMessages?: number;
  persona: PersonaProfile | null;
  relationshipMemory: RelationshipMemory;
  runtimeContext: RuntimeContextSnapshot;
};

function serializeContextSection(label: string, values: Record<string, string>) {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return null;
  }

  return `${label}: ${JSON.stringify(Object.fromEntries(entries))}`;
}

export function trimChatHistory(history: ChatMessage[], limit = 36) {
  return history.slice(-limit);
}

export function buildChatCompletionMessages({
  history,
  includeHostContext,
  maxHistoryMessages = 12,
  persona,
  relationshipMemory,
  runtimeContext,
}: BuildChatCompletionMessagesOptions): CompletionMessage[] {
  const messages: CompletionMessage[] = [];
  const personaBlocks: string[] = [];

  if (persona) {
    personaBlocks.push(`You are ${persona.name}. Stay in character and reply naturally.`);

    if (persona.description.trim()) {
      personaBlocks.push(`Character description: ${persona.description.trim()}`);
    }

    if (persona.systemPrompt.trim()) {
      personaBlocks.push(persona.systemPrompt.trim());
    }

    if (persona.userNickname.trim()) {
      personaBlocks.push(
        `The user prefers to be called "${persona.userNickname.trim()}". Use that naturally when it fits.`,
      );
    }
  }

  if (personaBlocks.length > 0) {
    messages.push({
      role: 'system',
      content: personaBlocks.join('\n\n'),
    });
  }

  if (includeHostContext) {
    const contextBlocks = [
      serializeContextSection('launchParams', runtimeContext.launchParams),
      serializeContextSection('shareParams', runtimeContext.shareParams),
      serializeContextSection('notificationParams', runtimeContext.notificationParams),
    ].filter((value): value is string => Boolean(value));

    if (contextBlocks.length > 0) {
      messages.push({
        role: 'system',
        content: `Current RUN.game host context:\n${contextBlocks.join('\n')}`,
      });
    }
  }

  if (
    relationshipMemory.turnCount > 0
    || relationshipMemory.summary
    || relationshipMemory.facts.length > 0
    || relationshipMemory.diaryEntry
  ) {
    const memoryBlocks = [
      `Relationship stage: ${relationshipMemory.relationshipStage}`,
      `Total prior turns: ${relationshipMemory.turnCount}`,
      `Current mood: ${relationshipMemory.mood}`,
      `Relationship stats: ${JSON.stringify({
        trust: relationshipMemory.trust,
        attraction: relationshipMemory.attraction,
        respect: relationshipMemory.respect,
        irritation: relationshipMemory.irritation,
        jealousy: relationshipMemory.jealousy,
        guard: relationshipMemory.guard,
      })}`,
      `Last classified action: ${relationshipMemory.lastActionTag}`,
      relationshipMemory.diaryEntry
        ? `Latest private diary note: ${relationshipMemory.diaryEntry}`
        : null,
      relationshipMemory.summary ? `Memory summary: ${relationshipMemory.summary}` : null,
      relationshipMemory.facts.length > 0
        ? `Known user facts: ${JSON.stringify(relationshipMemory.facts)}`
        : null,
    ].filter((value): value is string => Boolean(value));

    messages.push({
      role: 'system',
      content: `Persistent memory for this relationship:\n${memoryBlocks.join('\n')}`,
    });
  }

  const contextualHistory = history
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-maxHistoryMessages)
    .map(({ role, content }) => ({
      role,
      content,
    }));

  messages.push(...contextualHistory);

  return messages;
}
