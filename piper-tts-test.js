import * as tts from 'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/+esm';

const DEFAULT_VOICE = 'en_US-riko_2399-medium';
const DEFAULT_FILTER = 'en_US';
const PITCH_OVERLAP_RATIO = 0.75;
const FORMANT_OVERLAP_RATIO = 0.75;
const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const CUSTOM_PIPER_VOICES = {
  'en_US-riko_2399-medium': {
    key: 'en_US-riko_2399-medium',
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
  },
};
const CUSTOM_KOKORO_VOICES = {
  af_mika: {
    label: 'af_mika | Sethblocks custom',
    source: 'Local .bin converted from Sethblocks af_mika.pt',
    binUrl: new URL('./custom-voices/af_mika.bin', import.meta.url).href,
    dialect: 'a',
    kind: 'custom',
  },
};
const BUILTIN_KOKORO_VOICES = {
  af_bella: {
    label: 'af_bella | official Bella',
    source: 'Official Kokoro voice',
    kind: 'official',
  },
  af_heart: {
    label: 'af_heart | official Heart',
    source: 'Official Kokoro voice',
    kind: 'official',
  },
};

const state = {
  voices: [],
  sourceBlob: null,
  sourceUrl: '',
  processedUrl: '',
  storedVoices: new Set(),
  busy: false,
  kokoroTts: null,
  kokoroModule: null,
  kokoroFetchInstalled: false,
};

let els;

window.addEventListener('DOMContentLoaded', () => {
  try {
    ensureShell();
    els = collectElements();
    void bootstrap();
  } catch (error) {
    renderBootError(error);
    console.error(error);
  }
});

async function bootstrap() {
  registerCustomPiperVoices();
  installKokoroFetchHook();
  renderCapabilities();
  bindEvents();
  els.voiceFilter.value = DEFAULT_FILTER;
  renderKokoroVoiceOptions();
  updateKokoroMeta();
  updateKokoroSpeedDisplay();
  updateVoiceFxDisplay();
  logLine('Booting browser TTS tester.');
  await refreshVoices();
  await refreshStoredVoices();
}

function bindEvents() {
  els.voiceFilter.addEventListener('input', renderVoiceOptions);
  els.voiceSelect.addEventListener('change', updateVoiceMeta);
  els.refreshVoices.addEventListener('click', refreshVoices);
  els.cacheVoice.addEventListener('click', cacheSelectedVoice);
  els.removeVoice.addEventListener('click', removeSelectedVoice);
  els.flushCache.addEventListener('click', flushAllVoices);
  els.kokoroVoice.addEventListener('change', updateKokoroMeta);
  els.kokoroDevice.addEventListener('change', updateKokoroMeta);
  els.kokoroSpeed.addEventListener('input', updateKokoroSpeedDisplay);
  els.kokoroInit.addEventListener('click', initKokoroModel);
  els.kokoroSynthesize.addEventListener('click', synthesizeKokoroVoice);
  els.synthesize.addEventListener('click', synthesizeSelectedVoice);
  els.playCurrent.addEventListener('click', playSourceAudio);
  els.audioUpload.addEventListener('change', handleAudioUpload);
  els.presenceSlider.addEventListener('input', updateVoiceFxDisplay);
  els.deessSlider.addEventListener('input', updateVoiceFxDisplay);
  els.airSlider.addEventListener('input', updateVoiceFxDisplay);
  els.processFx.addEventListener('click', processVoiceFxPass);
  els.resetFx.addEventListener('click', resetProcessedOutput);
}

