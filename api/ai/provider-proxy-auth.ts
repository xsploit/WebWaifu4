import { readSupabaseServerEnv } from '../../src/lib/product/supabase-env.js';
import {
  fetchSupabaseAuthIdentity,
  readBearerToken,
  type ByokApiRequestLike,
} from '../byok/_lib/supabase-context.js';

export type ServerProviderProxyAuthContext =
  | {
      ok: true;
      principal: string;
    }
  | {
      ok: false;
      principal: null;
    };

export async function hasServerProviderProxyAuth(request: ByokApiRequestLike, fetchFn = fetch) {
  return (await getServerProviderProxyAuthContext(request, fetchFn)).ok;
}

export async function getServerProviderProxyAuthContext(
  request: ByokApiRequestLike,
  fetchFn = fetch,
): Promise<ServerProviderProxyAuthContext> {
  const config = readSupabaseServerEnv(process.env);
  if (!config.url || !config.anonKey) {
    return { ok: false, principal: null };
  }
  const token = readBearerToken(request);
  if (!token) {
    return { ok: false, principal: null };
  }
  const identity = await fetchSupabaseAuthIdentity(config, token, fetchFn).catch(() => null);
  return identity?.id
    ? { ok: true, principal: `supabase:${identity.id}` }
    : { ok: false, principal: null };
}
