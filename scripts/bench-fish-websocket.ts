import { performance } from 'node:perf_hooks';
import { loadConfig, type StreamBotConfig } from '../server/src/config.js';
import {
  streamFishSpeechTextStream,
  type FishSpeechLatency,
  type RemoteTextStream,
} from '../server/src/tts/RemoteTtsProvider.js';

type BenchOptions = {
  text: string;
  repeat: number;
  textChunkChars: number;
  chunkDelayMs: number;
  chunkLength: number;
  conditionOnPreviousChunks: boolean;
  latency: FishSpeechLatency;
  modelId: string;
  voiceId: string;
  format: StreamBotConfig['fishSpeechFormat'];
  hardTimeoutMs: number;
  json: boolean;
  progress: boolean;
};

type AudioStats = {
  audioBytes: number;
  audioChunks: number;
  firstAudioMs: number | null;
  firstTextToAudioMs: number | null;
  lastAudioMs: number | null;
  textChunks: number;
  textChars: number;
  totalMs: number;
};

const DEFAULT_TEXT =
  'Hey chat, this is a Fish Speech websocket latency benchmark. We are checking first audio chunk timing, total chunks, and total streamed bytes.';

function printHelp() {
  console.log(`Fish Speech WebSocket benchmark

Usage:
  npm run bench:fish -- [options]

Required config:
  FISH_AUDIO_API_KEY or FISHSPEECH_API_KEY
  FISH_SPEECH_VOICE_ID or FISH_AUDIO_VOICE_ID

Options:
  --text "hello chat"              Text to synthesize
  --repeat 3                       Number of runs, default 1
  --text-chunk-chars 48            Characters per streamed text chunk, default 48
  --chunk-delay-ms 25              Delay between text chunks, default 0
  --chunk-length 160               Fish chunk_length, default env/current config
  --condition true|false           condition_on_previous_chunks, default env/current config
  --latency balanced|normal        Fish latency mode, default env/current config
  --model s2                       Fish backend/model, default env/current config
  --voice <reference-id>           Fish reference/voice id, default env/current config
  --format pcm|mp3|wav|opus        Audio format, default pcm/env
  --progress                       Print text/audio events as they arrive
  --hard-timeout-ms 30000          Print partial stats and exit if Fish never closes
  --json                           Print JSON instead of readable summary
  --help                           Show this help
`);
}

function readArg(name: string) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf(name);
  if (index >= 0) {
    return process.argv[index + 1] ?? '';
  }
  return '';
}

