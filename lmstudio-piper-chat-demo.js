import * as tts from 'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/+esm';

const DEFAULT_VOICE_KEY = 'en_US-riko_2399-medium';
const CUSTOM_PIPER_VOICE = {
  key: DEFAULT_VOICE_KEY,
  name: 'riko_2399',
  quality: 'medium',
  num_speakers: 1,
  speaker_id_map: {},
  source: 'Local ONNX export from TextyMcSpeechy (Neuro text seed, Riko target voice)',
  kind: 'custom',
  remotePath: 'custom/en_US-riko_2399-medium.onnx',
  onnxUrl: new URL('./custom-voices/piper/en_US-riko_2399-medium.onnx', import.meta.url).href,
  configUrl: new URL('./custom-voices/piper/en_US-riko_2399-medium.onnx.json', import.meta.url).href,
  language: {
    code: 'en_US',
    family: 'en',
    region: 'US',
    name_native: 'English',
    name_english: 'English',
    country_english: 'United States',
  },
};

const state = {
  storedVoices: new Set(),
  models: [],
  messages: [],
  playlist: [],
  currentAudio: null,
  busy: false,
  fetchHookInstalled: false,
  runCounter: 0,
  activeRun: null,
  totalSynthMs: 0,
};

let els;

window.addEventListener('DOMContentLoaded', () => {
  try {
    ensureShell();
    els = collectElements();
    bootstrap().catch((error) => handleFatal(error));
  } catch (error) {
    handleFatal(error);
  }
});

async function bootstrap() {
  registerCustomPiperVoice();
  installFetchHook();
  bindEvents();
  renderMessages();
  renderPlaylist();
  await verifyLocalVoiceAssets();
  await refreshStoredVoices();
  await loadLmStudioModels();
  updateMetrics();
  logLine('Chat demo ready. Warm the voice cache or send a message.', 'ok');
}

