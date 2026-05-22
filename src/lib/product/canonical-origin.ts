import { parseAppRoute } from './app-route';

const PUBLIC_APP_URL_ENV = 'VITE_PUBLIC_APP_URL';

export function getCanonicalProductRedirectUrl(
  input: Location | URL | string,
  env: Record<string, string | undefined> | undefined = getImportMetaEnv(),
) {
  const canonicalUrl = normalizePublicAppUrl(env?.[PUBLIC_APP_URL_ENV]);
  if (!canonicalUrl) {
    return null;
  }

  const currentUrl = parseCurrentUrl(input);
  if (!currentUrl || currentUrl.origin === canonicalUrl.origin) {
    return null;
  }

  const route = parseAppRoute(currentUrl);
  if (route.kind === 'overlay') {
    return null;
  }

  const redirectUrl = new URL(currentUrl.pathname || '/', canonicalUrl);
  redirectUrl.search = currentUrl.search;
  redirectUrl.hash = currentUrl.hash;
  return redirectUrl.toString();
}

function normalizePublicAppUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !isLocalhost) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function parseCurrentUrl(input: Location | URL | string) {
  try {
    if (typeof input === 'string') {
      return new URL(input, 'http://localhost');
    }
    return new URL(input.href);
  } catch {
    return null;
  }
}

function getImportMetaEnv(): Record<string, string | undefined> | undefined {
  try {
    return import.meta.env as Record<string, string | undefined>;
  } catch {
    return undefined;
  }
}
