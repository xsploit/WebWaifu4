import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PERSONA,
  STORAGE_KEYS,
  createDefaultAiSettings,
  createDefaultPersonas,
  createDefaultRelationshipMemory,
  createDefaultUiState,
} from './defaults';
import { loadPersistedChatState, savePersistedChatState } from './storage';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from '../menu/defaults';
import type { PersistedChatState } from './types';

function createStorage() {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('chat settings persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: createStorage(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips the current operator settings surface', async () => {
    const personas = createDefaultPersonas();
    const aiSettings = {
      ...createDefaultAiSettings(),
      aiTransportMode: 'http-stream',
      fishSpeechChunkLength: 220,
      fishSpeechConditionOnPreviousChunks: false,
      fishSpeechLatency: 'normal',
      fishSpeechModel: 's2',
      fishSpeechVoiceId: 'fish-voice',
      fishSpeechVoiceScope: 'mine',
      inworldBufferCharThreshold: 140,
      inworldDeliveryMode: 'CREATIVE',
      inworldModelId: 'inworld-tts-2',
      inworldVoiceId: 'inworld-voice',
      maxTokens: 420,
      memoryAgentModel: 'gpt-5.4-mini',
      model: 'gpt-5.4',
      openAiStateMode: 'previous-response',
      remoteTtsMode: 'sentence-chunks',
      temperature: 1.1,
      ttsAutoSpeak: false,
      ttsEnabled: true,
      ttsExpressionTagsEnabled: true,
      ttsPlaybackRate: 1.15,
      ttsProvider: 'fish-speech',
      ttsSimulatedStreaming: false,
      ttsVoice: 'custom-voice',
      ttsVolume: 1.4,
    } satisfies PersistedChatState['aiSettings'];
    const sequencerSettings = {
      ...createDefaultSequencerSettings(),
      currentIndex: 2,
      duration: 7,
      loop: false,
      playing: false,
      shuffle: true,
      speed: 1.4,
    };
    const visualSettings = {
      ...createDefaultVisualSettings(),
      ambientLight: 0.7,
      armClipGuard: false,
      armClipGuardStrength: 0.25,
      armClipTorsoRadius: 0.31,
      autoBlink: false,
      autoGaze: false,
      blinkIntensity: 0.55,
      blinkInterval: 6.5,
      cameraFov: 41,
      cameraOffsetX: 0.4,
      cameraOffsetY: -0.2,
      cameraOffsetZ: 0.9,
      cameraRigMode: 'custom',
      cameraTargetOffsetX: -0.15,
      cameraTargetOffsetY: 0.2,
      cameraTargetOffsetZ: -0.35,
      cameraVerticalOffset: 0.18,
      cameraViewMode: 'full-body',
      colorCorr: true,
      colorPowB: 1.75,
      colorPowG: 1.35,
      colorPowR: 1.2,
      crossfadeDuration: 1.7,
      fillLight: 0.8,
      gazeAudienceYOffset: -0.08,
      gazeEyeMotion: 0.7,
      gazeHeadDrift: 0.4,
      gazeHeadFollow: 0.5,
      gazeIntensity: 0.6,
      gazePointerFollow: true,
      hemiLight: 0.65,
      keyLight: 1.1,
      modelPositionX: 0.2,
      modelPositionZ: -0.5,
      modelRotationX: 4,
      modelRotationY: -12,
      modelRotationZ: 2,
      modelScale: 1.15,
      modelVerticalOffset: -0.4,
      outline: false,
      outlineAlpha: 0.65,
      outlineColor: '#334455',
      outlineThickness: 0.008,
      mtoonGiEqualization: 0.6,
      mtoonRimColor: '#ddeeff',
      mtoonRimFresnel: 7.2,
      mtoonRimLift: 0.35,
      mtoonRimLightingMix: 0.45,
      mtoonShadeColor: '#445566',
      mtoonShadeShift: -0.2,
      mtoonToony: 0.75,
      mtoonTuning: true,
      pbrClearcoat: 0.4,
      pbrClearcoatRoughness: 0.25,
      pbrEnvMapIntensity: 1.2,
      pbrMetalness: 0.15,
      pbrRoughness: 0.38,
      pbrSpecularIntensity: 0.7,
      realisticMode: true,
      rimLight: 0.9,
      sceneExposure: 1.25,
    } satisfies PersistedChatState['visualSettings'];
    const state: PersistedChatState = {
      activePersonaId: DEFAULT_PERSONA.id,
      activeTab: 'tts',
      aiSettings,
      chatHistory: [
        {
          content: 'hello',
          createdAt: Date.parse('2026-05-14T08:00:00.000Z'),
          id: 'message-1',
          role: 'user',
        },
      ],
      currentBundledModelId: 'hikari-chan',
      personas,
      relationshipMemories: {
        'local:persona:neuro-sama': {
          ...createDefaultRelationshipMemory(),
          summary: 'local scope summary',
        },
      },
      relationshipMemory: {
        ...createDefaultRelationshipMemory(),
        facts: ['likes saved settings'],
        summary: 'global summary',
      },
      twitchChannel: '#CohhCarnage',
      sequencerSettings,
      uiState: {
        ...createDefaultUiState(),
        chatDraft: 'draft',
        chatLogOpen: false,
        menuOpen: true,
      },
      visualSettings,
    };

    await savePersistedChatState(state);
    const loaded = await loadPersistedChatState();

    expect(loaded.aiSettings).toEqual(aiSettings);
    expect(loaded.visualSettings).toEqual(visualSettings);
    expect(loaded.sequencerSettings).toMatchObject({
      currentIndex: sequencerSettings.currentIndex,
      duration: sequencerSettings.duration,
      loop: sequencerSettings.loop,
      playing: sequencerSettings.playing,
      shuffle: sequencerSettings.shuffle,
      speed: sequencerSettings.speed,
    });
    expect(loaded.sequencerSettings.playlist).toHaveLength(sequencerSettings.playlist.length);
    expect(loaded.activeTab).toBe('tts');
    expect(loaded.currentBundledModelId).toBe('hikari-chan');
    expect(loaded.twitchChannel).toBe('cohhcarnage');
    expect(loaded.uiState).toEqual({
      ...state.uiState,
      menuOpen: false,
    });
    expect(loaded.relationshipMemory.summary).toBe('global summary');
    expect(loaded.relationshipMemories['local:persona:neuro-sama']?.summary).toBe(
      'local scope summary',
    );
  });

  it('ignores retired post-processing settings from older saved state', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.visualSettings,
      JSON.stringify({
        ...createDefaultVisualSettings(),
        bloom: true,
        chroma: true,
        glitch: true,
        grain: true,
        mtoonRimColor: 'not-a-color',
        outlineThickness: 100,
        sceneExposure: 1.3,
      }),
    );

    const loaded = await loadPersistedChatState();

    expect(loaded.visualSettings.sceneExposure).toBe(1.3);
    expect(loaded.visualSettings.outlineThickness).toBe(0.02);
    expect(loaded.visualSettings.mtoonRimColor).toBe('#ffffff');
    expect('bloom' in loaded.visualSettings).toBe(false);
    expect('glitch' in loaded.visualSettings).toBe(false);
  });
});
