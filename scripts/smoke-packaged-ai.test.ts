import { describe, expect, it } from 'vitest';
import { getSmokeBackupSecret, hasStructuredJsonEnvelopeLeak } from './smoke-packaged-ai';

describe('packaged AI smoke structured leak detector', () => {
  it('allows normal dialogue with braces or the word message', () => {
    expect(hasStructuredJsonEnvelopeLeak('Say the word message out loud.')).toBe(false);
    expect(hasStructuredJsonEnvelopeLeak('Use braces like {this} in normal speech.')).toBe(false);
  });

  it('flags structured reply envelopes in visible deltas', () => {
    expect(
      hasStructuredJsonEnvelopeLeak('{"message":"this should not be spoken","emotion":"happy"}'),
    ).toBe(true);
    expect(hasStructuredJsonEnvelopeLeak('"emotion":"happy"')).toBe(true);
    expect(hasStructuredJsonEnvelopeLeak('"message": "this should not be spoken"')).toBe(true);
  });
});

describe('packaged AI smoke backup secret lookup', () => {
  it('can select provider secrets by provider and key name for optional providers', () => {
    const backup = {
      providerSecrets: [
        { provider: 'custom', keyName: 'other.apiKey', secret: 'wrong' },
        { provider: 'custom', keyName: 'aiGateway.apiKey', secret: 'gateway-key' },
        { provider: 'deepseek', keyName: 'deepseek.apiKey', secret: 'deepseek-key' },
      ],
    };

    expect(getSmokeBackupSecret(backup, 'custom', 'aiGateway.apiKey')).toBe('gateway-key');
    expect(getSmokeBackupSecret(backup, 'deepseek', 'deepseek.apiKey')).toBe('deepseek-key');
  });
});
