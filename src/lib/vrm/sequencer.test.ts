import { describe, expect, it } from 'vitest';
import { DEFAULT_ANIMATIONS } from './sequencer';

describe('animation sequencer catalog', () => {
  it('title-cases generated Silly Tavern animation names for the settings playlist', () => {
    expect(
      DEFAULT_ANIMATIONS.find((entry) => entry.id === 'silly-tavern-action-attention-seeking')
        ?.name,
    ).toBe('Silly Action Attention Seeking');
    expect(
      DEFAULT_ANIMATIONS.find((entry) => entry.id === 'silly-tavern-dance-gangnam-style')?.name,
    ).toBe('Silly Dance Gangnam Style');
  });
});
