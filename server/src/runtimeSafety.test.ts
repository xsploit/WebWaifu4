import { describe, expect, it } from 'vitest';
import {
  canUseServerProviderProxy,
  getRawPathParts,
  safeDecodePathParts,
} from './runtimeSafety.js';

describe('runtimeSafety', () => {
  it('requires both the server proxy flag and authenticated proxy access', () => {
    expect(canUseServerProviderProxy(true, true)).toBe(true);
    expect(canUseServerProviderProxy(false, true)).toBe(false);
    expect(canUseServerProviderProxy(true, false)).toBe(false);
    expect(canUseServerProviderProxy(false, false)).toBe(false);
  });

  it('checks raw route ownership before decoding malformed path segments', () => {
    expect(getRawPathParts('/api/byok/%E0%A4%A')).toEqual(['api', 'byok', '%E0%A4%A']);
  });

  it('returns null instead of throwing for malformed path encoding', () => {
    expect(safeDecodePathParts('/api/byok/%E0%A4%A')).toBeNull();
    expect(safeDecodePathParts('/api/byok/profile')).toEqual(['api', 'byok', 'profile']);
  });
});
