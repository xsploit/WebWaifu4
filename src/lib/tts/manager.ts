import type { WLipSyncAudioNode, Profile as WLipSyncProfile } from 'wlipsync';
import type { LipSyncData, WordBoundary } from './piper';
import { synthesizePiperChunk } from './piper';
import { createRemoteTtsStream, type RemoteTtsRequest } from './remote';

const LIP_SYNC_PROFILE_URL =
  typeof window === 'undefined'
    ? `${import.meta.env.BASE_URL}assets/lipsync-profile.json`
    : new URL(
        `${import.meta.env.BASE_URL}assets/lipsync-profile.json`,
        window.location.href,
      ).toString();
const AUTO_RESUME_AUDIO =
  import.meta.env['VITE_AUTO_RESUME_AUDIO'] === 'true' ||
  (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('routelet') === '1');

interface ChunkData {
  audioBlob: Blob;
  wordBoundaries: WordBoundary[];
  phonemes: string[] | null;
  text: string;
  sampleRate?: number | null;
}

function canAttemptAudioResume() {
  return AUTO_RESUME_AUDIO || navigator.userActivation?.isActive === true;
}

export class TtsManager {
  enableTts = true;
  playbackRate = 1;
  volume = 1;

  audioContext: AudioContext | null = null;
  isPlaying = false;
  currentSource: AudioBufferSourceNode | null = null;
  currentAudio: HTMLAudioElement | null = null;

  wordBoundaries: WordBoundary[] = [];
  currentPhonemes: string[] | null = null;
  wordBoundaryStartTime: number | null = null;

  audioAnalyser: AnalyserNode | null = null;
  audioSource: MediaElementAudioSourceNode | null = null;
  audioDataArray: Uint8Array<ArrayBuffer> | null = null;
  lipsyncNode: WLipSyncAudioNode | null = null;
  masterGain: GainNode | null = null;
  streamDestination: MediaStreamAudioDestinationNode | null = null;
  private analyserConnected = false;

  onSpeechStarted: (() => void) | null = null;
  onSpeechFinished: (() => void) | null = null;
  onError: ((error: Error) => void) | null = null;
  onLipSyncData: ((data: LipSyncData) => void) | null = null;

  private playbackQueue: Promise<void> = Promise.resolve();
  private remoteSynthesisQueue: Promise<void> = Promise.resolve();
  private remoteAbortControllers = new Set<AbortController>();
  private queueGeneration = 0;

  private disconnectAudioSource() {
    if (!this.audioSource) {
      return;
    }

    try {
      this.audioSource.disconnect();
    } catch {
      // ignore
    }
    this.audioSource = null;
  }

  private clearPlaybackState() {
    this.isPlaying = false;
    this.wordBoundaries = [];
    this.currentPhonemes = null;
    this.wordBoundaryStartTime = null;
  }

  private teardownCurrentAudio(audioUrl?: string | null) {
    const nextAudioUrl =
      audioUrl ?? (this.currentAudio?.src?.startsWith('blob:') ? this.currentAudio.src : null);

    if (this.currentAudio) {
      this.currentAudio.onplay = null;
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      try {
        this.currentAudio.pause();
      } catch {
        // ignore
      }
      this.currentAudio.src = '';
      this.currentAudio.load();
      this.currentAudio = null;
    }

    this.disconnectAudioSource();
    this.clearPlaybackState();

    if (nextAudioUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(nextAudioUrl);
    }
  }

  async initialize() {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch {
        // ignore
      }
    }

