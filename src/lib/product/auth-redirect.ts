const PUBLIC_APP_URL_ENV = 'VITE_PUBLIC_APP_URL';

export function getProductAuthCallbackUrl(currentHref?: string) {
  const publicAppUrl = getPublicAppUrl();
  const fallbackHref =
    currentHref ?? (typeof window === 'undefined' ? undefined : window.location.href);
  const base = publicAppUrl ?? normalizeUrl(fallbackHref);

  if (!base) {
    return undefined;
  }

  return new URL('/auth/callback', base).toString();
}

function getPublicAppUrl() {
  const env = getImportMetaEnv();
  return normalizeUrl(env?.[PUBLIC_APP_URL_ENV]);
}

function getImportMetaEnv(): Record<string, string | undefined> | undefined {
  try {
    return import.meta.env as Record<string, string | undefined>;
  } catch {
    return undefined;
  }
}

function normalizeUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return null;
    }
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}
