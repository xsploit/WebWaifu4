import { describe, expect, it } from 'vitest';
import { parseAppRoute } from './app-route';

describe('product app route parser', () => {
  it.each([
    ['/', 'home'],
    ['/home', 'home'],
    ['/editor', 'editor'],
    ['/login', 'login'],
    ['/auth/callback', 'auth-callback'],
    ['/account', 'account'],
    ['/dashboard', 'dashboard'],
    ['/overlay/main-scene', 'overlay'],
  ] as const)('maps %s to %s', (path, kind) => {
    expect(parseAppRoute(path).kind).toBe(kind);
  });

  it('decodes overlay scene ids', () => {
    expect(parseAppRoute('/overlay/Main%20Overlay')).toMatchObject({
      kind: 'overlay',
      sceneId: 'Main Overlay',
    });
  });

  it('falls back unknown paths to the editor', () => {
    expect(parseAppRoute('/not-a-product-route')).toEqual({ kind: 'editor', path: '/editor' });
  });
});
