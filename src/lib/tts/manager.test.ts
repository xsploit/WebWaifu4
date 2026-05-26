import { afterEach, describe, expect, it, vi } from 'vitest';
import { TtsManager } from './manager';
import type { RemoteTtsAudioChunk } from './remote';

class FakeAudioParam {
  value = 1;

  cancelScheduledValues() {}

  linearRampToValueAtTime() {}

  setValueAtTime() {}
}

class FakeGainNode {
  gain = new FakeAudioParam();

  connect() {
    return null;
  }

  disconnect() {}
}

class FakeAnalyserNode {
  connect() {
    return null;
  }

  getByteFrequencyData() {}
}

class FakeAudioBufferSourceNode {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;
  playbackRate = { value: 1 };
  startedAt: number | null = null;

  connect() {
    return null;
  }

  disconnect() {}

  start(startAt: number) {
    this.startedAt = startAt;
  }

  stop() {}

  finish() {
    this.onended?.();
  }
}

class FakeAudioContext {
  currentTime = 10;
  destination = {};
  sources: FakeAudioBufferSourceNode[] = [];
  state = 'running';

  close() {
    return Promise.resolve();
  }

  createBuffer(_channels: number, length: number, sampleRate: number) {
    const channel = new Float32Array(length);
    return {
      duration: length / sampleRate,
      getChannelData: () => channel,
    };
  }

  createBufferSource() {
    const source = new FakeAudioBufferSourceNode();
    this.sources.push(source);
    return source;
  }

  createGain() {
    return new FakeGainNode();
  }

  resume() {
    return Promise.resolve();
  }
}

function createPcmChunk(sampleCount = 2400, sampleRate = 24000): RemoteTtsAudioChunk {
  const buffer = new ArrayBuffer(sampleCount * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < sampleCount; index += 1) {
    view.setInt16(index * 2, 1200, true);
  }
  return {
    audioBlob: new Blob([buffer], { type: 'audio/pcm' }),
    mimeType: 'audio/pcm',
    sampleRate,
  };
}

async function waitForSourceCount(context: FakeAudioContext, count: number) {
  const deadline = Date.now() + 1000;
  while (context.sources.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(context.sources).toHaveLength(count);
}

describe('TtsManager remote PCM streaming', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('schedules live PCM chunks back-to-back without overlap', async () => {
    vi.stubGlobal('window', {
      clearTimeout: vi.fn(),
      setTimeout: vi.fn(() => 1),
    });
    const audioContext = new FakeAudioContext();
    const manager = new TtsManager();
    manager.audioContext = audioContext as unknown as AudioContext;
    manager.audioAnalyser = new FakeAnalyserNode() as unknown as AnalyserNode;
    manager.masterGain = audioContext.createGain() as unknown as GainNode;

    const stream = manager.startRemotePcmPushStream('live bridge test');
    const firstPlayback = stream.push(createPcmChunk());
    const secondPlayback = stream.push(createPcmChunk());

    await waitForSourceCount(audioContext, 2);
    const firstSource = audioContext.sources[0]!;
    const secondSource = audioContext.sources[1]!;
    expect(firstSource.startedAt).not.toBeNull();
    expect(secondSource.startedAt).not.toBeNull();
    expect(secondSource.startedAt!).toBeGreaterThanOrEqual(firstSource.startedAt! + 0.1);

    let firstFinished = false;
    firstPlayback.then(() => {
      firstFinished = true;
    });
    await Promise.resolve();
    expect(firstFinished).toBe(false);

    firstSource.finish();
    await firstPlayback;
    secondSource.finish();
    await secondPlayback;
    await stream.close();
  });
});
