import type { SequencerSettings, VisualSettings } from './types';
import { DEFAULT_ANIMATIONS } from '../vrm/sequencer';

export function createDefaultVisualSettings(): VisualSettings {
  return {
    cameraViewMode: 'half-body',
    cameraVerticalOffset: 0,
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
    crossfadeDuration: 1,
    postProcessingEnabled: true,
    outline: true,
    bloom: false,
    chroma: false,
    grain: false,
    glitch: false,
    fxaa: false,
    smaa: false,
    taa: false,
    bleach: false,
    colorCorr: false,
    bloomStrength: 0.4,
    bloomRadius: 0.6,
    bloomThreshold: 0.7,
    chromaAmount: 0.0015,
    chromaAngle: 0,
    grainAmount: 0.05,
    vignetteAmount: 0.3,
    vignetteHardness: 0.8,
    bleachOpacity: 0.2,
    colorPowR: 1.4,
    colorPowG: 1.45,
    colorPowB: 1.45,
    taaSampleLevel: 2,
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
