import { useEffect, useState } from 'react';

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
};

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
          Browser IRC listens read-only as anonymous Twitch chat. Switching room keeps Subsect as
          the controller.
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
        </div>
        <div className="field-hint">
          Under 10 active chatters, tagged messages queue. Above 10, chat batches into room-level
          replies.
        </div>
        <button className="btn-tech danger" onClick={onResetTwitchState} type="button">
          Reset Twitch AI Queue
        </button>
      </div>
    </>
  );
}