function parseBoolean(value: string, fallback: boolean) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseNumber(value: string, fallback: number, min: number, max: number) {
  if (!value.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number value: ${value}`);
  }
  return Math.min(max, Math.max(min, parsed));
}

function parseLatency(value: string, fallback: FishSpeechLatency): FishSpeechLatency {
  if (!value.trim()) {
    return fallback;
  }
  if (value === 'balanced' || value === 'normal') {
    return value;
  }
  throw new Error(`Invalid Fish latency: ${value}`);
}

function parseFormat(value: string, fallback: StreamBotConfig['fishSpeechFormat']) {
  if (!value.trim()) {
    return fallback;
  }
  if (value === 'pcm' || value === 'mp3' || value === 'wav' || value === 'opus') {
    return value;
  }
  throw new Error(`Invalid Fish format: ${value}`);
}

function parseOptions(config: StreamBotConfig): BenchOptions {
  return {
    text: readArg('--text') || DEFAULT_TEXT,
    repeat: parseNumber(readArg('--repeat'), 1, 1, 50),
    textChunkChars: parseNumber(readArg('--text-chunk-chars'), 48, 1, 2000),
    chunkDelayMs: parseNumber(readArg('--chunk-delay-ms'), 0, 0, 10000),
    chunkLength: parseNumber(readArg('--chunk-length'), config.fishSpeechChunkLength, 100, 300),
    conditionOnPreviousChunks: parseBoolean(
      readArg('--condition'),
      config.fishSpeechConditionOnPreviousChunks,
    ),
    latency: parseLatency(readArg('--latency'), config.fishSpeechLatency),
    modelId: readArg('--model') || config.fishSpeechModel || 's2',
    voiceId: readArg('--voice') || config.fishSpeechVoiceId,
    format: parseFormat(readArg('--format'), config.fishSpeechFormat || 'pcm'),
    hardTimeoutMs: parseNumber(readArg('--hard-timeout-ms'), 0, 0, 300000),
    json: process.argv.includes('--json'),
    progress: process.argv.includes('--progress'),
  };
}

function splitText(text: string, chunkChars: number) {
  const chunks: string[] = [];
  for (let cursor = 0; cursor < text.length; cursor += chunkChars) {
    chunks.push(text.slice(cursor, cursor + chunkChars));
  }
  return chunks.map((chunk) => (chunk.endsWith(' ') ? chunk : `${chunk} `));
}

function sleep(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function* createMeasuredTextStream(
  text: string,
  chunkChars: number,
  chunkDelayMs: number,
  onChunk: (chunk: string) => void,
): RemoteTextStream {
  for (const chunk of splitText(text, chunkChars)) {
    onChunk(chunk);
    yield chunk;
    await sleep(chunkDelayMs);
  }
}

async function runOnce(
  baseConfig: StreamBotConfig,
  options: BenchOptions,
  runNumber: number,
): Promise<AudioStats & { run: number }> {
  const startedAt = performance.now();
  let firstTextChunkAt: number | null = null;
  let firstAudioAt: number | null = null;
  let lastAudioAt: number | null = null;
  let textChunks = 0;
  let textChars = 0;
  let audioChunks = 0;
  let audioBytes = 0;
  let hardTimeout: ReturnType<typeof setTimeout> | null = null;

  const config: StreamBotConfig = {
    ...baseConfig,
    fishSpeechVoiceId: options.voiceId,
    fishSpeechModel: options.modelId,
    fishSpeechLatency: options.latency,
    fishSpeechFormat: options.format,
    fishSpeechChunkLength: options.chunkLength,
    fishSpeechConditionOnPreviousChunks: options.conditionOnPreviousChunks,
  };
  if (options.progress) {
    console.log(`[run ${runNumber}] starting Fish realtime request`);
  }

  const textStream = createMeasuredTextStream(
    options.text,
    options.textChunkChars,
    options.chunkDelayMs,
    (chunk) => {
      const now = performance.now();
      firstTextChunkAt ??= now;
      textChunks += 1;
      textChars += chunk.length;
      if (options.progress) {
        console.log(
          `[run ${runNumber}] text chunk ${textChunks} at ${Math.round(now - startedAt)}ms chars=${chunk.length}`,
        );
      }
    },
  );

  const getPartialStats = () => ({
    run: runNumber,
    audioBytes,
    audioChunks,
    firstAudioMs: firstAudioAt === null ? null : firstAudioAt - startedAt,
    firstTextToAudioMs:
      firstAudioAt === null || firstTextChunkAt === null ? null : firstAudioAt - firstTextChunkAt,
    lastAudioMs: lastAudioAt === null ? null : lastAudioAt - startedAt,
    textChunks,
    textChars,
    totalMs: performance.now() - startedAt,
  });

  if (options.hardTimeoutMs > 0) {
    hardTimeout = setTimeout(() => {
      const partial = getPartialStats();
      if (options.json) {
        console.log(JSON.stringify({ partial, timedOut: true }, null, 2));
      } else {
        console.error(
          `[run ${runNumber}] hard timeout after ${options.hardTimeoutMs}ms; partial stats follow`,
        );
        printSummary(options, [partial]);
      }
      process.exit(2);
    }, options.hardTimeoutMs);
  }

  try {
    await streamFishSpeechTextStream(
      config,
      {
        chunkLength: options.chunkLength,
        conditionOnPreviousChunks: options.conditionOnPreviousChunks,
        latency: options.latency,
        modelId: options.modelId,
        voiceId: options.voiceId,
      },
      textStream,
      {
        onAudioChunk(chunk) {
          const now = performance.now();
          firstAudioAt ??= now;
          lastAudioAt = now;
          audioChunks += 1;
          audioBytes += chunk.audio.length;
          if (options.progress) {
            console.log(
              `[run ${runNumber}] audio chunk ${audioChunks} at ${Math.round(now - startedAt)}ms bytes=${chunk.audio.length}`,
            );
          }
        },
      },
    );
  } finally {
    if (hardTimeout) {
      clearTimeout(hardTimeout);
    }
  }

  const totalMs = performance.now() - startedAt;
  return {
    run: runNumber,
    audioBytes,
    audioChunks,
    firstAudioMs: firstAudioAt === null ? null : firstAudioAt - startedAt,
    firstTextToAudioMs:
      firstAudioAt === null || firstTextChunkAt === null ? null : firstAudioAt - firstTextChunkAt,
    lastAudioMs: lastAudioAt === null ? null : lastAudioAt - startedAt,
    textChunks,
    textChars,
    totalMs,
  };
}

function formatMs(value: number | null) {
  return value === null ? 'n/a' : `${Math.round(value)}ms`;
}

function printSummary(options: BenchOptions, results: Array<AudioStats & { run: number }>) {
  console.log('Fish Speech websocket benchmark');
  console.log(`model=${options.modelId}`);
  console.log(`voice=${options.voiceId}`);
  console.log(`format=${options.format}`);
  console.log(`latency=${options.latency}`);
  console.log(`chunk_length=${options.chunkLength}`);
  console.log(`condition_on_previous_chunks=${options.conditionOnPreviousChunks}`);
  console.log(`text_chunk_chars=${options.textChunkChars}`);
  console.log(`chunk_delay_ms=${options.chunkDelayMs}`);
  console.log('');
  console.table(
    results.map((result) => ({
      run: result.run,
      firstAudio: formatMs(result.firstAudioMs),
      firstTextToAudio: formatMs(result.firstTextToAudioMs),
      lastAudio: formatMs(result.lastAudioMs),
      total: formatMs(result.totalMs),
      textChunks: result.textChunks,
      audioChunks: result.audioChunks,
      audioBytes: result.audioBytes,
    })),
  );
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  const config = loadConfig();
  const options = parseOptions(config);
  if (!config.fishSpeechApiKey) {
    throw new Error('Missing FISH_AUDIO_API_KEY or FISHSPEECH_API_KEY.');
  }
  if (!options.voiceId) {
    throw new Error('Missing Fish voice/reference id. Set FISH_SPEECH_VOICE_ID or pass --voice.');
  }

  const results: Array<AudioStats & { run: number }> = [];
  for (let run = 1; run <= options.repeat; run += 1) {
    results.push(await runOnce(config, options, run));
  }

  if (options.json) {
    console.log(JSON.stringify({ options, results }, null, 2));
    return;
  }
  printSummary(options, results);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
