import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ByokAccountMode } from '../../lib/product/account-mode';
import type { AppRoute } from '../../lib/product/app-route';
import {
  fetchByokProfile,
  fetchByokSettings,
  issueByokOverlayToken,
  patchByokSetting,
  patchByokProfile,
  type ByokProfileResponse,
} from '../../lib/product/byok-api';
import { buildCloudSettingRecords } from '../../lib/product/cloud-settings';
import type { PersistedChatState } from '../../lib/chat/types';
import {
  createSceneBackup,
  parseSceneBackup,
  serializeSceneBackup,
} from '../../lib/product/scene-backup';
import type { SyncedSettingRecord } from '../../lib/product/byok';
import {
  describeByokAccountShell,
  requestSupabaseMagicLink,
} from '../../lib/product/supabase-auth-shell';
import type { SupabasePublicConfig } from '../../lib/product/supabase-env';

type ProductPagesProps = {
  accountMode: ByokAccountMode;
  authStatus: string;
  onNavigate: (path: string) => void;
  onApplyCloudSettings: (records: SyncedSettingRecord[]) => void;
  onSignOut: () => void;
  persistedState: PersistedChatState;
  route: AppRoute;
  supabaseConfig: SupabasePublicConfig;
  twitchChannel: string;
};

export function ProductPages(props: ProductPagesProps) {
  const accountSummary = useMemo(
    () => describeByokAccountShell(props.accountMode),
    [props.accountMode],
  );

  if (props.route.kind === 'login') {
    return <LoginPage {...props} accountSummary={accountSummary} />;
  }
  if (props.route.kind === 'auth-callback') {
    return <AuthCallbackPage {...props} />;
  }
  if (props.route.kind === 'account') {
    return <AccountPage {...props} accountSummary={accountSummary} />;
  }
  if (props.route.kind === 'dashboard') {
    return <DashboardPage {...props} accountSummary={accountSummary} />;
  }
  return null;
}

function LoginPage(
  props: ProductPagesProps & {
    accountSummary: ReturnType<typeof describeByokAccountShell>;
  },
) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(props.accountSummary.detail);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (props.accountMode.kind === 'supabase-cloud-sync') {
      props.onNavigate('/dashboard');
    }
  }, [props.accountMode.kind, props.onNavigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await requestSupabaseMagicLink({
      config: props.supabaseConfig,
      email,
      redirectTo:
        typeof window === 'undefined'
          ? undefined
          : new URL('/auth/callback', window.location.href).toString(),
    });
    setBusy(false);
    setStatus(result.message);
  };

  return (
    <ProductPageFrame
      accountMode={props.accountMode}
      eyebrow="Magic-link login"
      onNavigate={props.onNavigate}
      onSignOut={props.onSignOut}
      routeKind={props.route.kind}
      title="Sign in to sync your stream setup"
    >
      <form className="product-card product-card-narrow" onSubmit={handleSubmit}>
        <p className="product-status-text product-hint">
          We never store a password. Drop your email and we&rsquo;ll send a one-tap magic link to
          finish signing in.
        </p>
        <label className="product-field">
          <span>Email</span>
          <input
            autoComplete="email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            type="email"
            value={email}
          />
        </label>
        <div className="product-actions">
          <button className="product-primary" disabled={busy} type="submit">
            {busy ? 'Sending...' : 'Send magic link'}
          </button>
          <button
            className="product-secondary"
            onClick={() => props.onNavigate('/dashboard')}
            type="button"
          >
            Continue local-only
          </button>
        </div>
        <StatusText>{status}</StatusText>
      </form>
    </ProductPageFrame>
  );
}

function AuthCallbackPage(props: ProductPagesProps) {
  useEffect(() => {
    if (props.accountMode.kind === 'supabase-cloud-sync') {
      props.onNavigate('/dashboard');
    }
  }, [props.accountMode.kind, props.onNavigate]);

  return (
    <ProductPageFrame
      accountMode={props.accountMode}
      eyebrow="Auth callback"
      onNavigate={props.onNavigate}
      onSignOut={props.onSignOut}
      routeKind={props.route.kind}
      title="Checking your session"
    >
      <div className="product-card product-card-narrow">
        <StatusText>{props.authStatus}</StatusText>
        <div className="product-actions">
          <button className="product-primary" onClick={() => props.onNavigate('/dashboard')}>
            Go to dashboard
          </button>
          <button className="product-secondary" onClick={() => props.onNavigate('/')}>
            Back to editor
          </button>
        </div>
      </div>
    </ProductPageFrame>
  );
}