function ensureShell() {
  const requiredIds = ['warm-cache', 'send-chat', 'playlist-player', 'voice-label', 'cache-state', 'model-select', 'refresh-models'];
  if (requiredIds.every((id) => document.getElementById(id))) {
    return;
  }

  document.body.innerHTML = `
    <main style="padding:20px;max-width:1400px;margin:0 auto;color:#edf3ff;font-family:Cascadia Code,Consolas,monospace;background:#05070a;min-height:100vh">
      <section style="border:1px solid rgba(153,186,255,.18);border-radius:24px;background:rgba(9,14,22,.88);padding:20px;margin-bottom:18px">
        <p style="margin:0 0 8px;color:#73ffd5;text-transform:uppercase;letter-spacing:.18em;font-size:.72rem">Local Speed Harness</p>
        <h1 style="margin:0;font-family:'Iowan Old Style','Palatino Linotype',serif;font-size:clamp(2.2rem,5vw,4.4rem);line-height:.92">LM Studio stream in, Piper queue out.</h1>
        <p style="max-width:70ch;color:#92a4bf;line-height:1.6">The shell markup was missing, so the script rendered a fallback version. It still uses the same local Riko Piper voice and LM Studio stream pipeline.</p>
      </section>
      <section style="display:grid;grid-template-columns:minmax(360px,.9fr) minmax(420px,1.15fr) minmax(320px,.82fr);gap:18px">
        <section style="border:1px solid rgba(153,186,255,.18);border-radius:24px;background:rgba(9,14,22,.88);padding:18px;display:grid;gap:14px">
          <p style="margin:0;color:#92a4bf;text-transform:uppercase;letter-spacing:.18em;font-size:.72rem">Connection</p>
          <label style="display:grid;gap:8px;color:#92a4bf">LM Studio base URL<input id="base-url" type="text" value="http://127.0.0.1:1234/v1" style="width:100%;border:1px solid rgba(153,186,255,.18);border-radius:16px;background:rgba(4,8,13,.88);color:#edf3ff;padding:12px 14px" /></label>
          <label style="display:grid;gap:8px;color:#92a4bf">LM Studio model
            <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px">
              <select id="model-select" style="width:100%;border:1px solid rgba(153,186,255,.18);border-radius:16px;background:rgba(4,8,13,.88);color:#edf3ff;padding:12px 14px">
                <option value="local-model">local-model</option>
              </select>
              <button id="refresh-models" type="button" style="border:1px solid rgba(153,186,255,.18);border-radius:16px;padding:11px 14px;color:#edf3ff;background:rgba(255,255,255,.05);cursor:pointer">Refresh</button>
            </div>
          </label>
          <div id="model-status" style="color:#92a4bf;font-size:.84rem">Idle</div>
          <label style="display:grid;gap:8px;color:#92a4bf">System prompt<textarea id="system-prompt" style="width:100%;min-height:112px;border:1px solid rgba(153,186,255,.18);border-radius:16px;background:rgba(4,8,13,.88);color:#edf3ff;padding:12px 14px;resize:vertical;line-height:1.55">You are a fast local companion. Respond conversationally, keep your sentences compact, and do not dump huge paragraphs unless explicitly asked.</textarea></label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;color:#92a4bf"><span>Voice: <strong id="voice-label">Riko 2399</strong></span><span>Cache state: <strong id="cache-state">unknown</strong></span></div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <button id="warm-cache" type="button" style="border:1px solid rgba(153,186,255,.18);border-radius:16px;padding:11px 14px;color:#edf3ff;background:linear-gradient(180deg, rgba(47,88,80,.45), rgba(10,23,29,.9));cursor:pointer">Warm Voice Cache</button>
            <button id="clear-chat" type="button" style="border:1px solid rgba(153,186,255,.18);border-radius:16px;padding:11px 14px;color:#edf3ff;background:rgba(255,255,255,.05);cursor:pointer">Clear Chat</button>
            <button id="stop-run" type="button" style="border:1px solid rgba(255,143,155,.35);border-radius:16px;padding:11px 14px;color:#edf3ff;background:linear-gradient(180deg, rgba(115,36,49,.45), rgba(31,8,14,.92));cursor:pointer">Stop Run</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
            <div style="border:1px solid rgba(153,186,255,.18);border-radius:18px;padding:12px 14px"><span style="display:block;color:#92a4bf;font-size:.78rem;text-transform:uppercase;letter-spacing:.14em">Cache</span><strong id="metric-cache">cold</strong></div>
            <div style="border:1px solid rgba(153,186,255,.18);border-radius:18px;padding:12px 14px"><span style="display:block;color:#92a4bf;font-size:.78rem;text-transform:uppercase;letter-spacing:.14em">Queue Depth</span><strong id="metric-queue-depth">0</strong></div>
            <div style="border:1px solid rgba(153,186,255,.18);border-radius:18px;padding:12px 14px"><span style="display:block;color:#92a4bf;font-size:.78rem;text-transform:uppercase;letter-spacing:.14em">First Token</span><strong id="metric-first-token">-</strong></div>
            <div style="border:1px solid rgba(153,186,255,.18);border-radius:18px;padding:12px 14px"><span style="display:block;color:#92a4bf;font-size:.78rem;text-transform:uppercase;letter-spacing:.14em">First Audio Ready</span><strong id="metric-first-audio">-</strong></div>
            <div style="border:1px solid rgba(153,186,255,.18);border-radius:18px;padding:12px 14px"><span style="display:block;color:#92a4bf;font-size:.78rem;text-transform:uppercase;letter-spacing:.14em">Audio Start</span><strong id="metric-first-play">-</strong></div>
            <div style="border:1px solid rgba(153,186,255,.18);border-radius:18px;padding:12px 14px"><span style="display:block;color:#92a4bf;font-size:.78rem;text-transform:uppercase;letter-spacing:.14em">Total Synth</span><strong id="metric-total-synth">0.0 ms</strong></div>
            <div style="border:1px solid rgba(153,186,255,.18);border-radius:18px;padding:12px 14px"><span style="display:block;color:#92a4bf;font-size:.78rem;text-transform:uppercase;letter-spacing:.14em">Chunks Ready</span><strong id="metric-chunks-ready">0</strong></div>
            <div style="border:1px solid rgba(153,186,255,.18);border-radius:18px;padding:12px 14px"><span style="display:block;color:#92a4bf;font-size:.78rem;text-transform:uppercase;letter-spacing:.14em">Chunks Played</span><strong id="metric-chunks-played">0</strong></div>
          </div>
          <audio id="playlist-player" controls style="width:100%"></audio>
          <div style="border:1px solid rgba(153,186,255,.18);border-radius:18px;padding:10px 14px;color:#92a4bf">Status: <strong id="status-line">Idle</strong></div>
          <pre id="event-log" style="border:1px solid rgba(153,186,255,.18);border-radius:18px;background:rgba(14,21,32,.96);padding:14px;min-height:220px;max-height:28vh;overflow:auto;white-space:pre-wrap;color:#edf3ff"></pre>
        </section>
        <section style="border:1px solid rgba(153,186,255,.18);border-radius:24px;background:rgba(9,14,22,.88);padding:18px;display:grid;gap:14px">
          <p style="margin:0;color:#92a4bf;text-transform:uppercase;letter-spacing:.18em;font-size:.72rem">Conversation</p>
          <div id="chat-log" style="border:1px solid rgba(153,186,255,.18);border-radius:18px;background:rgba(14,21,32,.96);padding:14px;min-height:420px;max-height:64vh;overflow:auto"></div>
          <label style="display:grid;gap:8px;color:#92a4bf">Message<textarea id="chat-input" style="width:100%;min-height:112px;border:1px solid rgba(153,186,255,.18);border-radius:16px;background:rgba(4,8,13,.88);color:#edf3ff;padding:12px 14px;resize:vertical;line-height:1.55">Give me a quick hello in three short sentences so I can test stream-to-speech speed.</textarea></label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;color:#92a4bf"><span>Press <strong>Ctrl+Enter</strong> to send.</span><span>Chunking prefers sentence endings, then clause breaks if the stream runs long.</span></div>
          <div style="display:flex;gap:12px;flex-wrap:wrap"><button id="send-chat" type="button" style="border:1px solid rgba(153,186,255,.18);border-radius:16px;padding:11px 14px;color:#edf3ff;background:linear-gradient(180deg, rgba(47,88,80,.45), rgba(10,23,29,.9));cursor:pointer">Send</button></div>
        </section>
        <section style="border:1px solid rgba(153,186,255,.18);border-radius:24px;background:rgba(9,14,22,.88);padding:18px;display:grid;gap:14px">
          <p style="margin:0;color:#92a4bf;text-transform:uppercase;letter-spacing:.18em;font-size:.72rem">Speech Queue</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <button id="play-next" type="button" style="border:1px solid rgba(153,186,255,.18);border-radius:16px;padding:11px 14px;color:#edf3ff;background:rgba(255,255,255,.05);cursor:pointer">Play Next Ready</button>
            <button id="clear-playlist" type="button" style="border:1px solid rgba(153,186,255,.18);border-radius:16px;padding:11px 14px;color:#edf3ff;background:rgba(255,255,255,.05);cursor:pointer">Clear Playlist</button>
          </div>
          <div id="playlist" style="border:1px solid rgba(153,186,255,.18);border-radius:18px;background:rgba(14,21,32,.96);padding:14px;min-height:420px;max-height:64vh;overflow:auto"></div>
        </section>
      </section>
    </main>
  `;
}

