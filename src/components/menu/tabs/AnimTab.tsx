import type { Dispatch, SetStateAction } from 'react';
import type { ManualPlayRequest, SequencerSettings } from '../../../lib/menu/types';

type AnimTabProps = {
  onImportAnimationFile: (file: File) => void;
  onPlayAnimation: (request: ManualPlayRequest) => void;
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>;
  sequencerSettings: SequencerSettings;
};

function updateSequencer(
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>,
  patch: Partial<SequencerSettings>,
) {
  setSequencerSettings((current) => ({
    ...current,
    ...patch,
  }));
}

export function AnimTab({
  onImportAnimationFile,
  onPlayAnimation,
  setSequencerSettings,
  sequencerSettings,
}: AnimTabProps) {
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

      <div className="batch-row">
        <button
          className="btn-xs"
          onClick={() =>
            setSequencerSettings((current) => ({
              ...current,
              playlist: current.playlist.map((entry) => ({
                ...entry,
                enabled: entry.experimental ? entry.enabled : true,
              })),
            }))
          }
          type="button"
        >
          Enable Standard
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
            className={`row ${sequencerSettings.currentIndex === index ? 'active' : ''} ${
              !entry.enabled ? 'disabled' : ''
            }`}
            key={entry.id}
          >
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
              {entry.experimental ? <span className="badge">EXP</span> : null}
            </span>
            <button
              className="play-btn"
              onClick={() =>
                onPlayAnimation({
                  index,
                  nonce: Date.now(),
                })
              }
              title="Play"
              type="button"
            >
              <svg fill="currentColor" viewBox="0 0 24 24">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
