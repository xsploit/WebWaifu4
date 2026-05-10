import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import {
  createVRMAnimationClip,
  VRMAnimationLoaderPlugin,
  type VRMAnimation,
} from '@pixiv/three-vrm-animation';
import type { AnimationEntry, AnimationFormat } from '../menu/types';

// Mixamo to VRM humanoid bone map (from three-vrm examples)
export const mixamoVRMRigMap: Partial<Record<string, VRMHumanBoneName>> = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
  mixamorigLeftHandThumb2: 'leftThumbProximal',
  mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal',
  mixamorigLeftHandIndex2: 'leftIndexIntermediate',
  mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal',
  mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal',
  mixamorigLeftHandRing2: 'leftRingIntermediate',
  mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal',
  mixamorigLeftHandPinky2: 'leftLittleIntermediate',
  mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigRightHandThumb1: 'rightThumbMetacarpal',
  mixamorigRightHandThumb2: 'rightThumbProximal',
  mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal',
  mixamorigRightHandIndex2: 'rightIndexIntermediate',
  mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandRing1: 'rightRingProximal',
  mixamorigRightHandRing2: 'rightRingIntermediate',
  mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandPinky1: 'rightLittleProximal',
  mixamorigRightHandPinky2: 'rightLittleIntermediate',
  mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
};

// Simple bone map for retargeting generic FBX
const simpleBoneMap: Record<string, string> = {
  Hips: 'J_Bip_C_Hips',
  Spine: 'J_Bip_C_Spine',
  Spine1: 'J_Bip_C_Chest',
  Spine2: 'J_Bip_C_UpperChest',
  Neck: 'J_Bip_C_Neck',
  Head: 'J_Bip_C_Head',
  LeftShoulder: 'J_Bip_L_Shoulder',
  LeftArm: 'J_Bip_L_UpperArm',
  LeftForeArm: 'J_Bip_L_LowerArm',
  LeftHand: 'J_Bip_L_Hand',
  RightShoulder: 'J_Bip_R_Shoulder',
  RightArm: 'J_Bip_R_UpperArm',
  RightForeArm: 'J_Bip_R_LowerArm',
  RightHand: 'J_Bip_R_Hand',
  LeftUpLeg: 'J_Bip_L_UpperLeg',
  LeftLeg: 'J_Bip_L_LowerLeg',
  LeftFoot: 'J_Bip_L_Foot',
  RightUpLeg: 'J_Bip_R_UpperLeg',
  RightLeg: 'J_Bip_R_LowerLeg',
  RightFoot: 'J_Bip_R_Foot',
};

const genericVRMRigMap: Record<string, VRMHumanBoneName> = {
  hips: 'hips',
  hip: 'hips',
  pelvis: 'hips',
  spine: 'spine',
  spine1: 'chest',
  chest: 'chest',
  spine2: 'upperChest',
  upperchest: 'upperChest',
  neck: 'neck',
  head: 'head',
  leftshoulder: 'leftShoulder',
  lshoulder: 'leftShoulder',
  leftarm: 'leftUpperArm',
  leftupperarm: 'leftUpperArm',
  larm: 'leftUpperArm',
  rightshoulder: 'rightShoulder',
  rshoulder: 'rightShoulder',
  rightarm: 'rightUpperArm',
  rightupperarm: 'rightUpperArm',
  rarm: 'rightUpperArm',
  leftforearm: 'leftLowerArm',
  leftlowerarm: 'leftLowerArm',
  lelbow: 'leftLowerArm',
  rightforearm: 'rightLowerArm',
  rightlowerarm: 'rightLowerArm',
  relbow: 'rightLowerArm',
  lefthand: 'leftHand',
  lhand: 'leftHand',
  righthand: 'rightHand',
  rhand: 'rightHand',
  leftupleg: 'leftUpperLeg',
  leftupperleg: 'leftUpperLeg',
  leftleg: 'leftLowerLeg',
  leftlowerleg: 'leftLowerLeg',
  leftfoot: 'leftFoot',
  lefttoebase: 'leftToes',
  lefttoe: 'leftToes',
  rightupleg: 'rightUpperLeg',
  rightupperleg: 'rightUpperLeg',
  rightleg: 'rightLowerLeg',
  rightlowerleg: 'rightLowerLeg',
  rightfoot: 'rightFoot',
  righttoebase: 'rightToes',
  righttoe: 'rightToes',
};