    this.audioSource = null;
    this.lipsyncNode = null;
    this.masterGain = null;
    this.streamDestination = null;
    this.audioContext = new (
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    )();
    this.audioAnalyser = this.audioContext.createAnalyser();
    this.audioAnalyser.fftSize = 256;
    this.audioAnalyser.smoothingTimeConstant = 0.08;
    this.masterGain = this.audioContext.createGain();
    this.streamDestination = this.audioContext.createMediaStreamDestination();
    this.masterGain.gain.value = Math.max(0, Math.min(2, this.volume));
    this.analyserConnected = false;
    this.audioDataArray = new Uint8Array(
      this.audioAnalyser.frequencyBinCount,
    ) as Uint8Array<ArrayBuffer>;
    await this.initLipSyncNode();
  }

  private async initLipSyncNode() {
    if (!this.audioContext) {
      return;
    }

    try {
      if (!lipSyncProfile) {
        const response = await fetch(LIP_SYNC_PROFILE_URL);
        if (!response.ok) {
          throw new Error(`Profile fetch failed: ${response.status}`);
        }
        lipSyncProfile = await response.json();
      }

      const { createWLipSyncNode } = await import('wlipsync');
      this.lipsyncNode = await createWLipSyncNode(this.audioContext, lipSyncProfile!);
      this.lipsyncNode.smoothness = 0.03;
      this.lipsyncNode.blockSize = 256;
    } catch (error) {
      console.warn('[TtsManager] wLipSync init failed, using frequency-band fallback:', error);
      this.lipsyncNode = null;
    }
  }

  async speakPiperText(text: string, voiceId: string) {
    this.resetSpeechQueue();
    await this.queuePiperText(text, voiceId);
  }

  async speakRemoteText(options: RemoteTtsRequest) {
    this.resetSpeechQueue();
    await this.queueRemoteText(options);
  }

  queuePiperText(text: string, voiceId: string) {
    if (!this.enableTts) {
      return Promise.resolve();
    }

    const cleaned = this.cleanForSpeech(text);
    if (!cleaned) {
      return Promise.resolve();
    }

    const generation = this.queueGeneration;
    const chunkPromise = synthesizePiperChunk(cleaned, voiceId);

    const playbackPromise = this.playbackQueue
      .catch(() => {
        // Keep later queued speech moving if an earlier chunk fails.
      })
      .then(async () => {
        const chunkData = await chunkPromise;
        if (generation !== this.queueGeneration) {
          return;
        }
        if (!this.audioContext) {
          await this.initialize();
        }
        if (generation !== this.queueGeneration) {
          return;
        }
        await this.playAudioChunk(chunkData);
      });

    this.playbackQueue = playbackPromise;
    return playbackPromise;
  }

  queueRemoteText(options: RemoteTtsRequest) {
    if (!this.enableTts) {
      return Promise.resolve();
    }

    const cleaned = this.cleanForSpeech(options.text);
    if (!cleaned) {
      return Promise.resolve();
    }

    const generation = this.queueGeneration;

    let playbackTail: Promise<void> = Promise.resolve();

    const synthesisPromise = this.remoteSynthesisQueue
      .catch(() => {
        // Keep later queued speech moving if an earlier remote request fails.
      })
      .then(async () => {
        if (generation !== this.queueGeneration) {
          return;
        }
        if (!this.audioContext) {
          await this.initialize();
        }
        if (generation !== this.queueGeneration) {
          return;
        }
        const abortController = new AbortController();
        this.remoteAbortControllers.add(abortController);
        let playedChunk = false;
        try {
          const remoteStream = createRemoteTtsStream(
            {
              ...options,
              text: cleaned,
            },
            abortController.signal,
          );
          for await (const chunk of remoteStream) {
            if (generation !== this.queueGeneration || abortController.signal.aborted) {
              return;
            }
            playedChunk = true;
            const chunkData: ChunkData = {
              audioBlob: chunk.audioBlob,
              wordBoundaries: [],
              phonemes: null,
              text: cleaned,
              sampleRate: chunk.sampleRate,
            };
            playbackTail = this.playbackQueue
              .catch(() => {
                // Keep later queued speech moving if an earlier audio chunk fails.
              })
              .then(async () => {
                if (generation !== this.queueGeneration) {
                  return;
                }
                if (!this.audioContext) {
                  await this.initialize();
                }
                if (generation !== this.queueGeneration) {
                  return;
                }
                await this.playAudioChunk(chunkData);
              });
            this.playbackQueue = playbackTail;
          }
        } finally {
          this.remoteAbortControllers.delete(abortController);
        }
        if (!playedChunk && generation === this.queueGeneration && !abortController.signal.aborted) {
          throw new Error('Remote TTS returned no audio chunks.');
        }
      });

    this.remoteSynthesisQueue = synthesisPromise;
    return synthesisPromise.then(() => playbackTail);
  }

  resetSpeechQueue() {
    this.queueGeneration += 1;
    this.playbackQueue = Promise.resolve();
    this.remoteSynthesisQueue = Promise.resolve();
    for (const controller of this.remoteAbortControllers) {
      controller.abort();
    }
    this.remoteAbortControllers.clear();
  }

  stop() {
    this.resetSpeechQueue();
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // ignore
      }
      this.currentSource = null;
    }

    this.teardownCurrentAudio();
  }

  destroy() {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    this.audioAnalyser = null;
    this.audioDataArray = null;
    this.lipsyncNode = null;
    this.masterGain = null;
    this.streamDestination = null;
    this.analyserConnected = false;
  }

  setPlaybackRate(value: number) {
    this.playbackRate = Math.max(0.7, Math.min(1.35, value));
    if (this.currentAudio) {
      this.currentAudio.playbackRate = this.playbackRate;
      const audioWithPitch = this.currentAudio as HTMLAudioElement & {
        mozPreservesPitch?: boolean;
        preservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      if ('preservesPitch' in audioWithPitch) {
        audioWithPitch.preservesPitch = true;
      }
      if ('webkitPreservesPitch' in audioWithPitch) {
        audioWithPitch.webkitPreservesPitch = true;
      }
      if ('mozPreservesPitch' in audioWithPitch) {
        audioWithPitch.mozPreservesPitch = true;
      }
    }
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(2, value));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  private ensureAnalyserConnected() {
    if (!this.audioContext || !this.audioAnalyser || !this.masterGain || this.analyserConnected) {
      return;
    }

    try {
      this.audioAnalyser.connect(this.masterGain);
      this.masterGain.connect(this.audioContext.destination);
      if (this.streamDestination) {
        this.masterGain.connect(this.streamDestination);
      }
      this.analyserConnected = true;
    } catch {
      // Ignore duplicate graph connections.
    }
  }

  async primeAudio() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      await this.initialize();
    }

    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }

    return this.audioContext?.state ?? 'closed';
  }

  getAudioState() {
    return this.audioContext?.state ?? 'uninitialized';
  }

  getOutputStream() {
    return this.streamDestination?.stream ?? null;
  }

  private async playAudioChunk(chunkData: ChunkData) {
    return new Promise<void>(async (resolve, reject) => {
      let { audioBlob, wordBoundaries, phonemes, text, sampleRate } = chunkData;

      this.teardownCurrentAudio();

      if (audioBlob.type === 'audio/pcm') {
        audioBlob = await this.pcmToWav(audioBlob, sampleRate ?? 24000);
      }

      this.wordBoundaries = wordBoundaries;
      this.currentPhonemes = phonemes;
      this.wordBoundaryStartTime = null;

      if (!this.audioContext) {
        reject(new Error('AudioContext not initialized'));
        return;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      this.currentAudio = new Audio(audioUrl);
      this.currentAudio.autoplay = true;
      this.currentAudio.preload = 'auto';
      this.currentAudio.playbackRate = this.playbackRate;
      this.currentAudio.volume = 1;
      const audioWithPitch = this.currentAudio as HTMLAudioElement & {
        mozPreservesPitch?: boolean;
        preservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      if ('preservesPitch' in audioWithPitch) {
        audioWithPitch.preservesPitch = true;
      }
      if ('webkitPreservesPitch' in audioWithPitch) {
        audioWithPitch.webkitPreservesPitch = true;
      }
      if ('mozPreservesPitch' in audioWithPitch) {
        audioWithPitch.mozPreservesPitch = true;
      }
      if (this.masterGain) {
        this.masterGain.gain.value = this.volume;
      }

      try {
        this.disconnectAudioSource();
        this.audioSource = this.audioContext.createMediaElementSource(this.currentAudio);
        this.audioSource.connect(this.audioAnalyser!);
        if (this.lipsyncNode) {
          this.audioSource.connect(this.lipsyncNode);
        }
        this.ensureAnalyserConnected();
      } catch (error) {
        console.warn('[TtsManager] Audio graph connect:', error);
      }

      if (this.audioContext.state === 'suspended' && canAttemptAudioResume()) {
        void this.audioContext.resume().catch(() => {});
      }

      this.currentAudio.onplay = () => {
        this.wordBoundaryStartTime = this.currentAudio?.currentTime || 0;
        if (this.audioContext?.state === 'suspended' && canAttemptAudioResume()) {
          void this.audioContext.resume().catch(() => {});
        }
        if (!this.isPlaying) {
          this.isPlaying = true;
          this.onSpeechStarted?.();
        }
        this.onLipSyncData?.({ wordBoundaries, phonemes, text });
      };

      this.currentAudio.onended = () => {
        this.teardownCurrentAudio(audioUrl);
        this.onSpeechFinished?.();
        resolve();
      };

      this.currentAudio.onerror = () => {
        this.teardownCurrentAudio(audioUrl);
        reject(new Error('Audio playback failed.'));
      };

      this.currentAudio.play().catch((error) => {
        const nextError = error instanceof Error ? error : new Error(String(error));
        this.teardownCurrentAudio(audioUrl);
        this.onError?.(nextError);
        reject(nextError);
      });
    });
  }

  private pcmToWav(pcmBlob: Blob, sampleRate = 24000): Promise<Blob> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const pcmData = new Uint8Array(reader.result as ArrayBuffer);
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        view.setUint32(0, 0x52494646, false);
        view.setUint32(4, 36 + pcmData.length, true);
        view.setUint32(8, 0x57415645, false);
        view.setUint32(12, 0x666d7420, false);
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        view.setUint32(36, 0x64617461, false);
        view.setUint32(40, pcmData.length, true);
        resolve(new Blob([wavHeader, pcmData], { type: 'audio/wav' }));
      };
      reader.readAsArrayBuffer(pcmBlob);
    });
  }

  private cleanForSpeech(text: string) {
    return text
      .replace(/\*[^*]*\*/g, '')
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
      .replace(/([.!?,;:—])\1+/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getAudioAmplitude(): number {
    if (!this.audioAnalyser || !this.audioDataArray) {
      return this.isPlaying ? 0.5 : 0;
    }
    if (!this.isPlaying) {
      return 0;
    }
    if (this.currentAudio && this.currentAudio.paused) {
      return 0;
    }

    this.audioAnalyser.getByteFrequencyData(this.audioDataArray);

    let sum = 0;
    const length = this.audioDataArray.length;
    for (let index = 0; index < length; index += 1) {
      let weight = 1.0;
      if (index < 20) {
        weight = 2.0;
      } else if (index < 50) {
        weight = 1.5;
      }
      sum += (this.audioDataArray[index] ?? 0) * weight;
    }
    const average = sum / (length * 1.5);
    const scale = this.currentAudio ? 2.5 : 1.0;
    return Math.min((average / 255) * scale, 1.0);
  }

  getFrequencyBands(): { low: number; midLow: number; midHigh: number; high: number } | null {
    if (!this.audioAnalyser || !this.audioDataArray) {
      return null;
    }
    if (!this.isPlaying) {
      return null;
    }
    if (this.currentAudio && this.currentAudio.paused) {
      return null;
    }

    this.audioAnalyser.getByteFrequencyData(this.audioDataArray);
    const data = this.audioDataArray;
    const length = data.length;

    const bandEnergy = (start: number, end: number) => {
      const clampedEnd = Math.min(end, length);
      if (start >= clampedEnd) {
        return 0;
      }
      let sum = 0;
      for (let index = start; index < clampedEnd; index += 1) {
        sum += data[index] ?? 0;
      }
      return sum / ((clampedEnd - start) * 255);
    };

    const scale = this.currentAudio ? 2.5 : 1.0;
    return {
      low: Math.min(bandEnergy(0, 5) * scale, 1.0),
      midLow: Math.min(bandEnergy(5, 13) * scale, 1.0),
      midHigh: Math.min(bandEnergy(13, 20) * scale, 1.0),
      high: Math.min(bandEnergy(20, 35) * scale, 1.0),
    };
  }

  getLipSyncWeights(): { A: number; I: number; U: number; E: number; O: number } | null {
    if (!this.lipsyncNode || !this.isPlaying) {
      return null;
    }

    const weights = this.lipsyncNode.weights;
    const volume = this.lipsyncNode.volume;
    if (volume < 0.01) {
      return null;
    }

    return {
      A: (weights['A'] ?? 0) * volume,
      I: (weights['I'] ?? 0) * volume,
      U: (weights['U'] ?? 0) * volume,
      E: (weights['E'] ?? 0) * volume,
      O: (weights['O'] ?? 0) * volume,
    };
  }
}

let lipSyncProfile: WLipSyncProfile | null = null;
let instance: TtsManager | null = null;

export function getTtsManager() {
  if (!instance) {
    instance = new TtsManager();
  }
  return instance;
}
