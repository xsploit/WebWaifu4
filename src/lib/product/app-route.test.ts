import { describe, expect, it } from 'vitest';
import {
  appRouteNeedsAuth,
  buildLoginRedirectPath,
  consumeStoredLoginNextPath,
  getInternalAppPath,
  getSafeLoginNextPath,
  LOGIN_NEXT_STORAGE_KEY,
  parseAppRoute,
  storeLoginNextPath,
} from './app-route';

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

  it('requires auth for the editor, account, dashboard, and unsigned overlay routes', () => {
    expect(appRouteNeedsAuth(parseAppRoute('/'))).toBe(false);
    expect(appRouteNeedsAuth(parseAppRoute('/login'))).toBe(false);
    expect(appRouteNeedsAuth(parseAppRoute('/auth/callback'))).toBe(false);
    expect(appRouteNeedsAuth(parseAppRoute('/editor'))).toBe(true);
    expect(appRouteNeedsAuth(parseAppRoute('/account'))).toBe(true);
    expect(appRouteNeedsAuth(parseAppRoute('/dashboard'))).toBe(true);
    expect(appRouteNeedsAuth(parseAppRoute('/overlay/main-scene'))).toBe(true);
    expect(appRouteNeedsAuth(parseAppRoute('/overlay/private-preview'))).toBe(false);
    expect(
      appRouteNeedsAuth(parseAppRoute('/overlay/main-scene'), { overlayTokenPresent: true }),
    ).toBe(false);
  });

  it('builds safe login redirects for protected app routes', () => {
    expect(buildLoginRedirectPath('/editor')).toBe('/login?next=%2Feditor');
    expect(getSafeLoginNextPath('/login?next=%2Feditor')).toBe('/editor');
    expect(getSafeLoginNextPath('/login?next=%2Fdashboard%3Ftab%3Dvoice')).toBe(
      '/dashboard?tab=voice',
    );
    expect(getSafeLoginNextPath('/login?next=https%3A%2F%2Fevil.test')).toBe('/dashboard');
    expect(getSafeLoginNextPath('/login?next=%2Flogin')).toBe('/dashboard');
    expect(getSafeLoginNextPath('/login?next=%2Fsettings')).toBe('/dashboard');
    expect(getInternalAppPath('/editor?tab=voice#settings')).toBe('/editor?tab=voice#settings');
  });

  it('stores only safe internal login return paths', () => {
    const storage = createStorage();

    expect(storeLoginNextPath('/editor?tab=voice', storage)).toBe(true);
    expect(storage.getItem(LOGIN_NEXT_STORAGE_KEY)).toBe('/editor?tab=voice');
    expect(consumeStoredLoginNextPath(storage)).toBe('/editor?tab=voice');
    expect(storage.getItem(LOGIN_NEXT_STORAGE_KEY)).toBeNull();

    expect(storeLoginNextPath('https://evil.test/editor', storage)).toBe(false);
    expect(storeLoginNextPath('/settings', storage)).toBe(false);
    expect(consumeStoredLoginNextPath(storage)).toBe('/dashboard');
  });
});

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
