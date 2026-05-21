import { describe, expect, it } from 'vitest';
import { createDefaultRelationshipMemory } from './defaults';
import { mergeRelationshipMemory } from './memory-agent-worker';

describe('memory agent worker merge', () => {
  it('advances the diary pass counter for raw chat-message cadence', () => {
    const current = {
      ...createDefaultRelationshipMemory(),
      lastDiaryTurnCount: 2,
      turnCount: 2,
    };

    const next = mergeRelationshipMemory(
      current,
      {
        actionTag: 'conversation',
        facts: ['Subby is testing Twitch memory cadence'],
        mood: 'curious',
        rikoDiaryEntry: 'I noticed the chat cadence should include Twitch and local messages.',
        summary: 'The memory worker should run from normalized chat messages.',
      },
      9,
    );

    expect(next.turnCount).toBe(9);
    expect(next.lastDiaryTurnCount).toBe(9);
    expect(next.diaryHistory[0]).toContain('chat cadence');
    expect(next.facts).toContain('Subby is testing Twitch memory cadence');
  });

  it('does not rewrite memory when the target count is already processed', () => {
    const current = {
      ...createDefaultRelationshipMemory(),
      diaryEntry: 'already processed',
      lastDiaryTurnCount: 5,
      turnCount: 5,
    };

    const next = mergeRelationshipMemory(
      current,
      {
        rikoDiaryEntry: 'new diary',
        summary: 'new summary',
      },
      5,
    );

    expect(next).toBe(current);
  });
});
