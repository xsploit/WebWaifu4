import { readSupabaseServerEnv } from '../../src/lib/product/supabase-env.js';
import {
  fetchSupabaseAuthIdentity,
  readBearerToken,
  type ByokApiRequestLike,
} from '../byok/_lib/supabase-context.js';

export async function hasServerProviderProxyAuth(request: ByokApiRequestLike, fetchFn = fetch) {
  const config = readSupabaseServerEnv(process.env);
  if (!config.url || !config.anonKey) {
    return false;
  }
  const token = readBearerToken(request);
  if (!token) {
    return false;
  }
  return Boolean(await fetchSupabaseAuthIdentity(config, token, fetchFn).catch(() => null));
}
