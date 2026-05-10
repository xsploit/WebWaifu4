import { useId, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BundledVrmOption, VisualSettings } from '../../../lib/menu/types';
import { Slider } from '../ui/Slider';
import { Toggle } from '../ui/Toggle';

type VrmTabProps = {
  bundledModels: BundledVrmOption[];
  currentBundledModelId: string;
  onLoadBundledModel: (modelId: string) => void;
  onLoadModelFile: (file: File) => void;
  onLoadSample: () => void;
  setVisualSettings: Dispatch<SetStateAction<VisualSettings>>;
  visualSettings: VisualSettings;
};

function updateVisualSettings(
  setVisualSettings: Dispatch<SetStateAction<VisualSettings>>,
  patch: Partial<VisualSettings>,
) {
  setVisualSettings((current) => ({
    ...current,
    ...patch,
  }));
}

export function VrmTab({
  bundledModels,
  currentBundledModelId,
  onLoadBundledModel,
  onLoadModelFile,
  onLoadSample,
  setVisualSettings,
  visualSettings,
}: VrmTabProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const selectedBundledModelId = currentBundledModelId;

  return (
    <>
      <div className="control-group">
        <div className="control-label">Avatar Source</div>
        <select
          className="select-tech"
          onChange={(event) => {
            if (event.target.value) {
              onLoadBundledModel(event.target.value);
            }
          }}
          value={selectedBundledModelId}
        >
          <option value="">Custom / Uploaded VRM</option>
          {bundledModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
        <div className="field-hint">
          Bundled avatars ship with the game so players can switch instantly.
        </div>
        <button
          className="file-drop-area"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          [ LOAD .VRM FILE ]
        </button>
        <input
          accept=".vrm"
          className="hidden-input"
          id={fileInputId}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              setSelectedFileName(file.name);
              onLoadModelFile(file);
            }
            event.target.value = '';
          }}
          ref={fileInputRef}
          type="file"
        />
        <div className="field-hint">
          {selectedFileName ? `Selected file: ${selectedFileName}` : 'Pick any local .vrm file.'}
        </div>
        <button className="btn-tech secondary" onClick={onLoadSample} type="button">
          Load Default Avatar
        </button>
      </div>

      <div className="control-group">
        <div className="control-label">Rendering Protocols</div>
        <div className="control-label">Camera Framing</div>
        <select
          className="select-tech"
          onChange={(event) =>
            updateVisualSettings(setVisualSettings, {
              cameraViewMode: event.target.value === 'half-body' ? 'half-body' : 'full-body',
            })
          }
          value={visualSettings.cameraViewMode}
        >
          <option value="full-body">Full Body</option>
          <option value="half-body">Half Body / Close</option>
        </select>
        <div className="field-hint">
          Close mode zooms the camera in so you mostly see upper torso and face.
        </div>
        <div className="field-hint">
          Hold <strong>Alt</strong> and drag on the stage to move the avatar up or down.
        </div>
        <div className="control-label">World Placement</div>
        <Slider
          label="Avatar X"
          max={3}
          min={-3}
          onInput={(value) => updateVisualSettings(setVisualSettings, { modelPositionX: value })}
          step={0.01}
          value={visualSettings.modelPositionX}
        />
        <Slider
          label="Avatar Y"
          max={2}
          min={-2}
          onInput={(value) =>
            updateVisualSettings(setVisualSettings, { modelVerticalOffset: value })
          }
          step={0.01}
          value={visualSettings.modelVerticalOffset}
        />
        <Slider
          label="Avatar Z"
          max={3}
          min={-3}
          onInput={(value) => updateVisualSettings(setVisualSettings, { modelPositionZ: value })}
          step={0.01}
          value={visualSettings.modelPositionZ}
        />
        <Slider
          label="Avatar Scale"
          max={4}
          min={0.25}
          onInput={(value) => updateVisualSettings(setVisualSettings, { modelScale: value })}
          step={0.01}
          value={visualSettings.modelScale}
        />
        <Slider
          label="Pitch"
          max={45}
          min={-45}
          onInput={(value) => updateVisualSettings(setVisualSettings, { modelRotationX: value })}
          step={0.1}
          value={visualSettings.modelRotationX}
        />
        <Slider
          label="Yaw"
          max={180}
          min={-180}
          onInput={(value) => updateVisualSettings(setVisualSettings, { modelRotationY: value })}
          step={0.1}
          value={visualSettings.modelRotationY}
        />
        <Slider
          label="Roll"
          max={45}
          min={-45}
          onInput={(value) => updateVisualSettings(setVisualSettings, { modelRotationZ: value })}
          step={0.1}
          value={visualSettings.modelRotationZ}
        />
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            onClick={() =>
              updateVisualSettings(setVisualSettings, {
                modelPositionX: 0,
                modelPositionZ: 0,
                modelRotationX: 0,
                modelRotationY: 0,
                modelRotationZ: 0,
                modelVerticalOffset: -0.62,
                modelScale: 1,
              })
            }
            type="button"
          >
            Reset Avatar
          </button>
        </div>
        <div className="control-label">Camera Rig</div>
        <select
          className="select-tech"
          onChange={(event) =>
            updateVisualSettings(setVisualSettings, {
              cameraRigMode: event.target.value === 'custom' ? 'custom' : 'locked',
            })
          }
          value={visualSettings.cameraRigMode}
        >
          <option value="locked">Locked Preset</option>
          <option value="custom">Custom Camera</option>
        </select>
        <Slider
          label="Camera Y"
          max={0.9}
          min={-0.9}
          onInput={(value) => updateVisualSettings(setVisualSettings, { cameraVerticalOffset: value })}
          step={0.01}
          value={visualSettings.cameraVerticalOffset}
        />
        {visualSettings.cameraRigMode === 'custom' ? (
          <>
            <Slider
              label="Cam X"
              max={3}
              min={-3}
              onInput={(value) => updateVisualSettings(setVisualSettings, { cameraOffsetX: value })}
              step={0.01}
              value={visualSettings.cameraOffsetX}
            />
            <Slider
              label="Cam Lift"
              max={1.5}
              min={-1.5}
              onInput={(value) => updateVisualSettings(setVisualSettings, { cameraOffsetY: value })}
              step={0.01}
              value={visualSettings.cameraOffsetY}
            />
            <Slider
              label="Cam Depth"
              max={4}
              min={-4}
              onInput={(value) => updateVisualSettings(setVisualSettings, { cameraOffsetZ: value })}
              step={0.01}
              value={visualSettings.cameraOffsetZ}
            />
            <Slider
              label="Aim X"
              max={3}
              min={-3}
              onInput={(value) =>
                updateVisualSettings(setVisualSettings, { cameraTargetOffsetX: value })
              }
              step={0.01}
              value={visualSettings.cameraTargetOffsetX}
            />
            <Slider
              label="Aim Y"
              max={1.5}
              min={-1.5}
              onInput={(value) =>
                updateVisualSettings(setVisualSettings, { cameraTargetOffsetY: value })
              }
              step={0.01}
              value={visualSettings.cameraTargetOffsetY}
            />
            <Slider
              label="Aim Z"
              max={4}
              min={-4}
              onInput={(value) =>
                updateVisualSettings(setVisualSettings, { cameraTargetOffsetZ: value })
              }
              step={0.01}
              value={visualSettings.cameraTargetOffsetZ}
            />
            <Slider
              label="FOV"
              max={70}
              min={18}
              onInput={(value) => updateVisualSettings(setVisualSettings, { cameraFov: value })}
              step={0.5}
              value={visualSettings.cameraFov}
            />
          </>
        ) : null}
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            onClick={() =>
              updateVisualSettings(setVisualSettings, {
                cameraRigMode: 'locked',
                cameraVerticalOffset: 0,
                cameraOffsetX: 0,
                cameraOffsetY: 0,
                cameraOffsetZ: 0,
                cameraTargetOffsetX: 0,
                cameraTargetOffsetY: 0,
                cameraTargetOffsetZ: 0,
                cameraFov: 35,
              })
            }
            type="button"
          >
            Reset Camera
          </button>
        </div>
        <div className="toggle-row">
          <span>PBR Realism</span>
          <Toggle
            checked={visualSettings.realisticMode}
            onChange={(checked) =>
              updateVisualSettings(setVisualSettings, { realisticMode: checked })
            }
          />
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Audience Gaze</div>
        <div className="toggle-row">
          <span>Auto Gaze</span>
          <Toggle
            checked={visualSettings.autoGaze}
            onChange={(checked) => updateVisualSettings(setVisualSettings, { autoGaze: checked })}
          />
        </div>
        <div className="toggle-row">
          <span>Pointer Follow</span>
          <Toggle
            checked={visualSettings.gazePointerFollow}
            onChange={(checked) =>
              updateVisualSettings(setVisualSettings, { gazePointerFollow: checked })
            }
          />
        </div>
        <Slider
          label="Strength"
          max={1}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { gazeIntensity: value })}
          step={0.05}
          value={visualSettings.gazeIntensity}
        />
        <Slider
          label="Eye Motion"
          max={1}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { gazeEyeMotion: value })}
          step={0.05}
          value={visualSettings.gazeEyeMotion}
        />
        <Slider
          label="Head Drift"
          max={1}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { gazeHeadDrift: value })}
          step={0.05}
          value={visualSettings.gazeHeadDrift}
        />
        <Slider
          label="Head Follow"
          max={1}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { gazeHeadFollow: value })}
          step={0.05}
          value={visualSettings.gazeHeadFollow}
        />
        <Slider
          label="Eye Aim Y"
          max={0.15}
          min={-0.25}
          onInput={(value) =>
            updateVisualSettings(setVisualSettings, { gazeAudienceYOffset: value })
          }
          step={0.01}
          value={visualSettings.gazeAudienceYOffset}
        />
      </div>

      <div className="control-group">
        <div className="control-label">Post-Processing FX</div>
        <div className="toggle-row">
          <span>Anime Outlines</span>
          <Toggle
            checked={visualSettings.outline}
            onChange={(checked) => updateVisualSettings(setVisualSettings, { outline: checked })}
          />
        </div>
        <div className="toggle-row">
          <span>Bloom</span>
          <Toggle
            checked={visualSettings.bloom}
            onChange={(checked) => updateVisualSettings(setVisualSettings, { bloom: checked })}
          />
        </div>
        <div className="toggle-row">
          <span>Chromatic Aberration</span>
          <Toggle
            checked={visualSettings.chroma}
            onChange={(checked) => updateVisualSettings(setVisualSettings, { chroma: checked })}
          />
        </div>
        <div className="toggle-row">
          <span>Film Grain</span>
          <Toggle
            checked={visualSettings.grain}
            onChange={(checked) => updateVisualSettings(setVisualSettings, { grain: checked })}
          />
        </div>
        <div className="toggle-row">
          <span>Glitch Effect</span>
          <Toggle
            checked={visualSettings.glitch}
            onChange={(checked) => updateVisualSettings(setVisualSettings, { glitch: checked })}
          />
        </div>
        <div className="toggle-row">
          <span>Anti-Aliasing (FXAA)</span>
          <Toggle
            checked={visualSettings.fxaa}
            onChange={(checked) => updateVisualSettings(setVisualSettings, { fxaa: checked })}
          />
        </div>
        <div className="toggle-row">
          <span>SMAA (Better Quality)</span>
          <Toggle
            checked={visualSettings.smaa}
            onChange={(checked) => updateVisualSettings(setVisualSettings, { smaa: checked })}
          />
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Animation Quality</div>
        <div className="toggle-row">
          <span>Auto Blink</span>
          <Toggle
            checked={visualSettings.autoBlink}
            onChange={(checked) => updateVisualSettings(setVisualSettings, { autoBlink: checked })}
          />
        </div>
        <Slider
          label="Blink Every"
          max={10}
          min={1.5}
          onInput={(value) => updateVisualSettings(setVisualSettings, { blinkInterval: value })}
          step={0.1}
          value={visualSettings.blinkInterval}
        />
        <Slider
          label="Blink Strength"
          max={1}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { blinkIntensity: value })}
          step={0.05}
          value={visualSettings.blinkIntensity}
        />
        <Slider
          label="Crossfade"
          max={3}
          min={0.1}
          onInput={(value) => updateVisualSettings(setVisualSettings, { crossfadeDuration: value })}
          step={0.1}
          value={visualSettings.crossfadeDuration}
        />
        <div className="toggle-row">
          <span>Arm Clip Guard</span>
          <Toggle
            checked={visualSettings.armClipGuard}
            onChange={(checked) =>
              updateVisualSettings(setVisualSettings, { armClipGuard: checked })
            }
          />
        </div>
        <Slider
          label="Arm Guard"
          max={1}
          min={0}
          onInput={(value) =>
            updateVisualSettings(setVisualSettings, { armClipGuardStrength: value })
          }
          step={0.05}
          value={visualSettings.armClipGuardStrength}
        />
        <Slider
          label="Torso Radius"
          max={0.55}
          min={0.08}
          onInput={(value) =>
            updateVisualSettings(setVisualSettings, { armClipTorsoRadius: value })
          }
          step={0.01}
          value={visualSettings.armClipTorsoRadius}
        />
      </div>

      <div className="control-group">
        <div className="control-label">Film Look (Perry-Smith)</div>
        <div className="toggle-row">
          <span>Bleach Bypass</span>
          <Toggle
            checked={visualSettings.bleach}
            onChange={(checked) => updateVisualSettings(setVisualSettings, { bleach: checked })}
          />
        </div>
        <Slider
          label="Intensity"
          max={1}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { bleachOpacity: value })}
          step={0.05}
          value={visualSettings.bleachOpacity}
        />
        <div className="toggle-row">
          <span>Color Correction</span>
          <Toggle
            checked={visualSettings.colorCorr}
            onChange={(checked) => updateVisualSettings(setVisualSettings, { colorCorr: checked })}
          />
        </div>
        <Slider
          label="Red Power"
          max={2}
          min={1}
          onInput={(value) => updateVisualSettings(setVisualSettings, { colorPowR: value })}
          step={0.05}
          value={visualSettings.colorPowR}
        />
        <Slider
          label="Green Pow"
          max={2}
          min={1}
          onInput={(value) => updateVisualSettings(setVisualSettings, { colorPowG: value })}
          step={0.05}
          value={visualSettings.colorPowG}
        />
        <Slider
          label="Blue Power"
          max={2}
          min={1}
          onInput={(value) => updateVisualSettings(setVisualSettings, { colorPowB: value })}
          step={0.05}
          value={visualSettings.colorPowB}
        />
      </div>

      <div className="control-group">
        <div className="control-label">Shader Controls</div>
        <Slider
          label="Bloom Str"
          max={2}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { bloomStrength: value })}
          step={0.1}
          value={visualSettings.bloomStrength}
        />
        <Slider
          label="Bloom Rad"
          max={1}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { bloomRadius: value })}
          step={0.1}
          value={visualSettings.bloomRadius}
        />
        <Slider
          label="Bloom Th"
          max={1}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { bloomThreshold: value })}
          step={0.05}
          value={visualSettings.bloomThreshold}
        />
        <Slider
          label="Chroma Amt"
          max={0.01}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { chromaAmount: value })}
          step={0.0001}
          value={visualSettings.chromaAmount}
        />
        <Slider
          label="Chroma Ang"
          max={6.28}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { chromaAngle: value })}
          step={0.1}
          value={visualSettings.chromaAngle}
        />
        <Slider
          label="Grain Amt"
          max={0.2}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { grainAmount: value })}
          step={0.01}
          value={visualSettings.grainAmount}
        />
        <Slider
          label="Vignette"
          max={1}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { vignetteAmount: value })}
          step={0.05}
          value={visualSettings.vignetteAmount}
        />
        <Slider
          label="Vig Hard"
          max={2}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { vignetteHardness: value })}
          step={0.1}
          value={visualSettings.vignetteHardness}
        />
      </div>

      <div className="control-group">
        <div className="control-label">Lighting Controls</div>
        <Slider
          label="Key Light"
          max={3}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { keyLight: value })}
          step={0.1}
          value={visualSettings.keyLight}
        />
        <Slider
          label="Fill Light"
          max={2}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { fillLight: value })}
          step={0.1}
          value={visualSettings.fillLight}
        />
        <Slider
          label="Rim Light"
          max={2}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { rimLight: value })}
          step={0.05}
          value={visualSettings.rimLight}
        />
        <Slider
          label="Hemi Light"
          max={2}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { hemiLight: value })}
          step={0.05}
          value={visualSettings.hemiLight}
        />
        <Slider
          label="Ambient"
          max={2}
          min={0}
          onInput={(value) => updateVisualSettings(setVisualSettings, { ambientLight: value })}
          step={0.05}
          value={visualSettings.ambientLight}
        />
      </div>
    </>
  );
}