function renderCapabilities() {
  const capabilities = [
    ['Secure Context', window.isSecureContext],
    ['OPFS', typeof navigator.storage?.getDirectory === 'function'],
    ['AudioContext', typeof window.AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined'],
    ['OfflineAudioContext', typeof window.OfflineAudioContext !== 'undefined'],
  ];

  els.capabilityBadges.innerHTML = capabilities
    .map(([label, ok]) => {
      const value = ok ? 'yes' : 'no';
      const color = ok ? '#aaf78d' : '#ff7c7c';
      return `<span class="badge">${label}: <strong style="color:${color}">${value}</strong></span>`;
    })
    .join('');
}

function renderKokoroVoiceOptions() {
  const options = [
    ...Object.entries(CUSTOM_KOKORO_VOICES).map(([id, meta]) => ({ id, ...meta })),
    ...Object.entries(BUILTIN_KOKORO_VOICES).map(([id, meta]) => ({ id, ...meta })),
  ];

  els.kokoroVoice.innerHTML = options
    .map(
      (voice) =>
        `<option value="${escapeHtml(voice.id)}">${escapeHtml(voice.label)}${voice.kind === 'custom' ? ' | local bin' : ''}</option>`,
    )
    .join('');

  if (!els.kokoroVoice.value) {
    els.kokoroVoice.value = 'af_mika';
  }
}

function getSelectedKokoroVoiceMeta() {
  const voiceId = els.kokoroVoice.value;
  if (CUSTOM_KOKORO_VOICES[voiceId]) {
    return { id: voiceId, ...CUSTOM_KOKORO_VOICES[voiceId] };
  }
  if (BUILTIN_KOKORO_VOICES[voiceId]) {
    return { id: voiceId, ...BUILTIN_KOKORO_VOICES[voiceId] };
  }
  return null;
}

function updateKokoroMeta() {
  const voice = getSelectedKokoroVoiceMeta();
  if (!voice) {
    els.kokoroMeta.innerHTML = '<span>No Kokoro voice selected.</span>';
    return;
  }

  const device = els.kokoroDevice.value === 'auto' ? 'auto detect' : els.kokoroDevice.value;
  const details = [
    ['Voice', voice.id],
    ['Kind', voice.kind],
    ['Device', device],
    ['Source', voice.source],
  ];

  els.kokoroMeta.innerHTML = details
    .map(([label, value]) => `<span>${label}: <strong style="color:#edf5ff">${escapeHtml(value)}</strong></span>`)
    .join('');
}

function updateKokoroSpeedDisplay() {
  els.kokoroSpeedDisplay.textContent = `${Number(els.kokoroSpeed.value).toFixed(2)}x`;
}

async function refreshVoices() {
  await withBusy('Loading voice list...', async () => {
    const remoteVoices = await tts.voices();
    const combinedVoices = new Map(Object.values(CUSTOM_PIPER_VOICES).map((voice) => [voice.key, voice]));
    for (const voice of remoteVoices) {
      if (!combinedVoices.has(voice.key)) {
        combinedVoices.set(voice.key, voice);
      }
    }
    state.voices = Array.from(combinedVoices.values());
    state.voices.sort((a, b) => {
      const aScore = a.key === DEFAULT_VOICE ? -1 : 0;
      const bScore = b.key === DEFAULT_VOICE ? -1 : 0;
      const aCustom = a.kind === 'custom' ? -1 : 0;
      const bCustom = b.kind === 'custom' ? -1 : 0;
      return aScore - bScore || aCustom - bCustom || a.key.localeCompare(b.key);
    });
    renderVoiceOptions();
    updateVoiceMeta();
    logLine(`Loaded ${state.voices.length} voices.`);
  });
}

function renderVoiceOptions() {
  const filter = els.voiceFilter.value.trim().toLowerCase();
  const selected = els.voiceSelect.value || DEFAULT_VOICE;
  const filtered = state.voices.filter((voice) => {
    if (!filter) {
      return true;
    }

    const haystack = [
      voice.key,
      voice.name,
      voice.language?.name_english,
      voice.language?.country_english,
      voice.quality,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(filter);
  });

  els.voiceSelect.innerHTML = filtered
    .map((voice) => {
      const label = [voice.key, voice.name, voice.quality, voice.language?.name_english].filter(Boolean).join(' | ');
      return `<option value="${escapeHtml(voice.key)}">${escapeHtml(label)}${voice.kind === 'custom' ? ' | local onnx' : ''}</option>`;
    })
    .join('');

  els.voiceSelect.value = filtered.some((voice) => voice.key === selected) ? selected : filtered[0]?.key || '';
  updateVoiceMeta();
}

async function refreshStoredVoices() {
  try {
    state.storedVoices = new Set(await tts.stored());
  } catch (error) {
    logLine(`Could not read stored voices: ${formatError(error)}`, 'warn');
    state.storedVoices = new Set();
  }

  els.storedCount.textContent = String(state.storedVoices.size);
  updateVoiceMeta();
}

function updateVoiceMeta() {
  const voice = getSelectedVoice();
  if (!voice) {
    els.voiceMeta.innerHTML = '<span>No voice selected.</span>';
    return;
  }

  const stored = state.storedVoices.has(voice.key) ? 'cached' : 'not cached';
  const details = [
    ['Voice', voice.key],
    ['Kind', voice.kind || 'builtin'],
    ['Quality', voice.quality || 'unknown'],
    ['Language', voice.language?.name_english || 'unknown'],
    ['Country', voice.language?.country_english || 'unknown'],
    ['Speakers', String(voice.num_speakers ?? 1)],
    ['Source', voice.source || 'Remote Piper registry'],
    ['State', stored],
  ];

  els.voiceMeta.innerHTML = details
    .map(([label, value]) => `<span>${label}: <strong style="color:#edf5ff">${escapeHtml(value)}</strong></span>`)
    .join('');
}

async function cacheSelectedVoice() {
  const voice = getSelectedVoice();
  if (!voice) {
    return;
  }

  await withBusy(`Caching ${voice.key}...`, async () => {
    resetProgress();
    const start = performance.now();
    await tts.download(voice.key, makeProgressCallback('Downloading model'));
    const elapsed = performance.now() - start;
    setMetric(els.metricDownload, formatMs(elapsed));
    setStatus(`Voice cached in ${formatMs(elapsed)}.`);
    logLine(`Cached ${voice.key} in ${formatMs(elapsed)}.`);
    await refreshStoredVoices();
  });
}

async function removeSelectedVoice() {
  const voice = getSelectedVoice();
  if (!voice) {
    return;
  }

  await withBusy(`Removing ${voice.key}...`, async () => {
    await tts.remove(voice.key);
    setStatus(`Removed ${voice.key} from browser storage.`);
    logLine(`Removed cached model for ${voice.key}.`, 'warn');
    await refreshStoredVoices();
  });
}

async function flushAllVoices() {
  await withBusy('Flushing cached voices...', async () => {
    await tts.flush();
    setStatus('Cleared browser-side Piper cache.');
    logLine('Flushed all cached Piper voices.', 'warn');
    await refreshStoredVoices();
  });
}

async function initKokoroModel() {
  await withBusy('Initializing Kokoro...', async () => {
    await ensureKokoroReady();
    setStatus('Kokoro model is ready.');
  });
}

async function synthesizeKokoroVoice() {
  const text = els.textInput.value.trim();
  const voice = getSelectedKokoroVoiceMeta();
  if (!voice) {
    setStatus('Pick a Kokoro voice first.');
    return;
  }
  if (!text) {
    setStatus('Enter text to synthesize.');
    return;
  }

  await withBusy(`Synthesizing with Kokoro ${voice.id}...`, async () => {
    resetProgress();
    const kokoro = await ensureKokoroReady();
    const synthStart = performance.now();
    const audio = await kokoro.generate(text, {
      voice: voice.id,
      speed: Number(els.kokoroSpeed.value),
    });
    const synthElapsed = performance.now() - synthStart;
    const wavBlob = floatSamplesToWavBlob(audio.audio, audio.sampling_rate);
    setMetric(els.metricSynthesis, formatMs(synthElapsed));
    await setSourceBlob(wavBlob, `Kokoro synth: ${voice.id}`, `${voice.id}.wav`);
    setStatus(`Kokoro synthesis finished in ${formatMs(synthElapsed)}.`);
    logLine(`Synthesized Kokoro voice ${voice.id} in ${formatMs(synthElapsed)}.`);

    if (els.autoFx.checked) {
      await runVoiceFxPass();
    }
  });
}

async function ensureKokoroReady() {
  if (state.kokoroTts) {
    return state.kokoroTts;
  }

  installKokoroFetchHook();

  if (!state.kokoroModule) {
    state.kokoroModule = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
  }

  const device = els.kokoroDevice.value === 'auto' ? null : els.kokoroDevice.value;
  const initStart = performance.now();
  state.kokoroTts = await state.kokoroModule.KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
    dtype: 'q4',
    device,
    progress_callback: makeKokoroProgressCallback(),
  });
  patchKokoroCustomVoices(state.kokoroTts);
  const initElapsed = performance.now() - initStart;
  setMetric(els.metricDownload, formatMs(initElapsed));
  logLine(`Initialized Kokoro in ${formatMs(initElapsed)} on ${device ?? 'auto'}.`);
  return state.kokoroTts;
}