function bindEvents() {
  els.warmCache.addEventListener('click', () => {
    void ensureVoiceCached();
  });
  els.sendChat.addEventListener('click', () => {
    void sendChat();
  });
  els.refreshModels.addEventListener('click', () => {
    void loadLmStudioModels();
  });
  els.clearChat.addEventListener('click', clearChat);
  els.stopRun.addEventListener('click', () => stopActiveRun('Stopped by user.'));
  els.playNext.addEventListener('click', () => {
    void maybePlayNext();
  });
  els.clearPlaylist.addEventListener('click', clearPlaylist);
  els.chatInput.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void sendChat();
    }
  });
  els.baseUrl.addEventListener('change', () => {
    void loadLmStudioModels();
  });
  els.playlistPlayer.addEventListener('ended', handlePlaybackEnded);
  els.playlistPlayer.addEventListener('error', handlePlaybackError);
}

function collectElements() {
  return {
    baseUrl: byId('base-url'),
    modelSelect: byId('model-select'),
    modelStatus: byId('model-status'),
    refreshModels: byId('refresh-models'),
    systemPrompt: byId('system-prompt'),
    voiceLabel: byId('voice-label'),
    cacheState: byId('cache-state'),
    warmCache: byId('warm-cache'),
    clearChat: byId('clear-chat'),
    stopRun: byId('stop-run'),
    playlistPlayer: byId('playlist-player'),
    statusLine: byId('status-line'),
    eventLog: byId('event-log'),
    chatLog: byId('chat-log'),
    chatInput: byId('chat-input'),
    sendChat: byId('send-chat'),
    playNext: byId('play-next'),
    clearPlaylist: byId('clear-playlist'),
    playlist: byId('playlist'),
    metricCache: byId('metric-cache'),
    metricQueueDepth: byId('metric-queue-depth'),
    metricFirstToken: byId('metric-first-token'),
    metricFirstAudio: byId('metric-first-audio'),
    metricFirstPlay: byId('metric-first-play'),
    metricTotalSynth: byId('metric-total-synth'),
    metricChunksReady: byId('metric-chunks-ready'),
    metricChunksPlayed: byId('metric-chunks-played'),
  };
}

