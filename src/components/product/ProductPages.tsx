import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ByokAccountMode } from '../../lib/product/account-mode';
import type { AppRoute } from '../../lib/product/app-route';
import {
  fetchByokProfile,
  patchByokSetting,
  patchByokProfile,
  type ByokProfileResponse,
} from '../../lib/product/byok-api';
import { buildCloudSettingRecords } from '../../lib/product/cloud-settings';
import type { PersistedChatState } from '../../lib/chat/types';
import {
  describeByokAccountShell,
  requestSupabaseMagicLink,
} from '../../lib/product/supabase-auth-shell';
import type { SupabasePublicConfig } from '../../lib/product/supabase-env';

type ProductPagesProps = {
  accountMode: ByokAccountMode;
  authStatus: string;
  onNavigate: (path: string) => void;
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
  }, [props]);

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
      eyebrow="Magic-link login"
      onNavigate={props.onNavigate}
      title="Sign in to sync your stream setup"
    >
      <form className="product-card" onSubmit={handleSubmit}>
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
        <button className="product-primary" disabled={busy} type="submit">
          {busy ? 'Sending...' : 'Send magic link'}
        </button>
        <p>{status}</p>
      </form>
    </ProductPageFrame>
  );
}

function AuthCallbackPage(props: ProductPagesProps) {
  return (
    <ProductPageFrame
      eyebrow="Auth callback"
      onNavigate={props.onNavigate}
      title="Checking your session"
    >
      <div className="product-card">
        <p>{props.authStatus}</p>
        <div className="product-actions">
          <button className="product-primary" onClick={() => props.onNavigate('/dashboard')}>
            Dashboard
          </button>
          <button className="product-secondary" onClick={() => props.onNavigate('/')}>
            Editor
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
    <ProductPageFrame eyebrow="Account" onNavigate={props.onNavigate} title="YourWifey account">
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
            Sign out locally
          </button>
        </div>
        <p>{status}</p>
      </form>
    </ProductPageFrame>
  );
}

function DashboardPage(
  props: ProductPagesProps & {
    accountSummary: ReturnType<typeof describeByokAccountShell>;
  },
) {
  const [profile, setProfile] = useState<ByokProfileResponse | null>(null);
  const [status, setStatus] = useState(props.authStatus);
  const [syncing, setSyncing] = useState(false);
  const overlayUrl =
    profile?.bootstrap.scene.id && typeof window !== 'undefined'
      ? new URL(`/overlay/${encodeURIComponent(profile.bootstrap.scene.id)}`, window.location.href)
          .pathname
      : '/overlay/private-preview';

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
  }, [props.accountMode.kind]);

  const handleSyncSettings = async () => {
    if (!profile?.bootstrap.workspace.id || props.accountMode.kind !== 'supabase-cloud-sync') {
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

  return (
    <ProductPageFrame eyebrow="Dashboard" onNavigate={props.onNavigate} title="Stream workspace">
      <div className="product-card">
        <div className="product-grid">
          <Stat label="Workspace" value={profile?.bootstrap.workspace.name ?? 'Local editor'} />
          <Stat label="Scene" value={profile?.bootstrap.scene.name ?? 'Main Overlay'} />
          <Stat label="Twitch" value={`#${props.twitchChannel || 'subsect'}`} />
          <Stat label="Sync" value={props.accountSummary.cloudSyncLabel} />
        </div>
        <div className="product-actions">
          <button className="product-primary" onClick={() => props.onNavigate('/')}>
            Open editor
          </button>
          <button className="product-secondary" onClick={() => props.onNavigate('/account')}>
            Account
          </button>
          <button className="product-secondary" onClick={() => props.onNavigate(overlayUrl)}>
            Preview overlay
          </button>
          <button
            className="product-secondary"
            disabled={syncing || props.accountMode.kind !== 'supabase-cloud-sync'}
            onClick={handleSyncSettings}
          >
            {syncing ? 'Syncing...' : 'Sync settings'}
          </button>
        </div>
        <p>{status}</p>
      </div>
    </ProductPageFrame>
  );
}

function ProductPageFrame(props: {
  children: ReactNode;
  eyebrow: string;
  onNavigate: (path: string) => void;
  title: string;
}) {
  return (
    <div className="product-page" onClick={(event) => event.stopPropagation()}>
      <nav className="product-nav">
        <button onClick={() => props.onNavigate('/')}>Editor</button>
        <button onClick={() => props.onNavigate('/dashboard')}>Dashboard</button>
        <button onClick={() => props.onNavigate('/account')}>Account</button>
        <button onClick={() => props.onNavigate('/login')}>Login</button>
      </nav>
      <main className="product-panel">
        <p className="product-eyebrow">{props.eyebrow}</p>
        <h1>{props.title}</h1>
        {props.children}
      </main>
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="product-stat">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