const fbxLoader = new FBXLoader();
const bvhLoader = new BVHLoader();
const vrmaLoader = new GLTFLoader();
const fbxAssetCache = new Map<string, Promise<THREE.Group>>();
const bvhAssetCache = new Map<string, ReturnType<typeof bvhLoader.loadAsync>>();
const vrmaAssetCache = new Map<string, ReturnType<typeof vrmaLoader.loadAsync>>();

bvhLoader.animateBonePositions = false;
vrmaLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

function normalizeAnimationUrl(url: string) {
  const trimmed = url.trim();
  return trimmed.startsWith('./assets/') ? trimmed.replace(/^\.\//, '/') : trimmed;
}

function loadFbxAsset(url: string) {
  const normalizedUrl = normalizeAnimationUrl(url);
  const cached = fbxAssetCache.get(normalizedUrl);
  if (cached) {
    return cached;
  }

  const pending = fbxLoader.loadAsync(normalizedUrl).catch((error) => {
    fbxAssetCache.delete(normalizedUrl);
    throw error;
  });
  fbxAssetCache.set(normalizedUrl, pending);
  return pending;
}

function loadBvhAsset(url: string) {
  const normalizedUrl = normalizeAnimationUrl(url);
  const cached = bvhAssetCache.get(normalizedUrl);
  if (cached) {
    return cached;
  }

  const pending = bvhLoader.loadAsync(normalizedUrl).catch((error) => {
    bvhAssetCache.delete(normalizedUrl);
    throw error;
  });
  bvhAssetCache.set(normalizedUrl, pending);
  return pending;
}

function loadVrmaAsset(url: string) {
  const normalizedUrl = normalizeAnimationUrl(url);
  const cached = vrmaAssetCache.get(normalizedUrl);
  if (cached) {
    return cached;
  }

  const pending = vrmaLoader.loadAsync(normalizedUrl).catch((error) => {
    vrmaAssetCache.delete(normalizedUrl);
    throw error;
  });
  vrmaAssetCache.set(normalizedUrl, pending);
  return pending;
}

function inferAnimationFormat(url: string, format?: AnimationFormat): AnimationFormat {
  if (format) {
    return format;
  }

  const cleanUrl = url.split('?')[0]?.split('#')[0]?.toLowerCase() ?? '';
  if (cleanUrl.endsWith('.vrma')) return 'vrma';
  if (cleanUrl.endsWith('.bvh')) return 'bvh';
  if (cleanUrl.endsWith('.glb')) return 'glb';
  if (cleanUrl.endsWith('.gltf')) return 'gltf';
  return 'fbx';
}

function normalizeRigName(name: string) {
  return name
    .split('|')
    .pop()!
    .split(':')
    .pop()!
    .replace(/^mixamorig/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function resolveVRMBoneName(rigName: string): VRMHumanBoneName | null {
  return mixamoVRMRigMap[rigName] ?? genericVRMRigMap[normalizeRigName(rigName)] ?? null;
}

function copyQuaternionTrackValues(track: THREE.QuaternionKeyframeTrack, vrm: VRM) {
  const value = new Float32Array(track.values.length);
  for (let i = 0; i < track.values.length; i += 4) {
    const x = track.values[i] ?? 0;
    const y = track.values[i + 1] ?? 0;
    const z = track.values[i + 2] ?? 0;
    const w = track.values[i + 3] ?? 1;
    value[i] = vrm.meta?.metaVersion === '0' ? -x : x;
    value[i + 1] = y;
    value[i + 2] = vrm.meta?.metaVersion === '0' ? -z : z;
    value[i + 3] = w;
  }
  return value;
}

function retargetHumanoidClipByBoneName(
  clip: THREE.AnimationClip,
  vrm: VRM,
  options: { includeHipsTranslation: boolean },
): THREE.AnimationClip | null {
  const tracks: THREE.KeyframeTrack[] = [];

  clip.tracks.forEach((track) => {
    const [rigName, propertyName] = track.name.split('.');
    if (!rigName || !propertyName) {
      return;
    }

    const vrmBoneName = resolveVRMBoneName(rigName);
    if (!vrmBoneName) {
      return;
    }

    const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
    if (!vrmNodeName) {
      return;
    }

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          track.times,
          copyQuaternionTrackValues(track, vrm),
        ),
      );
      return;
    }

    if (
      options.includeHipsTranslation &&
      vrmBoneName === 'hips' &&
      track instanceof THREE.VectorKeyframeTrack
    ) {
      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          track.times,
          new Float32Array(track.values),
        ),
      );
    }
  });

  return tracks.length > 0
    ? new THREE.AnimationClip(clip.name || 'vrmAnimation', clip.duration, tracks)
    : null;
}

