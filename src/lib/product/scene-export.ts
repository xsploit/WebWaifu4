import {
  assertSettingCanSync,
  type CharacterProfile,
  type ProviderSecretDescriptor,
  type Scene,
  type SyncedSettingRecord,
  type Workspace,
} from './byok';
import { exportProviderSecretDescriptorsForSync } from './provider-key-vault';

export type ByokSceneExportV1 = {
  schemaVersion: 1;
  exportedAt: string;
  workspace: Pick<Workspace, 'id' | 'name' | 'storageMode' | 'providerKeyMode'>;
  scene: Pick<Scene, 'id' | 'name' | 'twitchChannel' | 'activeCharacterId'>;
  characters: CharacterProfile[];
  syncedSettings: SyncedSettingRecord[];
  providerSecretDescriptors: ProviderSecretDescriptor[];
};

const FORBIDDEN_EXPORT_KEY_PATTERN = /(?:apiKey|secret|token|password|credential)/i;
const ALLOWED_DESCRIPTOR_KEY_PATHS = new Set([
  'providerSecretDescriptors',
  'providerSecretDescriptors.*.keyName',
  'providerSecretDescriptors.*.redactedLabel',
]);

export function createByokSceneExport(input: {
  workspace: Workspace;
  scene: Scene;
  characters: CharacterProfile[];
  syncedSettings: SyncedSettingRecord[];
  providerSecretDescriptors?: ProviderSecretDescriptor[];
  includeProviderDescriptors?: boolean;
  exportedAt?: string;
}): ByokSceneExportV1 {
  const syncedSettings = input.syncedSettings.map((record) => {
    assertSettingCanSync(record);
    assertExportValueHasNoSecretKeys(record.valueJson, `syncedSettings.${record.key}.valueJson`);
    return { ...record };
  });

  return {
    schemaVersion: 1,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    workspace: {
      id: input.workspace.id,
      name: input.workspace.name,
      storageMode: input.workspace.storageMode,
      providerKeyMode: input.workspace.providerKeyMode,
    },
    scene: {
      id: input.scene.id,
      name: input.scene.name,
      twitchChannel: input.scene.twitchChannel,
      activeCharacterId: input.scene.activeCharacterId,
    },
    characters: input.characters.map((character) => ({ ...character })),
    syncedSettings,
    providerSecretDescriptors: input.includeProviderDescriptors
      ? exportProviderSecretDescriptorsForSync(input.providerSecretDescriptors ?? [])
      : [],
  };
}

export function parseByokSceneExport(value: string): ByokSceneExportV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isByokSceneExportV1(parsed)) {
    throw new Error('Unsupported BYOK scene export payload.');
  }

  assertByokSceneExportHasNoSecretMaterial(parsed);
  parsed.syncedSettings.forEach(assertSettingCanSync);
  return parsed;
}

export function assertByokSceneExportHasNoSecretMaterial(exported: ByokSceneExportV1) {
  const forbiddenPaths = findForbiddenExportKeyPaths(exported);
  if (forbiddenPaths.length > 0) {
    throw new Error(
      `BYOK scene export contains secret-shaped fields: ${forbiddenPaths.join(', ')}`,
    );
  }
}

export function findForbiddenExportKeyPaths(value: unknown, path = ''): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenExportKeyPaths(item, `${path}.${index}`));
  }

  const findings: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    const wildcardPath = childPath.replace(/\.\d+\./g, '.*.');
    if (FORBIDDEN_EXPORT_KEY_PATTERN.test(key) && !ALLOWED_DESCRIPTOR_KEY_PATHS.has(wildcardPath)) {
      findings.push(childPath);
      continue;
    }
    findings.push(...findForbiddenExportKeyPaths(child, childPath));
  }
  return findings;
}

function assertExportValueHasNoSecretKeys(valueJson: string, path: string) {
  try {
    const findings = findForbiddenExportKeyPaths(JSON.parse(valueJson), path);
    if (findings.length > 0) {
      throw new Error(`Synced setting value contains secret-shaped fields: ${findings.join(', ')}`);
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Synced setting value is not valid JSON at ${path}.`);
    }
    throw error;
  }
}

function isByokSceneExportV1(value: unknown): value is ByokSceneExportV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const source = value as Partial<ByokSceneExportV1>;
  return (
    source.schemaVersion === 1 &&
    typeof source.exportedAt === 'string' &&
    Boolean(source.workspace) &&
    Boolean(source.scene) &&
    Array.isArray(source.characters) &&
    Array.isArray(source.syncedSettings) &&
    Array.isArray(source.providerSecretDescriptors)
  );
}
