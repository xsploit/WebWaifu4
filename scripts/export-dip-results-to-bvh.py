#!/usr/bin/env python3
"""Export MDM/DiP results.npy motion samples into BVH clips.

DiP writes generated HumanML/SMPL-style XYZ joint positions as:
  motion: [sample, joint, xyz, frame]

This exporter turns those generated positions into a simple 22-joint BVH
hierarchy that Three.js can load through BVHLoader. It is meant as a cache
bridge for the web waifu app, not as a perfect production retargeter.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from pathlib import Path

import numpy as np
from scipy.spatial.transform import Rotation


JOINT_NAMES = [
    "Hips",
    "LeftUpLeg",
    "RightUpLeg",
    "Spine",
    "LeftLeg",
    "RightLeg",
    "Spine1",
    "LeftFoot",
    "RightFoot",
    "Spine2",
    "LeftToeBase",
    "RightToeBase",
    "Neck",
    "LeftShoulder",
    "RightShoulder",
    "Head",
    "LeftArm",
    "RightArm",
    "LeftForeArm",
    "RightForeArm",
    "LeftHand",
    "RightHand",
]

PARENTS = {
    0: None,
    2: 0,
    5: 2,
    8: 5,
    11: 8,
    1: 0,
    4: 1,
    7: 4,
    10: 7,
    3: 0,
    6: 3,
    9: 6,
    12: 9,
    15: 12,
    14: 9,
    17: 14,
    19: 17,
    21: 19,
    13: 9,
    16: 13,
    18: 16,
    20: 18,
}

PRIMARY_CHILD = {
    0: 3,
    1: 4,
    2: 5,
    3: 6,
    4: 7,
    5: 8,
    6: 9,
    7: 10,
    8: 11,
    9: 12,
    12: 15,
    13: 16,
    14: 17,
    16: 18,
    17: 19,
    18: 20,
    19: 21,
}

JOINT_ORDER = [0, 2, 5, 8, 11, 1, 4, 7, 10, 3, 6, 9, 12, 15, 14, 17, 19, 21, 13, 16, 18, 20]


def slugify(value: str) -> str:
    safe = []
    for char in value.lower():
        if char.isalnum():
            safe.append(char)
        elif safe and safe[-1] != "_":
            safe.append("_")
    return "".join(safe).strip("_") or "motion"


def rotation_between(source: np.ndarray, target: np.ndarray) -> Rotation:
    source_norm = np.linalg.norm(source)
    target_norm = np.linalg.norm(target)
    if source_norm < 1e-8 or target_norm < 1e-8:
        return Rotation.identity()

    a = source / source_norm
    b = target / target_norm
    cross = np.cross(a, b)
    dot = float(np.dot(a, b))

    if dot > 0.999999:
        return Rotation.identity()

    if dot < -0.999999:
        axis = np.cross(a, np.array([1.0, 0.0, 0.0]))
        if np.linalg.norm(axis) < 1e-6:
            axis = np.cross(a, np.array([0.0, 1.0, 0.0]))
        axis = axis / np.linalg.norm(axis)
        return Rotation.from_rotvec(axis * math.pi)

    scale = math.sqrt((1.0 + dot) * 2.0)
    quat = np.array([cross[0] / scale, cross[1] / scale, cross[2] / scale, scale * 0.5])
    return Rotation.from_quat(quat)


def build_children() -> dict[int, list[int]]:
    children = {index: [] for index in range(len(JOINT_NAMES))}
    for joint, parent in PARENTS.items():
        if parent is not None:
            children[parent].append(joint)
    return children


def hierarchy_lines(joint: int, indent: int, rest: np.ndarray, scale: float, children: dict[int, list[int]]) -> list[str]:
    pad = "  " * indent
    label = "ROOT" if joint == 0 else "JOINT"
    parent = PARENTS[joint]
    offset = np.zeros(3) if parent is None else (rest[joint] - rest[parent]) * scale

    lines = [
        f"{pad}{label} {JOINT_NAMES[joint]}",
        f"{pad}{{",
        f"{pad}  OFFSET {offset[0]:.6f} {offset[1]:.6f} {offset[2]:.6f}",
    ]
    if joint == 0:
        lines.append(f"{pad}  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation")
    else:
        lines.append(f"{pad}  CHANNELS 3 Zrotation Xrotation Yrotation")

    for child in children[joint]:
        lines.extend(hierarchy_lines(child, indent + 1, rest, scale, children))

    if not children[joint]:
        lines.extend(
            [
                f"{pad}  End Site",
                f"{pad}  {{",
                f"{pad}    OFFSET 0.000000 4.000000 0.000000",
                f"{pad}  }}",
            ],
        )

    lines.append(f"{pad}}}")
    return lines


def frame_values(rest: np.ndarray, frame: np.ndarray, scale: float) -> list[float]:
    global_rots: dict[int, Rotation] = {0: Rotation.identity()}
    local_rots: dict[int, Rotation] = {0: Rotation.identity()}

    for joint in JOINT_ORDER:
        child = PRIMARY_CHILD.get(joint)
        if child is None:
            global_rots[joint] = Rotation.identity()
        else:
            global_rots[joint] = rotation_between(rest[child] - rest[joint], frame[child] - frame[joint])

        parent = PARENTS[joint]
        if parent is None:
            local_rots[joint] = global_rots[joint]
        else:
            local_rots[joint] = global_rots.get(parent, Rotation.identity()).inv() * global_rots[joint]

    root_pos = (frame[0] - rest[0]) * scale
    values = [root_pos[0], root_pos[1], root_pos[2]]
    values.extend(local_rots[0].as_euler("ZXY", degrees=True))

    for joint in JOINT_ORDER:
        if joint == 0:
            continue
        values.extend(local_rots[joint].as_euler("ZXY", degrees=True))

    return [float(value) for value in values]


def write_bvh(path: Path, motion: np.ndarray, fps: float, scale: float) -> None:
    rest = motion[0].copy()
    children = build_children()
    lines = ["HIERARCHY"]
    lines.extend(hierarchy_lines(0, 0, rest, scale, children))
    lines.extend(["MOTION", f"Frames: {motion.shape[0]}", f"Frame Time: {1.0 / fps:.6f}"])

    for frame in motion:
        lines.append(" ".join(f"{value:.6f}" for value in frame_values(rest, frame, scale)))

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_names(value: str, count: int, texts: list[str]) -> list[str]:
    if value:
        names = [slugify(item) for item in value.split(",") if item.strip()]
        if len(names) != count:
            raise ValueError(f"--names must have {count} comma-separated entries, got {len(names)}")
        return names
    return [slugify(text.split(".")[0]) for text in texts]


def main() -> None:
    parser = argparse.ArgumentParser(description="Export DiP/MDM results.npy to BVH cache files.")
    parser.add_argument("--results", required=True, type=Path, help="Path to DiP/MDM results.npy")
    parser.add_argument("--out", required=True, type=Path, help="Output folder for BVH files and manifest")
    parser.add_argument("--asset-base", default="", help="URL prefix for manifest entries, e.g. /assets/animations/dip")
    parser.add_argument("--names", default="", help="Comma-separated clip names matching result sample order")
    parser.add_argument("--source", default="", help="Human-readable model/checkpoint source")
    parser.add_argument("--prefix", default="dip_", help="File prefix for exported BVHs")
    parser.add_argument("--fps", default=20.0, type=float, help="BVH frame rate")
    parser.add_argument("--scale", default=100.0, type=float, help="XYZ-to-BVH scale multiplier")
    parser.add_argument("--copy-raw", action="store_true", help="Copy results.npy/txt/len files into out/cache")
    args = parser.parse_args()

    payload = np.load(args.results, allow_pickle=True).item()
    motions = payload["motion"]
    texts = [str(item) for item in payload.get("text", [])]
    lengths = [int(item) for item in payload.get("lengths", [])]
    if not texts:
        texts = [f"motion {index}" for index in range(motions.shape[0])]
    if not lengths:
        lengths = [motions.shape[-1]] * motions.shape[0]

    args.out.mkdir(parents=True, exist_ok=True)
    names = parse_names(args.names, motions.shape[0], texts)
    asset_base = args.asset_base.rstrip("/")

    manifest = []
    for index, name in enumerate(names):
        motion = motions[index].transpose(2, 0, 1)[: lengths[index]]
        file_name = f"{args.prefix}{name}.bvh"
        bvh_path = args.out / file_name
        write_bvh(bvh_path, motion, args.fps, args.scale)
        manifest.append(
            {
                "name": name,
                "prompt": texts[index],
                "frames": int(motion.shape[0]),
                "fps": args.fps,
                "source": args.source,
                "url": f"{asset_base}/{file_name}" if asset_base else file_name,
            },
        )

    (args.out / "motion_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    if args.copy_raw:
        cache_dir = args.out / "cache"
        cache_dir.mkdir(exist_ok=True)
        for source in [args.results, args.results.with_suffix(".txt"), args.results.with_name(args.results.stem + "_len.txt")]:
            if source.exists():
                shutil.copy2(source, cache_dir / source.name)

    for item in manifest:
        print(f"{item['name']}: {item['frames']} frames -> {item['url']}")


if __name__ == "__main__":
    main()
