export function canUseServerProviderProxy(providerProxyEnabled: boolean, proxyAuthOk: boolean) {
  return providerProxyEnabled && proxyAuthOk;
}

export function getRawPathParts(pathname: string) {
  return pathname.split('/').filter(Boolean);
}

export function safeDecodePathParts(pathname: string) {
  try {
    return getRawPathParts(pathname).map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
}

export function resolveRuntimeHealthStateKey(input: {
  browserProviderKeyPresent: boolean;
  requestedStateKey?: string | null;
}) {
  const requestedStateKey = input.requestedStateKey?.trim();
  if (!requestedStateKey) {
    return undefined;
  }
  return input.browserProviderKeyPresent ? requestedStateKey : undefined;
}