export async function loadMixamoAnimation(
  url: string,
  vrm: VRM,
): Promise<THREE.AnimationClip | null> {
  const asset = await loadFbxAsset(url);
  const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com');
  if (!clip) return null;

  const tracks: THREE.KeyframeTrack[] = [];
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const quatA = new THREE.Quaternion();
  const vector = new THREE.Vector3();

  const motionHipsHeight = asset.getObjectByName('mixamorigHips')?.position.y ?? 1;
  const vrmHipsY = vrm.humanoid?.getNormalizedBoneNode('hips')?.getWorldPosition(vector).y ?? 0;
  const vrmRootY = vrm.scene.getWorldPosition(vector).y;
  const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY);
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

  clip.tracks.forEach((track) => {
    const trackSplitted = track.name.split('.');
    const mixamoRigName = trackSplitted[0];
    if (!mixamoRigName) return;
    const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
    if (!vrmBoneName) return;
    const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
    const mixamoRigNode = asset.getObjectByName(mixamoRigName);

    if (vrmNodeName != null && mixamoRigNode) {
      const propertyName = trackSplitted[1];
      if (!propertyName) return;

      mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
      mixamoRigNode.parent!.getWorldQuaternion(parentRestWorldRotation);

      if (track instanceof THREE.QuaternionKeyframeTrack) {
        const value = new Float32Array(track.values.length);
        for (let i = 0; i < track.values.length; i += 4) {
          quatA.set(
            track.values[i] ?? 0,
            track.values[i + 1] ?? 0,
            track.values[i + 2] ?? 0,
            track.values[i + 3] ?? 1,
          );
          quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
          value[i] = vrm.meta?.metaVersion === '0' ? -quatA.x : quatA.x;
          value[i + 1] = quatA.y;
          value[i + 2] = vrm.meta?.metaVersion === '0' ? -quatA.z : quatA.z;
          value[i + 3] = quatA.w;
        }

        tracks.push(
          new THREE.QuaternionKeyframeTrack(`${vrmNodeName}.${propertyName}`, track.times, value),
        );
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        // Only retarget hips translation; other positional tracks cause skeleton drift on many VRMs.
        if (vrmBoneName !== 'hips') return;

        // Compute position as delta from Mixamo rest pose, scaled, then offset to VRM rest
        // This prevents animations with different rest hips heights from pushing the VRM up
        const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName);
        const vrmRestX = vrmNode ? vrmNode.position.x : 0;
        const vrmRestY = vrmNode ? vrmNode.position.y : 0;
        const vrmRestZ = vrmNode ? vrmNode.position.z : 0;
        const mixRestX = mixamoRigNode.position.x;
        const mixRestY = mixamoRigNode.position.y;
        const mixRestZ = mixamoRigNode.position.z;
        let baseDx = (track.values[0] ?? mixRestX) - mixRestX;
        let baseDy = (track.values[1] ?? mixRestY) - mixRestY;
        let baseDz = (track.values[2] ?? mixRestZ) - mixRestZ;
        if (vrm.meta?.metaVersion === '0') {
          baseDx = -baseDx;
          baseDz = -baseDz;
        }

        const value = new Float32Array(track.values.length);
        for (let i = 0; i < track.values.length; i += 3) {
          let dx = (track.values[i] ?? mixRestX) - mixRestX;
          let dy = (track.values[i + 1] ?? mixRestY) - mixRestY;
          let dz = (track.values[i + 2] ?? mixRestZ) - mixRestZ;
          if (vrm.meta?.metaVersion === '0') {
            dx = -dx;
            dz = -dz;
          }
          dx -= baseDx;
          dy -= baseDy;
          dz -= baseDz;
          // Lock horizontal root motion so looped clips stay centered in the scene.
          dx = 0;
          dz = 0;
          value[i] = vrmRestX + dx * hipsPositionScale;
          value[i + 1] = vrmRestY + dy * hipsPositionScale;
          value[i + 2] = vrmRestZ + dz * hipsPositionScale;
        }

        tracks.push(
          new THREE.VectorKeyframeTrack(`${vrmNodeName}.${propertyName}`, track.times, value),
        );
      }
    }
  });

  return tracks.length > 0 ? new THREE.AnimationClip('vrmAnimation', clip.duration, tracks) : null;
}

