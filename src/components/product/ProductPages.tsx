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

  if (props.route.kind === 'home') {
    return <HomePage {...props} accountSummary={accountSummary} />;
  }
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

function HomePage(
  props: ProductPagesProps & {
    accountSummary: ReturnType<typeof describeByokAccountShell>;
  },
) {
  const isCloud = props.accountMode.kind === 'supabase-cloud-sync';
  return (
    <ProductShell {...props}>
      <section className="product-hero product-home-hero" aria-label="YourWifey">
        <div className="product-hero-copy">
          <span className="product-online-pill">
            <span className="product-online-dot" />
            stream-ready AI overlay
          </span>
          <h1 className="product-display product-home-display">
            meet <span className="product-display-accent">YourWifey</span>
          </h1>
          <p className="product-home-subtitle">
            an AI character for Twitch chat, voice, memory, and OBS overlays.
          </p>
          <div className="product-hero-actions">
            <button
              className="product-primary"
              onClick={() => props.onNavigate(isCloud ? '/dashboard' : '/login')}
            >
              {isCloud ? 'Open dashboard' : 'Sign up'}
            </button>
            <button className="product-secondary" onClick={() => props.onNavigate('/editor')}>
              Try local editor
            </button>
          </div>
        </div>
        <div className="product-hero-art product-home-art" aria-hidden="true" />
      </section>

      <div className="product-home-strip">
        <span>{props.accountSummary.providerKeyLabel}</span>
        <span>{props.accountSummary.cloudSyncLabel}</span>
        <span>OBS browser source</span>
        <span>#{props.twitchChannel || 'subsect'}</span>
      </div>

      <section className="product-feature-row" aria-label="Product flow">
        <article className="product-feature">
          <span>01</span>
          <strong>Create a character</strong>
          <p>Pick a persona, VRM, voice, background, and animation setup for the stream.</p>
        </article>
        <article className="product-feature">
          <span>02</span>
          <strong>Connect chat</strong>
          <p>Twitch and local chat route into the same response queue and memory layer.</p>
        </article>
        <article className="product-feature">
          <span>03</span>
          <strong>Go live</strong>
          <p>Use the editor locally or issue an OBS overlay URL from your workspace.</p>
        </article>
      </section>
    </ProductShell>
  );
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
    <ProductShell {...props}>
      <section className="product-hero product-hero-compact">
        <div className="product-hero-copy">
          <p className="product-eyebrow">Magic-link login</p>
          <h1 className="product-display">
            Sign in to <span className="product-display-accent">YourWifey</span>
          </h1>
          <p className="product-lede">
            No password. We email a one-tap link that signs you in and mirrors safe settings to the
            cloud. Memory and chat history stay on this device.
          </p>
        </div>
      </section>
      <form className="product-card product-card-narrow" onSubmit={handleSubmit}>
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
            {busy ? 'Sending…' : 'Send magic link'}
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
    </ProductShell>
  );
}

function AuthCallbackPage(props: ProductPagesProps) {
  useEffect(() => {
    if (props.accountMode.kind === 'supabase-cloud-sync') {
      props.onNavigate('/dashboard');
    }
  }, [props.accountMode.kind, props.onNavigate]);

  return (
    <ProductShell {...props}>
      <section className="product-hero product-hero-compact">
        <div className="product-hero-copy">
          <p className="product-eyebrow">Auth callback</p>
          <h1 className="product-display">Checking your session…</h1>
          <p className="product-lede">{props.authStatus}</p>
        </div>
      </section>
      <div className="product-actions">
        <button className="product-primary" onClick={() => props.onNavigate('/dashboard')}>
          Go to dashboard
        </button>
        <button className="product-secondary" onClick={() => props.onNavigate('/editor')}>
          Back to editor
        </button>
      </div>
    </ProductShell>
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
    <ProductShell {...props}>
      <section className="product-hero product-hero-compact">
        <div className="product-hero-copy">
          <p className="product-eyebrow">Account</p>
          <h1 className="product-display">
            Your <span className="product-display-accent">workspace</span>
          </h1>
          <p className="product-lede">
            Logged in as {profile?.profile.email ?? props.accountSummary.loginLabel}. Cloud sync
            covers safe settings only — provider keys never leave your browser.
          </p>
        </div>
      </section>

      <div className="product-stat-row">
        <Stat label="Mode" value={props.accountSummary.modeLabel} />
        <Stat label="Storage" value={props.accountSummary.storageLabel} />
        <Stat label="Provider keys" value="Browser local only" />
        <Stat label="Email" value={profile?.profile.email ?? props.accountSummary.loginLabel} />
      </div>

      <form className="product-card" onSubmit={handleSave}>
        <SectionTitle title="Display name" />
        <label className="product-field">
          <span>How streams should address you</span>
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
          <button
            className="product-secondary"
            onClick={() => props.onNavigate('/dashboard')}
            type="button"
          >
            Back to dashboard
          </button>
          <button className="product-secondary" onClick={props.onSignOut} type="button">
            Sign out
          </button>
        </div>
        <StatusText>{status}</StatusText>
      </form>
    </ProductShell>
  );
}

