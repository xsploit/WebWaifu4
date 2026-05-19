import { normalizeSettingKey } from './byok.js';

export function cloudSettingId(input: {
  characterId?: string | null;
  key: string;
  sceneId?: string | null;
  workspaceId: string;
}) {
  return deterministicUuidFromText(
    [
      'yourwifey:cloud-setting',
      normalizeUuidScope(input.workspaceId),
      normalizeUuidScope(input.sceneId),
      normalizeUuidScope(input.characterId),
      normalizeSettingKey(input.key),
    ].join(':'),
  );
}

function normalizeUuidScope(value: string | null | undefined) {
  return value?.trim() || 'global';
}

function deterministicUuidFromText(value: string) {
  const hex = cyrb128(value)
    .map((item) => item.toString(16).padStart(8, '0'))
    .join('');
  const variant = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const uuidHex = `${hex.slice(0, 12)}5${hex.slice(13, 16)}${variant}${hex.slice(17, 32)}`;
  return [
    uuidHex.slice(0, 8),
    uuidHex.slice(8, 12),
    uuidHex.slice(12, 16),
    uuidHex.slice(16, 20),
    uuidHex.slice(20, 32),
  ].join('-');
}

function cyrb128(value: string) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}