function installKokoroFetchHook() {
  if (state.kokoroFetchInstalled) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = getRequestUrl(input);
    const customPiper = Object.values(CUSTOM_PIPER_VOICES).find(
      (voice) => url === `${tts.HF_BASE}/${voice.remotePath}` || url === `${tts.HF_BASE}/${voice.remotePath}.json`,
    );
    if (customPiper) {
      const isConfig = url.endsWith('.json');
      logLine(`Serving local custom Piper voice ${customPiper.key}${isConfig ? ' config' : ''}.`);
      return originalFetch(isConfig ? customPiper.configUrl : customPiper.onnxUrl, init);
    }
    const match = url.match(/\/voices\/([^/?#]+)\.bin(?:[?#].*)?$/);
    if (match) {
      const voiceId = match[1];
      const custom = CUSTOM_KOKORO_VOICES[voiceId];
      if (custom) {
        logLine(`Serving local custom Kokoro voice ${voiceId}.`);
        return originalFetch(custom.binUrl, init);
      }
    }

    return originalFetch(input, init);
  };

  state.kokoroFetchInstalled = true;
}

function registerCustomPiperVoices() {
  for (const voice of Object.values(CUSTOM_PIPER_VOICES)) {
    tts.PATH_MAP[voice.key] = voice.remotePath;
  }
}

function patchKokoroCustomVoices(kokoro) {
  if (kokoro.__customVoicePatchApplied) {
    return;
  }

  const originalValidate = kokoro._validate_voice?.bind(kokoro);
  if (typeof originalValidate !== 'function') {
    throw new Error('kokoro-js validation hook changed. Custom voice patch needs to be updated.');
  }

  kokoro._validate_voice = (voiceId) => {
    const custom = CUSTOM_KOKORO_VOICES[voiceId];
    if (custom) {
      return custom.dialect;
    }
    return originalValidate(voiceId);
  };
  kokoro.__customVoicePatchApplied = true;
}

function makeKokoroProgressCallback() {
  return (progress) => {
    const percent = progress.progress != null ? Math.round(progress.progress * 100) : 0;
    const label = progress.file ?? progress.status ?? 'Downloading Kokoro model';
    setProgress(percent, `${label}: ${percent}%`);
  };
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

async function synthesizeSelectedVoice() {
  const voice = getSelectedVoice();
  const text = els.textInput.value.trim();
  if (!voice) {
    setStatus('Pick a voice first.');
    return;
  }
  if (!text) {
    setStatus('Enter text to synthesize.');
    return;
  }

  await withBusy(`Synthesizing with ${voice.key}...`, async () => {
    resetProgress();
    if (!state.storedVoices.has(voice.key)) {
      const downloadStart = performance.now();
      await tts.download(voice.key, makeProgressCallback('Caching before synth'));
      const downloadElapsed = performance.now() - downloadStart;
      setMetric(els.metricDownload, formatMs(downloadElapsed));
      logLine(`Pre-cached ${voice.key} in ${formatMs(downloadElapsed)}.`);
      await refreshStoredVoices();
    }

    const synthStart = performance.now();
    const wavBlob = await tts.predict(
      {
        text,
        voiceId: voice.key,
      },
      makeProgressCallback('Synthesizing'),
    );
    const synthElapsed = performance.now() - synthStart;
    setMetric(els.metricSynthesis, formatMs(synthElapsed));
    await setSourceBlob(wavBlob, `Piper synth: ${voice.key}`, `${voice.key}.wav`);
    setStatus(`Synthesis finished in ${formatMs(synthElapsed)}.`);
    logLine(`Synthesized ${voice.key} in ${formatMs(synthElapsed)}.`);

    if (els.autoFx.checked) {
      await runVoiceFxPass();
    }
  });
}

async function handleAudioUpload() {
  const file = els.audioUpload.files?.[0];
  if (!file) {
    return;
  }

  await withBusy('Loading uploaded audio...', async () => {
    await setSourceBlob(file, `Upload: ${file.name}`, file.name);
    setStatus('Loaded uploaded source audio.');
    logLine(`Loaded uploaded audio ${file.name} (${formatBytes(file.size)}).`);

    if (els.autoFx.checked) {
      await runVoiceFxPass();
    }
  });
}

async function processVoiceFxPass() {
  await withBusy('Processing EQ + de-esser...', runVoiceFxPass);
}

async function runVoiceFxPass() {
  if (!state.sourceBlob) {
    setStatus('Load source audio by synthesizing or uploading first.');
    return;
  }

  const presenceCutDb = Number(els.presenceSlider.value);
  const deEssPercent = Number(els.deessSlider.value);
  const airTrimDb = Number(els.airSlider.value);
  const decodeStart = performance.now();
  const sourceBuffer = await decodeAudioBlob(state.sourceBlob);
  const decodeElapsed = performance.now() - decodeStart;
  setMetric(els.metricDecode, formatMs(decodeElapsed));

  if (presenceCutDb === 0 && deEssPercent === 0 && airTrimDb === 0) {
    replaceObjectUrl('processedUrl', state.sourceBlob, els.processedAudio, els.processedDownload, 'eq-deessed-output.wav');
    setMetric(els.metricFx, formatMs(0));
    setMetric(els.metricProcessedDuration, formatSeconds(sourceBuffer.duration));
    setStatus('EQ + de-esser skipped at neutral settings.');
    logLine('Presence cut, de-ess amount, and air trim are all neutral, so the source audio was mirrored without extra processing.', 'warn');
    return;
  }

  setProgress(5, 'Preparing voice FX...');
  const fxStart = performance.now();
  setProgress(15, 'Rendering EQ + de-esser...');
  const processedBuffer = await renderEqDeEsser(sourceBuffer, {
    presenceCutDb,
    deEssPercent,
    airTrimDb,
  });

  const fxElapsed = performance.now() - fxStart;
  const processedBlob = audioBufferToWavBlob(processedBuffer);
  replaceObjectUrl('processedUrl', processedBlob, els.processedAudio, els.processedDownload, 'eq-deessed-output.wav');
  setMetric(els.metricFx, formatMs(fxElapsed));
  setMetric(els.metricProcessedDuration, formatSeconds(processedBuffer.duration));
  setProgress(100, 'EQ + de-esser complete.');
  setStatus(`EQ + de-esser finished in ${formatMs(fxElapsed)}.`);
  logLine(
    `Rendered EQ + de-esser in ${formatMs(fxElapsed)} with presence cut ${formatDb(-presenceCutDb)}, de-ess ${formatPercent(deEssPercent)}, and air trim ${formatDb(airTrimDb)} (${formatSeconds(processedBuffer.duration)}).`,
  );
}

async function setSourceBlob(blob, label, downloadName) {
  state.sourceBlob = blob;
  els.sourceLabel.textContent = label;
  replaceObjectUrl('sourceUrl', blob, els.sourceAudio, els.sourceDownload, downloadName || 'source.wav');
  resetProcessedOutput();
  const buffer = await decodeAudioBlob(blob);
  setMetric(els.metricSourceDuration, formatSeconds(buffer.duration));
}

function playSourceAudio() {
  if (!els.sourceAudio.src) {
    setStatus('No source audio loaded yet.');
    return;
  }

  void els.sourceAudio.play();
}

function resetProcessedOutput() {
  if (state.processedUrl) {
    URL.revokeObjectURL(state.processedUrl);
    state.processedUrl = '';
  }
  els.processedAudio.removeAttribute('src');
  els.processedAudio.load();
  els.processedDownload.removeAttribute('href');
  els.processedDownload.setAttribute('aria-disabled', 'true');
  setMetric(els.metricProcessedDuration, '-');
}

async function decodeAudioBlob(blob) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error('AudioContext is not available in this browser.');
  }

  const context = new AudioContextCtor();
  try {
    const buffer = await blob.arrayBuffer();
    return await context.decodeAudioData(buffer.slice(0));
  } finally {
    await context.close();
  }
}

async function renderEqDeEsser(audioBuffer, settings) {
  const OfflineContextCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContextCtor) {
    throw new Error('OfflineAudioContext is not available in this browser.');
  }

  const offline = new OfflineContextCtor(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);
  const source = offline.createBufferSource();
  source.buffer = audioBuffer;

  const splitFrequency = 5400;
  const lowBand = offline.createBiquadFilter();
  lowBand.type = 'lowpass';
  lowBand.frequency.value = splitFrequency;
  lowBand.Q.value = 0.5;

  const highBand = offline.createBiquadFilter();
  highBand.type = 'highpass';
  highBand.frequency.value = splitFrequency;
  highBand.Q.value = 0.75;

  const presenceFilter = offline.createBiquadFilter();
  presenceFilter.type = 'peaking';
  presenceFilter.frequency.value = 7200;
  presenceFilter.Q.value = 1.7;
  presenceFilter.gain.value = -settings.presenceCutDb;

  const deEssRatio = clampNumber(settings.deEssPercent / 100, 0, 1);
  const sibilanceCompressor = offline.createDynamicsCompressor();
  sibilanceCompressor.threshold.value = -10 - deEssRatio * 22;
  sibilanceCompressor.knee.value = 18;
  sibilanceCompressor.ratio.value = 1 + deEssRatio * 9;
  sibilanceCompressor.attack.value = 0.001;
  sibilanceCompressor.release.value = 0.07 + deEssRatio * 0.15;

  const deEssTrim = offline.createGain();
  deEssTrim.gain.value = 1 - deEssRatio * 0.22;

  const airFilter = offline.createBiquadFilter();
  airFilter.type = 'highshelf';
  airFilter.frequency.value = 10500;
  airFilter.gain.value = settings.airTrimDb;

  const masterGain = offline.createGain();
  masterGain.gain.value = 1;

  source.connect(lowBand);
  lowBand.connect(masterGain);

  source.connect(highBand);
  highBand.connect(presenceFilter);
  presenceFilter.connect(sibilanceCompressor);
  sibilanceCompressor.connect(deEssTrim);
  deEssTrim.connect(airFilter);
  airFilter.connect(masterGain);

  masterGain.connect(offline.destination);

  source.start();
  return offline.startRendering();
}

