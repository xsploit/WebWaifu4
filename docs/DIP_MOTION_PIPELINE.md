# DiP Motion Pipeline

This is the current local bridge from DiP/MDM generated motion into the web waifu app.

## Current Pack

Generated with:

- Repo: `C:\Users\SUBSECT\Documents\motion-lab\motion-diffusion-model`
- Env: WSL `Ubuntu`, micromamba env `mdm310`
- Checkpoint: `save/DiP_no-target_10steps_context20_predict40/model000600343.pt`
- Output cache: `C:\Users\SUBSECT\Documents\motion-lab\motion-diffusion-model\outputs\vtuber_motion_pack_dip`

Prompts:

- idle: standing idle with subtle breathing
- talking: expressive talking with small hand gestures
- hand_gestures: both-hand explaining gestures
- listening: attentive listening and nodding
- looking: casual head and upper-body looking
- laugh: happy laugh reaction
- react: surprised reaction
- leave: step back and leave
- thinking: hand-near-chin thinking pause

Committed app cache:

- `public/assets/animations/dip/*.bvh`
- `public/assets/animations/dip/motion_manifest.json`
- `public/assets/animations/dip/cache/results.npy`
- `public/assets/animations/dip/cache/results.txt`
- `public/assets/animations/dip/cache/results_len.txt`
- `public/assets/animations/dip/cache/samples_00_to_02.mp4`
- `public/assets/animations/dip/cache/samples_03_to_05.mp4`
- `public/assets/animations/dip/cache/samples_06_to_08.mp4`

The Anim tab exposes the pack as experimental default playlist entries named `DiP ...`.

## Regenerate

From the MDM checkout:

```bash
cd /mnt/c/Users/SUBSECT/Documents/motion-lab/motion-diffusion-model
export MAMBA_ROOT_PREFIX=/opt/micromamba
export MPLBACKEND=Agg
export TOKENIZERS_PARALLELISM=false
export TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=1
micromamba run -n mdm310 python -m sample.generate \
  --model_path save/DiP_no-target_10steps_context20_predict40/model000600343.pt \
  --autoregressive \
  --guidance_param 7.5 \
  --num_repetitions 1 \
  --motion_length 4 \
  --input_text assets/codex_vtuber_motion_prompts.txt \
  --output_dir outputs/vtuber_motion_pack_dip
```

## Export To App BVH

From this app repo:

```bash
cd /mnt/c/Users/SUBSECT/Documents/Codex/2026-05-04/https-github-com-prismml-eng-bonsai/yourwifey-stream
export MAMBA_ROOT_PREFIX=/opt/micromamba
micromamba run -n mdm310 python scripts/export-dip-results-to-bvh.py \
  --results /mnt/c/Users/SUBSECT/Documents/motion-lab/motion-diffusion-model/outputs/vtuber_motion_pack_dip/results.npy \
  --out public/assets/animations/dip \
  --asset-base /assets/animations/dip \
  --names idle,talking,hand_gestures,listening,looking,laugh,react,leave,thinking \
  --source DiP_no-target_10steps_context20_predict40/model000600343.pt \
  --copy-raw
```

Then copy preview MP4s into `public/assets/animations/dip/cache/` if needed.

## Translation Targets

Current:

- DiP `results.npy`: raw generated XYZ joint cache.
- BVH: exported app format, loadable by Three `BVHLoader`.

Next useful translations:

- FBX: easiest via Blender import BVH, retarget to an armature, export FBX.
- VRMA: retarget to VRM humanoid bones and export VRM Animation.
- Unity/VRChat: import BVH/FBX, map to Humanoid, bake an `.anim` clip for an avatar controller.
- Higher quality SMPL: run MDM `visualize.render_mesh` / SMPLify to produce SMPL params, then export through Blender. This is slower but gives better skeleton fidelity than the current direct XYZ-to-BVH bridge.

## Hook Shape

The clean version of our own hook is:

1. Generate or choose cached DiP prompt clips.
2. Export each clip into a stable asset format.
3. Add clips to `motion_manifest.json`.
4. Let the app's animation sequencer load them by URL.
5. Later, add semantic animation tags so chat/LLM output can request `talking`, `laugh`, `react`, `thinking`, etc.

That same bridge can target VRChat by replacing step 2 with a Unity/Blender retarget export.