function AccountPage(
  props: ProductPagesProps & {
    accountSummary: ReturnType<typeof describeByokAccountShell>;
  },
) {
  const [profile, setProfile] = useState<ByokProfileResponse | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState(props.authStatus);

  useEffect(() => {
    if (props.accountMode.kind !== 'supabase-cloud-sync') {
      return;
    }
    let cancelled = false;
    fetchByokProfile()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setProfile(data);
        setDisplayName(data.profile.displayName);
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Cloud profile load failed.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.accountMode.kind]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const next = await patchByokProfile({ displayName });
      setProfile(next);
      setStatus('Profile saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Profile save failed.');
    }
  };

  return (
    <ProductPageFrame
      accountMode={props.accountMode}
      eyebrow="Account"
      onNavigate={props.onNavigate}
      onSignOut={props.onSignOut}
      routeKind={props.route.kind}
      title="YourWifey account"
    >
      <div className="product-actions product-actions-back">
        <button className="product-secondary" onClick={() => props.onNavigate('/dashboard')}>
          &larr; Back to dashboard
        </button>
      </div>
      <form className="product-card" onSubmit={handleSave}>
        <div className="product-grid">
          <Stat label="Mode" value={props.accountSummary.modeLabel} />
          <Stat label="Storage" value={props.accountSummary.storageLabel} />
          <Stat label="Provider keys" value="Browser local only" />
          <Stat label="Email" value={profile?.profile.email ?? props.accountSummary.loginLabel} />
        </div>
        <label className="product-field">
          <span>Display name</span>
          <input
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Streamer"
            value={displayName}
          />
        </label>
        <div className="product-actions">
          <button
            className="product-primary"
            disabled={props.accountMode.kind !== 'supabase-cloud-sync'}
            type="submit"
          >
            Save profile
          </button>
          <button className="product-secondary" onClick={props.onSignOut} type="button">
            Sign out
          </button>
        </div>
        <StatusText>{status}</StatusText>
      </form>
    </ProductPageFrame>
  );
}

