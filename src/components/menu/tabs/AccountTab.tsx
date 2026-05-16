import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ByokAccountMode } from '../../../lib/product/account-mode';
import {
  describeByokAccountShell,
  normalizeAccountEmail,
  requestSupabaseMagicLink,
} from '../../../lib/product/supabase-auth-shell';
import type { SupabasePublicConfig } from '../../../lib/product/supabase-env';

type AccountTabProps = {
  accountMode: ByokAccountMode;
  authStatus: string;
  onSignOut: () => void;
  supabaseConfig: SupabasePublicConfig;
};

function getBrowserRedirectUrl() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return `${window.location.origin}${window.location.pathname}`;
}

function formatList(values: readonly string[]) {
  return values.length > 0 ? values.join(', ') : 'none';
}

export function AccountTab({
  accountMode,
  authStatus,
  onSignOut,
  supabaseConfig,
}: AccountTabProps) {
  const summary = useMemo(() => describeByokAccountShell(accountMode), [accountMode]);
  const [email, setEmail] = useState(accountMode.user?.email ?? '');
  const [loginStatus, setLoginStatus] = useState(summary.detail);
  const [sending, setSending] = useState(false);
  const mountedRef = useRef(true);
  const normalizedEmail = normalizeAccountEmail(email);
  const loginAvailable = accountMode.loginAvailable && supabaseConfig.status === 'configured';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setLoginStatus(authStatus || summary.detail);
  }, [authStatus, summary.detail]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) {
      return;
    }

    setSending(true);
    try {
      const result = await requestSupabaseMagicLink({
        config: supabaseConfig,
        email,
        redirectTo: getBrowserRedirectUrl(),
      });
      if (mountedRef.current) {
        setLoginStatus(result.message);
      }
    } finally {
      if (mountedRef.current) {
        setSending(false);
      }
    }
  }

  return (
    <>
      <div className="control-group">
        <div className="control-label">Account Mode</div>
        <div className="status-grid">
          <div className="status-copy">
            Mode: <strong>{summary.modeLabel}</strong>
          </div>
          <div className="status-copy">
            Storage: <strong>{summary.storageLabel}</strong>
          </div>
          <div className="status-copy">
            Cloud sync: <strong>{summary.cloudSyncLabel}</strong>
          </div>
          <div className="status-copy">
            Local mode: <strong>{summary.localOnlyLabel}</strong>
          </div>
          <div className="status-copy">
            Provider keys: <strong>{summary.providerKeyLabel}</strong>
          </div>
          <div className="status-copy">
            Login: <strong>{summary.loginLabel}</strong>
          </div>
        </div>
        <div className="field-hint">{summary.detail}</div>
      </div>

      <form className="control-group" onSubmit={handleSubmit}>
        <div className="control-label">Supabase Login</div>
        <input
          autoComplete="email"
          className="input-tech"
          disabled={!loginAvailable || sending}
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="streamer@example.com"
          spellCheck={false}
          type="email"
          value={email}
        />
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            disabled={!loginAvailable || !normalizedEmail || sending}
            type="submit"
          >
            {sending ? 'Sending Link...' : 'Send Login Link'}
          </button>
          {accountMode.kind === 'supabase-cloud-sync' ? (
            <button className="btn-tech secondary" onClick={onSignOut} type="button">
              Sign Out
            </button>
          ) : null}
        </div>
        <div className="status-copy">{loginStatus}</div>
      </form>

      <div className="control-group">
        <div className="control-label">Cloud Sync Config</div>
        <div className="status-grid">
          <div className="status-copy">
            Supabase: <strong>{supabaseConfig.status}</strong>
          </div>
          <div className="status-copy">
            Project: <strong>{supabaseConfig.url ?? 'none'}</strong>
          </div>
          <div className="status-copy">
            Missing: <strong>{formatList(supabaseConfig.missing)}</strong>
          </div>
          <div className="status-copy">
            Problems: <strong>{formatList(supabaseConfig.problems)}</strong>
          </div>
        </div>
        <div className="field-hint">
          Browser cloud sync uses the public anon key only. Provider API keys stay in the local key
          vault and are not sent to account storage.
        </div>
      </div>
    </>
  );
}
