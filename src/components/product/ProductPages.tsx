import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import type { ByokAccountMode } from '../../lib/product/account-mode';
import {
  consumeStoredLoginNextPath,
  getSafeLoginNextPath,
  storeLoginNextPath,
  type AppRoute,
} from '../../lib/product/app-route';
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
  buildSupabaseOAuthRequest,
  describeByokAccountShell,
  fetchSupabaseEnabledOAuthProviders,
  getEnabledSupabaseOAuthProviders,
  getSupabaseOAuthProviderLabel,
  requestSupabaseMagicLink,
} from '../../lib/product/supabase-auth-shell';
import type { SupabaseOAuthProvider, SupabasePublicConfig } from '../../lib/product/supabase-env';
import { getProductAuthCallbackUrl } from '../../lib/product/auth-redirect';

type HomeVrmExpression = 'neutral' | 'happy' | 'surprised' | 'sad' | 'angry';

type HomeVrmApi = {
  setExpression: (name: string) => void;
  setTalking: (on: boolean) => void;
};

declare global {
  interface Window {
    YWVRM?: HomeVrmApi;
    __vrmError?: unknown;
  }
}

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
  const twitchLabel = props.twitchChannel ? `#${props.twitchChannel}` : '#subsect';
  return (
    <ProductShell {...props}>
      <div className="yw-home">
        <section className="yw-hero" aria-label="YourWifey">
          <div className="yw-hero__inner">
            <div>
              <div className="yw-eyebrow">
                <b>// YourWifey BYOK</b>
                <span />
                stream-ready AI VTuber
              </div>
              <h1>
                Your AI <em>VTuber</em>
                <br />
                co-host for
                <br />
                live streams.
              </h1>
              <p className="yw-hero__sub">
                YourWifey runs a customizable AI avatar that reads Twitch chat, replies through your
                chosen LLM, speaks with Piper, Fish Speech, or Inworld TTS, remembers viewers,
                triggers expressions, and drops into OBS as a browser overlay.
              </p>
              <div className="yw-hero__ctas">
                <button
                  className="yw-btn yw-btn--primary"
                  onClick={() => props.onNavigate(isCloud ? '/dashboard' : '/login')}
                >
                  {isCloud ? 'Open dashboard' : 'Start creating'}
                </button>
                <button
                  className="yw-btn yw-btn--ghost"
                  onClick={() => props.onNavigate(isCloud ? '/editor' : '/login')}
                >
                  {isCloud ? 'Open editor' : 'Sign in first'}
                </button>
              </div>
              <div className="yw-hero__meta">
                <span>VRM avatars</span>
                <span>BYOK provider keys</span>
                <span>Piper · Fish · Inworld</span>
                <span>OBS browser source</span>
              </div>
            </div>
            <HomeProductPreview twitchLabel={twitchLabel} />
          </div>
        </section>

        <section className="yw-strip" aria-label="Current setup">
          <span>{props.accountSummary.providerKeyLabel}</span>
          <span>{props.accountSummary.cloudSyncLabel}</span>
          <span>Google/GitHub login when enabled</span>
          <span>{twitchLabel}</span>
        </section>

        <section className="yw-section" id="features">
          <div className="yw-wrap">
            <div className="yw-eyebrow">core features</div>
            <h2 className="yw-title">
              Everything she needs to <em>actually go live</em>.
            </h2>
            <p className="yw-lede">
              Six systems doing the work behind one character: chat intake, language model,
              real-time voice, memory, avatar control, and a browser overlay for OBS.
            </p>
          </div>
          <div className="yw-features yw-wrap">
            {[
              [
                'i',
                'LLM character replies',
                'OpenAI Responses is the primary path. Tune model, temperature, token caps, state mode, and prompt behavior from the app.',
                ['OpenAI', 'Responses', 'streaming'],
              ],
              [
                'ii',
                'Twitch + local chat',
                'Twitch and local test chat normalize into the same intake queue so local messages act like viewer messages with controller permissions.',
                ['Twitch IRC', 'local chat', 'queue'],
              ],
              [
                'iii',
                'Real-time voice output',
                'Use browser Piper, Fish Speech live bridge, or Inworld remote TTS. The Voice Lab stores Fish Speech and Inworld custom voice records per persona.',
                ['Piper', 'Fish', 'Inworld'],
              ],
              [
                'iv',
                'Character memory',
                'Per-scope relationship memory, diary thoughts, and semantic recall keep the character aware without dumping the whole chat into context.',
                ['diary', 'semantic', 'per-scope'],
              ],
              [
                'v',
                'VRM expression',
                'Map AI emotion to VRM expressions and animation categories while keeping idle/talking loops separate from emotion reactions.',
                ['VRM', 'blendshapes', 'motion'],
              ],
              [
                'vi',
                'OBS overlay',
                'Use the editor locally or issue signed overlay URLs from a cloud workspace for private OBS browser sources.',
                ['OBS', 'signed URL', 'scene'],
              ],
            ].map(([n, title, desc, tags]) => (
              <article className="yw-feature" key={String(title)}>
                <div className="yw-feature__num">
                  <span>{n}</span> feature
                </div>
                <h3>{title}</h3>
                <p>{desc}</p>
                <div className="yw-tags">
                  {(tags as string[]).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="yw-section yw-section--alt" id="voice">
          <div className="yw-split yw-wrap">
            <div>
              <div className="yw-eyebrow">voice · TTS · cloning</div>
              <h2 className="yw-title">
                Pick a voice. <em>Save it to a persona.</em>
              </h2>
              <p className="yw-lede">
                The app now has a Voice Lab for registering custom voices, attaching them to
                characters, and keeping a default voice per persona. Fish Speech is the
                zero-shot/custom voice path; active playback today is Piper, Fish Speech, and
                Inworld.
              </p>
              <HomeSpecList
                items={[
                  ['Piper', 'Local browser TTS with cached voice models and fast rehearsals.'],
                  [
                    'Fish Speech',
                    'Server-side live bridge for streaming text into one TTS request.',
                  ],
                  ['Inworld', 'Remote TTS stream path with provider voice IDs and model settings.'],
                  [
                    'Voice Lab',
                    'Upload sample metadata, save provider voice IDs, and bind voices to personas.',
                  ],
                ]}
              />
            </div>
            <div className="yw-voice-card">
              <div className="yw-card-head">
                <span className="yw-led" />
                Voice Lab · Hikari
                <strong>custom defaults</strong>
              </div>
              {[
                ['Piper · Neuro-sama', 'local', 'Default for Neuro-sama preset'],
                ['Fish Speech · s2 voice', 'remote', 'Live bridge ready when provider key exists'],
                ['Inworld · custom voice id', 'remote', 'Saved per persona through Voice Lab'],
                [
                  'Fish Speech · zero-shot clone',
                  'remote',
                  'Custom voice reference saved per persona',
                ],
              ].map(([name, type, desc], index) => (
                <div className={`yw-voice-row ${index === 1 ? 'is-selected' : ''}`} key={name}>
                  <span className="yw-radio" />
                  <div>
                    <strong>{name}</strong>
                    <p>{desc}</p>
                  </div>
                  <em>{type}</em>
                </div>
              ))}
              <div className="yw-wave-row">
                {Array.from({ length: 18 }).map((_, index) => (
                  <span key={index} style={{ height: `${6 + Math.abs(Math.sin(index) * 18)}px` }} />
                ))}
                <b>save to character</b>
              </div>
            </div>
          </div>
        </section>

        <section className="yw-section" id="memory">
          <div className="yw-split yw-split--reverse yw-wrap">
            <div className="yw-memory-card">
              <div className="yw-card-head">
                persona · <b>Hikari-chan</b>
                <strong>current scope</strong>
              </div>
              <div className="yw-memory-block">
                <span>persona prompt</span>
                <p>sarcastic, bright, chaotic streamer AI with a warm streak.</p>
              </div>
              <div className="yw-memory-block">
                <span>diary thought</span>
                <p>
                  compresses completed turns into private thoughts instead of replaying the full
                  chat.
                </p>
              </div>
              <div className="yw-pills">
                <span>semantic recall</span>
                <span>viewer notes</span>
                <span>Twitch batch</span>
                <span>local controller</span>
              </div>
            </div>
            <div>
              <div className="yw-eyebrow">AI + memory</div>
              <h2 className="yw-title">
                A character that <em>remembers what mattered</em>.
              </h2>
              <p className="yw-lede">
                Persona prompts define style. Diary and relationship memory shape the character over
                time. Semantic memory stays conditional so the prompt stays useful instead of
                bloated.
              </p>
              <HomeSpecList
                items={[
                  [
                    'Persona prompts',
                    'Editable profiles with nickname, description, and speaking style.',
                  ],
                  ['Diary layer', 'Background memory worker summarizes completed interactions.'],
                  [
                    'Semantic memory',
                    'Embeddings-backed recall when the current message needs it.',
                  ],
                  ['Channel scopes', 'Local and Twitch scopes can keep different memory stores.'],
                ]}
              />
            </div>
          </div>
        </section>

        <section className="yw-section yw-section--alt" id="how">
          <div className="yw-wrap">
            <div className="yw-eyebrow">how it works</div>
            <h2 className="yw-title">
              From blank slate to <em>stream overlay</em>.
            </h2>
          </div>
          <div className="yw-steps yw-wrap">
            {[
              [
                '01',
                'Pick a character',
                'Start from Neuro-sama, Riko, Hikari, or your own persona.',
                '~2 min',
              ],
              [
                '02',
                'Add keys',
                'Provider keys live in the browser vault; cloud sync stores non-secret settings.',
                'BYOK',
              ],
              [
                '03',
                'Connect chat',
                'Use Twitch direct IRC or local chat for offline rehearsals.',
                'Twitch/local',
              ],
              [
                '04',
                'Tune behavior',
                'Adjust LLM, memory, TTS, VRM, animation, expressions, and scene settings.',
                'settings',
              ],
              [
                '05',
                'Drop into OBS',
                'Open the editor locally or issue a signed overlay URL for OBS.',
                'go live',
              ],
            ].map(([n, title, desc, hint]) => (
              <article className="yw-step" key={n}>
                <div>{n}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
                <span>{hint}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="yw-final">
          <div>
            <div className="yw-eyebrow">start streaming</div>
            <h2>
              Spin up a <em>character</em>.
              <br />
              Drop her in OBS.
            </h2>
            <p>
              Use the app locally, sign in for cloud sync, or copy a signed overlay URL when your
              workspace is ready.
            </p>
            <div className="yw-hero__ctas">
              <button
                className="yw-btn yw-btn--primary"
                onClick={() => props.onNavigate(isCloud ? '/dashboard' : '/login')}
              >
                {isCloud ? 'Open dashboard' : 'Start creating'}
              </button>
              <button
                className="yw-btn yw-btn--ghost"
                onClick={() => props.onNavigate(isCloud ? '/editor' : '/login')}
              >
                {isCloud ? 'Open editor' : 'Sign in first'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </ProductShell>
  );
}

const HOME_CHAT_POOL = [
  { user: 'kazumi_dev', color: 'c-pink', text: 'wait she actually remembers my cat??' },
  { user: 'gamer_jules', color: 'c-cyan', text: '@wifey what build are we running tonight' },
  {
    user: 'mod_aria',
    color: 'c-amber',
    text: 'queue is wild, lets do small chat mode',
    badge: 'MOD',
  },
  { user: 'late_owl', color: 'c-violet', text: 'first stream since the trip, hi again!' },
  { user: 'pixel_ren', color: 'c-lime', text: 'her laugh sounds way more natural now' },
  { user: 'bento_box', color: 'c-pink', text: '@wifey roast my deck pick pls' },
  { user: 'kazumi_dev', color: 'c-pink', text: 'lmaooo perfect timing on that one' },
  { user: 'starlit_42', color: 'c-cyan', text: 'gg the inworld voice is so smooth' },
];

const HOME_REPLIES: Array<{
  text: string;
  expr: HomeVrmExpression;
  meta: { provider: string; voice: string; latency: string };
}> = [
  {
    text: "kazumi! yes, the orange one, right? you sent me a picture last week. how's he doing?",
    expr: 'happy',
    meta: { provider: 'OpenAI · Responses', voice: 'Inworld · Aria', latency: '480 ms' },
  },
  {
    text: "@gamer_jules tonight we're running the speedrun build, same as friday but with the new dash mod. let's see if it actually holds.",
    expr: 'neutral',
    meta: { provider: 'OpenAI · Responses', voice: 'Fish Speech · Coral', latency: '520 ms' },
  },
  {
    text: 'aria, switching to small chat mode now. tagged messages only. behave, chat.',
    expr: 'angry',
    meta: { provider: 'OpenAI · Responses', voice: 'Piper · en_US-amy', latency: '180 ms' },
  },
  {
    text: 'late_owl!! welcome back. how was the trip, did you actually take the pictures you promised?',
    expr: 'surprised',
    meta: { provider: 'OpenAI · Responses', voice: 'Inworld · Aria', latency: '490 ms' },
  },
];

function HomeProductPreview(props: { twitchLabel: string }) {
  const [chat, setChat] = useState(HOME_CHAT_POOL.slice(0, 5));
  const [replyIndex, setReplyIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [activeExpression, setActiveExpression] = useState<HomeVrmExpression>('happy');

  const reply = HOME_REPLIES[replyIndex] ?? HOME_REPLIES[0]!;

  useEffect(() => {
    let index = 5;
    const timer = window.setInterval(() => {
      setChat((current) => [
        ...current.slice(1),
        {
          ...HOME_CHAT_POOL[index % HOME_CHAT_POOL.length]!,
          key: `${Date.now()}-${Math.random()}`,
        },
      ]);
      index += 1;
    }, 2200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let index = 0;
    let finishTimer = 0;
    let nextTimer = 0;
    const text = reply.text;
    const timer = window.setInterval(() => {
      index += 1;
      setTyped(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(timer);
        finishTimer = window.setTimeout(() => {
          window.YWVRM?.setTalking(false);
          nextTimer = window.setTimeout(
            () => setReplyIndex((current) => (current + 1) % HOME_REPLIES.length),
            1800,
          );
        }, 600);
      }
    }, 28);
    setTyped('');
    setActiveExpression(reply.expr);
    window.YWVRM?.setExpression(reply.expr);
    window.YWVRM?.setTalking(true);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(finishTimer);
      window.clearTimeout(nextTimer);
    };
  }, [reply]);

  function handleExpression(name: HomeVrmExpression) {
    setActiveExpression(name);
    window.YWVRM?.setExpression(name);
  }

  return (
    <div className="yw-preview">
      <div className="yw-preview__chrome">
        <span />
        <span />
        <span />
        <strong>wifey://studio · live session</strong>
        <em>on air</em>
      </div>
      <div className="yw-preview__grid">
        <div className="yw-preview__avatar">
          <HomeVrmPreview />
          <div className="yw-avatar-overlays">
            <div className="yw-avatar-top">
              <div className="yw-avatar-chip">
                <b>Hikky</b> · v2.4
              </div>
              <div className="yw-avatar-chip">VRM 1.0 · idle</div>
            </div>
            <div className="yw-expr-bar">
              {(['neutral', 'happy', 'surprised', 'sad', 'angry'] as HomeVrmExpression[]).map(
                (expression) => (
                  <button
                    className={activeExpression === expression ? 'is-active' : ''}
                    key={expression}
                    onClick={() => handleExpression(expression)}
                    type="button"
                  >
                    {expression}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
        <div className="yw-preview__panel">
          <h3>
            Twitch chat <span>{props.twitchLabel}</span>
          </h3>
          {chat.map((message, index) => (
            <p className="yw-chat-line yw-chat-line--enter" key={`${message.user}-${index}`}>
              <em>#stream</em>
              <b className={message.color}>{message.user}</b>
              {message.badge ? <span>{message.badge}</span> : null}
              {message.text}
            </p>
          ))}
        </div>
        <div className="yw-preview__panel">
          <h3>
            AI reply <span>streaming</span>
          </h3>
          <p className="yw-reply">
            "{typed}
            <i />"
          </p>
          <div className="yw-reply-meta">
            <span>LLM {reply.meta.provider}</span>
            <span>Voice {reply.meta.voice}</span>
            <span>Latency {reply.meta.latency}</span>
          </div>
        </div>
        <div className="yw-preview__panel">
          <h3>
            Memory <span>scoped</span>
          </h3>
          <div className="yw-memory-mini">
            <strong>subby</strong>
            <span>close · playful · current local scope</span>
            <p>
              Diary, relationship notes, and semantic recall feed the next turn only when useful.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeVrmPreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadingRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const loadingEl = loadingRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xffe1e9, 1.4);
    key.position.set(1.2, 1.6, 1.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xa0d8ff, 0.6);
    fill.position.set(-1.4, 0.8, 0.6);
    scene.add(fill);
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const back = new THREE.DirectionalLight(0xff7eb6, 0.4);
    back.position.set(0, 1, -1.5);
    scene.add(back);

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    camera.position.set(0, 1.35, 1.7);

    const resize = () => {
      const parent = canvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement ?? canvas);
    resize();

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const clock = new THREE.Clock();
    const state = {
      expr: 'neutral' as HomeVrmExpression,
      nextBlink: 1.2,
      blinkPhase: 0,
      blinkT: 0,
      talking: false,
      talkT: 0,
      mouthOpen: 0,
    };
    let vrm: VRM | null = null;
    let animationFrame = 0;
    let disposed = false;
    let loadTimer = 0;

    const api: HomeVrmApi = {
      setExpression(name) {
        state.expr = (
          ['neutral', 'happy', 'surprised', 'sad', 'angry'].includes(name) ? name : 'neutral'
        ) as HomeVrmExpression;
      },
      setTalking(on) {
        state.talking = !!on;
        if (!on) {
          state.mouthOpen = 0;
        }
      },
    };
    window.YWVRM = api;

    const setLoadingText = (text: string) => {
      const textEl = loadingEl?.querySelector('.txt');
      if (textEl) {
        textEl.textContent = text;
      }
    };

    const loadAvatar = async () => {
      try {
        const gltf = await loader.loadAsync('/cdn-assets/product/avatar.vrm', (xhr) => {
          if (loadingEl && xhr.total) {
            const percent = Math.round((xhr.loaded / xhr.total) * 100);
            setLoadingText(`Loading VRM - ${percent}%`);
          }
        });
        if (disposed) {
          return;
        }
        onLoaded(gltf);
      } catch (error) {
        window.__vrmError = {
          message: error instanceof Error ? error.message : undefined,
          name: error instanceof Error ? error.name : undefined,
          stack: error instanceof Error ? error.stack : undefined,
          toString: String(error),
          keys: error && typeof error === 'object' ? Object.keys(error) : null,
        };
        console.error('[HomeVrmPreview] VRM load failed:', error);
        setLoadingText('VRM failed to load');
      }
    };

    function onLoaded(gltf: Awaited<ReturnType<typeof loader.loadAsync>>) {
      const loadedVrm = gltf.userData['vrm'] as VRM | undefined;
      if (!loadedVrm) {
        setLoadingText('VRM failed to load');
        return;
      }
      vrm = loadedVrm;

      try {
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
      } catch {}
      try {
        VRMUtils.combineSkeletons(gltf.scene);
      } catch {}
      try {
        VRMUtils.rotateVRM0(vrm);
      } catch {}

      scene.add(vrm.scene);

      let target = new THREE.Vector3(0, 1.35, 0);
      try {
        const head = vrm.humanoid?.getNormalizedBoneNode('head');
        if (head) {
          const worldPosition = new THREE.Vector3();
          head.getWorldPosition(worldPosition);
          target = new THREE.Vector3(0, worldPosition.y - 0.05, 0);
          camera.position.set(0, worldPosition.y - 0.05, 1.3);
        }
      } catch {}
      camera.lookAt(target);

      try {
        const leftUpperArm = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
        const rightUpperArm = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
        if (leftUpperArm) {
          leftUpperArm.rotation.z = 1.25;
        }
        if (rightUpperArm) {
          rightUpperArm.rotation.z = -1.25;
        }
      } catch {}

      if (loadingEl) {
        loadingEl.style.display = 'none';
      }
    }

    function setExpressionValues(expressionManager: NonNullable<VRM['expressionManager']>) {
      for (const name of ['neutral', 'happy', 'angry', 'sad', 'surprised', 'relaxed']) {
        try {
          expressionManager.setValue(name, 0);
        } catch {}
      }
      try {
        expressionManager.setValue(state.expr, 1);
      } catch {}
    }

    function animate() {
      animationFrame = window.requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);

      if (vrm) {
        const elapsed = clock.elapsedTime;
        try {
          const chest =
            vrm.humanoid?.getNormalizedBoneNode('chest') ??
            vrm.humanoid?.getNormalizedBoneNode('spine');
          const head = vrm.humanoid?.getNormalizedBoneNode('head');
          const neck = vrm.humanoid?.getNormalizedBoneNode('neck');
          if (chest) {
            chest.rotation.y = Math.sin(elapsed * 0.6) * 0.04;
            chest.rotation.x = Math.sin(elapsed * 0.9) * 0.015;
          }
          if (head) {
            head.rotation.y = Math.sin(elapsed * 0.45) * 0.1;
            head.rotation.x = Math.sin(elapsed * 0.65 + 1.2) * 0.05;
            head.rotation.z = Math.sin(elapsed * 0.3) * 0.02;
          }
          if (neck) {
            neck.rotation.y = Math.sin(elapsed * 0.45 + 0.3) * 0.04;
          }
        } catch {}

        const expressionManager = vrm.expressionManager;
        if (expressionManager) {
          setExpressionValues(expressionManager);

          state.nextBlink -= delta;
          if (state.nextBlink <= 0 && state.blinkPhase === 0) {
            state.blinkPhase = 1;
            state.blinkT = 0;
          }
          if (state.blinkPhase === 1) {
            state.blinkT += delta;
            const value = Math.min(1, state.blinkT / 0.08);
            try {
              expressionManager.setValue('blink', value);
            } catch {}
            if (value >= 1) {
              state.blinkPhase = 2;
              state.blinkT = 0;
            }
          } else if (state.blinkPhase === 2) {
            state.blinkT += delta;
            const value = Math.max(0, 1 - state.blinkT / 0.12);
            try {
              expressionManager.setValue('blink', value);
            } catch {}
            if (value <= 0) {
              state.blinkPhase = 0;
              state.nextBlink = 2 + Math.random() * 3.5;
            }
          }

          if (state.talking) {
            state.talkT += delta;
            const mouth =
              (Math.sin(state.talkT * 18) * 0.5 + 0.5) * 0.7 +
              (Math.sin(state.talkT * 9 + 1.2) * 0.5 + 0.5) * 0.3;
            state.mouthOpen = mouth * 0.7;
          } else {
            state.mouthOpen *= 0.85;
          }
          try {
            expressionManager.setValue('aa', state.mouthOpen);
          } catch {}
          expressionManager.update();
        }

        vrm.update(delta);
      }

      renderer.render(scene, camera);
    }

    loadTimer = window.setTimeout(loadAvatar, 100);
    animate();

    return () => {
      disposed = true;
      window.clearTimeout(loadTimer);
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      if (window.YWVRM === api) {
        delete window.YWVRM;
      }
      if (vrm) {
        scene.remove(vrm.scene);
        vrm.scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) {
            material.forEach((item) => item.dispose());
          } else {
            material?.dispose();
          }
        });
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className="yw-avatar-stage">
      <canvas className="yw-avatar-canvas" id="vrm-canvas" ref={canvasRef} />
      <div className="yw-avatar-loading" id="vrm-loading" ref={loadingRef}>
        <div className="ring" />
        <div className="txt">Loading VRM...</div>
      </div>
    </div>
  );
}

function HomeSpecList(props: { items: Array<[string, string]> }) {
  return (
    <ul className="yw-spec-list">
      {props.items.map(([label, body]) => (
        <li key={label}>
          <span>{label}</span>
          <p>{body}</p>
        </li>
      ))}
    </ul>
  );
}

function getLoginNextTarget(fallback = '/dashboard') {
  if (typeof window === 'undefined') {
    return fallback;
  }
  return (
    getSafeLoginNextPath(window.location, '') || consumeStoredLoginNextPath(undefined, fallback)
  );
}

function getAuthCallbackUrlWithNext() {
  if (typeof window !== 'undefined') {
    storeLoginNextPath(getSafeLoginNextPath(window.location));
  }
  const callbackUrl = getProductAuthCallbackUrl();
  if (!callbackUrl) {
    return undefined;
  }
  return callbackUrl;
}

function LoginPage(
  props: ProductPagesProps & {
    accountSummary: ReturnType<typeof describeByokAccountShell>;
  },
) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(props.accountSummary.detail);
  const [busy, setBusy] = useState(false);
  const [liveOAuthProviders, setLiveOAuthProviders] = useState<SupabaseOAuthProvider[] | null>(
    null,
  );
  const configuredOAuthProviders = useMemo(
    () => getEnabledSupabaseOAuthProviders(props.supabaseConfig),
    [props.supabaseConfig],
  );
  const enabledOAuthProviders = liveOAuthProviders ?? configuredOAuthProviders;
  const oauthAvailable =
    props.accountMode.loginAvailable &&
    props.supabaseConfig.status === 'configured' &&
    enabledOAuthProviders.length > 0;

  useEffect(() => {
    let cancelled = false;
    setLiveOAuthProviders(null);
    if (props.supabaseConfig.status !== 'configured') {
      return () => {
        cancelled = true;
      };
    }

    fetchSupabaseEnabledOAuthProviders({ config: props.supabaseConfig })
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.ok) {
          setLiveOAuthProviders(result.providers);
          if (result.providers.length === 0) {
            setStatus(
              'Supabase Auth currently reports Google and GitHub disabled for this project.',
            );
          }
          return;
        }
        setStatus(result.message);
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Supabase OAuth check failed.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [props.supabaseConfig]);

  useEffect(() => {
    if (props.accountMode.kind === 'supabase-cloud-sync') {
      props.onNavigate(getLoginNextTarget());
    }
  }, [props.accountMode.kind, props.onNavigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await requestSupabaseMagicLink({
      config: props.supabaseConfig,
      email,
      redirectTo: getAuthCallbackUrlWithNext(),
    });
    setBusy(false);
    setStatus(result.message);
  };

  const handleOAuth = (provider: SupabaseOAuthProvider) => {
    const request = buildSupabaseOAuthRequest({
      config: { ...props.supabaseConfig, oauthProviders: enabledOAuthProviders },
      provider,
      redirectTo: getAuthCallbackUrlWithNext(),
    });
    if (!request.ok) {
      setStatus(request.message);
      return;
    }
    window.location.assign(request.url);
  };

  return (
    <ProductShell {...props}>
      <section className="product-hero product-hero-compact">
        <div className="product-hero-copy">
          <p className="product-eyebrow">Account login</p>
          <h1 className="product-display">
            Sign in to <span className="product-display-accent">YourWifey</span>
          </h1>
          <p className="product-lede">
            Use a normal OAuth provider for cloud sync, dashboard access, and signed OBS overlay
            URLs. Provider API keys still stay in this browser vault.
          </p>
        </div>
      </section>
      <section className="product-card product-card-narrow">
        <SectionTitle title="Continue with" />
        <div className="product-oauth-grid">
          {enabledOAuthProviders.map((provider) => (
            <button
              className="product-primary"
              disabled={!oauthAvailable}
              key={provider}
              onClick={() => handleOAuth(provider)}
              type="button"
            >
              {getSupabaseOAuthProviderLabel(provider)}
            </button>
          ))}
        </div>
        <StatusText>
          {oauthAvailable
            ? 'Use an enabled Supabase OAuth provider.'
            : getOAuthUnavailableMessage(props)}
        </StatusText>
      </section>
      <form className="product-card product-card-narrow" onSubmit={handleSubmit}>
        <SectionTitle title="Email fallback" />
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
            {busy ? 'Sending…' : 'Send email link'}
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
      props.onNavigate(getLoginNextTarget());
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
        <button className="product-primary" onClick={() => props.onNavigate(getLoginNextTarget())}>
          Continue
        </button>
        <button className="product-secondary" onClick={() => props.onNavigate('/login')}>
          Back to login
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
              Sign in with Google or GitHub to mirror safe settings between machines and unlock
              signed OBS overlay URLs. Email link stays available as a fallback on the login page.
            </p>
            <div className="product-actions">
              <button className="product-primary" onClick={() => props.onNavigate('/login')}>
                Sign in
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

function getOAuthUnavailableMessage(
  props: ProductPagesProps & {
    accountSummary: ReturnType<typeof describeByokAccountShell>;
  },
) {
  if (props.supabaseConfig.status !== 'configured') {
    return props.accountSummary.detail;
  }
  return 'Supabase Auth reports Google/GitHub disabled. Enable a provider with its OAuth client ID and secret, then add the Supabase callback URL in that provider console.';
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