async function loadVrmaAnimation(url: string, vrm: VRM): Promise<THREE.AnimationClip | null> {
  const asset = await loadVrmaAsset(url);
  const animations = asset.userData['vrmAnimations'] as VRMAnimation[] | undefined;
  const vrmAnimation = animations?.[0];
  return vrmAnimation ? createVRMAnimationClip(vrmAnimation, vrm) : null;
}

async function loadBvhAnimation(url: string, vrm: VRM): Promise<THREE.AnimationClip | null> {
  const asset = await loadBvhAsset(url);
  return retargetHumanoidClipByBoneName(asset.clip, vrm, { includeHipsTranslation: false });
}

async function loadGltfAnimation(url: string, vrm: VRM): Promise<THREE.AnimationClip | null> {
  const asset = await loadVrmaAsset(url);
  const vrmAnimation = (asset.userData['vrmAnimations'] as VRMAnimation[] | undefined)?.[0];
  if (vrmAnimation) {
    return createVRMAnimationClip(vrmAnimation, vrm);
  }

  const clip = asset.animations[0];
  return clip ? retargetHumanoidClipByBoneName(clip, vrm, { includeHipsTranslation: true }) : null;
}

export async function loadVrmAnimationClip(
  entry: Pick<AnimationEntry, 'url' | 'format'>,
  vrm: VRM,
): Promise<THREE.AnimationClip | null> {
  switch (inferAnimationFormat(entry.url, entry.format)) {
    case 'vrma':
      return loadVrmaAnimation(entry.url, vrm);
    case 'bvh':
      return loadBvhAnimation(entry.url, vrm);
    case 'glb':
    case 'gltf':
      return loadGltfAnimation(entry.url, vrm);
    case 'fbx':
    default:
      return loadMixamoAnimation(entry.url, vrm);
  }
}

export function retargetClip(clip: THREE.AnimationClip, vrm: VRM): THREE.AnimationClip | null {
  if (!clip || !vrm) return null;
  const have = new Set<string>();
  vrm.scene.traverse((object) => have.add(object.name));
  const out = clip.clone();
  out.tracks = out.tracks.filter((track) => {
    const [node, rest] = track.name.split('.');
    const mapped = simpleBoneMap[node ?? ''] ?? node;
    if (!mapped || !rest || !have.has(mapped)) return false;
    track.name = `${mapped}.${rest}`;
    return true;
  });
  return out.tracks.length ? out : null;
}

let currentAction: THREE.AnimationAction | null = null;
let previousAction: THREE.AnimationAction | null = null;

export function crossfadeToAction(
  newAction: THREE.AnimationAction,
  duration = 1.0,
  timeScale = 1.0,
) {
  if (previousAction) previousAction.fadeOut(duration);
  if (currentAction) {
    currentAction.fadeOut(duration);
    previousAction = currentAction;
  }

  newAction.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(duration).play();
  currentAction = newAction;
}

export function resetCrossfadeState() {
  currentAction?.stop();
  previousAction?.stop();
  currentAction = null;
  previousAction = null;
}
