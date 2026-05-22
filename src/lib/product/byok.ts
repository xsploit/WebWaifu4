export type AuthProvider = 'supabase';

export type DatabaseProvider = 'supabase-postgres';

export type AssetStorageProvider = 'supabase-storage' | 'external-object-storage';

export type ProductStorageMode = 'local-only' | 'cloud-sync';

export type ProviderKeyMode = 'local-indexeddb' | 'hosted-encrypted-vault';

export type ProviderKind =
  | 'openai'
  | 'openrouter'
  | 'vercel_gateway'
  | 'fish_speech'
  | 'inworld'
  | 'tavily'
  | 'custom';

export type SettingStorageClass =
  | 'public-overlay'
  | 'synced-private'
  | 'local-secret'
  | 'hosted-secret'
  | 'server-only';

export type ProductUser = {
  id: string;
  authProvider: AuthProvider;
  authSubject: string;
  email?: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductStackDecision = {
  authProvider: AuthProvider;
  databaseProvider: DatabaseProvider;
  assetStorageProvider: AssetStorageProvider;
  defaultStorageMode: ProductStorageMode;
  defaultProviderKeyMode: ProviderKeyMode;
  localOnlySupported: boolean;
  paymentsInScope: boolean;
};

export type Workspace = {
  id: string;
  ownerUserId: string;
  name: string;
  storageMode: ProductStorageMode;
  providerKeyMode: ProviderKeyMode;
  createdAt: string;
  updatedAt: string;
};

export type Scene = {
  id: string;
  workspaceId: string;
  name: string;
  twitchChannel: string;
  activeCharacterId: string;
  createdAt: string;
  updatedAt: string;
};

export type CharacterProfile = {
  id: string;
  workspaceId: string;
  sceneId: string;
  personaId: string;
  name: string;
  vrmModelId: string;
  backgroundAssetId?: string;
  ttsProvider: ProviderKind;
  ttsVoiceId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProviderSecretDescriptor = {
  id: string;
  workspaceId: string;
  provider: ProviderKind;
  keyName: string;
  mode: ProviderKeyMode;
  redactedLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type SyncedSettingRecord = {
  id: string;
  workspaceId: string;
  sceneId?: string;
  characterId?: string;
  key: string;
  storageClass: Exclude<SettingStorageClass, 'local-secret' | 'hosted-secret'>;
  valueJson: string;
  updatedAt: string;
};

export type OverlayTokenClaims = {
  workspaceId: string;
  sceneId: string;
  characterId?: string;
  scopes: Array<'overlay:read' | 'chat:send' | 'chat:control' | 'scene:read'>;
  expiresAt: string;
};

export const PROVIDER_SECRET_ENV_NAMES: Record<ProviderKind, readonly string[]> = {
  openai: ['OPENAI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  vercel_gateway: ['AI_GATEWAY_API_KEY'],
  fish_speech: ['FISH_AUDIO_API_KEY', 'FISH_SPEECH_API_KEY'],
  inworld: ['INWORLD_API_KEY'],
  tavily: ['TAVILY_API_KEY'],
  custom: [],
};

export const BYOK_STACK_DECISION: ProductStackDecision = {
  authProvider: 'supabase',
  databaseProvider: 'supabase-postgres',
  assetStorageProvider: 'supabase-storage',
  defaultStorageMode: 'local-only',
  defaultProviderKeyMode: 'local-indexeddb',
  localOnlySupported: true,
  paymentsInScope: false,
};

const LOCAL_SECRET_SETTING_KEYS = new Set([
  'openai.apikey',
  'openrouter.apikey',
  'vercelgateway.apikey',
  'fishspeech.apikey',
  'inworld.apikey',
  'tavily.apikey',
]);

const PUBLIC_OVERLAY_SETTING_KEYS = new Set([
  'scene.name',
  'scene.twitchchannel',
  'character.personaid',
  'character.vrmmodelid',
  'character.backgroundassetid',
  'visualsettings',
  'sequencersettings',
  'twitchsettings',
]);

const SERVER_ONLY_SETTING_KEYS = new Set([
  'auth.supabaseservicerolekey',
  'auth.supabasejwtsecret',
  'overlay.signingsecret',
  'database.url',
]);

export function classifyByokSetting(
  key: string,
  providerKeyMode: ProviderKeyMode,
): SettingStorageClass {
  const canonical = canonicalizeSettingKey(key);
  if (SERVER_ONLY_SETTING_KEYS.has(canonical)) {
    return 'server-only';
  }
  if (LOCAL_SECRET_SETTING_KEYS.has(canonical)) {
    return providerKeyMode === 'hosted-encrypted-vault' ? 'hosted-secret' : 'local-secret';
  }
  if (PUBLIC_OVERLAY_SETTING_KEYS.has(canonical)) {
    return 'public-overlay';
  }
  return 'synced-private';
}

export function normalizeSettingKey(key: string) {
  return key.trim().replace(/\s+/g, '');
}

function canonicalizeSettingKey(key: string) {
  return normalizeSettingKey(key).toLowerCase();
}

export function normalizeTwitchChannelName(value: string) {
  return value.trim().toLowerCase().replace(/^#/, '');
}

export function isValidTwitchChannelName(value: string) {
  return /^[a-z0-9_]{1,25}$/.test(normalizeTwitchChannelName(value));
}

export function redactProviderSecret(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 10) {
    return `${trimmed.slice(0, 2)}...${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function assertSettingCanSync(record: SyncedSettingRecord) {
  const effectiveClass = classifyByokSetting(record.key, 'local-indexeddb');
  if (record.storageClass === 'server-only' || effectiveClass === 'server-only') {
    throw new Error('Server-only settings cannot be stored as synced user settings.');
  }
  if (
    effectiveClass === 'local-secret' ||
    effectiveClass === 'hosted-secret' ||
    (record.storageClass as SettingStorageClass) === 'local-secret' ||
    (record.storageClass as SettingStorageClass) === 'hosted-secret'
  ) {
    throw new Error('Provider API keys must use the key vault, not synced settings.');
  }
}

export function createProviderSecretDescriptor(input: {
  id: string;
  workspaceId: string;
  provider: ProviderKind;
  keyName: string;
  mode: ProviderKeyMode;
  secretPreview: string;
  createdAt: string;
  updatedAt?: string;
}): ProviderSecretDescriptor {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    provider: input.provider,
    keyName: normalizeSettingKey(input.keyName),
    mode: input.mode,
    redactedLabel: redactProviderSecret(input.secretPreview),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };
}

export function assertOverlayTokenClaims(claims: OverlayTokenClaims) {
  if (!claims.workspaceId || !claims.sceneId) {
    throw new Error('Overlay token requires workspaceId and sceneId.');
  }
  const expiresAt = Date.parse(claims.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('Overlay token expiry must be in the future.');
  }
  if (claims.scopes.length === 0) {
    throw new Error('Overlay token requires at least one scope.');
  }
}
