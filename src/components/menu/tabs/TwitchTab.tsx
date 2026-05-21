import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { TwitchSettings } from '../../../lib/chat/types';
import { Slider } from '../ui/Slider';
import { Toggle } from '../ui/Toggle';

type TwitchTabProps = {
  activeChatterCount: number;
  aiModeLabel: string;
  batchPending: number;
  botMentionTag: string;
  channel: string;
  chatOverlayOpen: boolean;
  connectionLabel: string;
  directChatEnabled: boolean;
  onResetTwitchState: () => void;
  onSetChannel: (channel: string) => void;
  onToggleChatOverlay: (open: boolean) => void;
  queueLength: number;
  setTwitchSettings: Dispatch<SetStateAction<TwitchSettings>>;
  twitchSettings: TwitchSettings;
};

function updateTwitchSettings(
  setTwitchSettings: Dispatch<SetStateAction<TwitchSettings>>,
  patch: Partial<TwitchSettings>,
) {
  setTwitchSettings((current) => ({
    ...current,
    ...patch,
  }));
}

function NumberField({
  label,
  max,
  min,
  onChange,
  step = 1,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      <input
        className="input-tech compact-input"
        max={max}
        min={min}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) {
            onChange(Math.max(min, Math.min(max, Math.round(next))));
          }
        }}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

