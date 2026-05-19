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
