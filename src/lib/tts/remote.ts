export type RemoteTtsProvider = 'fish-speech' | 'inworld';
export type FishSpeechLatency = 'balanced' | 'normal';
export type InworldDeliveryMode = 'STABLE' | 'BALANCED' | 'CREATIVE';

export type RemoteTtsRequest = {
  provider: RemoteTtsProvider;
  text: string;
  voiceId?: string;
  modelId?: string;
  latency?: FishSpeechLatency;
  conditionOnPreviousChunks?: boolean;
  chunkLength?: number;
  deliveryMode?: InworldDeliveryMode;
  bufferCharThreshold?: number;
};

export type RemoteTtsAudioChunk = {
  audioBlob: Blob;
  mimeType: string;
  sampleRate?: number | null;
};

export type RemoteTtsVoice = {
  provider: RemoteTtsProvider;
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  languages?: string[];
  source?: string;
};

type RemoteTtsStreamEvent =
  | {
      type: 'audio';
      audio: string;
      mimeType?: string;
      sampleRate?: number;
    }
  | {
      type: 'done';
      ok?: boolean;
    }
  | {
      type: 'error';
      ok?: false;
      error?: string;
    };

const TTS_PROXY_URL = (import.meta.env['VITE_TTS_PROXY_URL'] || '').trim();

function getTtsProxyUrl(path = '/tts/stream') {
  if (TTS_PROXY_URL) {
    const url = new URL(TTS_PROXY_URL, window.location.href);
    if (path !== '/tts/stream') {
      url.pathname = url.pathname.replace(/\/stream$/, '/voices');
      if (!url.pathname.endsWith('/voices')) {
        url.pathname = path;
      }
      url.search = '';
    }
    return url.toString();
  }

  const isLocalDev =
    ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname) ||
    window.location.hostname.endsWith('.local');
  const url = new URL(path, window.location.href);
  if (isLocalDev && (url.port === '5173' || url.port === '4173')) {
    url.port = '8787';
  } else if (!isLocalDev) {
    url.pathname = `/api${path}`;
  }
  return url.toString();
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function createRemoteTtsStream(
  request: RemoteTtsRequest,
): AsyncIterable<RemoteTtsAudioChunk> {
  const queue: RemoteTtsAudioChunk[] = [];
  const waiters: Array<() => void> = [];
  let done = false;
  let failure: Error | null = null;

  const wake = () => {
    while (waiters.length > 0) {
      waiters.shift()?.();
    }
  };

  const waitForEvent = () =>
    new Promise<void>((resolve) => {
      waiters.push(resolve);
    });

  const handleEvent = (event: RemoteTtsStreamEvent) => {
    if (event.type === 'audio') {
      const mimeType = event.mimeType || 'audio/mpeg';
      queue.push({
        audioBlob: new Blob([base64ToBytes(event.audio)], { type: mimeType }),
        mimeType,
        sampleRate: event.sampleRate ?? null,
      });
      wake();
      return;
    }

    if (event.type === 'error') {
      failure = new Error(event.error || 'Remote TTS stream failed.');
      done = true;
      wake();
      return;
    }

    done = true;
    wake();
  };

  void (async () => {
    try {
      const response = await fetch(getTtsProxyUrl('/tts/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        throw new Error(`Remote TTS proxy failed with HTTP ${response.status}.`);
      }
      if (!response.body) {
        const data = (await response.json()) as { ok?: boolean; error?: string };
        if (!data.ok) {
          throw new Error(data.error || 'Remote TTS proxy returned no stream.');
        }
        done = true;
        wake();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) {
            handleEvent(JSON.parse(line) as RemoteTtsStreamEvent);
          }
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        handleEvent(JSON.parse(buffer) as RemoteTtsStreamEvent);
      }
      done = true;
      wake();
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      done = true;
      wake();
    }
  })();

  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        if (failure) {
          throw failure;
        }
        if (done) {
          return;
        }
        await waitForEvent();
      }
    },
  };
}

export async function fetchRemoteTtsVoices(provider: RemoteTtsProvider) {
  const url = new URL(getTtsProxyUrl('/tts/voices'));
  url.searchParams.set('provider', provider);
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Remote TTS voice fetch failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    voices?: RemoteTtsVoice[];
  };
  if (!data.ok) {
    throw new Error(data.error || 'Remote TTS voice fetch failed.');
  }
  return data.voices ?? [];
}
