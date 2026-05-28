import type { ChatTurn } from './chat-turn';
import type { PersonaProfile, TwitchSettings } from './types';

export type ChatJobMemoryMode = 'direct' | 'batch';

function normalizeMentionTag(value: string) {
  return value
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_]+/g, '');
}

export function chatTextMentionsPersona(text: string, persona: PersonaProfile | null) {
  const mentions = new Set(
    Array.from(text.matchAll(/@([a-z0-9_][a-z0-9_-]*)/gi)).map((match) =>
      normalizeMentionTag(match[1] ?? ''),
    ),
  );
  if (mentions.size === 0) return false;
  const candidates = [
    'riko',
    'rico',
    persona?.name,
    persona?.id,
    persona?.name.replace(/-?chan$/i, ''),
    persona?.name.replace(/\s+/g, ''),
  ]
    .map((value) => normalizeMentionTag(value ?? ''))
    .filter(Boolean);
  return candidates.some((candidate) => mentions.has(candidate));
}

export function shouldIngestChatTurnToGrillo(
  turn: ChatTurn,
  persona: PersonaProfile | null,
  twitchSettings: TwitchSettings,
) {
  if (turn.source === 'local') {
    return true;
  }
  if (!twitchSettings.streamModeEnabled) {
    return false;
  }
  return (
    turn.isTrustedController ||
    turn.isBroadcaster ||
    turn.isMod ||
    chatTextMentionsPersona(turn.text, persona)
  );
}

export function shouldIngestChatJobToGrillo(
  mode: ChatJobMemoryMode,
  turns: ChatTurn[],
  persona: PersonaProfile | null,
  twitchSettings: TwitchSettings,
) {
  if (turns.length === 0) {
    return false;
  }
  if (turns.some((turn) => turn.source === 'local')) {
    return true;
  }
  if (!twitchSettings.streamModeEnabled) {
    return false;
  }
  if (mode === 'batch') {
    return true;
  }
  return turns.some((turn) => shouldIngestChatTurnToGrillo(turn, persona, twitchSettings));
}