function registerCustomPiperVoice() {
  tts.PATH_MAP[CUSTOM_PIPER_VOICE.key] = CUSTOM_PIPER_VOICE.remotePath;
  els.voiceLabel.textContent = `${CUSTOM_PIPER_VOICE.name} | local`;
}

function installFetchHook() {
  if (state.fetchHookInstalled) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = getRequestUrl(input);
    if (
      url === `${tts.HF_BASE}/${CUSTOM_PIPER_VOICE.remotePath}` ||
      url === `${tts.HF_BASE}/${CUSTOM_PIPER_VOICE.remotePath}.json`
    ) {
      const isConfig = url.endsWith('.json');
      logLine(`Serving local Piper asset ${isConfig ? 'config' : 'model'} for ${CUSTOM_PIPER_VOICE.key}.`);
      return originalFetch(isConfig ? CUSTOM_PIPER_VOICE.configUrl : CUSTOM_PIPER_VOICE.onnxUrl, init);
    }

    return originalFetch(input, init);
  };

  state.fetchHookInstalled = true;
}

async function refreshStoredVoices() {
  try {
    state.storedVoices = new Set(await tts.stored());
  } catch (error) {
    logLine(`Could not read Piper cache: ${formatError(error)}`, 'warn');
    state.storedVoices = new Set();
  }

  const cached = state.storedVoices.has(CUSTOM_PIPER_VOICE.key);
  els.cacheState.textContent = cached ? 'cached' : 'cold';
  els.metricCache.textContent = cached ? 'cached' : 'cold';
}

async function verifyLocalVoiceAssets() {
  try {
    const [configResponse, modelResponse] = await Promise.all([
      fetch(CUSTOM_PIPER_VOICE.configUrl, { cache: 'no-store' }),
      fetch(CUSTOM_PIPER_VOICE.onnxUrl, { method: 'HEAD', cache: 'no-store' }),
    ]);

    if (!configResponse.ok) {
      throw new Error(`Config fetch failed with ${configResponse.status}`);
    }
    if (!modelResponse.ok) {
      throw new Error(`Model fetch failed with ${modelResponse.status}`);
    }

    logLine('Verified local Riko Piper model assets are reachable.', 'ok');
  } catch (error) {
    logLine(`Local voice asset check failed: ${formatError(error)}`, 'warn');
    setStatus(`Local voice asset check failed: ${formatError(error)}`);
  }
}

async function ensureVoiceCached() {
  if (state.storedVoices.has(CUSTOM_PIPER_VOICE.key)) {
    setStatus('Riko voice already cached.');
    return;
  }

  await withBusy('Caching local Riko voice...', async () => {
    const start = performance.now();
    await tts.download(CUSTOM_PIPER_VOICE.key, makeProgressCallback('Caching Riko voice'));
    const elapsed = performance.now() - start;
    await refreshStoredVoices();
    setStatus(`Riko cache ready in ${formatMs(elapsed)}.`);
    logLine(`Cached ${CUSTOM_PIPER_VOICE.key} in ${formatMs(elapsed)}.`, 'ok');
  });
}

