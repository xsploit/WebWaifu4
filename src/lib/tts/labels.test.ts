import { describe, expect, it } from 'vitest';
import { getRemoteVoiceStatus, getTtsProviderLabel } from './labels';

describe('TTS labels', () => {
  it('uses current provider labels for overlay status text', () => {
    expect(getTtsProviderLabel('fish-speech')).toBe('Fish Speech Live');
    expect(getTtsProviderLabel('inworld')).toBe('Inworld Stream');
    expect(getTtsProviderLabel('piper')).toBe('Piper Web');
  });

  it('describes remote voice list states without implying a broken provider', () => {
    expect(
      getRemoteVoiceStatus({
        error: null,
        listedVoiceCount: 0,
        loading: true,
        provider: 'fish-speech',
        selectedVoiceId: '',
        selectedVoiceListed: false,
      }),
    ).toBe('Voice list: fetching Fish Speech voices.');

    expect(
      getRemoteVoiceStatus({
        error: null,
        listedVoiceCount: 0,
        loading: false,
        provider: 'inworld',
        selectedVoiceId: '',
        selectedVoiceListed: false,
      }),
    ).toBe('Voice list: none loaded; blank voice uses server default.');

    expect(
      getRemoteVoiceStatus({
        error: null,
        listedVoiceCount: 2,
        loading: false,
        provider: 'fish-speech',
        selectedVoiceId: 'custom-reference',
        selectedVoiceListed: false,
      }),
    ).toBe('Voice list: 2 Fish Speech voices listed; manual voice id selected.');
  });
});
