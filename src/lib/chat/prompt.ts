import type {
  ChatMessage,
  PersonaProfile,
  RelationshipMemory,
  RuntimeContextSnapshot,
} from './types';
import { buildYourWifeyPomlMessages } from './poml';
import type { PomlPromptMessage } from './poml';
import { buildReplyMetadataInstruction } from './reply-metadata';

type CompletionMessage = PomlPromptMessage;
type PromptTurnContextValue = string | number | boolean | null | undefined;

const DIARY_CONTEXT_RELEVANCE_THRESHOLD = 0.18;
const DIARY_CONTEXT_RECENT_TURN_WINDOW = 4;
const DIARY_CONTEXT_HISTORY_LIMIT = 3;
const LOW_SIGNAL_RELATIONSHIP_MOODS = new Set(['curious', 'guarded']);

type BuildChatCompletionMessagesOptions = {
  history: ChatMessage[];
  animationCatalogContext?: string;
  includeHostContext: boolean;
  maxHistoryMessages?: number;
  persona: PersonaProfile | null;
  relationshipMemory: RelationshipMemory;
  runtimeContext: RuntimeContextSnapshot;
  semanticMemoryContext?: string;
  turnContext?: Record<string, PromptTurnContextValue>;
  ttsExpressionTagsEnabled?: boolean;
  ttsProvider?: string;
};

function serializeContextSection(label: string, values: Record<string, string>) {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return null;
  }

  return `${label}: ${JSON.stringify(Object.fromEntries(entries))}`;
}

function serializeTurnMetadataContext({
  animationCatalogContext,
  history,
  persona,
  relationshipMemory,
  semanticMemoryContext,
  turnContext,
  ttsExpressionTagsEnabled,
  ttsProvider,
  diaryContext,
}: {
  animationCatalogContext: string;
  diaryContext: string;
  history: ChatMessage[];
  persona: PersonaProfile | null;
  relationshipMemory: RelationshipMemory;
  semanticMemoryContext: string;
  turnContext?: Record<string, PromptTurnContextValue>;
  ttsExpressionTagsEnabled: boolean;
  ttsProvider: string;
}) {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const lastUserMessage = [...history].reverse().find((message) => message.role === 'user');
  const metadata: Record<string, PromptTurnContextValue> = {
    animationCatalog: animationCatalogContext.trim() ? 'present' : 'absent',
    currentTimeIso: now.toISOString(),
    historyWindowMessages: history.filter((message) => message.role !== 'system').length,
    localTime: now.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: timezone === 'unknown' ? undefined : timezone,
    }),
    memoryStage: relationshipMemory.relationshipStage,
    memoryTurnCount: relationshipMemory.turnCount,
    privateDiary: diaryContext ? 'included' : relationshipMemory.diaryEntry ? 'withheld' : 'none',
    personaId: persona?.id,
    personaName: persona?.name,
    relationshipMood: relationshipMemory.mood,
    semanticMemory: semanticMemoryContext.trim() ? 'present' : 'absent',
    timezone,
    ttsExpressionTags: ttsExpressionTagsEnabled,
    ttsProvider,
    ...turnContext,
  };

  if (lastUserMessage) {
    metadata['lastUserMessageAtIso'] = new Date(lastUserMessage.createdAt).toISOString();
  }

  const cleanMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null),
  );

  return `Turn metadata: ${JSON.stringify(cleanMetadata)}`;
}

function serializeDiaryContext(
  history: ChatMessage[],
  relationshipMemory: RelationshipMemory,
  turnContext?: Record<string, PromptTurnContextValue>,
) {
  const diaryEntries = getDiaryEntries(relationshipMemory);
  if (diaryEntries.length === 0) {
    return '';
  }

  const latestUserMessage = [...history].reverse().find((message) => message.role === 'user');
  const score = scoreDiaryContext(
    latestUserMessage?.content ?? '',
    relationshipMemory,
    turnContext,
  );
  if (score < DIARY_CONTEXT_RELEVANCE_THRESHOLD) {
    return '';
  }

  return [
    'Use these as private emotional continuity only. Do not quote or announce the diary unless the reply naturally calls for it.',
    ...diaryEntries.map((entry, index) => {
      const label = index === 0 ? 'Latest private note' : `Previous private note ${index}`;
      return `${label}: ${entry}`;
    }),
  ].join('\n');
}

function getDiaryEntries(relationshipMemory: RelationshipMemory) {
  const entries = [relationshipMemory.diaryEntry, ...relationshipMemory.diaryHistory]
    .map((entry) => entry.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return entries
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, DIARY_CONTEXT_HISTORY_LIMIT);
}

