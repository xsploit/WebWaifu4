import { describe, expect, it } from 'vitest';
import { normalizeFishSpeechBaseUrl, normalizeInworldBaseUrl } from './RemoteTtsProvider.js';

describe('RemoteTtsProvider normalization', () => {
  it('normalizes Inworld URLs against the SDK stream endpoint, not the old bidirectional path', () => {
    expect(normalizeInworldBaseUrl('wss://api.inworld.ai/tts/v1/voice:stream')).toBe(
      'https://api.inworld.ai',
    );
    expect(normalizeInworldBaseUrl('https://api.inworld.ai/tts/v1/voice:streamBidirectional')).toBe(
      'https://api.inworld.ai',
    );
  });

  it('keeps FishSpeech live endpoint normalization separate', () => {
    expect(normalizeFishSpeechBaseUrl('wss://api.fish.audio/v1/tts/live')).toBe(
      'https://api.fish.audio',
    );
  });
});
