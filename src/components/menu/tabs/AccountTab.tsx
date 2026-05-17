import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ByokAccountMode } from '../../../lib/product/account-mode';
import type { ProviderKind, ProviderSecretDescriptor } from '../../../lib/product/byok';
import { createBrowserProviderKeyVault } from '../../../lib/product/provider-key-vault';
import {
  describeByokAccountShell,
  normalizeAccountEmail,
  requestSupabaseMagicLink,
} from '../../../lib/product/supabase-auth-shell';
import type { SupabasePublicConfig } from '../../../lib/product/supabase-env';

type AccountTabProps = {
  accountMode: ByokAccountMode;
  authStatus: string;
  localTransferStatus: string;
  onExportLocalBackup: () => void;
  onImportLocalBackup: (file: File) => void;
  onSignOut: () => void;
  supabaseConfig: SupabasePublicConfig;
};

type LocalProviderKeyConfig = {
  keyName: string;
  label: string;
  provider: ProviderKind;
};

const LOCAL_PROVIDER_KEYS: LocalProviderKeyConfig[] = [
  { provider: 'openai', keyName: 'openai.apiKey', label: 'OpenAI' },
  { provider: 'openrouter', keyName: 'openrouter.apiKey', label: 'OpenRouter' },
  { provider: 'fish_speech', keyName: 'fishSpeech.apiKey', label: 'Fish Speech' },
  { provider: 'inworld', keyName: 'inworld.apiKey', label: 'Inworld' },
  { provider: 'tavily', keyName: 'tavily.apiKey', label: 'Tavily' },
];

function getBrowserRedirectUrl() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return `${window.location.origin}${window.location.pathname}`;
}

function formatList(values: readonly string[]) {
  return values.length > 0 ? values.join(', ') : 'none';
}

function getProviderVaultWorkspaceId(accountMode: ByokAccountMode) {
  if (accountMode.kind === 'supabase-cloud-sync') {
    return `user:${accountMode.user.id}`;
  }
  return 'local-browser';
}

function findProviderDescriptor(
  descriptors: ProviderSecretDescriptor[],
  config: LocalProviderKeyConfig,
) {
  return descriptors.find(
    (descriptor) =>
      descriptor.provider === config.provider && descriptor.keyName === config.keyName,
  );
}

export function AccountTab({
  accountMode,
  authStatus,
  localTransferStatus,
  onExportLocalBackup,
  onImportLocalBackup,
  onSignOut,
  supabaseConfig,
}: AccountTabProps) {
  const summary = useMemo(() => describeByokAccountShell(accountMode), [accountMode]);
  const [email, setEmail] = useState(accountMode.user?.email ?? '');
  const [loginStatus, setLoginStatus] = useState(summary.detail);
  const [sending, setSending] = useState(false);
  const mountedRef = useRef(true);
  const providerVaultWorkspaceId = useMemo(
    () => getProviderVaultWorkspaceId(accountMode),
    [accountMode],
  );
  const providerVault = useMemo(
    () =>
      createBrowserProviderKeyVault({
        mode: accountMode.providerKeyMode,
        workspaceId: providerVaultWorkspaceId,
      }),
    [accountMode.providerKeyMode, providerVaultWorkspaceId],
  );
  const [providerInputs, setProviderInputs] = useState<Record<string, string>>({});
  const [providerDescriptors, setProviderDescriptors] = useState<ProviderSecretDescriptor[]>([]);
  const [providerStatus, setProviderStatus] = useState('Provider keys stay in this browser only.');
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedEmail = normalizeAccountEmail(email);
  const loginAvailable = accountMode.loginAvailable && supabaseConfig.status === 'configured';

  const refreshProviderDescriptors = useCallback(async () => {
    const descriptors = await providerVault.listSecretDescriptors();
    if (mountedRef.current) {
      setProviderDescriptors(descriptors);
    }
  }, [providerVault]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setLoginStatus(authStatus || summary.detail);
  }, [authStatus, summary.detail]);

  useEffect(() => {
    void refreshProviderDescriptors();
  }, [refreshProviderDescriptors]);

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

  async function handleSaveProviderKey(config: LocalProviderKeyConfig) {
    const secret = providerInputs[config.keyName]?.trim() ?? '';
    if (!secret) {
      setProviderStatus(`${config.label} key is empty.`);
      return;
    }

    try {
      const descriptor = await providerVault.setSecret({
        provider: config.provider,
        keyName: config.keyName,
        secret,
      });
      if (!mountedRef.current) {
        return;
      }
      setProviderInputs((previous) => ({ ...previous, [config.keyName]: '' }));
      setProviderStatus(`${config.label} saved as ${descriptor.redactedLabel}.`);
      await refreshProviderDescriptors();
    } catch (error) {
      if (mountedRef.current) {
        setProviderStatus(
          error instanceof Error ? error.message : `Could not save ${config.label} key.`,
        );
      }
    }
  }

  async function handleDeleteProviderKey(config: LocalProviderKeyConfig) {
    await providerVault.deleteSecret(config.provider, config.keyName);
    if (!mountedRef.current) {
      return;
    }
    setProviderInputs((previous) => ({ ...previous, [config.keyName]: '' }));
    setProviderStatus(`${config.label} key removed from this browser.`);
    await refreshProviderDescriptors();
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
        <div className="control-label">Browser Provider Keys</div>
        <div className="field-hint">
          These keys are saved only in this browser vault for BYOK mode. Cloud sync stores status
          descriptors only, never the secret values.
        </div>
        <div className="provider-key-list">
          {LOCAL_PROVIDER_KEYS.map((config) => {
            const descriptor = findProviderDescriptor(providerDescriptors, config);
            const inputValue = providerInputs[config.keyName] ?? '';
            return (
              <div className="provider-key-row" key={config.keyName}>
                <div className="provider-key-heading">
                  <span>{config.label}</span>
                  <strong>{descriptor?.redactedLabel ?? 'not set'}</strong>
                </div>
                <input
                  autoComplete="off"
                  className="input-tech"
                  onChange={(event) =>
                    setProviderInputs((previous) => ({
                      ...previous,
                      [config.keyName]: event.target.value,
                    }))
                  }
                  placeholder={`Paste ${config.label} key`}
                  spellCheck={false}
                  type="password"
                  value={inputValue}
                />
                <div className="btn-row provider-key-actions">
                  <button
                    className="btn-tech secondary"
                    disabled={!inputValue.trim()}
                    onClick={() => void handleSaveProviderKey(config)}
                    type="button"
                  >
                    Save Key
                  </button>
                  <button
                    className="btn-tech secondary"
                    disabled={!descriptor}
                    onClick={() => void handleDeleteProviderKey(config)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="status-copy">{providerStatus}</div>
      </div>

      <div className="control-group">
        <div className="control-label">Local Transfer Backup</div>
        <div className="field-hint">
          Export a 1:1 JSON backup for another streaming PC. It includes local app settings,
          provider keys, chat and memory state, and saved custom VRM files.
        </div>
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            onClick={() => void onExportLocalBackup()}
            type="button"
          >
            Export JSON Backup
          </button>
          <button
            className="btn-tech secondary"
            onClick={() => importInputRef.current?.click()}
            type="button"
          >
            Import JSON Backup
          </button>
        </div>
        <input
          ref={importInputRef}
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) {
              void onImportLocalBackup(file);
            }
          }}
          type="file"
        />
        <div className="status-copy">{localTransferStatus}</div>
      </div>

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
