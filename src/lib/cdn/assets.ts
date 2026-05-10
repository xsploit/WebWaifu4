const RUN_GAME_SDK_ENABLED = import.meta.env['VITE_RUN_GAME_SDK_ENABLED'] === 'true';

let runGameSdkPromise: Promise<typeof import('@series-inc/rundot-game-sdk/api').default> | null =
  null;

async function getRunGameSdk() {
  if (!RUN_GAME_SDK_ENABLED) {
    throw new Error('RUN.game SDK is disabled for standalone stream mode.');
  }

  runGameSdkPromise ??= import('@series-inc/rundot-game-sdk/api').then((module) => module.default);
  return runGameSdkPromise;
}

function isLocalhostEnvironment() {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function getLocalCdnAssetUrl(assetPath: string) {
  return `/cdn-assets/${assetPath.replace(/^\/+/, '')}`;
}

export async function fetchGameAssetBlob(assetPath: string): Promise<Blob> {
  const normalizedPath = assetPath.replace(/^\/+/, '');

  if (isLocalhostEnvironment() || !RUN_GAME_SDK_ENABLED) {
    const response = await fetch(getLocalCdnAssetUrl(normalizedPath));
    if (!response.ok) {
      throw new Error(`Local asset fetch failed for ${normalizedPath} (${response.status})`);
    }

    return response.blob();
  }

  try {
    const runGameSdk = await getRunGameSdk();
    return await runGameSdk.cdn.fetchAsset(normalizedPath);
  } catch (error) {
    const response = await fetch(getLocalCdnAssetUrl(normalizedPath));
    if (!response.ok) {
      throw error instanceof Error
        ? error
        : new Error(`CDN asset fetch failed for ${normalizedPath}`);
    }

    return response.blob();
  }
}
