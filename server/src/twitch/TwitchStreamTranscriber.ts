import { spawn } from 'node:child_process';

type ProcessResult = {
  stderr: Buffer;
  stdout: Buffer;
};

type TranscribeTwitchStreamOptions = {
  apiBaseUrl: string;
  apiKey: string;
  channel: string;
  model: string;
  prompt?: string;
  sampleSeconds: number;
};

const MAX_AUDIO_BYTES = 18 * 1024 * 1024;
const MAX_FRAME_BYTES = 6 * 1024 * 1024;
const MAX_TOOL_OUTPUT_BYTES = 1024 * 1024;

function cleanChannel(value: string) {
  const channel = value.trim().toLowerCase().replace(/^#/, '');
  if (!/^[a-z0-9_]{1,25}$/.test(channel)) {
    throw new Error('Twitch channel is invalid.');
  }
  return channel;
}

function runProcess(
  command: string,
  args: string[],
  options: { maxBuffer?: number; timeoutMs?: number } = {},
): Promise<ProcessResult> {
  const maxBuffer = options.maxBuffer ?? MAX_TOOL_OUTPUT_BYTES;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timeout =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            child.kill('SIGKILL');
            reject(new Error(`${command} timed out.`));
          }, options.timeoutMs)
        : null;

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBuffer) {
        child.kill('SIGKILL');
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxBuffer) {
        stderrChunks.push(chunk);
      }
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks);
      if (stdoutBytes > maxBuffer) {
        reject(new Error(`${command} produced too much output.`));
        return;
      }
      if (code && code !== 0) {
        const detail = stderr.toString('utf8').trim().slice(0, 400);
        reject(new Error(`${command} failed${detail ? `: ${detail}` : '.'}`));
        return;
      }
      resolve({ stderr, stdout });
    });
  });
}

export async function resolveTwitchStreamUrl(channel: string) {
  const twitchUrl = `https://www.twitch.tv/${channel}`;
  const attempts = [
    {
      args: ['--no-warnings', '--no-playlist', '-f', 'bestaudio/best', '--get-url', twitchUrl],
      command: 'yt-dlp',
    },
    {
      args: ['--stream-url', twitchUrl, 'best'],
      command: 'streamlink',
    },
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const result = await runProcess(attempt.command, attempt.args, {
        timeoutMs: 20000,
      });
      const streamUrl = result.stdout
        .toString('utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => /^https?:\/\//i.test(line));
      if (streamUrl) {
        return streamUrl;
      }
      errors.push(`${attempt.command} returned no stream URL`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${attempt.command} failed`);
    }
  }

  throw new Error(
    `Could not resolve Twitch stream audio. Install yt-dlp or streamlink on the server. ${errors.join(' | ')}`,
  );
}

async function captureAudioSample(streamUrl: string, sampleSeconds: number) {
  const seconds = Math.max(5, Math.min(60, Math.round(sampleSeconds)));
  const result = await runProcess(
    'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-t',
      String(seconds),
      '-i',
      streamUrl,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'mp3',
      'pipe:1',
    ],
    {
      maxBuffer: MAX_AUDIO_BYTES,
      timeoutMs: seconds * 1000 + 25000,
    },
  );
  if (result.stdout.length < 512) {
    throw new Error('Captured Twitch audio sample was empty.');
  }
  return result.stdout;
}

async function captureJpegFrame(streamUrl: string) {
  const result = await runProcess(
    'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      streamUrl,
      '-frames:v',
      '1',
      '-vf',
      'scale=960:-2',
      '-q:v',
      '5',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      'pipe:1',
    ],
    {
      maxBuffer: MAX_FRAME_BYTES,
      timeoutMs: 30000,
    },
  );
  if (result.stdout.length < 512) {
    throw new Error('Captured Twitch stream frame was empty.');
  }
  return result.stdout;
}

export async function transcribeTwitchStreamSample(options: TranscribeTwitchStreamOptions) {
  const channel = cleanChannel(options.channel);
  if (!options.apiKey.trim()) {
    throw new Error('OpenAI provider key is not configured.');
  }

  const streamUrl = await resolveTwitchStreamUrl(channel);
  const audio = await captureAudioSample(streamUrl, options.sampleSeconds);
  const form = new FormData();
  form.append('model', options.model.trim() || 'whisper-1');
  form.append('response_format', 'json');
  if (options.prompt?.trim()) {
    form.append('prompt', options.prompt.trim().slice(0, 600));
  }
  form.append(
    'file',
    new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' }),
    `twitch-${channel}.mp3`,
  );

  const response = await fetch(
    `${options.apiBaseUrl.replace(/\/+$/, '')}/audio/transcriptions`,
    {
      body: form,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
      method: 'POST',
    },
  );
  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    text?: string;
  };
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI transcription failed with HTTP ${response.status}.`);
  }

  return {
    channel,
    model: options.model.trim() || 'whisper-1',
    sampleSeconds: Math.max(5, Math.min(60, Math.round(options.sampleSeconds))),
    text: (data.text ?? '').replace(/\s+/g, ' ').trim(),
  };
}

export async function captureTwitchStreamFrame(channelValue: string) {
  const channel = cleanChannel(channelValue);
  const streamUrl = await resolveTwitchStreamUrl(channel);
  const frame = await captureJpegFrame(streamUrl);
  return {
    channel,
    imageDataUrl: `data:image/jpeg;base64,${frame.toString('base64')}`,
    mimeType: 'image/jpeg',
  };
}
