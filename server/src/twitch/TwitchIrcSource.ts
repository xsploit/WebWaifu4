import WebSocket from 'ws';
import type {
  TwitchChatMessage,
  TwitchChatSource,
  TwitchChatSourceHandlers,
} from './TwitchChatSource.js';
import { parseIrcMessage, splitIrcFrames } from './ircMessage.js';

export type TwitchIrcSourceOptions = {
  channel: string;
  botUsername: string;
  oauthToken: string;
  url?: string;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
};

const DEFAULT_IRC_WS_URL = 'wss://irc-ws.chat.twitch.tv:443';

function normalizeChannel(channel: string) {
  return channel.trim().toLowerCase().replace(/^#/, '');
}

function normalizeOauthToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('oauth:') ? trimmed : `oauth:${trimmed}`;
}

function createAnonymousNick() {
  return `justinfan${Math.floor(10000 + Math.random() * 89999)}`;
}

function parseBadges(value: string | undefined) {
  if (!value) {
    return [];
  }
  return value.split(',').map((badge) => badge.trim()).filter(Boolean);
}

function loginFromPrefix(prefix: string | undefined) {
  if (!prefix) {
    return '';
  }
  return prefix.split('!')[0]?.toLowerCase() ?? '';
}

export class TwitchIrcSource implements TwitchChatSource {
  private currentChannel: string;
  private readonly botUsername: string;
  private readonly oauthToken: string;
  private readonly url: string;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private socket: WebSocket | null = null;
  private stopped = true;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastSendAt = 0;

  constructor(
    options: TwitchIrcSourceOptions,
    private readonly handlers: TwitchChatSourceHandlers,
  ) {
    this.currentChannel = normalizeChannel(options.channel);
    this.botUsername = options.botUsername.trim().toLowerCase() || createAnonymousNick();
    this.oauthToken = normalizeOauthToken(options.oauthToken);
    this.url = options.url ?? DEFAULT_IRC_WS_URL;
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1000;
    this.reconnectMaxMs = options.reconnectMaxMs ?? 30000;
  }

  get channel() {
    return this.currentChannel;
  }

  start() {
    if (!this.currentChannel) {
      this.handlers.onStatus({
        level: 'error',
        message: 'Twitch IRC needs TWITCH_CHANNEL.',
      });
      return;
    }

    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  sendMessage(text: string) {
    const content = text.replace(/\s+/g, ' ').trim();
    if (!content || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    if (!this.oauthToken) {
      this.handlers.onStatus({
        level: 'warning',
        message: 'Anonymous Twitch IRC is read-only; skipping chat send.',
      });
      return;
    }

    const now = Date.now();
    const waitMs = Math.max(0, 1500 - (now - this.lastSendAt));
    this.lastSendAt = now + waitMs;
    setTimeout(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.sendRaw(`PRIVMSG #${this.currentChannel} :${content.slice(0, 450)}`);
      }
    }, waitMs);
  }

  switchChannel(channel: string) {
    const nextChannel = normalizeChannel(channel);
    if (!nextChannel || nextChannel === this.currentChannel) {
      return;
    }

    const previousChannel = this.currentChannel;
    this.currentChannel = nextChannel;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendRaw(`PART #${previousChannel}`);
      this.sendRaw(`JOIN #${this.currentChannel}`);
    }
    this.handlers.onStatus({
      level: 'info',
      message: `Twitch IRC channel switched from #${previousChannel} to #${this.currentChannel}.`,
    });
  }

  private connect() {
    if (this.stopped) {
      return;
    }

    this.socket = new WebSocket(this.url);
    this.socket.on('open', () => {
      this.reconnectAttempts = 0;
      this.handlers.onStatus({
        level: 'info',
        message: `Connected to Twitch IRC for #${this.currentChannel} as ${this.botUsername}${this.oauthToken ? '' : ' (anonymous read-only)'}.`,
      });
      this.sendRaw('CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands');
      if (this.oauthToken) {
        this.sendRaw(`PASS ${this.oauthToken}`);
      }
      this.sendRaw(`NICK ${this.botUsername}`);
      this.sendRaw(`JOIN #${this.currentChannel}`);
    });

    this.socket.on('message', (payload) => {
      const data = typeof payload === 'string' ? payload : payload.toString('utf8');
      this.handleData(data);
    });

    this.socket.on('close', () => {
      this.handlers.onStatus({
        level: this.stopped ? 'info' : 'warning',
        message: this.stopped ? 'Twitch IRC stopped.' : 'Twitch IRC disconnected; reconnecting.',
      });
      this.socket = null;
      this.scheduleReconnect();
    });

    this.socket.on('error', (error) => {
      this.handlers.onStatus({
        level: 'error',
        message: `Twitch IRC socket error: ${error.message}`,
      });
    });
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(
      this.reconnectBaseMs * 2 ** Math.min(this.reconnectAttempts, 6),
      this.reconnectMaxMs,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private handleData(data: string) {
    for (const frame of splitIrcFrames(data)) {
      const parsed = parseIrcMessage(frame);
      if (!parsed) {
        continue;
      }

      if (parsed.command === 'PING') {
        this.sendRaw(`PONG :${parsed.trailing ?? 'tmi.twitch.tv'}`);
        continue;
      }

      if (parsed.command === 'NOTICE' && parsed.trailing) {
        this.handlers.onStatus({
          level: parsed.trailing.toLowerCase().includes('failed') ? 'error' : 'warning',
          message: `Twitch IRC notice: ${parsed.trailing}`,
        });
        continue;
      }

      if (parsed.command !== 'PRIVMSG') {
        continue;
      }

      const user = loginFromPrefix(parsed.prefix);
      const text = parsed.trailing?.trim() ?? '';
      if (!user || !text) {
        continue;
      }

      const badges = parseBadges(parsed.tags.badges);
      this.handlers.onMessage({
        id: parsed.tags.id || `irc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        user,
        displayName: parsed.tags['display-name'] || user,
        text,
        timestamp: Date.now(),
        badges,
        isMod: parsed.tags.mod === '1' || badges.some((badge) => badge.startsWith('moderator/')),
        isBroadcaster: user === this.currentChannel || badges.some((badge) => badge.startsWith('broadcaster/')),
      });
    }
  }

  private sendRaw(line: string) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(`${line}\r\n`);
    }
  }
}