function scoreDiaryContext(
  userText: string,
  relationshipMemory: RelationshipMemory,
  turnContext?: Record<string, PromptTurnContextValue>,
) {
  const diaryCorpus = [
    relationshipMemory.diaryEntry,
    ...relationshipMemory.diaryHistory,
    relationshipMemory.summary,
    ...relationshipMemory.facts,
  ].join('\n');
  const lexicalScore = jaccardSimilarity(
    tokenizeForRelevance(userText),
    tokenizeForRelevance(diaryCorpus),
  );
  const turnsSinceDiary =
    relationshipMemory.lastDiaryTurnCount > 0
      ? Math.max(0, relationshipMemory.turnCount - relationshipMemory.lastDiaryTurnCount)
      : Number.POSITIVE_INFINITY;
  const recencyScore = Number.isFinite(turnsSinceDiary)
    ? Math.max(0, 1 - turnsSinceDiary / DIARY_CONTEXT_RECENT_TURN_WINDOW)
    : 0;
  const moodScore = LOW_SIGNAL_RELATIONSHIP_MOODS.has(relationshipMemory.mood) ? 0 : 0.08;
  const statScore =
    Math.max(
      relationshipMemory.trust,
      relationshipMemory.attraction,
      relationshipMemory.irritation,
      relationshipMemory.jealousy,
      relationshipMemory.guard,
    ) / 20;
  const batchPenalty = turnContext?.['turnKind'] === 'batch' ? -0.08 : 0;

  return lexicalScore * 0.72 + recencyScore * 0.14 + statScore * 0.1 + moodScore + batchPenalty;
}

function tokenizeForRelevance(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_'-]+/g)
      .map((term) => term.trim())
      .filter((term) => term.length >= 4),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const term of a) {
    if (b.has(term)) {
      overlap += 1;
    }
  }

  return overlap / (a.size + b.size - overlap);
}

export function trimChatHistory(history: ChatMessage[], limit = 36) {
  return history.slice(-limit);
}

export async function buildChatCompletionMessages({
  animationCatalogContext = '',
  history,
  includeHostContext,
  maxHistoryMessages = 12,
  persona,
  relationshipMemory,
  runtimeContext,
  semanticMemoryContext = '',
  turnContext,
  ttsExpressionTagsEnabled = false,
  ttsProvider = 'piper',
}: BuildChatCompletionMessagesOptions): Promise<CompletionMessage[]> {
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

  const ttsContext =
    ttsExpressionTagsEnabled && ttsProvider !== 'piper'
      ? 'Speech expression tags are enabled for the active TTS engine. You may add short bracketed delivery tags sparingly inside spoken dialogue when they improve performance, such as [laughs], [sighs], [whispers], [excited], [sarcastic], [nervous], or [pause]. Keep replies as natural spoken dialogue, do not explain the tags, and do not use markdown or stage directions outside those short tags.'
      : '';
  let hostContext = '';

  if (includeHostContext) {
    const contextBlocks = [
      serializeContextSection('launchParams', runtimeContext.launchParams),
      serializeContextSection('shareParams', runtimeContext.shareParams),
      serializeContextSection('notificationParams', runtimeContext.notificationParams),
    ].filter((value): value is string => Boolean(value));

    if (contextBlocks.length > 0) {
      hostContext = contextBlocks.join('\n');
    }
  }

  let relationshipMemoryContext = '';
  if (
    relationshipMemory.turnCount > 0 ||
    relationshipMemory.summary ||
    relationshipMemory.facts.length > 0
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
      relationshipMemory.summary ? `Memory summary: ${relationshipMemory.summary}` : null,
      relationshipMemory.facts.length > 0
        ? `Known user facts: ${JSON.stringify(relationshipMemory.facts)}`
        : null,
    ].filter((value): value is string => Boolean(value));

    relationshipMemoryContext = memoryBlocks.join('\n');
  }

  const contextualHistory = history
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-maxHistoryMessages)
    .map(({ role, content }) => ({
      role,
      content,
    }));
  const diaryContext = serializeDiaryContext(history, relationshipMemory, turnContext);

  return await buildYourWifeyPomlMessages({
    animationCatalogContext,
    diaryContext,
    history: contextualHistory,
    hostContext,
    personaContext: personaBlocks.join('\n\n'),
    relationshipMemoryContext,
    replyMetadataInstruction: buildReplyMetadataInstruction(),
    semanticMemoryContext,
    turnMetadataContext: serializeTurnMetadataContext({
      animationCatalogContext,
      diaryContext,
      history,
      persona,
      relationshipMemory,
      semanticMemoryContext,
      turnContext,
      ttsExpressionTagsEnabled,
      ttsProvider,
    }),
    ttsContext,
  });
}
