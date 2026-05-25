import { describe, expect, it } from 'vitest';
import {
  addMemoryAgentPendingChatTurns,
  clearMemoryAgentPendingChatTurns,
  consumeMemoryAgentPendingChatTurns,
  getMemoryAgentCadenceDecision,
} from './memory-agent';

describe('memory agent chat cadence', () => {
  it('queues the worker from local chat only when the configured interval is reached', () => {
    const pending: Record<string, number> = {};
    const stateKey = 'local:persona:hikari-chan';

    expect(addMemoryAgentPendingChatTurns(pending, stateKey, 1)).toBe(1);
    expect(getMemoryAgentCadenceDecision(pending, stateKey, 3)).toMatchObject({
      pendingCount: 1,
      remaining: 2,
      shouldQueue: false,
    });

    expect(addMemoryAgentPendingChatTurns(pending, stateKey, 2)).toBe(3);
    expect(getMemoryAgentCadenceDecision(pending, stateKey, 3)).toMatchObject({
      pendingCount: 3,
      remaining: 0,
      shouldQueue: true,
    });
  });

  it('uses the same cadence path for Twitch chat scopes without cross-scope bleed', () => {
    const pending: Record<string, number> = {};
    const localStateKey = 'local:persona:hikari-chan';
    const twitchStateKey = 'twitch:subsect:persona:hikari-chan';

    addMemoryAgentPendingChatTurns(pending, localStateKey, 2);
    addMemoryAgentPendingChatTurns(pending, twitchStateKey, 1);
    addMemoryAgentPendingChatTurns(pending, twitchStateKey, 2);

    expect(getMemoryAgentCadenceDecision(pending, localStateKey, 3)).toMatchObject({
      pendingCount: 2,
      remaining: 1,
      shouldQueue: false,
    });
    expect(getMemoryAgentCadenceDecision(pending, twitchStateKey, 3)).toMatchObject({
      pendingCount: 3,
      remaining: 0,
      shouldQueue: true,
    });
  });

  it('consumes or clears only the active memory scope after a worker pass or reset', () => {
    const pending: Record<string, number> = {
      'local:persona:hikari-chan': 4,
      'twitch:subsect:persona:hikari-chan': 5,
    };

    expect(consumeMemoryAgentPendingChatTurns(pending, 'twitch:subsect:persona:hikari-chan', 3))
      .toBe(2);
    expect(pending['local:persona:hikari-chan']).toBe(4);

    clearMemoryAgentPendingChatTurns(pending, 'local:persona:hikari-chan');
    expect(pending['local:persona:hikari-chan']).toBe(0);
    expect(pending['twitch:subsect:persona:hikari-chan']).toBe(2);
  });
});