function DashboardPage(
  props: ProductPagesProps & {
    accountSummary: ReturnType<typeof describeByokAccountShell>;
  },
) {
  const isCloud = props.accountMode.kind === 'supabase-cloud-sync';
  const [profile, setProfile] = useState<ByokProfileResponse | null>(null);
  const [overlayExpiresInHours, setOverlayExpiresInHours] = useState(24 * 30);
  const [overlayShareUrl, setOverlayShareUrl] = useState('');
  const [status, setStatus] = useState(isCloud ? props.authStatus : props.accountSummary.detail);
  const [pulling, setPulling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const previewOverlayUrl = '/overlay/private-preview';

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
        expiresInHours: overlayExpiresInHours,
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

  const handleCopyOverlayUrl = async () => {
    if (!overlayShareUrl) {
      setStatus('Issue an OBS overlay URL before copying.');
      return;
    }
    try {
      await navigator.clipboard.writeText(overlayShareUrl);
      setStatus('OBS overlay URL copied.');
    } catch {
      setStatus('Copy failed. Select the OBS overlay URL field and copy it manually.');
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
    <ProductShell {...props}>
      <section className="product-hero" aria-label="Stream workspace">
        <div className="product-hero-copy">
          <span className="product-online-pill">
            <span className="product-online-dot" />
            {isCloud ? 'Cloud sync online' : 'Local-only mode'}
          </span>
          <h1 className="product-display">
            Stream with <span className="product-display-accent">{sceneName}</span>
          </h1>
          <p className="product-lede">
            Your waifu overlay, your keys, your machine. Push safe settings to the cloud, ship a
            signed OBS URL, and keep memory plus chat history private on this device.
          </p>
          <div className="product-hero-actions">
            <button className="product-primary" onClick={() => props.onNavigate('/editor')}>
              Open editor
            </button>
            <button
              className="product-secondary"
              onClick={() => props.onNavigate(previewOverlayUrl)}
            >
              Preview overlay
            </button>
          </div>
          <StatusText>{status}</StatusText>
        </div>
        <div className="product-hero-art" aria-hidden="true" />
      </section>

      <div className="product-stat-row">
        <Stat label="Workspace" value={workspaceName} />
        <Stat label="Twitch" value={`#${props.twitchChannel || 'subsect'}`} />
        <Stat label="Sync" value={props.accountSummary.cloudSyncLabel} />
        <Stat label="Provider keys" value={props.accountSummary.providerKeyLabel} />
      </div>

      <div className="product-grid product-grid-cards">
        <section className="product-card">
          <SectionTitle title="OBS overlay" />
          <p className="product-hint">
            Drop a browser source into OBS using a signed URL. Local preview opens the overlay in
            this tab.
          </p>
          <label className="product-field">
            <span>Signed URL lifetime</span>
            <select
              disabled={!isCloud}
              onChange={(event) => setOverlayExpiresInHours(Number(event.target.value))}
              value={overlayExpiresInHours}
            >
              <option value={24}>24 hours</option>
              <option value={24 * 7}>7 days</option>
              <option value={24 * 30}>30 days</option>
              <option value={24 * 90}>90 days</option>
            </select>
          </label>
          <div className="product-actions">
            <button
              className="product-secondary"
              onClick={() => props.onNavigate(previewOverlayUrl)}
            >
              Preview overlay
            </button>
            <button className="product-primary" disabled={!isCloud} onClick={handleIssueOverlayUrl}>
              {isCloud ? 'Issue OBS URL' : 'Sign in for OBS URL'}
            </button>
          </div>
          {overlayShareUrl ? (
            <div className="product-url-box">
              <label className="product-field">
                <span>OBS overlay URL</span>
                <input readOnly value={overlayShareUrl} />
              </label>
              <div className="product-actions">
                <button className="product-secondary" onClick={handleCopyOverlayUrl}>
                  Copy URL
                </button>
                <button className="product-secondary" onClick={() => setOverlayShareUrl('')}>
                  Clear URL
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="product-card">
          <SectionTitle title={isCloud ? 'Cloud sync & backup' : 'Backup & restore'} />
          <p className="product-hint">
            {isCloud
              ? 'Push or pull safe settings to your Supabase workspace. Memory and chat history stay on this device.'
              : 'Export and import scene backups locally. Sign in to mirror safe settings to the cloud.'}
          </p>
          <div className="product-actions">
            <button
              className="product-secondary"
              disabled={syncing || !isCloud}
              onClick={handleSyncSettings}
            >
              {syncing ? 'Syncing…' : 'Push to cloud'}
            </button>
            <button
              className="product-secondary"
              disabled={pulling || !isCloud}
              onClick={handlePullSettings}
            >
              {pulling ? 'Loading…' : 'Pull from cloud'}
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

        <section className="product-card">
          <SectionTitle title="Provider keys" />
          <div className="product-provider-list">
            <ProviderStatus
              label="OpenAI"
              status={props.accountSummary.providerKeyLabel}
              tone="ready"
            />
            <ProviderStatus label="Fish Speech" status="Browser local" tone="ready" />
            <ProviderStatus label="Inworld" status="Browser local" tone="ready" />
            <ProviderStatus label="Cloud secrets" status="Never uploaded" tone="safe" />
          </div>
        </section>

        <section className="product-card">
          <SectionTitle title="Launch checklist" />
          <div className="product-checklist">
            <ChecklistItem
              done
              label={isCloud ? 'Cloud account linked' : 'Local-only mode active'}
            />
            <ChecklistItem done label={`Twitch channel #${props.twitchChannel || 'subsect'}`} />
            <ChecklistItem
              done={Boolean(profile?.bootstrap.scene.id)}
              label="Scene bootstrap ready"
            />
            <ChecklistItem done={Boolean(overlayShareUrl)} label="Signed OBS URL issued" />
          </div>
        </section>

        {!isCloud ? (
          <section className="product-card product-card-cta">
            <SectionTitle title="Cloud sync" />
            <p className="product-hint">
              Sign in with a magic link to mirror safe settings between machines and unlock signed
              OBS overlay URLs. No password — just a one-time email link.
            </p>
            <div className="product-actions">
              <button className="product-primary" onClick={() => props.onNavigate('/login')}>
                Sign in with magic link
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </ProductShell>
  );
}

function ProductShell(props: ProductPagesProps & { children: ReactNode }) {
  const isCloud = props.accountMode.kind === 'supabase-cloud-sync';
  return (
    <div className="product-page" onClick={(event) => event.stopPropagation()}>
      <div className="product-page-glow" aria-hidden="true" />
      <header className="product-topnav">
        <button className="product-brand" onClick={() => props.onNavigate('/home')} type="button">
          <span className="product-brand-mark">YW</span>
          <span className="product-brand-name">
            YourWifey<span className="product-brand-tag">BYOK</span>
          </span>
        </button>
        <nav className="product-topnav-links" aria-label="Primary">
          <NavLink active={props.route.kind === 'home'} onClick={() => props.onNavigate('/home')}>
            Home
          </NavLink>
          <NavLink
            active={props.route.kind === 'editor'}
            onClick={() => props.onNavigate('/editor')}
          >
            Editor
          </NavLink>
          <NavLink
            active={props.route.kind === 'dashboard'}
            onClick={() => props.onNavigate('/dashboard')}
          >
            Dashboard
          </NavLink>
          <NavLink
            active={props.route.kind === 'account'}
            onClick={() => props.onNavigate(isCloud ? '/account' : '/login')}
          >
            Account
          </NavLink>
          <NavLink active={false} onClick={() => props.onNavigate('/overlay/private-preview')}>
            Overlay
          </NavLink>
        </nav>
        <div className="product-topnav-end">
          <span className={`product-mode-pill ${isCloud ? 'is-cloud' : 'is-local'}`}>
            <span className="product-mode-dot" />
            {isCloud ? 'Cloud sync' : 'Local only'}
          </span>
          {isCloud ? (
            <button className="product-ghost" onClick={props.onSignOut} type="button">
              Sign out
            </button>
          ) : (
            <button
              className="product-ghost"
              onClick={() => props.onNavigate('/login')}
              type="button"
            >
              Sign in
            </button>
          )}
        </div>
      </header>
      <main className="product-main">{props.children}</main>
    </div>
  );
}

function NavLink(props: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={props.active ? 'product-navlink is-active' : 'product-navlink'}
      onClick={props.onClick}
      type="button"
    >
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

function ProviderStatus(props: { label: string; status: string; tone: 'ready' | 'safe' }) {
  return (
    <div className="product-provider-row">
      <span>{props.label}</span>
      <strong className={props.tone === 'safe' ? 'is-safe' : ''}>{props.status}</strong>
    </div>
  );
}

function ChecklistItem(props: { done: boolean; label: string }) {
  return (
    <div className={props.done ? 'product-check-item is-done' : 'product-check-item'}>
      <span />
      {props.label}
    </div>
  );
}
