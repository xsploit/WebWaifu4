import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  SetStateAction,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type {
  AnimationEntry,
  ManualPlayRequest,
  SequencerSettings,
  VisualSettings,
} from '../lib/menu/types';
import { crossfadeToAction, loadVrmAnimationClip, resetCrossfadeState } from '../lib/vrm/animation';
import { disposeVrm, loadVrm, setRealisticMode } from '../lib/vrm/loadVrm';
import { updateLipSync, resetLipSync } from '../lib/vrm/lipsync';
import { initPostProcessing, resizePostProcessing } from '../lib/vrm/postprocessing';
import type { PostProcessingRefs } from '../lib/vrm/postprocessing';
import { AnimationSequencer } from '../lib/vrm/sequencer';
import { getTtsManager, type TtsManager } from '../lib/tts/manager';

type VrmStageProps = {
  active: boolean;
  manualPlayRequest: ManualPlayRequest | null;
  modelUrl: string | null;
  sequencerSettings: SequencerSettings;
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>;
  setVisualSettings: Dispatch<SetStateAction<VisualSettings>>;
  visualSettings: VisualSettings;
};

type AvatarProps = {
  modelScale: number;
  modelVerticalOffset: number;
  vrm: VRM | null;
};

type SceneRuntimeProps = {
  active: boolean;
  animationSpeed: number;
  mixer: THREE.AnimationMixer | null;
  ttsManager: TtsManager;
  visualSettings: VisualSettings;
  vrm: VRM | null;
};

const SCALE_LIMITS = {
  min: 0.25,
  max: 4,
};

const CAMERA_VERTICAL_OFFSET_LIMITS = {
  min: -0.9,
  max: 0.9,
};

const MODEL_VERTICAL_OFFSET_LIMITS = {
  min: -2,
  max: 2,
};

const VRM_BASE_VERTICAL_OFFSET = 0.5;

const CAMERA_PRESETS = {
  'full-body': {
    position: new THREE.Vector3(0, 1.45, 3.2),
    target: new THREE.Vector3(0, 1.4, 0),
  },
  'half-body': {
    position: new THREE.Vector3(0, 1.34, 1.45),
    target: new THREE.Vector3(0, 1.32, 0),
  },
} as const;

const ROUTELET_URL_PARAMS =
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
const ROUTELET_RENDER_MODE = ROUTELET_URL_PARAMS.get('routelet') === '1';
const ROUTELET_QUALITY_MODE =
  ROUTELET_RENDER_MODE && ROUTELET_URL_PARAMS.get('routeletQuality') === '1';
const ROUTELET_PIXEL_RATIO = ROUTELET_RENDER_MODE
  ? THREE.MathUtils.clamp(
      Number(ROUTELET_URL_PARAMS.get('routeletDpr') ?? (ROUTELET_QUALITY_MODE ? 1.25 : 1)) || 1,
      1,
      2,
    )
  : 1;

function clampCameraVerticalOffset(value: number) {
  return THREE.MathUtils.clamp(
    value,
    CAMERA_VERTICAL_OFFSET_LIMITS.min,
    CAMERA_VERTICAL_OFFSET_LIMITS.max,
  );
}

function clampModelVerticalOffset(value: number) {
  return THREE.MathUtils.clamp(
    value,
    MODEL_VERTICAL_OFFSET_LIMITS.min,
    MODEL_VERTICAL_OFFSET_LIMITS.max,
  );
}

function hasActivePass(refs: PostProcessingRefs | null) {
  if (!refs) {
    return false;
  }

  return (
    refs.bloomPass.enabled ||
    refs.fxaaPass.enabled ||
    refs.smaaPass.enabled ||
    refs.chromaticAberrationPass.enabled ||
    refs.filmGrainPass.enabled ||
    refs.glitchPass.enabled ||
    refs.bleachBypassPass.enabled ||
    refs.colorCorrectionPass.enabled ||
    refs.taaPass.enabled
  );
}

