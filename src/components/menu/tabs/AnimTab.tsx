import type { Dispatch, SetStateAction } from 'react';
import type {
  AnimationEntry,
  AnimationPurpose,
  ManualPlayRequest,
  SequencerSettings,
} from '../../../lib/menu/types';

type AnimTabProps = {
  onImportAnimationFile: (file: File) => void;
  onPlayAnimation: (request: ManualPlayRequest) => void;
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>;
  sequencerSettings: SequencerSettings;
};

const ANIMATION_PURPOSES: AnimationPurpose[] = [
  'ambient',
  'gesture',
  'emotion',
  'movement',
  'pose',
];

function updateSequencer(
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>,
  patch: Partial<SequencerSettings>,
) {
  setSequencerSettings((current) => ({
    ...current,
    ...patch,
  }));
}

function updatePlaylistEntry(
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>,
  index: number,
  patch: Partial<AnimationEntry>,
) {
  setSequencerSettings((current) => ({
    ...current,
    playlist: current.playlist.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, ...patch } : entry,
    ),
  }));
}

export function AnimTab({
  onImportAnimationFile,
  onPlayAnimation,
  setSequencerSettings,
  sequencerSettings,
}: AnimTabProps) {
  const loopSafeCount = sequencerSettings.playlist.filter(
    (entry) => entry.enabled && entry.loopEligible !== false,
  ).length;
  const triggerCount = sequencerSettings.playlist.filter(
    (entry) => entry.enabled && entry.loopEligible === false,
  ).length;
  const reactionCount = sequencerSettings.playlist.filter(
    (entry) => entry.enabled && (entry.purpose === 'emotion' || entry.purpose === 'gesture'),
  ).length;

  return (
    <>
      <div className="controls">
        <button
          className={`btn-tech ${sequencerSettings.playing ? 'active' : ''}`}
          onClick={() =>
            updateSequencer(setSequencerSettings, { playing: !sequencerSettings.playing })
          }
          type="button"
        >
          {sequencerSettings.playing ? '[ STOP ]' : '[ AUTO-PLAY ]'}
        </button>

        <div className="control-row">
          <button
            className={`btn-sm ${sequencerSettings.loop ? 'on' : ''}`}
            onClick={() => updateSequencer(setSequencerSettings, { loop: !sequencerSettings.loop })}
            type="button"
          >
            Loop
          </button>
          <button
            className={`btn-sm ${sequencerSettings.shuffle ? 'on' : ''}`}
            onClick={() =>
              updateSequencer(setSequencerSettings, { shuffle: !sequencerSettings.shuffle })
            }
            type="button"
          >
            Shuffle
          </button>
        </div>

        <div className="slider-row slider-row-compact">
          <span>Speed</span>
          <input
            max="3"
            min="0.1"
            onChange={(event) =>
              updateSequencer(setSequencerSettings, { speed: Number(event.target.value) })
            }
            step="0.1"
            type="range"
            value={sequencerSettings.speed}
          />
          <span className="val">{sequencerSettings.speed.toFixed(1)}x</span>
        </div>

        <div className="slider-row slider-row-compact">
          <span>Duration</span>
          <input
            max="60"
            min="3"
            onChange={(event) =>
              updateSequencer(setSequencerSettings, { duration: Number(event.target.value) })
            }
            step="1"
            type="range"
            value={sequencerSettings.duration}
          />
          <span className="val">{sequencerSettings.duration}s</span>
        </div>
      </div>

      <div className="anim-summary">
        <span>
          <strong>{loopSafeCount}</strong>
          Loop
        </span>
        <span>
          <strong>{triggerCount}</strong>
          Trigger
        </span>
        <span>
          <strong>{reactionCount}</strong>
          React
        </span>
      </div>

      <div className="batch-row">
        <button
          className="btn-xs"
          onClick={() =>
            setSequencerSettings((current) => ({
              ...current,
              playlist: current.playlist.map((entry) => ({
                ...entry,
                enabled: entry.loopEligible !== false && !entry.experimental,
              })),
            }))
          }
          type="button"
        >
          Loop Safe
        </button>
        <button
          className="btn-xs"
          onClick={() =>
            setSequencerSettings((current) => ({
              ...current,
              playlist: current.playlist.map((entry) => ({
                ...entry,
                enabled:
                  entry.purpose === 'emotion' ||
                  entry.purpose === 'gesture' ||
                  (entry.loopEligible !== false && !entry.experimental),
              })),
            }))
          }
          type="button"
        >
          Reactions
        </button>
        <button
          className="btn-xs"
          onClick={() =>
            setSequencerSettings((current) => ({
              ...current,
              currentIndex: -1,
              playlist: current.playlist.map((entry) => ({
                ...entry,
                enabled: false,
              })),
            }))
          }
          type="button"
        >
          Disable All
        </button>
        <label className="btn-xs btn-xs-file">
          + Import Motion
          <input
            accept=".fbx,.glb,.gltf,.vrma,.bvh"
            className="hidden-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onImportAnimationFile(file);
              }
              event.target.value = '';
            }}
            type="file"
          />
        </label>
      </div>

      <div className="playlist">
        {sequencerSettings.playlist.map((entry, index) => (
          <div
            className={`row anim-row ${sequencerSettings.currentIndex === index ? 'active' : ''} ${
              !entry.enabled ? 'disabled' : ''
            }`}
            key={entry.id}
          >
            <div className="anim-row-main">
              <label className="check">
                <input
                  checked={entry.enabled}
                  onChange={() =>
                    setSequencerSettings((current) => ({
                      ...current,
                      playlist: current.playlist.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              enabled: !item.enabled,
                            }
                          : item,
                      ),
                    }))
                  }
                  type="checkbox"
                />
              </label>
              <span className="name">
                {entry.name}
                {entry.format ? <span className="badge">{entry.format.toUpperCase()}</span> : null}
                {entry.purpose ? (
                  <span className="badge badge-muted">{entry.purpose.toUpperCase()}</span>
                ) : null}
                {entry.loopEligible === false ? <span className="badge">TRIGGER</span> : null}
                {entry.experimental ? <span className="badge">EXP</span> : null}
                {entry.tags?.length ? (
                  <span className="anim-tags">{entry.tags.slice(0, 6).join(' / ')}</span>
                ) : null}
              </span>
              <button
                className="play-btn"
                onClick={() =>
                  onPlayAnimation({
                    index,
                    nonce: Date.now(),
                  })
                }
                title="Play animation"
                type="button"
              >
                <svg fill="currentColor" viewBox="0 0 24 24">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                <span>Play</span>
              </button>
            </div>
            <div className="anim-meta">
              <div className="anim-meta-field anim-meta-field-wide">
                <span>Chance {(entry.weight ?? 1).toFixed(2)}x</span>
                <input
                  aria-label="Animation probability"
                  className="anim-weight"
                  max="4"
                  min="0.05"
                  onChange={(event) =>
                    updatePlaylistEntry(setSequencerSettings, index, {
                      weight: Number(event.target.value),
                    })
                  }
                  step="0.05"
                  title={`Chance: ${(entry.weight ?? 1).toFixed(2)}`}
                  type="range"
                  value={entry.weight ?? 1}
                />
              </div>
              <div className="anim-meta-field">
                <span>Purpose</span>
                <select
                  className="anim-purpose-select"
                  onChange={(event) =>
                    updatePlaylistEntry(setSequencerSettings, index, {
                      purpose: event.target.value as AnimationPurpose,
                    })
                  }
                  value={entry.purpose ?? 'gesture'}
                >
                  {ANIMATION_PURPOSES.map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}
                    </option>
                  ))}
                </select>
              </div>
              <div className="anim-meta-field">
                <span>Mode</span>
                <button
                  className={`loop-chip ${entry.loopEligible !== false ? 'on' : ''}`}
                  onClick={() =>
                    updatePlaylistEntry(setSequencerSettings, index, {
                      loopEligible: entry.loopEligible === false,
                    })
                  }
                  type="button"
                >
                  {entry.loopEligible !== false ? 'Loop' : 'Trigger'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
