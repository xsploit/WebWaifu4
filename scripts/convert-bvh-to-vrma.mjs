import fs from 'node:fs/promises';
import path from 'node:path';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import { convertBVHToVRMAnimation } from './vendor/bvh2vrma/convertBVHToVRMAnimation.js';

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    result = null;
    onloadend = null;

    async readAsArrayBuffer(blob) {
      this.result = await blob.arrayBuffer();
      this.onloadend?.();
    }
  };
}

const [, , inputPath, outputPath, scaleArg] = process.argv;

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/convert-bvh-to-vrma.mjs <input.bvh> <output.vrma> [scale]');
  process.exit(1);
}

const scale = Number.isFinite(Number(scaleArg)) ? Number(scaleArg) : 0.01;
const source = await fs.readFile(inputPath, 'utf8');
const loader = new BVHLoader();
const bvh = loader.parse(source);
const vrma = await convertBVHToVRMAnimation(bvh, { scale });
const bytes = vrma instanceof ArrayBuffer ? Buffer.from(vrma) : Buffer.from(await vrma.arrayBuffer());

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, bytes);

console.log(`wrote ${outputPath} (${bytes.length} bytes)`);
