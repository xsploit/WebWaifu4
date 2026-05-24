import { describe, expect, it } from 'vitest';
import {
  getRawPathParts,
  resolveServerProviderProxyModel,
  resolveRuntimeHealthStateKey,
  safeDecodePathParts,
} from './runtimeSafety.js';

describe('runtimeSafety', () => {
  it('checks raw route ownership before decoding malformed path segments', () => {
    expect(getRawPathParts('/api/local/%E0%A4%A')).toEqual(['api', 'local', '%E0%A4%A']);
  });

  it('returns null instead of throwing for malformed path encoding', () => {
    expect(safeDecodePathParts('/api/local/%E0%A4%A')).toBeNull();
    expect(safeDecodePathParts('/api/local/profile')).toEqual(['api', 'local', 'profile']);
  });

  it('does not expose arbitrary health state keys to server-proxy auth callers', () => {
    expect(
      resolveRuntimeHealthStateKey({
        browserProviderKeyPresent: false,
        requestedStateKey: 'other-channel:persona:hikari',
      }),
    ).toBeUndefined();
    expect(
      resolveRuntimeHealthStateKey({
        browserProviderKeyPresent: true,
        requestedStateKey: 'local:persona:hikari',
      }),
    ).toBe('local:persona:hikari');
  });

  it('blocks client-selected premium models when spending server provider keys', () => {
    expect(
      resolveServerProviderProxyModel({
        browserProviderKeyPresent: false,
        configuredModel: 'gpt-5.4-nano',
        defaultModel: 'gpt-5-nano',
        requestedModel: 'gpt-5_4-pro',
      }),
    ).toMatchObject({ allowed: false });

    expect(
      resolveServerProviderProxyModel({
        browserProviderKeyPresent: false,
        configuredModel: 'gpt-5.4-nano',
        defaultModel: 'gpt-5-nano',
        requestedModel: 'gpt-5.4-nano',
      }),
    ).toEqual({ allowed: true, model: 'gpt-5.4-nano' });
  });

  it('allows arbitrary model selection only when a browser provider key is present', () => {
    expect(
      resolveServerProviderProxyModel({
        browserProviderKeyPresent: true,
        configuredModel: 'gpt-5.4-nano',
        defaultModel: 'gpt-5-nano',
        requestedModel: 'gpt-5.4-mini',
      }),
    ).toEqual({ allowed: true, model: 'gpt-5.4-mini' });
  });

  it('blocks known high-cost models even when a browser provider key is present', () => {
    expect(
      resolveServerProviderProxyModel({
        browserProviderKeyPresent: true,
        configuredModel: 'gpt-5.4-nano',
        defaultModel: 'gpt-5-nano',
        requestedModel: 'o1-pro-2025-03-19',
      }),
    ).toMatchObject({ allowed: false });

    expect(
      resolveServerProviderProxyModel({
        browserProviderKeyPresent: true,
        configuredModel: 'gpt-5.4-nano',
        defaultModel: 'gpt-5-nano',
        requestedModel: 'openai/o1-pro-2025-03-19',
      }),
    ).toMatchObject({ allowed: false });
  });

  it('supports an explicit server model allowlist for trusted deployments', () => {
    expect(
      resolveServerProviderProxyModel({
        browserProviderKeyPresent: false,
        configuredModel: 'gpt-5.4-nano',
        defaultModel: 'gpt-5-nano',
        env: {
          BYOK_SERVER_PROVIDER_PROXY_MODEL_ALLOWLIST: 'gpt-5.4-mini,gpt-5_4-pro',
          YOURWIFEY_ALLOW_PREMIUM_MODELS: 'true',
        },
        requestedModel: 'gpt-5_4-pro',
      }),
    ).toEqual({ allowed: true, model: 'gpt-5_4-pro' });
  });
});
