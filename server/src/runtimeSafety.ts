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
