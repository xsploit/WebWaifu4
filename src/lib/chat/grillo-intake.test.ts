import { describe, expect, it } from 'vitest';
import { createDefaultTwitchSettings, DEFAULT_PERSONA } from './defaults';
import { createLocalChatTurn, createTwitchChatTurn } from './chat-turn';
import {
  chatTextMentionsPersona,
  shouldIngestChatJobToGrillo,
  shouldIngestChatTurnToGrillo,
} from './grillo-intake';
import type { DirectTwitchChatMessage } from '../twitch/direct-irc';

function twitchMessage(patch: Partial<DirectTwitchChatMessage> = {}): DirectTwitchChatMessage {
  return {
    badges: [],
    displayName: 'Viewer',
    id: `msg-${Math.random().toString(36).slice(2)}`,
    isBroadcaster: false,
    isMod: false,
    text: 'hello chat',
    timestamp: 1770000000000,
    user: 'viewer',
    ...patch,
  };
}

describe('GRILLO intake gating', () => {
  it('always lets local turns feed GRILLO', () => {
    const settings = createDefaultTwitchSettings();
    const turn = createLocalChatTurn({
      persona: DEFAULT_PERSONA,
      text: 'local memory should work',
    });

    expect(shouldIngestChatTurnToGrillo(turn, DEFAULT_PERSONA, settings)).toBe(true);
  });

  it('keeps Twitch turns short-term when stream mode is off', () => {
    const settings = { ...createDefaultTwitchSettings(), streamModeEnabled: false };
    const turn = createTwitchChatTurn(
      twitchMessage({ text: '@hikari this still should not persist by default' }),
      'subsect',
    );

    expect(shouldIngestChatTurnToGrillo(turn, DEFAULT_PERSONA, settings)).toBe(false);
    expect(shouldIngestChatJobToGrillo('direct', [turn], DEFAULT_PERSONA, settings)).toBe(false);
  });

  it('lets Stream Mode ingest mentions and trusted Twitch roles', () => {
    const settings = { ...createDefaultTwitchSettings(), streamModeEnabled: true };
    const persona = { ...DEFAULT_PERSONA, id: 'hikari-chan', name: 'Hikari-chan' };
    const mentionTurn = createTwitchChatTurn(
      twitchMessage({ text: '@hikari this is for you' }),
      'subsect',
    );
    const modTurn = createTwitchChatTurn(
      twitchMessage({ isMod: true, text: 'mod note for stream memory' }),
      'subsect',
    );

    expect(chatTextMentionsPersona('@hikari this is for you', persona)).toBe(true);
    expect(shouldIngestChatTurnToGrillo(mentionTurn, persona, settings)).toBe(true);
    expect(shouldIngestChatTurnToGrillo(modTurn, persona, settings)).toBe(true);
  });

  it('allows Stream Mode batch summaries without ingesting every raw Twitch line', () => {
    const settings = { ...createDefaultTwitchSettings(), streamModeEnabled: true };
    const lowSignalTurn = createTwitchChatTurn(twitchMessage({ text: 'lol' }), 'subsect');

    expect(shouldIngestChatTurnToGrillo(lowSignalTurn, DEFAULT_PERSONA, settings)).toBe(false);
    expect(shouldIngestChatJobToGrillo('batch', [lowSignalTurn], DEFAULT_PERSONA, settings)).toBe(
      true,
    );
  });
});
