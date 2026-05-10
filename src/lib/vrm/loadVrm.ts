import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';

type RotatableVrmUtils = typeof VRMUtils & {
  rotateVRM0?: (vrm: VRM) => void;
};

function createLoader() {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser, { expressionPlugin: undefined }));
  return loader;
}

function disposeMaterial(material: THREE.Material) {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }

  material.dispose();
}

function asTexture(value: unknown): THREE.Texture | null {
  return value instanceof THREE.Texture ? value : null;
}

export async function loadVrm(url: string): Promise<VRM> {
  const loader = createLoader();
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData['vrm'] as VRM | undefined;

  if (!vrm) {
    throw new Error('Not a VRM file.');
  }

  VRMUtils.removeUnnecessaryVertices?.(vrm.scene);

  if (VRMUtils.combineSkeletons) {
    VRMUtils.combineSkeletons(vrm.scene);
  } else {
    VRMUtils.removeUnnecessaryJoints?.(vrm.scene);
  }

  const utilsWithRotation = VRMUtils as RotatableVrmUtils;
  utilsWithRotation.rotateVRM0?.(vrm);

  vrm.scene.traverse((object) => {
    object.frustumCulled = false;
  });

  vrm.scene.position.set(0, 0.5, 0);
  vrm.scene.rotation.set(0, Math.PI, 0);
  vrm.scene.scale.set(1, 1, 1);

  return vrm;
}

export function makePhysicalFrom(
  oldMaterial: THREE.Material & { [key: string]: any },
  envMap: THREE.Texture | null,
): THREE.Material {
  const uniforms = oldMaterial['uniforms'] as Record<string, { value?: unknown }> | undefined;
  const map =
    (oldMaterial['map'] as THREE.Texture | null | undefined) ??
    asTexture(uniforms?.['mainTexture']?.value) ??
    null;
  const normalMap =
    (oldMaterial['normalMap'] as THREE.Texture | null | undefined) ??
    asTexture(uniforms?.['normalMap']?.value) ??
    null;
  const emissiveMap =
    (oldMaterial['emissiveMap'] as THREE.Texture | null | undefined) ??
    asTexture(uniforms?.['emissiveMap']?.value) ??
    null;
  const emissiveSource = oldMaterial['emissive'] as THREE.Color | undefined;
  const colorSource = oldMaterial['color'] as THREE.Color | undefined;
  const emissiveIntensity = oldMaterial['emissiveIntensity'] as number | undefined;

  if (emissiveMap && !map) {
    return oldMaterial;
  }

  const emissive =
    emissiveSource && emissiveSource.clone ? emissiveSource.clone() : new THREE.Color(0x000000);
  const color =
    colorSource && colorSource.clone ? colorSource.clone() : new THREE.Color(0.9, 0.85, 0.82);

  const parameters: THREE.MeshPhysicalMaterialParameters = {
    map: map || undefined,
    normalMap: normalMap || undefined,
    color: map ? 0xffffff : color,
    emissive,
    emissiveMap: emissiveMap || undefined,
    emissiveIntensity: emissiveIntensity ?? 1,
    roughness: 0.45,
    metalness: 0,
    transmission: 0,
    thickness: 0,
    envMapIntensity: envMap ? 1 : 0,
    clearcoat: envMap ? 0.3 : 0,
    clearcoatRoughness: 0.4,
    specularIntensity: 0.5,
    side: oldMaterial.side !== undefined ? oldMaterial.side : THREE.FrontSide,
    depthWrite: oldMaterial.depthWrite !== undefined ? oldMaterial.depthWrite : true,
    transparent: Boolean(oldMaterial.transparent),
    alphaTest: oldMaterial.alphaTest !== undefined ? oldMaterial.alphaTest : 0,
  };

  if (envMap) {
    parameters.envMap = envMap;
  }

  return new THREE.MeshPhysicalMaterial(parameters);
}

export function setRealisticMode(
  root: THREE.Object3D,
  envMap: THREE.Texture | null,
  enable: boolean,
) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) {
      return;
    }

    const name = object.name?.toLowerCase() || '';
    if (name.includes('eye') || name.includes('iris') || name.includes('lash')) {
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    if (enable) {
      if (!(mesh.userData as { originalMaterials?: THREE.Material[] }).originalMaterials) {
        (mesh.userData as { originalMaterials?: THREE.Material[] }).originalMaterials =
          materials.slice();
      }

      const nextMaterials = materials.map((material) => makePhysicalFrom(material as any, envMap));
      mesh.material = nextMaterials.length === 1 ? nextMaterials[0]! : nextMaterials;
      return;
    }

    const originalMaterials = (mesh.userData as { originalMaterials?: THREE.Material[] })
      .originalMaterials;
    if (!originalMaterials) {
      return;
    }

    const originalSet = new Set(originalMaterials);
    materials.forEach((material) => {
      if (!originalSet.has(material)) {
        material.dispose();
      }
    });
    mesh.material = originalMaterials.length === 1 ? originalMaterials[0]! : originalMaterials;
  });
}

export function disposeVrm(vrm: VRM) {
  vrm.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;

    mesh.geometry?.dispose();

    if (!mesh.material) {
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach(disposeMaterial);
  });
}