async function loadLmStudioModels() {
  const baseUrl = els.baseUrl.value.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    state.models = [];
    renderModelOptions();
    els.modelStatus.textContent = 'Enter a base URL first.';
    return;
  }

  const endpoint = `${baseUrl}/models`;
  els.modelStatus.textContent = 'Loading models...';

  try {
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const modelIds = Array.isArray(payload.data)
      ? payload.data.map((entry) => entry?.id).filter((value) => typeof value === 'string' && value.trim())
      : [];

    state.models = Array.from(new Set(modelIds));
    renderModelOptions();

    if (state.models.length) {
      els.modelStatus.textContent = `${state.models.length} model${state.models.length === 1 ? '' : 's'} loaded.`;
      logLine(`Loaded ${state.models.length} model(s) from LM Studio.`, 'ok');
    } else {
      els.modelStatus.textContent = 'No models returned. Using fallback option.';
      logLine('LM Studio /models returned no ids. Falling back to local-model.', 'warn');
    }
  } catch (error) {
    state.models = [];
    renderModelOptions();
    els.modelStatus.textContent = `Model list failed: ${formatError(error)}`;
    logLine(`LM Studio model list failed: ${formatError(error)}`, 'warn');
  }
}

function renderModelOptions() {
  const currentValue = els.modelSelect.value;
  const options = state.models.length ? state.models : ['local-model'];
  els.modelSelect.innerHTML = options
    .map((modelId) => `<option value="${escapeHtml(modelId)}">${escapeHtml(modelId)}</option>`)
    .join('');

  const nextValue = options.includes(currentValue) ? currentValue : options[0];
  els.modelSelect.value = nextValue;
}

async function sendChat() {
  const userText = els.chatInput.value.trim();
  if (!userText) {
    setStatus('Enter a message first.');
    return;
  }

  stopActiveRun('Starting a new run.', false);
  clearPlaylist(true);
  state.totalSynthMs = 0;
  await ensureVoiceCached();

  const userMessage = makeMessage('user', userText);
  const assistantMessage = makeMessage('assistant', '');
  state.messages.push(userMessage, assistantMessage);
  renderMessages();

  const run = createRunState(assistantMessage.id);
  state.activeRun = run;
  updateMetrics();

  await withBusy('Streaming LM Studio response...', async () => {
    await streamLmStudio(run, userText);
    await finalizeRun(run);
  });
}

function createRunState(assistantMessageId) {
  return {
    id: ++state.runCounter,
    assistantMessageId,
    startedAt: performance.now(),
    abortController: new AbortController(),
    pendingText: '',
    ttsChain: Promise.resolve(),
    firstTokenMs: null,
    firstAudioReadyMs: null,
    firstPlayMs: null,
    chunksReady: 0,
    chunksPlayed: 0,
    maxQueueDepth: 0,
    finished: false,
  };
}

