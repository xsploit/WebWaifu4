import { describe, expect, it } from 'vitest';
import {
  addMemoryAgentPendingChatTurns,
  chooseMemoryAgentModel,
  clearMemoryAgentPendingChatTurns,
  consumeMemoryAgentPendingChatTurns,
  getMemoryAgentCadenceDecision,
  getMemoryAgentModelCandidates,
} from './memory-agent';
import { DEFAULT_MEMORY_AGENT_MODEL } from './defaults';

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

  it('does not choose expensive OpenAI o1/pro models for the memory worker', () => {
    expect(
      getMemoryAgentModelCandidates(
        ['o1-pro-2025-03-19', 'openai/gpt-5_4-pro-2026-03-05', 'google/gemini-2.5-pro'],
        'o1-pro-2025-03-19',
        [],
        'openai/o1-pro-2025-03-19',
      ),
    ).toEqual([]);

    expect(chooseMemoryAgentModel([], 'o1-pro-2025-03-19')).toBe(DEFAULT_MEMORY_AGENT_MODEL);
  });

  it('does not sweep arbitrary provider models as memory fallbacks', () => {
    expect(
      getMemoryAgentModelCandidates(
        [
          'openai/gpt-4o-mini',
          'amazon/nova-2-lite',
          'amazon/nova-lite',
          'amazon/nova-micro',
          'amazon/nova-pro',
        ],
        'openai/gpt-4o-mini',
        ['openai/gpt-4o-mini'],
        '',
      ),
    ).toEqual([]);
  });
});