export function TwitchTab({
  activeChatterCount,
  aiModeLabel,
  batchPending,
  botMentionTag,
  channel,
  chatOverlayOpen,
  connectionLabel,
  directChatEnabled,
  onResetTwitchState,
  onSetChannel,
  onToggleChatOverlay,
  queueLength,
  setTwitchSettings,
  twitchSettings,
}: TwitchTabProps) {
  const [draftChannel, setDraftChannel] = useState(channel);

  useEffect(() => {
    setDraftChannel(channel);
  }, [channel]);

  const cleanDraft = draftChannel.replace(/^#/, '').trim().toLowerCase();

  return (
    <>
      <div className="control-group">
        <div className="control-label">Twitch Connection</div>
        <div className="status-grid">
          <div className="status-copy">
            IRC: <strong>{directChatEnabled ? connectionLabel : 'Disabled'}</strong>
          </div>
          <div className="status-copy">
            Channel: <strong>#{channel || 'subsect'}</strong>
          </div>
          <div className="status-copy">
            Mention tag: <strong>{botMentionTag}</strong>
          </div>
          <div className="status-copy">
            AI mode: <strong>{aiModeLabel}</strong>
          </div>
          <div className="status-copy">
            Local name: <strong>{twitchSettings.localDisplayName}</strong>
          </div>
          <div className="status-copy">
            Commands: <strong>{twitchSettings.commandsEnabled ? 'Enabled' : 'Off'}</strong>
          </div>
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Chat Room</div>
        <input
          className="input-tech"
          onChange={(event) => setDraftChannel(event.target.value)}
          placeholder="subsect"
          spellCheck={false}
          type="text"
          value={draftChannel}
        />
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            disabled={!cleanDraft || cleanDraft === channel}
            onClick={() => onSetChannel(cleanDraft)}
            type="button"
          >
            Switch Channel
          </button>
          <button
            className="btn-tech secondary"
            onClick={() => onToggleChatOverlay(!chatOverlayOpen)}
            type="button"
          >
            {chatOverlayOpen ? 'Collapse Overlay Chat' : 'Open Overlay Chat'}
          </button>
        </div>
        <div className="field-hint">
          Browser IRC listens read-only as anonymous Twitch chat. The local chat box is also routed
          as a trusted participant turn.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Local Participant</div>
        <input
          className="input-tech"
          onChange={(event) =>
            updateTwitchSettings(setTwitchSettings, {
              localDisplayName: event.target.value,
            })
          }
          placeholder="Subsect"
          spellCheck={false}
          type="text"
          value={twitchSettings.localDisplayName}
        />
        <div className="setting-row">
          <span>Trusted local controls</span>
          <Toggle
            checked={twitchSettings.localTrustedControls}
            onChange={(checked) =>
              updateTwitchSettings(setTwitchSettings, { localTrustedControls: checked })
            }
          />
        </div>
        <div className="setting-row">
          <span>Chat overlay visible</span>
          <Toggle checked={chatOverlayOpen} onChange={onToggleChatOverlay} />
        </div>
        <div className="field-hint">
          Local messages still look like a viewer transcript turn, but trusted mode lets that
          participant run owner controls.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">AI Intake</div>
        <div className="status-grid">
          <div className="status-copy">
            Active chatters: <strong>{activeChatterCount}</strong>
          </div>
          <div className="status-copy">
            Direct queue: <strong>{queueLength}</strong>
          </div>
          <div className="status-copy">
            Batch pending: <strong>{batchPending}</strong>
          </div>
          <div className="status-copy">
            Overlay chat: <strong>{chatOverlayOpen ? 'Open' : 'Collapsed'}</strong>
          </div>
          <div className="status-copy">
            Direct intake: <strong>{twitchSettings.directChatterLimit} chatters</strong>
          </div>
          <div className="status-copy">
            All-chat intake:{' '}
            <strong>
              {twitchSettings.batchLowSize}/{twitchSettings.batchMidSize}/
              {twitchSettings.batchHighSize}/{twitchSettings.batchMaxSize} msgs
            </strong>
          </div>
        </div>
        <div className="setting-row">
          <span>AI replies from Twitch</span>
          <Toggle
            checked={twitchSettings.aiEnabled}
            onChange={(checked) => updateTwitchSettings(setTwitchSettings, { aiEnabled: checked })}
          />
        </div>
        <div className="setting-row">
          <span>Commands</span>
          <Toggle
            checked={twitchSettings.commandsEnabled}
            onChange={(checked) =>
              updateTwitchSettings(setTwitchSettings, { commandsEnabled: checked })
            }
          />
        </div>
        <div className="setting-row">
          <span>Require @mention under threshold</span>
          <Toggle
            checked={twitchSettings.mentionRequiredUnderThreshold}
            onChange={(checked) =>
              updateTwitchSettings(setTwitchSettings, { mentionRequiredUnderThreshold: checked })
            }
          />
        </div>
        <NumberField
          label="Direct mode up to chatters"
          max={250}
          min={0}
          onChange={(value) =>
            updateTwitchSettings(setTwitchSettings, { directChatterLimit: value })
          }
          value={twitchSettings.directChatterLimit}
        />
        <NumberField
          label="Transcript context kept"
          max={300}
          min={10}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { contextLimit: value })}
          value={twitchSettings.contextLimit}
        />
        <NumberField
          label="Max pending jobs"
          max={50}
          min={1}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { maxPendingJobs: value })}
          value={twitchSettings.maxPendingJobs}
        />
        <NumberField
          label="Max batch messages retained"
          max={500}
          min={10}
          onChange={(value) =>
            updateTwitchSettings(setTwitchSettings, { maxBatchMessages: value })
          }
          value={twitchSettings.maxBatchMessages}
        />
        <div className="field-hint">
          Direct mode intakes one tagged Twitch/local participant message per reply. All-chat mode
          intakes every normal Twitch chat line until the configured message count or timer fires.
        </div>
        <button className="btn-tech danger" onClick={onResetTwitchState} type="button">
          Reset Twitch AI Queue
        </button>
      </div>

      <div className="control-group">
        <div className="control-label">Queue Timing</div>
        <Slider
          label={`Reply cooldown ${(twitchSettings.replyGapMs / 1000).toFixed(1)}s`}
          max={30}
          min={0}
          onInput={(value) =>
            updateTwitchSettings(setTwitchSettings, { replyGapMs: Math.round(value * 1000) })
          }
          step={0.5}
          value={twitchSettings.replyGapMs / 1000}
        />
        <Slider
          label={`Normal batch wait ${Math.round(twitchSettings.batchWaitMs / 1000)}s`}
          max={120}
          min={5}
          onInput={(value) =>
            updateTwitchSettings(setTwitchSettings, { batchWaitMs: Math.round(value * 1000) })
          }
          step={5}
          value={Math.round(twitchSettings.batchWaitMs / 1000)}
        />
        <Slider
          label={`Huge chat wait ${Math.round(twitchSettings.batchFastWaitMs / 1000)}s`}
          max={120}
          min={5}
          onInput={(value) =>
            updateTwitchSettings(setTwitchSettings, {
              batchFastWaitMs: Math.round(value * 1000),
            })
          }
          step={5}
          value={Math.round(twitchSettings.batchFastWaitMs / 1000)}
        />
      </div>

      <div className="control-group">
        <div className="control-label">All-Chat Intake Size</div>
        <NumberField
          label="Intake msgs, 1-25 chatters"
          max={200}
          min={1}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { batchLowSize: value })}
          value={twitchSettings.batchLowSize}
        />
        <NumberField
          label="Intake msgs, 26-50 chatters"
          max={200}
          min={1}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { batchMidSize: value })}
          value={twitchSettings.batchMidSize}
        />
        <NumberField
          label="Intake msgs, 51-100 chatters"
          max={200}
          min={1}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { batchHighSize: value })}
          value={twitchSettings.batchHighSize}
        />
        <NumberField
          label="Intake msgs, 100+ chatters"
          max={300}
          min={1}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { batchMaxSize: value })}
          value={twitchSettings.batchMaxSize}
        />
      </div>
    </>
  );
}