async function streamLmStudio(run, userText) {
  const baseUrl = els.baseUrl.value.trim().replace(/\/+$/, '');
  const endpoint = `${baseUrl}/chat/completions`;
  const payload = {
    model: els.modelSelect.value.trim() || 'local-model',
    stream: true,
    temperature: 0.7,
    messages: [
      { role: 'system', content: els.systemPrompt.value.trim() },
      { role: 'user', content: userText },
    ],
  };

  logLine(`POST ${endpoint}`, 'ok');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: run.abortController.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`LM Studio request failed with ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    ({ events: buffer } = await processSseBuffer(run, buffer));
  }

  const finalChunk = decoder.decode();
  if (finalChunk) {
    buffer += finalChunk;
  }
  ({ events: buffer } = await processSseBuffer(run, buffer, true));
}

async function processSseBuffer(run, buffer, flush = false) {
  let remaining = buffer;

  while (true) {
    const boundary = remaining.indexOf('\n\n');
    if (boundary === -1) {
      break;
    }

    const rawEvent = remaining.slice(0, boundary);
    remaining = remaining.slice(boundary + 2);
    await handleSseEvent(run, rawEvent);
  }

  if (flush && remaining.trim()) {
    await handleSseEvent(run, remaining);
    remaining = '';
  }

  return { events: remaining };
}

async function handleSseEvent(run, rawEvent) {
  const dataLines = rawEvent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());

  if (!dataLines.length) {
    return;
  }

  const data = dataLines.join('\n');
  if (data === '[DONE]') {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    return;
  }

  const delta =
    payload.choices?.[0]?.delta?.content ??
    payload.choices?.[0]?.message?.content ??
    payload.content ??
    '';

  if (!delta) {
    return;
  }

  handleAssistantDelta(run, delta);
}

function handleAssistantDelta(run, delta) {
  if (!state.activeRun || state.activeRun.id !== run.id) {
    return;
  }

  if (run.firstTokenMs == null) {
    run.firstTokenMs = performance.now() - run.startedAt;
    logLine(`First token at ${formatMs(run.firstTokenMs)}.`, 'ok');
  }

  const assistantMessage = state.messages.find((message) => message.id === run.assistantMessageId);
  if (assistantMessage) {
    assistantMessage.content += delta;
  }

  run.pendingText += delta;
  renderMessages();
  updateMetrics();

  const extracted = extractSpeakableChunks(run.pendingText);
  run.pendingText = extracted.remaining;

  for (const chunkText of extracted.chunks) {
    queueSpeechChunk(run, chunkText);
  }
}

function extractSpeakableChunks(text, force = false) {
  const chunks = [];
  let remaining = text;

  while (true) {
    const boundary = findChunkBoundary(remaining, force);
    if (boundary === -1) {
      break;
    }

    const nextChunk = normalizeChunk(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary).replace(/^\s+/, '');

    if (nextChunk) {
      chunks.push(nextChunk);
    }

    if (force && !remaining.trim()) {
      break;
    }
  }

  return { chunks, remaining };
}

function findChunkBoundary(text, force = false) {
  const trimmed = text.trim();
  if (!trimmed) {
    return -1;
  }

  const sentenceMatch = text.match(/^[\s\S]{24,}?[.!?]["')\]]?(?=\s|$)/);
  if (sentenceMatch) {
    return sentenceMatch[0].length;
  }

  if (text.length >= 110) {
    let best = -1;
    const clauseRegex = /[,;:]\s+/g;
    for (const match of text.matchAll(clauseRegex)) {
      if (match.index != null && match.index > 45) {
        best = match.index + match[0].length;
      }
    }
    if (best !== -1) {
      return best;
    }
  }

  if (force) {
    return text.length;
  }

  return -1;
}

function normalizeChunk(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function queueSpeechChunk(run, text) {
  const item = {
    id: `chunk-${run.id}-${state.playlist.length + 1}`,
    runId: run.id,
    text,
    status: 'generating',
    synthMs: null,
    url: '',
    objectUrl: '',
    error: '',
  };

  state.playlist.push(item);
  updateQueueDepth(run);
  renderPlaylist();
  run.ttsChain = run.ttsChain.then(() => synthesizePlaylistItem(run, item));
}

async function synthesizePlaylistItem(run, item) {
  if (!state.activeRun || state.activeRun.id !== run.id) {
    item.status = 'cancelled';
    renderPlaylist();
    return;
  }

  const start = performance.now();
  const wavBlob = await tts.predict(
    {
      text: item.text,
      voiceId: CUSTOM_PIPER_VOICE.key,
    },
    makeProgressCallback(`Synth chunk ${state.playlist.indexOf(item) + 1}`),
  );
  const elapsed = performance.now() - start;
  state.totalSynthMs += elapsed;

  item.synthMs = elapsed;
  item.objectUrl = URL.createObjectURL(wavBlob);
  item.url = item.objectUrl;
  item.status = 'ready';

  run.chunksReady += 1;
  if (run.firstAudioReadyMs == null) {
    run.firstAudioReadyMs = performance.now() - run.startedAt;
    logLine(`First audio ready at ${formatMs(run.firstAudioReadyMs)}.`, 'ok');
  }

  updateQueueDepth(run);
  renderPlaylist();
  updateMetrics();
  await maybePlayNext();
}

async function finalizeRun(run) {
  const flushed = extractSpeakableChunks(run.pendingText, true);
  run.pendingText = flushed.remaining;
  flushed.chunks.forEach((chunk) => queueSpeechChunk(run, chunk));
  await run.ttsChain;
  run.finished = true;
  updateMetrics();
  setStatus('Stream finished. Waiting for playlist playback.');
  logLine(`Run ${run.id} complete with ${run.chunksReady} chunk(s) ready.`, 'ok');
}

async function maybePlayNext() {
  if (state.currentAudio) {
    return;
  }

  const next = state.playlist.find((item) => item.status === 'ready');
  if (!next) {
    return;
  }

  playPlaylistItem(next);
}

function playPlaylistItem(item) {
  item.status = 'playing';
  renderPlaylist();

  state.currentAudio = item.id;
  els.playlistPlayer.src = item.url;
  els.playlistPlayer.dataset.playingId = item.id;
  void els.playlistPlayer.play().then(() => {
    const run = state.activeRun && state.activeRun.id === item.runId ? state.activeRun : null;
    if (run && run.firstPlayMs == null) {
      run.firstPlayMs = performance.now() - run.startedAt;
      logLine(`First playback started at ${formatMs(run.firstPlayMs)}.`, 'ok');
      updateMetrics();
    }
    setStatus(`Playing chunk ${state.playlist.findIndex((entry) => entry.id === item.id) + 1}.`);
  }).catch((error) => {
    item.status = 'error';
    item.error = formatError(error);
    state.currentAudio = null;
    renderPlaylist();
    setStatus(`Playback failed: ${formatError(error)}`);
  });
}

function handlePlaybackEnded() {
  const item = state.playlist.find((entry) => entry.id === els.playlistPlayer.dataset.playingId);
  if (item) {
    item.status = 'done';
    const run = state.activeRun && state.activeRun.id === item.runId ? state.activeRun : null;
    if (run) {
      run.chunksPlayed += 1;
      updateMetrics();
    }
  }

  state.currentAudio = null;
  renderPlaylist();
  void maybePlayNext();
}

function handlePlaybackError() {
  const item = state.playlist.find((entry) => entry.id === els.playlistPlayer.dataset.playingId);
  if (item) {
    item.status = 'error';
    item.error = 'audio element error';
  }
  state.currentAudio = null;
  renderPlaylist();
  setStatus('Playback error on current chunk.');
}

function stopActiveRun(status = 'Run stopped.', clearBusy = true) {
  if (state.activeRun) {
    state.activeRun.abortController.abort();
    state.activeRun.finished = true;
  }

  if (clearBusy) {
    state.busy = false;
    toggleControls(false);
  }

  setStatus(status);
}

function clearChat() {
  stopActiveRun('Chat cleared.', false);
  state.messages = [];
  renderMessages();
}

function clearPlaylist(silent = false) {
  if (state.currentAudio) {
    els.playlistPlayer.pause();
    state.currentAudio = null;
  }

  els.playlistPlayer.removeAttribute('src');
  els.playlistPlayer.load();

  for (const item of state.playlist) {
    if (item.objectUrl) {
      URL.revokeObjectURL(item.objectUrl);
    }
  }

  state.playlist = [];
  state.totalSynthMs = 0;
  updateMetrics();
  renderPlaylist();

  if (!silent) {
    setStatus('Playlist cleared.');
  }
}

function renderMessages() {
  if (!state.messages.length) {
    els.chatLog.innerHTML = '<div class="message assistant"><div class="message-head"><span>assistant</span><span>idle</span></div><div class="message-body">No conversation yet. Send a prompt to start the stream.</div></div>';
    return;
  }

  els.chatLog.innerHTML = state.messages
    .map(
      (message) => `
        <article class="message ${escapeHtml(message.role)}">
          <div class="message-head">
            <span>${escapeHtml(message.role)}</span>
            <span>${new Date(message.createdAt).toLocaleTimeString()}</span>
          </div>
          <div class="message-body">${escapeHtml(message.content || '...')}</div>
        </article>
      `,
    )
    .join('');

  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function renderPlaylist() {
  if (!state.playlist.length) {
    els.playlist.innerHTML = '<div class="playlist-item"><div class="playlist-head"><span>queue</span><span>empty</span></div><div class="message-body">Chunks will appear here as the stream produces speakable segments.</div></div>';
    return;
  }

  els.playlist.innerHTML = state.playlist
    .map((item, index) => {
      const canPlay = item.status === 'ready' || item.status === 'done';
      const statusClass = `is-${item.status}`;
      return `
        <article class="playlist-item ${statusClass}">
          <div class="playlist-head">
            <span>chunk ${index + 1}</span>
            <span>${escapeHtml(item.status)}</span>
          </div>
          <div class="message-body">${escapeHtml(item.text)}</div>
          <div class="playlist-meta">
            <span>synth: <strong>${item.synthMs != null ? formatMs(item.synthMs) : '-'}</strong></span>
            <span>chars: <strong>${item.text.length}</strong></span>
            ${item.error ? `<span>error: <strong>${escapeHtml(item.error)}</strong></span>` : ''}
          </div>
          <div class="playlist-actions" style="margin-top:10px">
            <button type="button" data-play-id="${escapeHtml(item.id)}" class="secondary" ${canPlay ? '' : 'disabled'}>Play</button>
          </div>
        </article>
      `;
    })
    .join('');

  for (const button of els.playlist.querySelectorAll('[data-play-id]')) {
    button.addEventListener('click', () => {
      const item = state.playlist.find((entry) => entry.id === button.getAttribute('data-play-id'));
      if (item?.url) {
        if (state.currentAudio) {
          els.playlistPlayer.pause();
          state.currentAudio = null;
        }
        playPlaylistItem(item);
      }
    });
  }
}

function updateQueueDepth(run = state.activeRun) {
  if (!run) {
    els.metricQueueDepth.textContent = '0';
    return;
  }

  const queued = state.playlist.filter((item) => item.runId === run.id && ['generating', 'ready', 'playing'].includes(item.status)).length;
  run.maxQueueDepth = Math.max(run.maxQueueDepth, queued);
  els.metricQueueDepth.textContent = String(run.maxQueueDepth);
}

function updateMetrics() {
  const run = state.activeRun;
  const cached = state.storedVoices.has(CUSTOM_PIPER_VOICE.key);

  els.metricCache.textContent = cached ? 'cached' : 'cold';
  els.metricFirstToken.textContent = run?.firstTokenMs != null ? formatMs(run.firstTokenMs) : '-';
  els.metricFirstAudio.textContent = run?.firstAudioReadyMs != null ? formatMs(run.firstAudioReadyMs) : '-';
  els.metricFirstPlay.textContent = run?.firstPlayMs != null ? formatMs(run.firstPlayMs) : '-';
  els.metricTotalSynth.textContent = formatMs(state.totalSynthMs);
  els.metricChunksReady.textContent = String(run?.chunksReady ?? 0);
  els.metricChunksPlayed.textContent = String(run?.chunksPlayed ?? 0);
  updateQueueDepth(run);
}

function makeMessage(role, content) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
  };
}

function toggleControls(disabled) {
  [
    els.warmCache,
    els.clearChat,
    els.stopRun,
    els.sendChat,
    els.playNext,
    els.clearPlaylist,
  ].forEach((button) => {
    button.disabled = disabled && button !== els.stopRun;
  });
}

async function withBusy(status, task) {
  if (state.busy) {
    setStatus('Busy. Stop the current run or wait for it to finish.');
    return;
  }

  state.busy = true;
  toggleControls(true);
  setStatus(status);

  try {
    await task();
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      logLine(formatError(error), 'error');
      setStatus(formatError(error));
      console.error(error);
    }
  } finally {
    state.busy = false;
    toggleControls(false);
    updateMetrics();
  }
}

function makeProgressCallback(label) {
  let lastPercent = -1;
  return (progress) => {
    const percent = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;
    if (percent !== lastPercent) {
      lastPercent = percent;
      setStatus(`${label}: ${percent}%`);
    }
  };
}

function setStatus(text) {
  els.statusLine.textContent = text;
}

function logLine(message, tone = 'ok') {
  const stamp = new Date().toLocaleTimeString();
  const prefix = tone === 'error' ? 'ERR' : tone === 'warn' ? 'WARN' : 'OK';
  const existing = els.eventLog.textContent ? `${els.eventLog.textContent}\n` : '';
  els.eventLog.textContent = `${existing}[${stamp}] ${prefix} ${message}`;
  els.eventLog.scrollTop = els.eventLog.scrollHeight;
}

function getRequestUrl(input) {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  if (input && typeof input.url === 'string') {
    return input.url;
  }
  return '';
}

function byId(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}.`);
  }
  return element;
}

function formatMs(value) {
  return `${value.toFixed(1)} ms`;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function handleFatal(error) {
  console.error(error);
  document.body.innerHTML = `
    <main style="padding:24px;font-family:Cascadia Code,Consolas,monospace;background:#05070a;color:#edf3ff;min-height:100vh">
      <h1 style="margin:0 0 12px;font-size:28px">Chat demo failed to boot</h1>
      <pre style="padding:16px;border:1px solid rgba(153,186,255,.2);border-radius:16px;background:#020305;white-space:pre-wrap">${escapeHtml(formatError(error))}</pre>
    </main>
  `;
}