function applyPostProcessingSettings(refs: PostProcessingRefs, visualSettings: VisualSettings) {
  refs.bloomPass.enabled = visualSettings.bloom;
  refs.bloomPass.strength = visualSettings.bloomStrength;
  refs.bloomPass.radius = visualSettings.bloomRadius;
  refs.bloomPass.threshold = visualSettings.bloomThreshold;

  refs.chromaticAberrationPass.enabled = visualSettings.chroma;
  const chromaAmountUniform = refs.chromaticAberrationPass.uniforms['amount'];
  if (chromaAmountUniform) {
    chromaAmountUniform.value = visualSettings.chromaAmount;
  }
  const chromaAngleUniform = refs.chromaticAberrationPass.uniforms['angle'];
  if (chromaAngleUniform) {
    chromaAngleUniform.value = visualSettings.chromaAngle;
  }

  refs.filmGrainPass.enabled = visualSettings.grain;
  const grainAmountUniform = refs.filmGrainPass.uniforms['grainAmount'];
  if (grainAmountUniform) {
    grainAmountUniform.value = visualSettings.grainAmount;
  }
  const vignetteAmountUniform = refs.filmGrainPass.uniforms['vignetteAmount'];
  if (vignetteAmountUniform) {
    vignetteAmountUniform.value = visualSettings.vignetteAmount;
  }
  const vignetteHardnessUniform = refs.filmGrainPass.uniforms['vignetteHardness'];
  if (vignetteHardnessUniform) {
    vignetteHardnessUniform.value = visualSettings.vignetteHardness;
  }

  refs.glitchPass.enabled = visualSettings.glitch;
  refs.fxaaPass.enabled = visualSettings.fxaa;
  refs.smaaPass.enabled = visualSettings.smaa;
  refs.taaPass.enabled = visualSettings.taa;
  refs.taaPass.sampleLevel = visualSettings.taaSampleLevel;

  refs.bleachBypassPass.enabled = visualSettings.bleach;
  const opacityUniform = refs.bleachBypassPass.uniforms['opacity'];
  if (opacityUniform) {
    opacityUniform.value = visualSettings.bleachOpacity;
  }

  refs.colorCorrectionPass.enabled = visualSettings.colorCorr;
  const powRgbUniform = refs.colorCorrectionPass.uniforms['powRGB'];
  if (powRgbUniform) {
    (powRgbUniform.value as THREE.Vector3).set(
      visualSettings.colorPowR,
      visualSettings.colorPowG,
      visualSettings.colorPowB,
    );
  }

  refs.outlinePass.enabled = false;
}

function updateVrmFrame(vrm: VRM, ttsManager: TtsManager, delta: number) {
  updateLipSync(vrm, ttsManager);

  if (!ROUTELET_RENDER_MODE) {
    vrm.update(delta);
    return;
  }

  vrm.humanoid.update();
  vrm.lookAt?.update(delta);
  vrm.expressionManager?.update();
  vrm.materials?.forEach((material) => {
    const updatableMaterial = material as THREE.Material & { update?: (delta: number) => void };
    updatableMaterial.update?.(delta);
  });
}

