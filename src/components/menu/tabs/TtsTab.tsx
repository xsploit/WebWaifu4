import type { Dispatch, SetStateAction } from 'react';
import type { AiSettings } from '../../../lib/chat/types';
import type { PiperVoiceProfile } from '../../../lib/tts/piper';
import { Toggle } from '../ui/Toggle';
import { Slider } from '../ui/Slider';

type TtsTabProps = {
  aiSettings: AiSettings;
  onCacheVoice: () => void;
  onRefreshVoices: () => void;
  onSelectVoice: (voiceId: string) => void;
  onSpeakLastReply: () => void;
  onStopTts: () => void;
  onTestVoice: () => void;
  setAiSettings: Dispatch<SetStateAction<AiSettings>>;
  ttsBusy: boolean;
  ttsCached: boolean;
  ttsStatus: string;
  ttsActiveVoice: PiperVoiceProfile | null;
  ttsVoices: PiperVoiceProfile[];
  voicesError: string | null;
  voicesLoading: boolean;
};

function updateAiSettings(
  setAiSettings: Dispatch<SetStateAction<AiSettings>>,
  patch: Partial<AiSettings>,
) {
  setAiSettings((current) => ({
    ...current,
    ...patch,
  }));
}

export function TtsTab({
  aiSettings,
  onCacheVoice,
  onRefreshVoices,
  onSelectVoice,
  onSpeakLastReply,
  onStopTts,
  onTestVoice,
  setAiSettings,
  ttsBusy,
  ttsCached,
  ttsStatus,
  ttsActiveVoice,
  ttsVoices,
  voicesError,
  voicesLoading,
}: TtsTabProps) {
  const selectedVoice = ttsVoices.find((voice) => voice.key === aiSettings.ttsVoice) ?? null;

  return (
    <>
      <div className="control-group">
        <div className="control-label">Speech Output</div>
        <div className="toggle-row">
          <span>Enable TTS</span>
          <Toggle
            checked={aiSettings.ttsEnabled}
            onChange={(checked) => updateAiSettings(setAiSettings, { ttsEnabled: checked })}
          />
        </div>
        <div className="toggle-row">
          <span>Auto Speak Replies</span>
          <Toggle
            checked={aiSettings.ttsAutoSpeak}
            onChange={(checked) => updateAiSettings(setAiSettings, { ttsAutoSpeak: checked })}
          />
        </div>
        <div className="toggle-row">
          <span>Simulate Streaming Replies</span>
          <Toggle
            checked={aiSettings.ttsSimulatedStreaming}
            onChange={(checked) =>
              updateAiSettings(setAiSettings, { ttsSimulatedStreaming: checked })
            }
          />
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Piper Voice</div>
        <select
          className="select-tech"
          disabled={voicesLoading}
          onChange={(event) => onSelectVoice(event.target.value)}
          value={aiSettings.ttsVoice}
        >
          {ttsVoices.map((voice) => {
            const label = [
              voice.name,
              voice.key,
              voice.quality,
              voice.kind === 'custom' ? 'local' : voice.language?.name_english,
            ]
              .filter(Boolean)
              .join(' | ');

            return (
              <option key={voice.key} value={voice.key}>
                {label}
              </option>
            );
          })}
        </select>
        <div className="btn-row">
          <button className="btn-tech secondary" onClick={onRefreshVoices} type="button">
            {voicesLoading ? 'Refreshing...' : 'Refresh Voices'}
          </button>
          <button
            className="btn-tech secondary"
            disabled={!selectedVoice || voicesLoading}
            onClick={onCacheVoice}
            title="Load the selected Piper voice model into the browser and prime audio."
            type="button"
          >
            {ttsCached ? 'Reload Model' : 'Load Model'}
          </button>
        </div>
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            disabled={!aiSettings.ttsEnabled || ttsBusy}
            onClick={onTestVoice}
            type="button"
          >
            Test Voice
          </button>
          <button
            className="btn-tech secondary"
            disabled={!aiSettings.ttsEnabled || ttsBusy}
            onClick={onSpeakLastReply}
            type="button"
          >
            Speak Last Reply
          </button>
          <button className="btn-tech secondary" onClick={onStopTts} type="button">
            Stop Audio
          </button>
        </div>
        {voicesError ? <div className="status-copy">{voicesError}</div> : null}
        <div className="status-copy">
          Voice cache: <strong>{ttsCached ? 'ready' : 'not cached'}</strong>
        </div>
        <div className="status-copy">
          Selected: <strong>{selectedVoice?.name ?? 'none'}</strong> / Active:{' '}
          <strong>{ttsActiveVoice?.name ?? 'none'}</strong>
        </div>
        <div className="status-copy">{ttsStatus}</div>
      </div>

      <div className="control-group">
        <div className="control-label">Playback</div>
        <Slider
          label={`Speed ${aiSettings.ttsPlaybackRate.toFixed(2)}x`}
          max={1.35}
          min={0.7}
          onInput={(value) =>
            updateAiSettings(setAiSettings, {
              ttsPlaybackRate: Number(value.toFixed(2)),
            })
          }
          step={0.05}
          value={aiSettings.ttsPlaybackRate}
        />
        <Slider
          label={`Volume ${aiSettings.ttsVolume.toFixed(2)}x`}
          max={2}
          min={0}
          onInput={(value) =>
            updateAiSettings(setAiSettings, {
              ttsVolume: Number(value.toFixed(2)),
            })
          }
          step={0.05}
          value={aiSettings.ttsVolume}
        />
        <div className="field-hint">
          Piper web only exposes `text + voice` for synthesis here, so speed and volume are the
          two real playback controls available in this runtime.
        </div>
      </div>
    </>
  );
}
