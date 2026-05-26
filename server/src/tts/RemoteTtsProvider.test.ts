import { describe, expect, it } from 'vitest';
import {
  normalizeFishSpeechBaseUrl,
  normalizeInworldBaseUrl,
  stripWavHeaderFromPcmChunk,
} from './RemoteTtsProvider.js';

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

  it('strips per-chunk WAV headers from Inworld LINEAR16 streaming audio', () => {
    const pcm = Buffer.from([1, 0, 255, 127, 0, 128]);
    const wav = Buffer.alloc(44 + pcm.length);
    wav.write('RIFF', 0, 'ascii');
    wav.writeUInt32LE(36 + pcm.length, 4);
    wav.write('WAVE', 8, 'ascii');
    wav.write('fmt ', 12, 'ascii');
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(22050, 24);
    wav.writeUInt32LE(44100, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36, 'ascii');
    wav.writeUInt32LE(pcm.length, 40);
    pcm.copy(wav, 44);

    expect([...stripWavHeaderFromPcmChunk(wav)]).toEqual([...pcm]);
  });

  it('leaves already-raw PCM chunks untouched', () => {
    const pcm = Buffer.from([1, 2, 3, 4]);
    expect(stripWavHeaderFromPcmChunk(pcm)).toBe(pcm);
  });
});
