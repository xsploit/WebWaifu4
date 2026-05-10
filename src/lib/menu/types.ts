export type SettingsTabId = 'vrm' | 'anim' | 'character' | 'ai' | 'context' | 'tts';

export type CameraViewMode = 'full-body' | 'half-body';

export type BundledVrmOption = {
  id: string;
  label: string;
  assetPath: string;
};

export type AnimationFormat = 'fbx' | 'glb' | 'gltf' | 'vrma' | 'bvh';

export type AnimationEntry = {
  id: string;
  name: string;
  url: string;
  format?: AnimationFormat;
  enabled: boolean;
  experimental: boolean;
};

export type VisualSettings = {
  cameraViewMode: CameraViewMode;
  cameraVerticalOffset: number;
  modelVerticalOffset: number;
  modelScale: number;
  realisticMode: boolean;
  autoBlink: boolean;
  blinkInterval: number;
  blinkIntensity: number;
  autoGaze: boolean;
  gazeIntensity: number;
  gazeHeadFollow: number;
  gazeHeadDrift: number;
  gazeEyeMotion: number;
  gazePointerFollow: boolean;
  gazeAudienceYOffset: number;
  armClipGuard: boolean;
  armClipGuardStrength: number;
  armClipTorsoRadius: number;
  crossfadeDuration: number;
  postProcessingEnabled: boolean;
  outline: boolean;
  bloom: boolean;
  chroma: boolean;
  grain: boolean;
  glitch: boolean;
  fxaa: boolean;
  smaa: boolean;
  taa: boolean;
  bleach: boolean;
  colorCorr: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  chromaAmount: number;
  chromaAngle: number;
  grainAmount: number;
  vignetteAmount: number;
  vignetteHardness: number;
  bleachOpacity: number;
  colorPowR: number;
  colorPowG: number;
  colorPowB: number;
  taaSampleLevel: number;
  keyLight: number;
  fillLight: number;
  rimLight: number;
  hemiLight: number;
  ambientLight: number;
};

export type SequencerSettings = {
  playing: boolean;
  shuffle: boolean;
  loop: boolean;
  speed: number;
  duration: number;
  currentIndex: number;
  playlist: AnimationEntry[];
};

export type ManualPlayRequest = {
  index: number;
  nonce: number;
};