function DashboardPage(
  props: ProductPagesProps & {
    accountSummary: ReturnType<typeof describeByokAccountShell>;
  },
) {
  const isCloud = props.accountMode.kind === 'supabase-cloud-sync';
  const [profile, setProfile] = useState<ByokProfileResponse | null>(null);
  const [overlayShareUrl, setOverlayShareUrl] = useState('');
  const [status, setStatus] = useState(isCloud ? props.authStatus : props.accountSummary.detail);
  const [pulling, setPulling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const overlayUrl =
    profile?.bootstrap.scene.id && typeof window !== 'undefined'
      ? new URL(`/overlay/${encodeURIComponent(profile.bootstrap.scene.id)}`, window.location.href)
          .pathname
      : '/overlay/private-preview';

  useEffect(() => {
    if (!isCloud) {
      return;
    }
    let cancelled = false;
    fetchByokProfile()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setProfile(data);
        setStatus('Cloud workspace ready.');
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Cloud dashboard load failed.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isCloud]);

  const handleSyncSettings = async () => {
    if (!profile?.bootstrap.workspace.id || !isCloud) {
      setStatus('Sign in before syncing settings.');
      return;
    }
    setSyncing(true);
    try {
      const records = buildCloudSettingRecords({
        sceneId: profile.bootstrap.scene.id,
        state: props.persistedState,
        workspaceId: profile.bootstrap.workspace.id,
      });
      await Promise.all(records.map((record) => patchByokSetting({ record })));
      setStatus(`Synced ${records.length} safe settings. Memory and chat history stayed local.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Cloud settings sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const handlePullSettings = async () => {
    if (!profile?.bootstrap.workspace.id || !isCloud) {
      setStatus('Sign in before loading cloud settings.');
      return;
    }
    setPulling(true);
    try {
      const response = await fetchByokSettings({
        workspaceId: profile.bootstrap.workspace.id,
      });
      props.onApplyCloudSettings(response.settings);
      setStatus(`Loaded ${response.settings.length} cloud settings into the editor.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Cloud settings load failed.');
    } finally {
      setPulling(false);
    }
  };

  const handleIssueOverlayUrl = async () => {
    if (!profile?.bootstrap.workspace.id || !profile.bootstrap.scene.id || !isCloud) {
      setStatus('Sign in before issuing an OBS overlay URL.');
      return;
    }

    try {
      const response = await issueByokOverlayToken({
        sceneId: profile.bootstrap.scene.id,
        workspaceId: profile.bootstrap.workspace.id,
      });
      const path = `/overlay/${encodeURIComponent(response.scene.id)}?token=${encodeURIComponent(response.token)}`;
      const url =
        typeof window === 'undefined' ? path : new URL(path, window.location.href).toString();
      setOverlayShareUrl(url);
      setStatus(`OBS overlay URL issued. Expires ${response.expiresAt ?? 'later'}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Overlay URL issue failed.');
    }
  };

  const handleExportBackup = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      setStatus('Scene backup export needs a browser.');
      return;
    }
    const backup = createSceneBackup({
      sceneId: profile?.bootstrap.scene.id,
      state: props.persistedState,
      workspaceId: profile?.bootstrap.workspace.id,
    });
    const blob = new Blob([serializeSceneBackup(backup)], {
      type: 'application/json',
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `yourwifey-scene-${backup.sceneId ?? 'local'}-${backup.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    setStatus(
      `Exported ${backup.safeSettings.length} safe settings. Chat history and relationship memory stayed local.`,
    );
  };

  const handleImportBackup = async (file: File | null | undefined) => {
    if (!file) {
      return;
    }
    try {
      const backup = parseSceneBackup(await file.text());
      props.onApplyCloudSettings(backup.safeSettings);
      setStatus(
        `Imported ${backup.safeSettings.length} safe settings from ${backup.exportedAt}. Chat history and relationship memory were not included.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Scene backup import failed.');
    } finally {
      if (backupInputRef.current) {
        backupInputRef.current.value = '';
      }
    }
  };

  const sceneName = profile?.bootstrap.scene.name ?? (isCloud ? 'Main Overlay' : 'Local scene');
  const workspaceName =
    profile?.bootstrap.workspace.name ?? (isCloud ? 'Personal workspace' : 'Local editor');

  return (
    <ProductPageFrame
      accountMode={props.accountMode}
      eyebrow={isCloud ? 'Cloud workspace' : 'Local studio'}
      onNavigate={props.onNavigate}
      onSignOut={props.onSignOut}
      routeKind={props.route.kind}
      title="Stream workspace"
    >
      <div className="product-dashboard">
        <section className="product-card product-card-primary product-hero">
          <div className="product-card-header">
            <div>
              <span>Current scene</span>
              <strong>{sceneName}</strong>
            </div>
            <div className="product-actions product-actions-hero">
              <button className="product-primary" onClick={() => props.onNavigate('/')}>
                Open editor
              </button>
              <button className="product-secondary" onClick={() => props.onNavigate(overlayUrl)}>
                Preview overlay
              </button>
            </div>
          </div>
          <div className="product-grid product-grid-hero">
            <Stat label="Workspace" value={workspaceName} />
            <Stat label="Twitch" value={`#${props.twitchChannel || 'subsect'}`} />
            <Stat label="Sync" value={props.accountSummary.cloudSyncLabel} />
            <Stat label="Provider keys" value={props.accountSummary.providerKeyLabel} />
          </div>
          <StatusText>{status}</StatusText>
        </section>

        <section className="product-card">
          <SectionTitle title="OBS overlay" />
          <p className="product-status-text product-hint">
            Drop a browser source into OBS using a signed URL. Local preview opens the overlay in
            this tab.
          </p>
          <div className="product-actions product-actions-grid">
            <button className="product-secondary" onClick={() => props.onNavigate(overlayUrl)}>
              Preview overlay
            </button>
            <button
              className="product-secondary"
              disabled={!isCloud}
              onClick={handleIssueOverlayUrl}
            >
              {isCloud ? 'Issue OBS URL' : 'Sign in for OBS URL'}
            </button>
          </div>
          {overlayShareUrl ? (
            <label className="product-field">
              <span>OBS overlay URL</span>
              <input readOnly value={overlayShareUrl} />
            </label>
          ) : null}
        </section>

        <section className="product-card">
          <SectionTitle title={isCloud ? 'Cloud sync & backup' : 'Backup & restore'} />
          <p className="product-status-text product-hint">
            {isCloud
              ? 'Push or pull safe settings to your Supabase workspace. Memory and chat history stay on this device.'
              : 'Export and import scene backups locally. Sign in to mirror safe settings to the cloud.'}
          </p>
          <div className="product-actions product-actions-grid">
            <button
              className="product-secondary"
              disabled={syncing || !isCloud}
              onClick={handleSyncSettings}
            >
              {syncing ? 'Syncing...' : 'Push to cloud'}
            </button>
            <button
              className="product-secondary"
              disabled={pulling || !isCloud}
              onClick={handlePullSettings}
            >
              {pulling ? 'Loading...' : 'Pull from cloud'}
            </button>
            <button className="product-secondary" onClick={handleExportBackup}>
              Export backup
            </button>
            <button className="product-secondary" onClick={() => backupInputRef.current?.click()}>
              Import backup
            </button>
          </div>
          <input
            ref={backupInputRef}
            accept="application/json,.json"
            className="product-hidden-file"
            onChange={(event) => void handleImportBackup(event.target.files?.[0])}
            type="file"
          />
        </section>

        {!isCloud ? (
          <section className="product-card product-card-cta">
            <SectionTitle title="Cloud sync" />
            <p className="product-status-text product-hint">
              Sign in with a magic link to mirror safe settings between machines and unlock signed
              OBS overlay URLs. No password &mdash; just a one-time email link.
            </p>
            <div className="product-actions">
              <button className="product-primary" onClick={() => props.onNavigate('/login')}>
                Sign in with magic link
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </ProductPageFrame>
  );
}

function ProductPageFrame(props: {
  accountMode: ByokAccountMode;
  children: ReactNode;
  eyebrow: string;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
  routeKind: AppRoute['kind'];
  title: string;
}) {
  const isCloud = props.accountMode.kind === 'supabase-cloud-sync';
  return (
    <div className="product-page" onClick={(event) => event.stopPropagation()}>
      <nav className="product-nav">
        <div className="product-brand">
          <strong>YourWifey</strong>
          <span>BYOK Studio</span>
        </div>
        <div className="product-nav-links">
          <NavButton active={props.routeKind === 'editor'} onClick={() => props.onNavigate('/')}>
            Editor
          </NavButton>
          <NavButton
            active={props.routeKind === 'dashboard'}
            onClick={() => props.onNavigate('/dashboard')}
          >
            Dashboard
          </NavButton>
          {isCloud ? (
            <NavButton
              active={props.routeKind === 'account'}
              onClick={() => props.onNavigate('/account')}
            >
              Account
            </NavButton>
          ) : null}
          {isCloud ? (
            <NavButton
              active={props.routeKind === 'overlay'}
              onClick={() => props.onNavigate('/overlay/private-preview')}
            >
              Overlay
            </NavButton>
          ) : null}
          {isCloud ? (
            <NavButton active={false} onClick={props.onSignOut}>
              Sign out
            </NavButton>
          ) : (
            <NavButton
              active={props.routeKind === 'login'}
              onClick={() => props.onNavigate('/login')}
            >
              Sign in
            </NavButton>
          )}
        </div>
        <div className="product-nav-foot">
          <span className={`product-mode-dot ${isCloud ? 'is-cloud' : 'is-local'}`} />
          <span className="product-mode-label">{isCloud ? 'Cloud sync' : 'Local only'}</span>
        </div>
      </nav>
      <main className="product-panel">
        <header className="product-header">
          <p className="product-eyebrow">{props.eyebrow}</p>
          <h1>{props.title}</h1>
        </header>
        {props.children}
      </main>
    </div>
  );
}

function NavButton(props: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button className={props.active ? 'active' : ''} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

function SectionTitle(props: { title: string }) {
  return <h2 className="product-section-title">{props.title}</h2>;
}

function StatusText(props: { children: ReactNode }) {
  return <p className="product-status-text">{props.children}</p>;
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="product-stat">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
