# bvh2vrma Vendor

These files are a local script-oriented copy of the MIT-licensed `vrm-c/bvh2vrma`
converter surface.

Source repo: https://github.com/vrm-c/bvh2vrma
Reference commit used for verification: `da148d9`

Local adaptation:

- `convertBVHToVRMAnimation.js` imports `GLTFExporter` from this app's installed
  `three` package.
- `convertBVHToVRMAnimation.js` accepts a local `rootTranslation` option:
  `in-place` locks hips X/Z translation, `center-xz` recenters it, and `none`
  preserves the source motion.
- `scripts/convert-bvh-to-vrma.mjs` adds a tiny Node `FileReader` polyfill so
  Three's `GLTFExporter` can write binary VRMA from Node.
