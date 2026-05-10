# VR Motion Bridge

This is the decision point for getting generated motion into VRM, VRChat, or any VR-style runtime without repeating the bad direct-BVH path.

## Decision

Use two different paths:

1. Live VR-style movement: stream tracker/bone poses through a motion protocol.
2. Baked web/app clips: retarget once, then export VRMA or FBX.

Do not treat FBX, BVH, SMPL, VMC, and VRChat OSC as interchangeable. They solve different layers of the problem.

## Why VRChat Can Work Differently

The VRChat/VMT style path is not mainly "play this animation file." It is closer to virtual full-body tracking:

```text
DiP / MDM motion
-> canonical joints or SMPL frame
-> hip/chest/head/feet tracker transforms
-> smooth to VR frame rate
-> VMT or VRChat OSC tracker input
-> VRChat IK solves the avatar
```

This makes sense for walking to coordinates, body-facing direction, looking around, and live AI control. It also explains why a prototype can work in VRChat even when a naive BVH export looks broken on a VRM in Three.js: VRChat IK is doing a lot of the final pose solving.

Start with fewer tracker targets:

- hips
- chest
- leftFoot
- rightFoot

Then add:

- head look target
- knees
- elbows
- hands

Bad elbow/knee data can make IK worse, so add those only after the root, feet, and chest are stable.

## Web VRM Path

For this web app, the most correct baked target is VRMA.

```text
DiP / MDM motion
-> SMPL params
-> retarget to VRM humanoid
-> export VRMA
-> app loads VRMA with @pixiv/three-vrm-animation
```

FBX is still useful because the app already supports FBX and Mixamo-style retargeting, but FBX is only a container. A "Mixamo FBX" is an FBX with a specific skeleton naming/rest-pose convention. The important part is the retarget, not the extension.

Use FBX for fast tests. Use VRMA as the long-term format for reusable VRM humanoid clips.

## XR Animator Takeaways

XR Animator is useful as a reference because it already sits in the same conceptual space:

- webcam/body tracking
- VRM avatar driving
- VMC-protocol output in native environments
- BVH/gLTF/VRMA export paths

The useful lesson is not "copy XR Animator's whole app." The useful lesson is that live motion and baked exports are separate features. We should borrow the architecture shape:

```text
motion source
-> normalized humanoid pose
-> live protocol output and/or baked file export
```

Practical repo result:

- Pulled XR Animator/System Animator Online locally to inspect the path.
- XR Animator's VRMA export calls the `bvh2vrma` converter.
- Pulled `vrm-c/bvh2vrma` directly and used its MIT-licensed converter surface for local scripts.
- Generated disabled experimental `DiP VRMA ...` clips from the retired BVH files so the web VRM can test the VRMA path without exposing raw BVH again.

This only proves the VRMA bridge works. It does not prove the original DiP BVH skeleton is visually good. If the avatar still moves wrong, the next fix is a better source retarget, not another format change.

## VMC/VMT Direction

VMC Protocol is a good neutral bridge for VRM-style tools. VMT is useful when the final destination is SteamVR/VRChat because it can expose virtual trackers.

The practical prototype should be:

```text
SMPL sample frame
-> extract tracker transforms
-> emit VMC-style OSC packets
-> inspect in a VMC receiver or VMT
```

Only after that works should we wire this into chat/LLM motion tags.

## What Not To Do

- Do not regenerate direct DiP XYZ to BVH for app playback.
- Do not stream every humanoid bone into VRChat OSC as the first attempt.
- Do not add elbows/knees before hips/chest/feet are stable.
- Do not make the web app depend on SteamVR/VMT.
- Do not assume Mixamo FBX means VRM-ready.

## Sources To Recheck

- XR Animator / System Animator Online: https://github.com/ButzYung/SystemAnimatorOnline
- VMC Protocol: https://protocol.vmc.info/
- VRM Animation: https://vrm.dev/en/vrma/
- VRChat OSC Trackers: https://docs.vrchat.com/docs/osc-trackers
- Virtual Motion Tracker: https://github.com/gpsnmeajp/VirtualMotionTracker
