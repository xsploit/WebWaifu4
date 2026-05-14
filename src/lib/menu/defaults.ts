import type { SequencerSettings, VisualSettings } from './types';
import { DEFAULT_ANIMATIONS } from '../vrm/sequencer';

export function createDefaultVisualSettings(): VisualSettings {
  return {
    cameraViewMode: 'half-body',
    cameraRigMode: 'locked',
    cameraVerticalOffset: 0,
    cameraOffsetX: 0,
    cameraOffsetY: 0,
    cameraOffsetZ: 0,
    cameraTargetOffsetX: 0,
    cameraTargetOffsetY: 0,
    cameraTargetOffsetZ: 0,
    cameraFov: 35,
    modelPositionX: 0,
    modelPositionZ: 0,
    modelRotationX: 0,
    modelRotationY: 0,
    modelRotationZ: 0,
    modelVerticalOffset: -0.62,
    modelScale: 1,
    realisticMode: false,
    autoBlink: true,
    blinkInterval: 4.2,
    blinkIntensity: 1,
    autoGaze: true,
    gazeIntensity: 0.85,
    gazeHeadFollow: 0.75,
    gazeHeadDrift: 0.9,
    gazeEyeMotion: 0.8,
    gazePointerFollow: false,
    gazeAudienceYOffset: -0.1,
    armClipGuard: true,
    armClipGuardStrength: 0.75,
    armClipTorsoRadius: 0.24,
    crossfadeDuration: 1,
    outline: true,
    colorCorr: false,
    sceneExposure: 0.85,
    colorPowR: 1.4,
    colorPowG: 1.45,
    colorPowB: 1.45,
    keyLight: 0.8,
    fillLight: 0.3,
    rimLight: 0.35,
    hemiLight: 0.35,
    ambientLight: 0.35,
  };
}

export function createDefaultSequencerSettings(): SequencerSettings {
  return {
    playing: true,
    shuffle: false,
    loop: true,
    speed: 1,
    duration: 10,
    currentIndex: -1,
    playlist: DEFAULT_ANIMATIONS.map((entry) => ({ ...entry })),
  };
}
