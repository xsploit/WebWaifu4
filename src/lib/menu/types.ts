export type SettingsTabId = 'vrm' | 'anim' | 'character' | 'ai' | 'twitch' | 'context' | 'tts';

export type CameraViewMode = 'full-body' | 'half-body';

export type CameraRigMode = 'locked' | 'custom';

export type BundledVrmOption = {
  id: string;
  label: string;
  assetPath: string;
};

export type AnimationFormat = 'fbx' | 'glb' | 'gltf' | 'vrma' | 'bvh';

export type AnimationPurpose = 'ambient' | 'gesture' | 'emotion' | 'movement' | 'pose';

export type AnimationEntry = {
  id: string;
  name: string;
  url: string;
  format?: AnimationFormat;
  enabled: boolean;
  experimental: boolean;
  weight?: number;
  loopEligible?: boolean;
  purpose?: AnimationPurpose;
  tags?: string[];
};

export type VisualSettings = {
  cameraViewMode: CameraViewMode;
  cameraRigMode: CameraRigMode;
  cameraVerticalOffset: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
  cameraOffsetZ: number;
  cameraTargetOffsetX: number;
  cameraTargetOffsetY: number;
  cameraTargetOffsetZ: number;
  cameraFov: number;
  modelPositionX: number;
  modelPositionZ: number;
  modelRotationX: number;
  modelRotationY: number;
  modelRotationZ: number;
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
  outline: boolean;
  outlineAlpha: number;
  outlineColor: string;
  outlineThickness: number;
  colorCorr: boolean;
  sceneExposure: number;
  colorPowR: number;
  colorPowG: number;
  colorPowB: number;
  pbrClearcoat: number;
  pbrClearcoatRoughness: number;
  pbrEnvMapIntensity: number;
  pbrMetalness: number;
  pbrRoughness: number;
  pbrSpecularIntensity: number;
  mtoonTuning: boolean;
  mtoonGiEqualization: number;
  mtoonRimColor: string;
  mtoonRimFresnel: number;
  mtoonRimLift: number;
  mtoonRimLightingMix: number;
  mtoonShadeColor: string;
  mtoonShadeShift: number;
  mtoonToony: number;
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

export type FacialExpressionRequest = {
  durationMs: number;
  expression: string;
  intensity: number;
  nonce: number;
};
