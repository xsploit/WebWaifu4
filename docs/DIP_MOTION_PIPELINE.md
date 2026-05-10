# DiP Motion Pipeline

This is the current local bridge from DiP/MDM generated motion into the web waifu app.

## Current Truth

DiP generation works. The first direct DiP XYZ to BVH bridge did not.

The generated BVHs loaded in the app, but the VRM retarget was bad enough to make the avatar move incorrectly. Those BVHs are retired and no longer exposed in the default animation playlist. Old saved playlist entries for `/assets/animations/dip/dip_*.bvh` are filtered out during settings normalization.

The real cache format is now:

1. DiP/MDM `results.npy`: raw XYZ joint output.
2. MDM `visualize.render_mesh`: official SMPLify conversion.
3. `sampleN_rep00_smpl_params.npy`: stable SMPL motion parameters.
4. In-place VRMA test clips: generated through the `bvh2vrma` converter path that XR Animator also uses, with hips X/Z translation locked so the avatar does not walk off camera.
5. Next step: visually test those VRM-native clips, then replace the source skeleton with a better SMPL-to-humanoid retarget if needed.

Do not regenerate app-facing BVH clips from the raw XYZ cache without a real skeleton/retarget pass.

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

- `public/assets/animations/dip/motion_manifest.json`
- `public/assets/animations/dip/cache/results.npy`
- `public/assets/animations/dip/cache/results.txt`
- `public/assets/animations/dip/cache/results_len.txt`
- `public/assets/animations/dip/cache/samples_00_to_02.mp4`
- `public/assets/animations/dip/cache/samples_03_to_05.mp4`
- `public/assets/animations/dip/cache/samples_06_to_08.mp4`
- `public/assets/animations/dip/cache/smpl/sample*_smpl_params.npy`
- `public/assets/animations/dip/vrma/dip_*.inplace.vrma`

## Regenerate DiP Cache

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

## Render SMPL Params

From WSL, inside this app repo:

```bash
cd /mnt/c/Users/SUBSECT/Documents/Codex/2026-05-04/https-github-com-prismml-eng-bonsai/yourwifey-stream
bash scripts/render-dip-results-to-smpl.sh
```

To render specific samples:

```bash
bash scripts/render-dip-results-to-smpl.sh 7 8
```

The script writes OBJ frame folders while it is running, then writes `sampleN_rep00_smpl_params.npy` when a sample finishes.

## Copy SMPL Params Into App Cache

Copy the finished `.npy` files into:

```text
public/assets/animations/dip/cache/smpl/
```

Use the names from `motion_manifest.json`:

```text
sample0_idle_smpl_params.npy
sample1_talking_smpl_params.npy
sample2_hand_gestures_smpl_params.npy
sample3_listening_smpl_params.npy
sample4_looking_smpl_params.npy
sample5_laugh_smpl_params.npy
sample6_react_smpl_params.npy
sample7_leave_smpl_params.npy
sample8_thinking_smpl_params.npy
```

## Translation Targets

Use the SMPL params, not the retired direct BVH files.

- FBX: import SMPL motion into Blender, retarget to a humanoid armature, export FBX.
- VRMA: the app now has disabled experimental `DiP VRMA ...` entries generated through `bvh2vrma`; if they still pose badly, keep the VRMA exporter and replace the source retarget or route through VMC/XR Animator.
- Unity/VRChat: import FBX or VRMA source, map to Humanoid, bake an `.anim` clip for an avatar controller.
- Live VR control: extract tracker poses and stream them through VMC/VMT-style OSC instead of baking a clip.

See `docs/VR_MOTION_BRIDGE.md` for the split between baked web clips and live VR-style tracker motion.

## Convert BVH To In-Place VRMA

XR Animator points at the same `bvh2vrma` bridge. The local Node wrapper is:

```bash
node scripts/convert-bvh-to-vrma.mjs \
  /path/to/input.bvh \
  public/assets/animations/dip/vrma/output.inplace.vrma \
  0.01 \
  in-place
```

Verify a VRMA:

```bash
node scripts/verify-vrma.mjs public/assets/animations/dip/vrma/dip_idle.inplace.vrma
```

Expected shape:

```json
{"animations":1,"duration":3.95,"humanoidRotationTracks":21,"humanoidTranslationTracks":1}
```

## Hook Shape

The clean version of our own hook is:

1. Generate or choose cached DiP prompt clips.
2. Convert through SMPL params.
3. Retarget to a stable humanoid/VRM skeleton.
4. Export each clip into FBX or VRMA.
5. Add those exported clips to the app animation sequencer.
6. Later, add semantic animation tags so chat/LLM output can request `talking`, `laugh`, `react`, `thinking`, etc.

That same bridge can target VRChat by replacing step 4 with a Unity-ready Humanoid `.anim` clip.
