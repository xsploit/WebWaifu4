import { describe, expect, it } from 'vitest';
import { createDefaultTwitchSettings, DEFAULT_PERSONA } from './defaults';
import { createLocalChatTurn, createTwitchChatTurn } from './chat-turn';
import {
  chatTextMentionsPersona,
  scoreChatJobForGrilloIntake,
  scoreChatTurnForGrilloIntake,
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

  it('keeps low-signal Twitch chatter short-term even in Stream Mode batches', () => {
    const settings = { ...createDefaultTwitchSettings(), streamModeEnabled: true };
    const lowSignalTurn = createTwitchChatTurn(twitchMessage({ text: 'lol' }), 'subsect');

    expect(shouldIngestChatTurnToGrillo(lowSignalTurn, DEFAULT_PERSONA, settings)).toBe(false);
    expect(shouldIngestChatJobToGrillo('batch', [lowSignalTurn], DEFAULT_PERSONA, settings)).toBe(
      false,
    );
  });

  it('scores explicit preference, fact, goal, and boundary chat as durable Twitch memory', () => {
    const settings = { ...createDefaultTwitchSettings(), streamModeEnabled: true };
    const durableTurns = [
      'I prefer cozy synthwave BGM on streams',
      'I work nights and usually watch after midnight',
      'My goal is to finish the overlay this week',
      "Don't call me by my old handle anymore",
    ].map((text, index) =>
      createTwitchChatTurn(twitchMessage({ id: `durable-${index}`, text }), 'subsect'),
    );

    for (const turn of durableTurns) {
      const score = scoreChatTurnForGrilloIntake(turn, DEFAULT_PERSONA, settings);
      expect(score.shouldIngest).toBe(true);
      expect(score.signals).toContain('explicit_memory_cue');
    }
  });

  it('scores emotional relationship signals and stream-relevant badges as durable Twitch memory', () => {
    const settings = { ...createDefaultTwitchSettings(), streamModeEnabled: true };
    const emotionalTurn = createTwitchChatTurn(
      twitchMessage({ id: 'emotion', text: 'Thank you for helping me feel welcome here' }),
      'subsect',
    );
    const subscriberTurn = createTwitchChatTurn(
      twitchMessage({ badges: ['subscriber/12'], id: 'subscriber', text: 'renewed for the year' }),
      'subsect',
    );

    expect(scoreChatTurnForGrilloIntake(emotionalTurn, DEFAULT_PERSONA, settings)).toMatchObject({
      shouldIngest: true,
      signals: ['emotional_relationship_signal'],
    });
    expect(scoreChatTurnForGrilloIntake(subscriberTurn, DEFAULT_PERSONA, settings)).toMatchObject({
      shouldIngest: true,
      signals: ['stream_event_relevance'],
    });
  });

  it('lets repeated Twitch topic threads feed batch GRILLO without requiring every line', () => {
    const settings = { ...createDefaultTwitchSettings(), streamModeEnabled: true };
    const turns = [
      createTwitchChatTurn(
        twitchMessage({ id: 'thread-1', text: 'overlay captions are lagging again', user: 'a' }),
        'subsect',
      ),
      createTwitchChatTurn(
        twitchMessage({
          id: 'thread-2',
          text: 'yeah the overlay captions need delay tuning',
          user: 'b',
        }),
        'subsect',
      ),
      createTwitchChatTurn(twitchMessage({ id: 'thread-3', text: 'lol', user: 'c' }), 'subsect'),
    ];
    const score = scoreChatJobForGrilloIntake('batch', turns, DEFAULT_PERSONA, settings);

    expect(score.shouldIngest).toBe(true);
    expect(score.signals).toContain('repeated_topic_thread');
  });
});