function SceneRuntime({
  active,
  animationSpeed,
  mixer,
  ttsManager,
  visualSettings,
  vrm,
}: SceneRuntimeProps) {
  const { camera, gl } = useThree();
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);
  const postProcessingRef = useRef<PostProcessingRefs | null>(null);
  const initialPreset = CAMERA_PRESETS[visualSettings.cameraViewMode];
  const cameraTargetPositionRef = useRef(
    initialPreset.position
      .clone()
      .add(new THREE.Vector3(0, visualSettings.cameraVerticalOffset, 0)),
  );
  const cameraLookAtRef = useRef(
    initialPreset.target.clone().add(new THREE.Vector3(0, visualSettings.cameraVerticalOffset, 0)),
  );
  const cameraLookAtTargetRef = useRef(
    initialPreset.target.clone().add(new THREE.Vector3(0, visualSettings.cameraVerticalOffset, 0)),
  );

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const preset = CAMERA_PRESETS[visualSettings.cameraViewMode];
    const cameraPosition = preset.position
      .clone()
      .add(new THREE.Vector3(0, visualSettings.cameraVerticalOffset, 0));
    const cameraTarget = preset.target
      .clone()
      .add(new THREE.Vector3(0, visualSettings.cameraVerticalOffset, 0));

    gl.setPixelRatio(
      ROUTELET_RENDER_MODE ? ROUTELET_PIXEL_RATIO : Math.min(window.devicePixelRatio, 2),
    );
    gl.setClearColor(0x02040a, 0);
    gl.autoClear = true;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.85;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = false;

    perspectiveCamera.fov = 35;
    perspectiveCamera.near = 0.1;
    perspectiveCamera.far = 100;
    perspectiveCamera.position.copy(cameraPosition);
    perspectiveCamera.lookAt(cameraTarget);
    perspectiveCamera.updateProjectionMatrix();
    cameraTargetPositionRef.current.copy(cameraPosition);
    cameraLookAtRef.current.copy(cameraTarget);
    cameraLookAtTargetRef.current.copy(cameraTarget);

    if (!ROUTELET_RENDER_MODE) {
      const postProcessing = initPostProcessing(gl, scene, perspectiveCamera);
      postProcessingRef.current = postProcessing;
      applyPostProcessingSettings(postProcessing, visualSettings);
    }

    return () => {
      postProcessingRef.current?.composer.dispose();
      postProcessingRef.current = null;
    };
  }, [camera, gl, scene]);

  useEffect(() => {
    const preset = CAMERA_PRESETS[visualSettings.cameraViewMode];
    cameraTargetPositionRef.current.copy(
      preset.position.clone().add(new THREE.Vector3(0, visualSettings.cameraVerticalOffset, 0)),
    );
    cameraLookAtTargetRef.current.copy(
      preset.target.clone().add(new THREE.Vector3(0, visualSettings.cameraVerticalOffset, 0)),
    );
  }, [visualSettings.cameraViewMode, visualSettings.cameraVerticalOffset]);

  useEffect(() => {
    if (!postProcessingRef.current) {
      return;
    }

    resizePostProcessing(postProcessingRef.current, gl);
  }, [gl, size.height, size.width]);

  useEffect(() => {
    if (!postProcessingRef.current) {
      return;
    }

    applyPostProcessingSettings(postProcessingRef.current, visualSettings);
  }, [visualSettings]);

  useEffect(() => {
    if (!postProcessingRef.current) {
      return;
    }

    postProcessingRef.current.outlinePass.selectedObjects = vrm ? [vrm.scene] : [];
  }, [vrm]);

  useFrame((_state, delta) => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const cameraLerp = 1 - Math.exp(-delta * 9);
    perspectiveCamera.position.lerp(cameraTargetPositionRef.current, cameraLerp);
    cameraLookAtRef.current.lerp(cameraLookAtTargetRef.current, cameraLerp);
    perspectiveCamera.lookAt(cameraLookAtRef.current);

    if (mixer && active) {
      mixer.timeScale = animationSpeed;
      mixer.update(delta);
    }

    if (vrm && active) {
      updateVrmFrame(vrm, ttsManager, delta);
    }

    const postProcessing = postProcessingRef.current;
    if (!postProcessing) {
      gl.render(scene, camera);
      return;
    }

    if (postProcessing.filmGrainPass.enabled && visualSettings.postProcessingEnabled) {
      const timeUniform = postProcessing.filmGrainPass.uniforms['time'];
      if (timeUniform) {
        timeUniform.value = performance.now() * 0.001;
      }
    }

    if (visualSettings.outline && postProcessing.outlineEffect) {
      postProcessing.outlineEffect.render(scene, camera);
    } else if (visualSettings.postProcessingEnabled && hasActivePass(postProcessing)) {
      postProcessing.composer.render();
    } else {
      gl.render(scene, camera);
    }
  }, 1);

  return null;
}

function Avatar({ modelScale, modelVerticalOffset, vrm }: AvatarProps) {
  useEffect(() => {
    if (!vrm) {
      return;
    }

    vrm.scene.scale.set(modelScale, modelScale, 1);
    vrm.scene.position.y = VRM_BASE_VERTICAL_OFFSET + modelVerticalOffset;
  }, [modelScale, modelVerticalOffset, vrm]);

  if (!vrm) {
    return null;
  }

  return <primitive object={vrm.scene} />;
}

