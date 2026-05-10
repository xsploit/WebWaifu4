#!/usr/bin/env bash
set -euo pipefail

MDM_REPO="${MDM_REPO:-/mnt/c/Users/SUBSECT/Documents/motion-lab/motion-diffusion-model}"
OUTPUT_DIR="${OUTPUT_DIR:-outputs/vtuber_motion_pack_dip}"
SAMPLES=("$@")

if [ "${#SAMPLES[@]}" -eq 0 ]; then
  SAMPLES=(0 1 2 3 4 5 6 7 8)
fi

cd "$MDM_REPO"

export MAMBA_ROOT_PREFIX="${MAMBA_ROOT_PREFIX:-/opt/micromamba}"
export MPLBACKEND="${MPLBACKEND:-Agg}"
export TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD="${TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD:-1}"

for sample_index in "${SAMPLES[@]}"; do
  preview="$OUTPUT_DIR/samples_00_to_02.mp4"
  if [ "$sample_index" -ge 3 ] && [ "$sample_index" -le 5 ]; then
    preview="$OUTPUT_DIR/samples_03_to_05.mp4"
  elif [ "$sample_index" -ge 6 ]; then
    preview="$OUTPUT_DIR/samples_06_to_08.mp4"
  fi

  input="$OUTPUT_DIR/sample${sample_index}_rep00.mp4"
  output="$OUTPUT_DIR/sample${sample_index}_rep00_smpl_params.npy"

  [ -f "$input" ] || cp "$preview" "$input"
  if [ -f "$output" ]; then
    echo "skip sample${sample_index}: $output exists"
    continue
  fi

  rm -rf "$OUTPUT_DIR/sample${sample_index}_rep00_obj"
  echo "SMPLify sample${sample_index}"
  micromamba run -n mdm310 python -m visualize.render_mesh \
    --input_path "$input" \
    --device 0 \
    --cuda True
done

find "$OUTPUT_DIR" -maxdepth 1 -name "sample*_smpl_params.npy" -printf "%f %s\n" | sort
