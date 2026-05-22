export type AppRoute =
  | {
      kind: 'editor';
      path: '/editor';
    }
  | {
      kind: 'home';
      path: '/' | '/home';
    }
  | {
      kind: 'login';
      path: '/login';
    }
  | {
      kind: 'auth-callback';
      path: '/auth/callback';
    }
  | {
      kind: 'account';
      path: '/account';
    }
  | {
      kind: 'dashboard';
      path: '/dashboard';
    }
  | {
      kind: 'overlay';
      path: string;
      sceneId: string;
    };

export const LOGIN_NEXT_STORAGE_KEY = 'yourwifey.byok.loginNext.v1';

type LoginNextStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export function parseAppRoute(input: Location | URL | string): AppRoute {
  const pathname = normalizePathname(input);
  if (pathname === '/' || pathname === '/home') {
    return { kind: 'home', path: pathname };
  }
  if (pathname === '/editor') {
    return { kind: 'editor', path: '/editor' };
  }
  if (pathname === '/login') {
    return { kind: 'login', path: '/login' };
  }
  if (pathname === '/auth/callback') {
    return { kind: 'auth-callback', path: '/auth/callback' };
  }
  if (pathname === '/account') {
    return { kind: 'account', path: '/account' };
  }
  if (pathname === '/dashboard') {
    return { kind: 'dashboard', path: '/dashboard' };
  }

  const overlayMatch = pathname.match(/^\/overlay\/([^/?#]+)$/);
  if (overlayMatch?.[1]) {
    return {
      kind: 'overlay',
      path: pathname,
      sceneId: decodeURIComponent(overlayMatch[1]),
    };
  }

  return { kind: 'editor', path: '/editor' };
}

export function navigateToAppPath(path: string) {
  if (typeof window === 'undefined') {
    return parseAppRoute(path);
  }

  window.history.pushState({}, '', path);
  return parseAppRoute(window.location);
}

export function appRouteNeedsAuth(route: AppRoute, input: { overlayTokenPresent?: boolean } = {}) {
  if (route.kind === 'home' || route.kind === 'login' || route.kind === 'auth-callback') {
    return false;
  }
  if (route.kind === 'overlay') {
    if (route.sceneId === 'private-preview') {
      return false;
    }
    return !input.overlayTokenPresent;
  }
  return true;
}

export function buildLoginRedirectPath(nextPath: string | null | undefined) {
  const next = normalizeSafeInternalNextPath(nextPath) ?? '/dashboard';
  return `/login?next=${encodeURIComponent(next)}`;
}

export function getSafeLoginNextPath(input: Location | URL | string, fallback = '/dashboard') {
  const parsed = parseUrl(input);
  const safeNext = normalizeSafeInternalNextPath(parsed?.searchParams.get('next'));
  return safeNext ?? fallback;
}

export function storeLoginNextPath(
  nextPath: string | null | undefined,
  storage: LoginNextStorage | null = getBrowserLoginNextStorage(),
) {
  const safeNext = normalizeSafeInternalNextPath(nextPath);
  if (!storage || !safeNext) {
    return false;
  }
  storage.setItem(LOGIN_NEXT_STORAGE_KEY, safeNext);
  return true;
}

export function consumeStoredLoginNextPath(
  storage: LoginNextStorage | null = getBrowserLoginNextStorage(),
  fallback = '/dashboard',
) {
  if (!storage) {
    return fallback;
  }
  const safeNext = normalizeSafeInternalNextPath(storage.getItem(LOGIN_NEXT_STORAGE_KEY));
  storage.removeItem(LOGIN_NEXT_STORAGE_KEY);
  return safeNext ?? fallback;
}

export function getInternalAppPath(input: Location | URL | string) {
  const parsed = parseUrl(input);
  if (!parsed) {
    return '/dashboard';
  }
  return `${parsed.pathname || '/'}${parsed.search}${parsed.hash}`;
}

function getBrowserLoginNextStorage(): LoginNextStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizePathname(input: Location | URL | string) {
  if (typeof input === 'string') {
    try {
      return new URL(input, 'http://localhost').pathname || '/';
    } catch {
      return input.startsWith('/') ? input : '/';
    }
  }

  return input.pathname || '/';
}

function normalizeSafeInternalNextPath(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('//')) {
    return null;
  }

  const parsed = parseUrl(trimmed);
  if (!parsed || parsed.origin !== 'http://localhost') {
    return null;
  }

  const route = parseAppRoute(parsed);
  if (route.kind === 'home' || route.kind === 'login' || route.kind === 'auth-callback') {
    return null;
  }
  if (
    (route.kind === 'editor' && parsed.pathname !== '/editor') ||
    (route.kind === 'account' && parsed.pathname !== '/account') ||
    (route.kind === 'dashboard' && parsed.pathname !== '/dashboard')
  ) {
    return null;
  }
  return `${parsed.pathname || '/'}${parsed.search}${parsed.hash}`;
}

function parseUrl(input: Location | URL | string) {
  if (typeof input !== 'string') {
    try {
      return new URL(input.href);
    } catch {
      return null;
    }
  }

  try {
    return new URL(input, 'http://localhost');
  } catch {
    return null;
  }
}