export function VrmStage({
  active,
  manualPlayRequest,
  modelUrl,
  sequencerSettings,
  setSequencerSettings,
  setVisualSettings,
  visualSettings,
}: VrmStageProps) {
  const ttsManager = useMemo(() => getTtsManager(), []);
  const clampScale = (value: number) =>
    THREE.MathUtils.clamp(value, SCALE_LIMITS.min, SCALE_LIMITS.max);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelScale, setModelScale] = useState(() => clampScale(visualSettings.modelScale));
  const modelScaleTargetRef = useRef(clampScale(visualSettings.modelScale));
  const scaleAnimationFrameRef = useRef<number | null>(null);
  const pinchDistanceRef = useRef(0);
  const cameraDragRef = useRef<{
    startClientY: number;
    startOffset: number;
  } | null>(null);
  const modelDragRef = useRef<{
    startClientY: number;
    startOffset: number;
  } | null>(null);
  const animationRequestRef = useRef(0);
  const lastManualPlayNonceRef = useRef<number | null>(null);
  const sequencerRef = useRef<AnimationSequencer | null>(null);
  const autoStartTimerRef = useRef<number | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);

  const cancelScaleAnimation = useCallback(() => {
    if (scaleAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scaleAnimationFrameRef.current);
      scaleAnimationFrameRef.current = null;
    }
  }, []);

  const scheduleScaleAnimation = useCallback(() => {
    if (scaleAnimationFrameRef.current !== null) {
      return;
    }

    const tick = () => {
      scaleAnimationFrameRef.current = null;
      setModelScale((current) => {
        const target = modelScaleTargetRef.current;
        const next = THREE.MathUtils.lerp(current, target, 0.24);
        if (Math.abs(target - next) <= 0.0015) {
          return target;
        }

        scaleAnimationFrameRef.current = window.requestAnimationFrame(tick);
        return next;
      });
    };

    scaleAnimationFrameRef.current = window.requestAnimationFrame(tick);
  }, []);

  useEffect(() => () => cancelScaleAnimation(), [cancelScaleAnimation]);

  useEffect(() => {
    const nextScale = clampScale(visualSettings.modelScale);
    modelScaleTargetRef.current = nextScale;
    if (Math.abs(nextScale - modelScale) <= 0.0015) {
      setModelScale(nextScale);
      return;
    }
    scheduleScaleAnimation();
  }, [modelScale, scheduleScaleAnimation, visualSettings.modelScale]);

  useEffect(() => {
    vrmRef.current = vrm;
  }, [vrm]);

  useEffect(() => {
    mixerRef.current = mixer;
  }, [mixer]);

  const playAnimation = useCallback(
    (entry: AnimationEntry, index: number) => {
      const currentVrm = vrmRef.current;
      if (!currentVrm) {
        return;
      }

      const requestId = animationRequestRef.current + 1;
      animationRequestRef.current = requestId;

      void loadVrmAnimationClip(entry, currentVrm)
        .then((clip) => {
          const latestVrm = vrmRef.current;
          if (
            !clip ||
            animationRequestRef.current !== requestId ||
            !latestVrm ||
            latestVrm !== currentVrm
          ) {
            return;
          }

          let nextMixer = mixerRef.current;
          if (!nextMixer) {
            nextMixer = new THREE.AnimationMixer(latestVrm.scene);
            mixerRef.current = nextMixer;
            setMixer(nextMixer);
          }

          setSequencerSettings((current) =>
            current.currentIndex === index
              ? current
              : {
                  ...current,
                  currentIndex: index,
                },
          );
          crossfadeToAction(nextMixer.clipAction(clip), visualSettings.crossfadeDuration, 1);
        })
        .catch((nextError) => {
          console.error('[VrmStage] Failed to load animation:', nextError);
        });
    },
    [setSequencerSettings, visualSettings.crossfadeDuration],
  );

  useEffect(() => {
    let disposed = false;
    let loadedVrm: VRM | null = null;

    setError(null);
    cancelScaleAnimation();
    modelScaleTargetRef.current = clampScale(visualSettings.modelScale);
    setModelScale(clampScale(visualSettings.modelScale));
    vrmRef.current = null;
    mixerRef.current = null;
    setVrm(null);
    setMixer(null);
    if (autoStartTimerRef.current !== null) {
      window.clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }
    setSequencerSettings((current) =>
      current.currentIndex === -1
        ? current
        : {
            ...current,
            currentIndex: -1,
          },
    );

    if (!modelUrl) {
      return () => {
        disposed = true;
      };
    }

    loadVrm(modelUrl)
      .then((nextVrm) => {
        if (disposed) {
          disposeVrm(nextVrm);
          return;
        }

        loadedVrm = nextVrm;
        vrmRef.current = nextVrm;
        mixerRef.current = null;
        setVrm(nextVrm);
        setMixer(null);

        autoStartTimerRef.current = window.setTimeout(() => {
          if (disposed || loadedVrm !== nextVrm) {
            return;
          }

          setSequencerSettings((current) => {
            const hasEnabledEntries = current.playlist.some((entry) => entry.enabled);
            if (!hasEnabledEntries) {
              return current;
            }

            return {
              ...current,
              playing: true,
            };
          });
        }, 500);
      })
      .catch((nextError: unknown) => {
        if (disposed) {
          return;
        }

        const message =
          nextError instanceof Error ? nextError.message : 'The VRM model failed to load.';
        setError(message);
      });

    return () => {
      disposed = true;
      animationRequestRef.current += 1;
      lastManualPlayNonceRef.current = null;
      if (autoStartTimerRef.current !== null) {
        window.clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
      sequencerRef.current?.stop(false);
      sequencerRef.current = null;
      resetCrossfadeState();
      const currentMixer = mixerRef.current;
      if (currentMixer) {
        currentMixer.stopAllAction();
      }
      if (loadedVrm && currentMixer) {
        currentMixer.uncacheRoot(loadedVrm.scene);
      }
      mixerRef.current = null;
      vrmRef.current = null;

      if (loadedVrm) {
        resetLipSync(loadedVrm);
        disposeVrm(loadedVrm);
      }
    };
  }, [cancelScaleAnimation, modelUrl, setSequencerSettings, visualSettings.modelScale]);

  useEffect(() => {
    if (!vrm) {
      return;
    }

    setRealisticMode(vrm.scene, null, visualSettings.realisticMode);
  }, [visualSettings.realisticMode, vrm]);

  useEffect(() => {
    if (keyLightRef.current) {
      keyLightRef.current.intensity = visualSettings.keyLight;
    }
    if (fillLightRef.current) {
      fillLightRef.current.intensity = visualSettings.fillLight;
    }
    if (rimLightRef.current) {
      rimLightRef.current.intensity = visualSettings.rimLight;
    }
    if (hemiLightRef.current) {
      hemiLightRef.current.intensity = visualSettings.hemiLight;
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = visualSettings.ambientLight;
    }
  }, [
    visualSettings.ambientLight,
    visualSettings.fillLight,
    visualSettings.hemiLight,
    visualSettings.keyLight,
    visualSettings.rimLight,
  ]);

  useEffect(() => {
    if (!vrm || !manualPlayRequest) {
      return;
    }

    if (lastManualPlayNonceRef.current === manualPlayRequest.nonce) {
      return;
    }

    const entry = sequencerSettings.playlist[manualPlayRequest.index];
    if (!entry) {
      return;
    }

    lastManualPlayNonceRef.current = manualPlayRequest.nonce;
    playAnimation(entry, manualPlayRequest.index);
  }, [manualPlayRequest, playAnimation, sequencerSettings.playlist, vrm]);

  useEffect(() => {
    if (!vrm) {
      return;
    }

    if (!sequencerRef.current) {
      sequencerRef.current = new AnimationSequencer();
    }

    const sequencer = sequencerRef.current;
    const enabledEntries = sequencerSettings.playlist.filter((entry) => entry.enabled);
    if (enabledEntries.length === 0) {
      sequencer.stop(false);
      setSequencerSettings((current) =>
        current.playing || current.currentIndex !== -1
          ? {
              ...current,
              playing: false,
              currentIndex: -1,
            }
          : current,
      );
      return;
    }

    sequencer.onAdvance = (entry, index) => {
      playAnimation(entry, index);
    };
    sequencer.onStop = () => {
      setSequencerSettings((current) => ({
        ...current,
        playing: false,
        currentIndex: -1,
      }));
    };

    if (!sequencerSettings.playing) {
      sequencer.stop(false);
      setSequencerSettings((current) =>
        current.currentIndex === -1
          ? current
          : {
              ...current,
              currentIndex: -1,
            },
      );
      return;
    }

    sequencer.start(sequencerSettings.playlist, {
      shuffle: sequencerSettings.shuffle,
      loop: sequencerSettings.loop,
      duration: sequencerSettings.duration,
    });

    return () => {
      sequencer.stop(false);
    };
  }, [
    playAnimation,
    sequencerSettings.duration,
    sequencerSettings.loop,
    sequencerSettings.playing,
    sequencerSettings.playlist,
    sequencerSettings.shuffle,
    setSequencerSettings,
    vrm,
  ]);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.cancelable) {
      event.preventDefault();
    }
    const nextScale = clampScale(modelScaleTargetRef.current * Math.exp(-event.deltaY * 0.00065));
    modelScaleTargetRef.current = nextScale;
    setVisualSettings((current) =>
      current.modelScale === nextScale
        ? current
        : {
            ...current,
            modelScale: nextScale,
          },
    );
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) {
      return;
    }

    const firstTouch = event.touches.item(0);
    const secondTouch = event.touches.item(1);
    if (!firstTouch || !secondTouch) {
      return;
    }

    const dx = firstTouch.clientX - secondTouch.clientX;
    const dy = firstTouch.clientY - secondTouch.clientY;
    pinchDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || pinchDistanceRef.current <= 0) {
      return;
    }

    event.preventDefault();

    const firstTouch = event.touches.item(0);
    const secondTouch = event.touches.item(1);
    if (!firstTouch || !secondTouch) {
      return;
    }

    const dx = firstTouch.clientX - secondTouch.clientX;
    const dy = firstTouch.clientY - secondTouch.clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const factor = distance / pinchDistanceRef.current;

    const nextScale = clampScale(modelScaleTargetRef.current * factor);
    modelScaleTargetRef.current = nextScale;
    setVisualSettings((current) =>
      current.modelScale === nextScale
        ? current
        : {
            ...current,
            modelScale: nextScale,
          },
    );
    pinchDistanceRef.current = distance;
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button === 0 && event.altKey) {
      event.preventDefault();
      modelDragRef.current = {
        startClientY: event.clientY,
        startOffset: visualSettings.modelVerticalOffset,
      };
      return;
    }

    if (event.button !== 0 || !event.ctrlKey) {
      return;
    }

    event.preventDefault();
    cameraDragRef.current = {
      startClientY: event.clientY,
      startOffset: visualSettings.cameraVerticalOffset,
    };
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (modelDragRef.current) {
      event.preventDefault();
      const deltaY = event.clientY - modelDragRef.current.startClientY;
      const nextOffset = clampModelVerticalOffset(
        modelDragRef.current.startOffset - deltaY * 0.0035,
      );
      setVisualSettings((current) =>
        current.modelVerticalOffset === nextOffset
          ? current
          : {
              ...current,
              modelVerticalOffset: nextOffset,
            },
      );
      return;
    }

    if (!cameraDragRef.current) {
      return;
    }

    event.preventDefault();
    const deltaY = event.clientY - cameraDragRef.current.startClientY;
    const nextOffset = clampCameraVerticalOffset(
      cameraDragRef.current.startOffset + deltaY * 0.0035,
    );
    setVisualSettings((current) =>
      current.cameraVerticalOffset === nextOffset
        ? current
        : {
            ...current,
            cameraVerticalOffset: nextOffset,
          },
    );
  };

  const handleMouseUp = () => {
    cameraDragRef.current = null;
    modelDragRef.current = null;
  };

  return (
    <div
      className="stage-root"
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchEnd={() => {
        pinchDistanceRef.current = 0;
      }}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
      onWheel={handleWheel}
    >
      <Canvas
        dpr={ROUTELET_RENDER_MODE ? ROUTELET_PIXEL_RATIO : [1, 2]}
        gl={{
          alpha: true,
          antialias: !ROUTELET_RENDER_MODE || ROUTELET_QUALITY_MODE,
          powerPreference: 'high-performance',
          precision: ROUTELET_RENDER_MODE && !ROUTELET_QUALITY_MODE ? 'mediump' : 'highp',
          stencil: false,
        }}
      >
        <SceneRuntime
          active={active}
          animationSpeed={sequencerSettings.speed}
          mixer={mixer}
          ttsManager={ttsManager}
          visualSettings={visualSettings}
          vrm={vrm}
        />

        <ambientLight ref={ambientLightRef} intensity={visualSettings.ambientLight} />
        <hemisphereLight
          args={['#dfe8ff', '#1c1f26', visualSettings.hemiLight]}
          ref={hemiLightRef}
        />
        <directionalLight
          color="#ffffff"
          intensity={visualSettings.keyLight}
          position={[1.5, 2.2, 1.2]}
          ref={keyLightRef}
        />
        <directionalLight
          color="#bad1ff"
          intensity={visualSettings.fillLight}
          position={[-1.4, 1.5, -1]}
          ref={fillLightRef}
        />
        <directionalLight
          color="#8fbaff"
          intensity={visualSettings.rimLight}
          position={[-1.2, 2, -2]}
          ref={rimLightRef}
        />

        <Avatar
          modelScale={modelScale}
          modelVerticalOffset={visualSettings.modelVerticalOffset}
          vrm={vrm}
        />

        {error ? (
          <Html center>
            <div className="stage-badge stage-badge-error">{error}</div>
          </Html>
        ) : null}

        {!vrm && !error ? (
          <Html center>
            <div className="stage-badge">Loading VRM...</div>
          </Html>
        ) : null}
      </Canvas>
    </div>
  );
}