function audioBufferToWavBlob(audioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const sampleLength = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataLength = sampleLength * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  let offset = 0;

  writeString(view, offset, 'RIFF');
  offset += 4;
  view.setUint32(offset, 36 + dataLength, true);
  offset += 4;
  writeString(view, offset, 'WAVE');
  offset += 4;
  writeString(view, offset, 'fmt ');
  offset += 4;
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channelCount, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString(view, offset, 'data');
  offset += 4;
  view.setUint32(offset, dataLength, true);
  offset += 4;

  const channelData = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));
  for (let sampleIndex = 0; sampleIndex < sampleLength; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channelIndex][sampleIndex]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function floatSamplesToWavBlob(floatSamples, sampleRate) {
  const audioBuffer = new AudioBuffer({
    length: floatSamples.length,
    numberOfChannels: 1,
    sampleRate,
  });
  audioBuffer.getChannelData(0).set(floatSamples);
  return audioBufferToWavBlob(audioBuffer);
}

function writeString(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function replaceObjectUrl(stateKey, blob, audioEl, linkEl, fileName) {
  if (state[stateKey]) {
    URL.revokeObjectURL(state[stateKey]);
  }
  const url = URL.createObjectURL(blob);
  state[stateKey] = url;
  audioEl.src = url;
  linkEl.href = url;
  linkEl.download = fileName;
  linkEl.setAttribute('aria-disabled', 'false');
}

function getSelectedVoice() {
  return state.voices.find((voice) => voice.key === els.voiceSelect.value) || null;
}

function updateVoiceFxDisplay() {
  els.presenceDisplay.textContent = formatDb(-Number(els.presenceSlider.value));
  els.deessDisplay.textContent = formatPercent(Number(els.deessSlider.value));
  els.airDisplay.textContent = formatDb(Number(els.airSlider.value));
}

function setProgress(value, label) {
  els.progressBar.value = value;
  els.statusLine.textContent = label;
}

function resetProgress() {
  setProgress(0, 'Idle');
}

function setStatus(text) {
  els.statusLine.textContent = text;
}

function setMetric(element, text) {
  element.textContent = text;
}

function makeProgressCallback(label) {
  let lastPercent = -1;
  return (progress) => {
    const percent = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;
    if (percent !== lastPercent) {
      lastPercent = percent;
      setProgress(percent, `${label}: ${percent}%`);
    }
  };
}

async function withBusy(status, task) {
  if (state.busy) {
    setStatus('Busy.');
    return;
  }

  state.busy = true;
  toggleButtons(true);
  setStatus(status);

  try {
    await task();
  } catch (error) {
    setStatus(formatError(error));
    logLine(formatError(error), 'error');
    console.error(error);
  } finally {
    state.busy = false;
    toggleButtons(false);
  }
}

function toggleButtons(disabled) {
  [
    els.refreshVoices,
    els.cacheVoice,
    els.removeVoice,
    els.flushCache,
    els.kokoroInit,
    els.kokoroSynthesize,
    els.synthesize,
    els.playCurrent,
    els.processFx,
    els.resetFx,
  ].forEach((button) => {
    button.disabled = disabled;
  });
}

function logLine(message, tone = 'ok') {
  const stamp = new Date().toLocaleTimeString();
  const prefix = tone === 'error' ? 'ERR' : tone === 'warn' ? 'WARN' : 'OK';
  const existing = els.log.textContent ? `${els.log.textContent}\n` : '';
  els.log.textContent = `${existing}[${stamp}] ${prefix} ${message}`;
  els.log.scrollTop = els.log.scrollHeight;
}

function formatMs(value) {
  return `${value.toFixed(1)} ms`;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatDb(value) {
  return value > 0 ? `+${value.toFixed(1)} dB` : `${value.toFixed(1)} dB`;
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function formatSeconds(value) {
  return `${value.toFixed(2)} s`;
}

function formatBytes(value) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
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

function byId(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}.`);
  }
  return element;
}

function ensureShell() {
  const requiredIds = ['cache-voice', 'kokoro-voice', 'kokoro-init', 'presence-slider', 'deess-slider', 'air-slider', 'process-fx'];
  if (requiredIds.every((id) => document.getElementById(id))) {
    return;
  }

  document.body.innerHTML = `
    <div class="shell">
      <section class="hero">
        <p class="eyebrow">Pure Browser Test Harness</p>
        <h1>Piper + Kokoro + EQ shaping</h1>
        <p class="subcopy">
          The script rendered this shell directly because the expected tester DOM was missing.
        </p>
        <div class="badge-row" id="capability-badges"></div>
      </section>

      <section class="layout">
        <section class="panel stack">
          <div class="block stack">
            <p class="block-title">Voice Source</p>
            <label>
              Filter voices
              <input id="voice-filter" type="text" placeholder="en_US, female, medium, john..." />
            </label>
            <label>
              Voice
              <select id="voice-select"></select>
            </label>
            <div class="inline-meta" id="voice-meta"></div>
            <div class="action-row">
              <button id="refresh-voices" type="button" class="secondary">Refresh Voices</button>
              <button id="cache-voice" type="button">Cache Voice</button>
              <button id="remove-voice" type="button" class="secondary">Remove Voice</button>
              <button id="flush-cache" type="button" class="danger">Flush All</button>
            </div>
          </div>

          <div class="block stack">
            <p class="block-title">Kokoro Custom Voice</p>
            <label>
              Voice
              <select id="kokoro-voice"></select>
            </label>
            <label>
              Device
              <select id="kokoro-device">
                <option value="auto">Auto</option>
                <option value="webgpu">WebGPU</option>
                <option value="wasm">WASM</option>
              </select>
            </label>
            <div class="pitch-row">
              <span style="min-width:90px;color:#9cb3c8">Speed</span>
              <input id="kokoro-speed" type="range" min="0.7" max="1.3" step="0.05" value="1" />
              <div class="pitch-display" id="kokoro-speed-display">1.00x</div>
            </div>
            <div class="inline-meta" id="kokoro-meta"></div>
            <div class="action-row">
              <button id="kokoro-init" type="button" class="secondary">Init Kokoro</button>
              <button id="kokoro-synthesize" type="button">Synthesize Kokoro</button>
            </div>
          </div>

          <div class="block stack">
            <p class="block-title">Synthesis</p>
            <label>
              Prompt
              <textarea id="text-input">This is a browser-side Piper test. After the model is cached, I want to know how fast synthesis is and whether a de-esser and EQ pass can smooth out the harsh top end.</textarea>
            </label>
            <div class="action-row">
              <button id="synthesize" type="button">Synthesize</button>
              <button id="play-current" type="button" class="secondary">Play Source</button>
            </div>
          </div>

          <div class="block stack">
            <p class="block-title">Upload For EQ Stage</p>
            <label>
              Upload WAV or any browser-decodable audio
              <input id="audio-upload" type="file" accept="audio/*,.wav" />
            </label>
            <div class="inline-meta">
              <span>Current source: <strong id="source-label">none</strong></span>
              <span>Stored voices: <strong id="stored-count">0</strong></span>
            </div>
          </div>

          <div class="block stack">
            <p class="block-title">EQ + De-Esser</p>
            <div class="pitch-row">
              <span style="min-width:90px;color:#9cb3c8">Presence Cut</span>
              <input id="presence-slider" type="range" min="0" max="12" step="0.5" value="3" />
              <div class="pitch-display" id="presence-display">-3.0 dB</div>
            </div>
            <div class="pitch-row">
              <span style="min-width:90px;color:#9cb3c8">De-Ess</span>
              <input id="deess-slider" type="range" min="0" max="100" step="5" value="50" />
              <div class="pitch-display" id="deess-display">50%</div>
            </div>
            <div class="pitch-row">
              <span style="min-width:90px;color:#9cb3c8">Air Trim</span>
              <input id="air-slider" type="range" min="-6" max="3" step="0.5" value="-1" />
              <div class="pitch-display" id="air-display">-1.0 dB</div>
            </div>
            <label class="check">
              <input id="auto-fx" type="checkbox" checked />
              Auto-run EQ + de-esser after synthesis or upload
            </label>
            <div class="action-row">
              <button id="process-fx" type="button">Process Audio</button>
              <button id="reset-fx" type="button" class="secondary">Reset Output</button>
            </div>
          </div>
        </section>

        <section class="panel stack">
          <div class="metric-grid">
            <div class="stat"><span>Download</span><strong id="metric-download">-</strong></div>
            <div class="stat"><span>Synthesis</span><strong id="metric-synthesis">-</strong></div>
            <div class="stat"><span>Decode</span><strong id="metric-decode">-</strong></div>
            <div class="stat"><span>EQ + De-Ess</span><strong id="metric-fx">-</strong></div>
            <div class="stat"><span>Source Duration</span><strong id="metric-source-duration">-</strong></div>
            <div class="stat"><span>Output Duration</span><strong id="metric-processed-duration">-</strong></div>
          </div>

          <div class="block stack">
            <p class="block-title">Progress</p>
            <div class="progress-shell">
              <progress id="progress-bar" max="100" value="0"></progress>
              <div class="status" id="status-line">Idle</div>
            </div>
          </div>

          <div class="block stack">
            <p class="block-title">Source Audio</p>
            <audio id="source-audio" controls></audio>
            <a id="source-download" class="download-link" aria-disabled="true">Download source</a>
          </div>

          <div class="block stack">
            <p class="block-title">Output Audio</p>
            <audio id="processed-audio" controls></audio>
            <a id="processed-download" class="download-link" aria-disabled="true">Download output</a>
          </div>

          <div class="block stack">
            <p class="block-title">Log</p>
            <pre class="log" id="log"></pre>
          </div>
        </section>
      </section>
    </div>
  `;
}

function collectElements() {
  return {
    capabilityBadges: byId('capability-badges'),
    voiceFilter: byId('voice-filter'),
    voiceSelect: byId('voice-select'),
    voiceMeta: byId('voice-meta'),
    refreshVoices: byId('refresh-voices'),
    cacheVoice: byId('cache-voice'),
    removeVoice: byId('remove-voice'),
    flushCache: byId('flush-cache'),
    kokoroVoice: byId('kokoro-voice'),
    kokoroDevice: byId('kokoro-device'),
    kokoroSpeed: byId('kokoro-speed'),
    kokoroSpeedDisplay: byId('kokoro-speed-display'),
    kokoroMeta: byId('kokoro-meta'),
    kokoroInit: byId('kokoro-init'),
    kokoroSynthesize: byId('kokoro-synthesize'),
    textInput: byId('text-input'),
    synthesize: byId('synthesize'),
    playCurrent: byId('play-current'),
    audioUpload: byId('audio-upload'),
    sourceLabel: byId('source-label'),
    storedCount: byId('stored-count'),
    presenceSlider: byId('presence-slider'),
    presenceDisplay: byId('presence-display'),
    deessSlider: byId('deess-slider'),
    deessDisplay: byId('deess-display'),
    airSlider: byId('air-slider'),
    airDisplay: byId('air-display'),
    autoFx: byId('auto-fx'),
    processFx: byId('process-fx'),
    resetFx: byId('reset-fx'),
    metricDownload: byId('metric-download'),
    metricSynthesis: byId('metric-synthesis'),
    metricDecode: byId('metric-decode'),
    metricFx: byId('metric-fx'),
    metricSourceDuration: byId('metric-source-duration'),
    metricProcessedDuration: byId('metric-processed-duration'),
    progressBar: byId('progress-bar'),
    statusLine: byId('status-line'),
    sourceAudio: byId('source-audio'),
    sourceDownload: byId('source-download'),
    processedAudio: byId('processed-audio'),
    processedDownload: byId('processed-download'),
    log: byId('log'),
  };
}

function renderBootError(error) {
  const message = formatError(error);
  document.body.innerHTML = `
    <main style="padding:24px;font-family:Segoe UI Variable,Segoe UI,sans-serif;background:#0c131c;color:#edf5ff;min-height:100vh">
      <h1 style="margin:0 0 12px;font-size:28px">TTS tester failed to boot</h1>
      <p style="margin:0 0 12px;color:#9cb3c8;max-width:70ch">
        The tester could not recover the DOM it needs to run.
      </p>
      <pre style="padding:16px;border:1px solid rgba(131,164,194,.26);border-radius:16px;background:#05090f;white-space:pre-wrap">${escapeHtml(message)}</pre>
      <p style="margin:12px 0 0;color:#9cb3c8">Reload once. If it still fails, send the exact new error.</p>
    </main>
  `;
}
