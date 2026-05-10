import fs from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error('Usage: node scripts/verify-vrma.mjs <input.vrma>');
  process.exit(1);
}

const buffer = await fs.readFile(inputPath);
const loader = new GLTFLoader();
loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

const gltf = await new Promise((resolve, reject) => {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  loader.parse(arrayBuffer, '', resolve, reject);
});

const animations = gltf.userData.vrmAnimations ?? [];
const first = animations[0];

console.log(
  JSON.stringify({
    animations: animations.length,
    duration: first?.duration ?? null,
    humanoidRotationTracks: first?.humanoidTracks?.rotation?.size ?? 0,
    humanoidTranslationTracks: first?.humanoidTracks?.translation?.size ?? 0,
  }),
);
