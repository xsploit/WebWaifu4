import { describe, expect, it } from 'vitest';
import type { ChatProvider, ChatProviderRequest } from '../ai/ChatProvider.js';
import { ChatScheduler, type StreamBotEvent } from './ChatScheduler.js';
import type { TwitchChatMessage } from '../twitch/TwitchChatSource.js';

class CapturingProvider implements ChatProvider {
  requests: ChatProviderRequest[] = [];

  async complete(request: ChatProviderRequest) {
    this.requests.push(request);
    return { text: request.mode === 'direct' ? 'direct reply' : 'batch reply' };
  }
}

function message(user: string, text: string, timestamp: number, overrides: Partial<TwitchChatMessage> = {}): TwitchChatMessage {
  return {
    id: `${user}-${timestamp}`,
    user,
    displayName: user,
    text,
    timestamp,
    badges: [],
    isMod: false,
    isBroadcaster: false,
    ...overrides,
  };
}

function createScheduler(provider = new CapturingProvider()) {
  const events: StreamBotEvent[] = [];
  const scheduler = new ChatScheduler({
    provider,
    botAliases: ['yourwifey', 'ai'],
    globalReplyCooldownMs: 8000,
    perUserCooldownMs: 30000,
    onEvent: (event) => events.push(event),
  });
  return { scheduler, provider, events };
}

describe('ChatScheduler', () => {
  it('answers direct mentions in low chat mode', async () => {
    const { scheduler, provider, events } = createScheduler();

    await scheduler.handleMessage(message('viewer1', 'hey @yourwifey how are you?', 100000));

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.mode).toBe('direct');
    expect(events.some((event) => event.type === 'ai:reply')).toBe(true);
  });

  it('does not answer every non-mention in low chat mode', async () => {
    const { scheduler, provider } = createScheduler();

    await scheduler.handleMessage(message('viewer1', 'just vibing', 100000));

    expect(provider.requests).toHaveLength(0);
    expect(scheduler.getPendingBatchCount()).toBe(0);
  });

  it('batches once chat grows beyond ten active chatters', async () => {
    const { scheduler, provider } = createScheduler();

    for (let index = 0; index < 20; index += 1) {
      await scheduler.handleMessage(message(`viewer${index}`, `message ${index}`, 100000 + index));
    }

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.mode).toBe('batch');
    expect(provider.requests[0]?.sourceMessages).toHaveLength(10);
    expect(scheduler.getPendingBatchCount()).toBe(0);
  });

  it('uses larger batch sizes as active chatter count increases', () => {
    const { scheduler } = createScheduler();

    expect(scheduler.getBatchSize(10)).toBe(1);
    expect(scheduler.getBatchSize(25)).toBe(10);
    expect(scheduler.getBatchSize(50)).toBe(20);
    expect(scheduler.getBatchSize(100)).toBe(50);
    expect(scheduler.getBatchSize(101)).toBe(100);
  });

  it('prunes active chatters outside the rolling window', async () => {
    const { scheduler } = createScheduler();

    await scheduler.handleMessage(message('oldviewer', 'hello @ai', 100000));
    await scheduler.handleMessage(message('newviewer', 'hello', 221000));

    expect(scheduler.getActiveChatterCount(221000)).toBe(1);
  });

  it('applies per-user cooldown to direct replies', async () => {
    const { scheduler, provider } = createScheduler();

    await scheduler.handleMessage(message('viewer1', 'hello @ai', 100000));
    await scheduler.handleMessage(message('viewer1', 'again @ai', 105000));

    expect(provider.requests).toHaveLength(1);
  });
});
