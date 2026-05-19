import { describe, expect, it } from 'vitest';
import {
  createDefaultAiSettings,
  createDefaultPersonas,
  createDefaultUiState,
} from '../chat/defaults';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from '../menu/defaults';
import {
  applyCloudSettingRecords,
  buildCloudSettingPatchBody,
  buildCloudSettingRecords,
  LOCAL_ONLY_PERSISTED_SETTING_KEYS,
} from './cloud-settings';
import { cloudSettingId } from './cloud-setting-id';
import type { PersistedChatState } from '../chat/types';

describe('cloud settings adapter', () => {
  it('exports only safe non-secret product settings', () => {
    const records = buildCloudSettingRecords({
      now: '2026-05-15T12:00:00.000Z',
      sceneId: 'scene-1',
      state: createState(),
      workspaceId: 'workspace-1',
    });

    expect(records.map((record) => record.key)).toEqual([
      'personas',
      'character.personaId',
      'aiSettings',
      'uiState',
      'character.vrmModelId',
      'scene.twitchChannel',
      'sequencerSettings',
      'visualSettings',
    ]);
    expect(records.map((record) => record.storageClass)).toContain('public-overlay');
    expect(records.map((record) => record.storageClass)).toContain('synced-private');
    expect(records.map((record) => record.id)).toEqual(
      records.map(() =>
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
      ),
    );
    expect(JSON.stringify(records)).not.toMatch(
      /relationshipMemory|chatHistory|apiKey|secret|sk-/i,
    );
  });

  it('marks memory and chat history as local-only for now', () => {
    expect(LOCAL_ONLY_PERSISTED_SETTING_KEYS).toEqual([
      'yourwifey.chatHistory.v1',
      'yourwifey.currentCustomVrmModelId.v1',
      'yourwifey.relationshipMemory.v1',
      'yourwifey.relationshipMemories.v1',
    ]);
  });

  it('builds cloud patch bodies without ids or timestamps', () => {
    const [record] = buildCloudSettingRecords({
      state: createState(),
      workspaceId: 'workspace-1',
    });

    expect(buildCloudSettingPatchBody(record!)).toEqual({
      characterId: null,
      key: 'personas',
      sceneId: null,
      storageClass: 'synced-private',
      valueJson: record!.valueJson,
    });
  });

  it('scopes deterministic cloud setting ids by workspace and scene', () => {
    expect(
      cloudSettingId({
        key: 'aiSettings',
        workspaceId: 'workspace-a',
      }),
    ).not.toBe(
      cloudSettingId({
        key: 'aiSettings',
        workspaceId: 'workspace-b',
      }),
    );
    expect(
      cloudSettingId({
        key: 'scene.twitchChannel',
        sceneId: 'scene-a',
        workspaceId: 'workspace-a',
      }),
    ).not.toBe(
      cloudSettingId({
        key: 'scene.twitchChannel',
        sceneId: 'scene-b',
        workspaceId: 'workspace-a',
      }),
    );
  });

  it('applies only safe cloud records back to persisted editor state', () => {
    const state = createState();
    const next = applyCloudSettingRecords(state, [
      {
        id: 'scene.twitchChannel',
        key: 'scene.twitchChannel',
        storageClass: 'public-overlay',
        updatedAt: '2026-05-15T12:00:00.000Z',
        valueJson: '"newchannel"',
        workspaceId: 'workspace-1',
      },
      {
        id: 'relationshipMemory',
        key: 'relationshipMemory',
        storageClass: 'synced-private',
        updatedAt: '2026-05-15T12:00:00.000Z',
        valueJson: '{"facts":["should not load"]}',
        workspaceId: 'workspace-1',
      },
    ]);

    expect(next.twitchChannel).toBe('newchannel');
    expect(next.relationshipMemory.facts).toEqual(['local-only fact']);
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
    uiState: createDefaultUiState(),
    visualSettings: createDefaultVisualSettings(),
  };
}
