import { createHmac, timingSafeEqual } from 'node:crypto';
import type { OverlayTokenClaims } from '../../../src/lib/product/byok.js';
import { assertOverlayTokenClaims } from '../../../src/lib/product/byok.js';
import type { SupabaseServerConfig } from '../../../src/lib/product/supabase-env.js';

const OVERLAY_TOKEN_VERSION = 'ywot1';
const DEFAULT_OVERLAY_TOKEN_HOURS = 24 * 30;
const MAX_OVERLAY_TOKEN_HOURS = 24 * 90;

export function issueOverlayToken(input: {
  characterId?: string | null;
  config: SupabaseServerConfig;
  expiresInHours?: number;
  sceneId: string;
  workspaceId: string;
}) {
  const expiresInHours = clampTokenHours(input.expiresInHours);
  const claims: OverlayTokenClaims = {
    ...(input.characterId ? { characterId: input.characterId } : {}),
    expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString(),
    sceneId: input.sceneId,
    scopes: ['overlay:read', 'scene:read'],
    workspaceId: input.workspaceId,
  };
  assertOverlayTokenClaims(claims);
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = signPayload(payload, getOverlaySigningSecret(input.config));
  return `${OVERLAY_TOKEN_VERSION}.${payload}.${signature}`;
}

export function verifyOverlayToken(config: SupabaseServerConfig, token: string | null | undefined) {
  if (!token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== OVERLAY_TOKEN_VERSION || !parts[1] || !parts[2]) {
    return null;
  }

  const expected = signPayload(parts[1], getOverlaySigningSecret(config));
  if (!safeEqual(parts[2], expected)) {
    return null;
  }

  try {
    const claims = JSON.parse(base64UrlDecode(parts[1])) as OverlayTokenClaims;
    assertOverlayTokenClaims(claims);
    return claims;
  } catch {
    return null;
  }
}

export function readOverlayTokenFromRequest(input: {
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}) {
  const queryToken = readQueryParam(input, 'token');
  if (queryToken) {
    return queryToken;
  }

  const authorization = readHeader(input, 'authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function getOverlaySigningSecret(config: SupabaseServerConfig) {
  const secret = config.overlaySigningSecret ?? config.jwtSecret ?? config.serviceRoleKey;
  if (!secret) {
    throw new Error('Overlay token signing requires a server-only signing secret.');
  }
  return secret;
}

function clampTokenHours(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) {
    return DEFAULT_OVERLAY_TOKEN_HOURS;
  }
  return Math.max(1, Math.min(MAX_OVERLAY_TOKEN_HOURS, Math.round(value!)));
}

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function readQueryParam(
  request: { query?: Record<string, string | string[] | undefined> },
  name: string,
) {
  const value = request.query?.[name];
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  return value?.trim() || null;
}

function readHeader(
  request: { headers?: Record<string, string | string[] | undefined> },
  name: string,
) {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() === lowerName) {
      return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
    }
  }
  return '';
}
