import { describe, expect, it } from 'vitest';
import {
  createDefaultAiSettings,
  createDefaultPersonaVoiceBindings,
  createDefaultPersonas,
  createDefaultTwitchSettings,
  createDefaultUiState,
} from '../chat/defaults';
import type { PersistedChatState } from '../chat/types';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from '../menu/defaults';
import {
  applySceneBackup,
  createSceneBackup,
  parseSceneBackup,
  serializeSceneBackup,
} from './scene-backup';

describe('scene backup', () => {
  it('exports safe settings without embedding relationship memory', () => {
    const backup = createSceneBackup({
      exportedAt: '2026-05-15T12:00:00.000Z',
      sceneId: 'scene-1',
      state: createState(),
      workspaceId: 'workspace-1',
    });

    expect(backup.safeSettings.map((record) => record.key)).toContain('scene.twitchChannel');
    expect(backup.localOnly).toEqual({
      chatHistoryCount: 1,
      relationshipMemoryIncluded: false,
    });
    expect(serializeSceneBackup(backup)).not.toMatch(/local-only fact|secret|apiKey|sk-/i);
  });

  it('parses and applies compatible backups through the safe cloud setting path', () => {
    const backup = createSceneBackup({
      state: {
        ...createState(),
        twitchChannel: 'cloudchannel',
      },
      workspaceId: 'workspace-1',
    });
    const parsed = parseSceneBackup(serializeSceneBackup(backup));
    const next = applySceneBackup(createState(), parsed);

    expect(next.twitchChannel).toBe('cloudchannel');
    expect(next.relationshipMemory.facts).toEqual(['local-only fact']);
  });

  it('rejects incompatible backup files', () => {
    expect(() => parseSceneBackup('{"app":"other"}')).toThrow(/compatible/i);
  });
});

function createState(): PersistedChatState {
  return {
    activePersonaId: 'hikari',
    activeTab: 'ai',
    aiSettings: createDefaultAiSettings(),
    chatHistory: [
      {
        content: 'local-only chat',
        createdAt: 1,
        id: 'chat-1',
        role: 'user',
      },
    ],
    currentBundledModelId: 'neuro-sama',
    currentCustomVrmModelId: '',
    personaVoiceBindings: createDefaultPersonaVoiceBindings(),
    personas: createDefaultPersonas(),
    relationshipMemories: {},
    relationshipMemory: {
      attraction: 0,
      diaryEntry: '',
      diaryHistory: [],
      facts: ['local-only fact'],
      guard: 0,
      irritation: 0,
      jealousy: 0,
      lastActionTag: 'none',
      lastDiaryTurnCount: 0,
      lastSeenAt: null,
      mood: 'guarded',
      relationshipStage: 'new',
      respect: 0,
      summary: '',
      trust: 0,
      turnCount: 0,
      version: 2,
    },
    sequencerSettings: createDefaultSequencerSettings(),
    twitchChannel: 'subsect',
    twitchSettings: createDefaultTwitchSettings(),
    uiState: createDefaultUiState(),
    visualSettings: createDefaultVisualSettings(),
    voiceLabVoices: [],
  };
}
