import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PERSONA } from './defaults';
import {
  buildGrilloMemoryPromptAdditions,
  clearGrilloMemoryState,
  getGrilloParticipantKey,
  loadGrilloMemoryState,
  recordGrilloMemoryTurn,
  saveGrilloMemoryState,
} from './grillo-memory';
import type { ChatTurn } from './chat-turn';

function createStorage() {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function createTurn(overrides: Partial<ChatTurn> = {}): ChatTurn {
  return {
    id: overrides.id ?? 'turn-1',
    source: overrides.source ?? 'twitch',
    channel: overrides.channel ?? 'subsect',
    login: overrides.login ?? 'subsect',
    displayName: overrides.displayName ?? 'Subsect',
    text: overrides.text ?? 'I love scoped memory',
    timestamp: overrides.timestamp ?? Date.parse('2026-05-13T09:00:00.000Z'),
    badges: overrides.badges ?? [],
    isMod: overrides.isMod ?? false,
    isBroadcaster: overrides.isBroadcaster ?? false,
    isLocal: overrides.isLocal ?? false,
    isTrustedController: overrides.isTrustedController ?? false,
    firstTimeChatter: overrides.firstTimeChatter,
  };
}

describe('Grillo memory store', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: createStorage(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes candidates and promoted memory blocks per scope without fake diary receipts', () => {
    const scopeKey = 'twitch:subsect:persona:hikari';
    recordGrilloMemoryTurn({
      assistantText: 'Obviously, I will remember that.',
      now: Date.parse('2026-05-13T09:00:00.000Z'),
      persona: { ...DEFAULT_PERSONA, name: 'Hikari' },
      scopeKey,
      turns: [createTurn({ id: 'turn-1', text: 'I love scoped memory' })],
    });
    const state = recordGrilloMemoryTurn({
      assistantText: 'Still filed under excellent taste.',
      now: Date.parse('2026-05-13T09:01:00.000Z'),
      persona: { ...DEFAULT_PERSONA, name: 'Hikari' },
      scopeKey,
      turns: [createTurn({ id: 'turn-2', text: 'I love scoped memory' })],
    });

    expect(state.candidates).toHaveLength(2);
    expect(state.diaryEntries).toHaveLength(0);
    expect(state.blocks).toHaveLength(1);
    expect(state.blocks[0]?.blockName).toBe('preferences');
    expect(state.blocks[0]?.items).toContain('Subsect likes scoped memory');
    expect(state.promotedCandidateIds).toHaveLength(2);
  });

  it('filters old mechanical per-reply diary receipts on load', () => {
    const scopeKey = 'local:persona:hikari';
    const storage = window.localStorage;
    storage.setItem(
      `yourwifey:grillo-memory:v1:${scopeKey}`,
      JSON.stringify({
        blocks: [],
        candidates: [],
        diaryEntries: [
          {
            beatType: 'relationship',
            createdAt: Date.parse('2026-05-13T09:00:00.000Z'),
            diaryId: 'old-noise',
            participantKey: 'local:local:subby',
            personalThought: 'I noticed Subby: hi and answered as Hikari: hey.',
            scopeKey,
            sourceTurnIds: ['turn-1'],
            summary: 'Processed 1 turn: Subby: hi',
            tags: ['local'],
          },
          {
            beatType: 'relationship',
            content: 'That stream plan feels solid.',
            contextTags: ['stream', 'trust'],
            createdAt: Date.parse('2026-05-13T09:01:00.000Z'),
            diaryId: 'real-reflection',
            emotions: [{ intensity: 6, name: 'warm' }],
            interactionSummary: 'Subby trusted the avatar with a stream setup decision.',
            involvedUsers: ['Subby'],
            participantKey: 'local:local:subby',
            personalThought: 'I felt warmer toward Subby after he trusted me with the stream plan.',
            scopeKey,
            sourceTurnIds: ['turn-2'],
            summary: 'Subby trusted Hikari with a stream setup decision.',
            tags: ['trust'],
            userMessage: 'I trust you with the stream plan.',
          },
        ],
        promotedCandidateIds: [],
        scopeKey,
        updatedAt: Date.parse('2026-05-13T09:01:00.000Z'),
        version: 1,
      }),
    );

    const state = loadGrilloMemoryState(scopeKey);

    expect(state.diaryEntries).toHaveLength(1);
    expect(state.diaryEntries[0]?.diaryId).toBe('real-reflection');
    expect(state.diaryEntries[0]?.contextTags).toContain('stream');
    expect(state.diaryEntries[0]?.emotions?.[0]).toEqual({ intensity: 6, name: 'warm' });
  });

  it('keeps participant and channel scopes isolated in prompt additions', () => {
    const twitchScope = 'twitch:subsect:persona:hikari';
    const localScope = 'local:persona:hikari';
    const twitchTurn = createTurn({
      id: 'tw-1',
      login: 'viewer_a',
      text: 'remember I prefer quiet sarcasm',
    });
    const localTurn = createTurn({
      channel: 'local',
      displayName: 'Subby',
      id: 'local-1',
      isLocal: true,
      login: 'subby',
      source: 'local',
      text: 'remember I prefer local control',
    });

    recordGrilloMemoryTurn({
      assistantText: 'Got it.',
      persona: DEFAULT_PERSONA,
      scopeKey: twitchScope,
      turns: [twitchTurn],
    });
    recordGrilloMemoryTurn({
      assistantText: 'Got it locally.',
      persona: DEFAULT_PERSONA,
      scopeKey: localScope,
      turns: [localTurn],
    });

    const twitchPrompt = buildGrilloMemoryPromptAdditions({
      participantKeys: [getGrilloParticipantKey(twitchTurn)],
      query: 'quiet sarcasm',
      scopeKey: twitchScope,
    });
    const localPrompt = buildGrilloMemoryPromptAdditions({
      participantKeys: [getGrilloParticipantKey(localTurn)],
      query: 'local control',
      scopeKey: localScope,
    });

    expect(twitchPrompt.recalledMemories.map((item) => item.text).join('\n')).toContain(
      'quiet sarcasm',
    );
    expect(twitchPrompt.recalledMemories.map((item) => item.text).join('\n')).not.toContain(
      'local control',
    );
    expect(localPrompt.recalledMemories.map((item) => item.text).join('\n')).toContain(
      'local control',
    );
  });

  it('loads an empty state when storage is unavailable or empty', () => {
    const state = loadGrilloMemoryState('missing-scope');
    expect(state.scopeKey).toBe('missing-scope');
    expect(state.candidates).toEqual([]);
    expect(state.blocks).toEqual([]);
  });

  it('clears a scoped Grillo memory state', () => {
    const scopeKey = 'twitch:subsect:persona:hikari';
    recordGrilloMemoryTurn({
      assistantText: 'Filed.',
      persona: DEFAULT_PERSONA,
      scopeKey,
      turns: [createTurn({ text: 'remember I like memory UI' })],
    });

    expect(loadGrilloMemoryState(scopeKey).candidates.length).toBeGreaterThan(0);

    const cleared = clearGrilloMemoryState(scopeKey);

    expect(cleared.scopeKey).toBe(scopeKey);
    expect(loadGrilloMemoryState(scopeKey).candidates).toEqual([]);
    expect(loadGrilloMemoryState(scopeKey).diaryEntries).toEqual([]);
  });

  it('merges stale Grillo saves with newer stored turns', () => {
    const scopeKey = 'twitch:subsect:persona:hikari';
    const staleBase = loadGrilloMemoryState(scopeKey);
    const newerState = recordGrilloMemoryTurn({
      assistantText: 'Filed newer.',
      now: Date.parse('2026-05-13T09:02:00.000Z'),
      persona: DEFAULT_PERSONA,
      scopeKey,
      turns: [createTurn({ id: 'newer-turn', text: 'remember I like newer memory' })],
    });

    saveGrilloMemoryState({
      ...staleBase,
      candidates: [
        ...staleBase.candidates,
        {
          candidateId: 'stale-candidate',
          confidence: 0.8,
          content: 'Subsect likes stale-safe memory.',
          createdAt: Date.parse('2026-05-13T09:01:00.000Z'),
          participantKey: 'twitch:subsect:subsect',
          scopeKey,
          source: 'twitch',
          sourceTurnIds: ['stale-turn'],
          summary: 'Subsect likes stale-safe memory',
          type: 'preference',
        },
      ],
      updatedAt: Date.parse('2026-05-13T09:01:00.000Z'),
    });

    const merged = loadGrilloMemoryState(scopeKey);
    expect(merged.candidates.map((candidate) => candidate.candidateId)).toEqual(
      expect.arrayContaining(['stale-candidate', newerState.candidates[0]!.candidateId]),
    );
  });
});
