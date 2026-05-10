import type { AnimationEntry } from '../menu/types';

export const DEFAULT_ANIMATIONS: AnimationEntry[] = [
  {
    id: 'idle',
    name: 'Idle',
    url: '/assets/animations/Idle.fbx',
    format: 'fbx',
    enabled: false,
    experimental: false,
  },
  {
    id: 'idle2',
    name: 'Idle 2',
    url: '/assets/animations/Idle2.fbx',
    format: 'fbx',
    enabled: true,
    experimental: false,
  },
  {
    id: 'idle3',
    name: 'Idle 3',
    url: '/assets/animations/Idle3.fbx',
    format: 'fbx',
    enabled: true,
    experimental: false,
  },
  {
    id: 'thinking',
    name: 'Thinking',
    url: '/assets/animations/Thinking.fbx',
    format: 'fbx',
    enabled: false,
    experimental: false,
  },
  {
    id: 'dip-vrma-idle',
    name: 'DiP VRMA Idle',
    url: '/assets/animations/dip/vrma/dip_idle.grounded.vrma',
    format: 'vrma',
    enabled: false,
    experimental: true,
  },
  {
    id: 'dip-vrma-talking',
    name: 'DiP VRMA Talking',
    url: '/assets/animations/dip/vrma/dip_talking.grounded.vrma',
    format: 'vrma',
    enabled: false,
    experimental: true,
  },
  {
    id: 'dip-vrma-hand-gestures',
    name: 'DiP VRMA Hand Gestures',
    url: '/assets/animations/dip/vrma/dip_hand_gestures.grounded.vrma',
    format: 'vrma',
    enabled: false,
    experimental: true,
  },
  {
    id: 'dip-vrma-listening',
    name: 'DiP VRMA Listening',
    url: '/assets/animations/dip/vrma/dip_listening.grounded.vrma',
    format: 'vrma',
    enabled: false,
    experimental: true,
  },
  {
    id: 'dip-vrma-looking',
    name: 'DiP VRMA Looking',
    url: '/assets/animations/dip/vrma/dip_looking.grounded.vrma',
    format: 'vrma',
    enabled: false,
    experimental: true,
  },
  {
    id: 'dip-vrma-laugh',
    name: 'DiP VRMA Laugh',
    url: '/assets/animations/dip/vrma/dip_laugh.grounded.vrma',
    format: 'vrma',
    enabled: false,
    experimental: true,
  },
  {
    id: 'dip-vrma-react',
    name: 'DiP VRMA React',
    url: '/assets/animations/dip/vrma/dip_react.grounded.vrma',
    format: 'vrma',
    enabled: false,
    experimental: true,
  },
  {
    id: 'dip-vrma-leave',
    name: 'DiP VRMA Leave',
    url: '/assets/animations/dip/vrma/dip_leave.grounded.vrma',
    format: 'vrma',
    enabled: false,
    experimental: true,
  },
  {
    id: 'dip-vrma-thinking',
    name: 'DiP VRMA Thinking',
    url: '/assets/animations/dip/vrma/dip_thinking.grounded.vrma',
    format: 'vrma',
    enabled: false,
    experimental: true,
  },
];

export class AnimationSequencer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentIndex = -1;
  private shuffleOrder: number[] = [];
  private shufflePosition = 0;

  onAdvance: ((entry: AnimationEntry, index: number) => void) | null = null;
  onStop: (() => void) | null = null;

  start(
    playlist: AnimationEntry[],
    options: { shuffle: boolean; loop: boolean; duration: number },
  ) {
    this.stop(false);
    const enabled = playlist.filter((entry) => entry.enabled);
    if (enabled.length === 0) {
      return;
    }

    if (options.shuffle) {
      this.shuffleOrder = this.fisherYatesShuffle(enabled.map((_, index) => index));
      this.shufflePosition = 0;
    }

    this.advance(playlist, enabled, options);
  }

  stop(notify = true) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.currentIndex = -1;
    if (notify) {
      this.onStop?.();
    }
  }

  private advance(
    playlist: AnimationEntry[],
    enabled: AnimationEntry[],
    options: { shuffle: boolean; loop: boolean; duration: number },
  ) {
    let nextEnabled: AnimationEntry;
    let nextEnabledIndex: number;

    if (options.shuffle) {
      if (this.shufflePosition >= enabled.length) {
        if (!options.loop) {
          this.stop();
          return;
        }

        this.shuffleOrder = this.fisherYatesShuffle(enabled.map((_, index) => index));
        this.shufflePosition = 0;
      }

      const shuffledIndex = this.shuffleOrder[this.shufflePosition++];
      if (shuffledIndex === undefined) {
        this.stop();
        return;
      }

      nextEnabledIndex = shuffledIndex;
      const shuffledEntry = enabled[nextEnabledIndex];
      if (!shuffledEntry) {
        this.stop();
        return;
      }

      nextEnabled = shuffledEntry;
    } else {
      const currentEntry = this.currentIndex >= 0 ? playlist[this.currentIndex] : undefined;
      const currentEnabledIndex = currentEntry ? enabled.indexOf(currentEntry) : -1;
      const nextIndex = currentEnabledIndex + 1;

      if (nextIndex >= enabled.length) {
        if (!options.loop) {
          this.stop();
          return;
        }

        nextEnabledIndex = 0;
      } else {
        nextEnabledIndex = nextIndex;
      }

      const sequentialEntry = enabled[nextEnabledIndex];
      if (!sequentialEntry) {
        this.stop();
        return;
      }

      nextEnabled = sequentialEntry;
    }

    const absoluteIndex = playlist.indexOf(nextEnabled);
    this.currentIndex = absoluteIndex;

    this.onAdvance?.(nextEnabled, absoluteIndex);

    this.timer = setTimeout(() => {
      this.advance(playlist, enabled, options);
    }, options.duration * 1000);
  }

  private fisherYatesShuffle(values: number[]) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const currentValue = copy[index];
      const swapValue = copy[swapIndex];
      if (currentValue === undefined || swapValue === undefined) {
        continue;
      }

      copy[index] = swapValue;
      copy[swapIndex] = currentValue;
    }
    return copy;
  }
}
