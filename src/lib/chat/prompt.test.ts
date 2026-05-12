import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderYourWifeyPomlMessages } from '../../../server/src/ai/PomlRenderer';
import {
  createDefaultRelationshipMemory,
  createEmptyRuntimeContext,
  DEFAULT_PERSONA,
} from './defaults';
import { buildYourWifeyResponsesPromptPayload, YOURWIFEY_POML_TEMPLATE } from './poml';
import { buildChatCompletionMessages } from './prompt';

describe('POML-backed chat prompt', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { variables?: unknown };
        return Response.json({
          messages: await renderYourWifeyPomlMessages(
            body.variables && typeof body.variables === 'object'
              ? (body.variables as Record<string, string>)
              : {},
          ),
          ok: true,
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the checked-in Responses instructions template discoverable', () => {
    expect(YOURWIFEY_POML_TEMPLATE).toContain('<system-msg name="responses-instructions">');
  });

  it('renders persona, memory, context, metadata, and history through POML', async () => {
    const messages = await buildChatCompletionMessages({
      animationCatalogContext: 'Available animation: little-wave [wave-01]',
      history: [
        {
          id: 'old-system',
          role: 'system',
          content: 'This should not be replayed as conversation input.',
          createdAt: 1,
        },
        {
          id: 'user-1',
          role: 'user',
          content: 'Hey Hikari, remember I like POML.',
          createdAt: 2,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Obviously. I filed it under excellent taste.',
          createdAt: 3,
        },
      ],
      includeHostContext: true,
      persona: {
        ...DEFAULT_PERSONA,
        name: 'Hikari',
        userNickname: 'Subsect',
      },
      relationshipMemory: {
        ...createDefaultRelationshipMemory(),
        facts: ['likes POML'],
        lastActionTag: 'compliment',
        mood: 'teasing',
        relationshipStage: 'familiar',
        summary: 'The user is trying to make prompt templates less cursed.',
        turnCount: 9,
      },
      runtimeContext: {
        ...createEmptyRuntimeContext(),
        launchParams: {
          room: 'stream',
        },
      },
      semanticMemoryContext: 'Prior note: use OpenAI Responses state keys carefully.',
      turnContext: {
        channel: 'subsect',
        source: 'twitch',
        turnKind: 'direct',
      },
      ttsExpressionTagsEnabled: true,
      ttsProvider: 'fish-speech',
    });

    const systemMessage = messages[0];
    if (!systemMessage) {
      throw new Error('Expected a POML-rendered system message.');
    }

    expect(systemMessage.role).toBe('system');
    expect(systemMessage.content).toContain('OpenAI Responses API');
    expect(systemMessage.content).toContain('You are Hikari');
    expect(systemMessage.content).toContain('Subsect');
    expect(systemMessage.content).toContain('Speech expression tags are enabled');
    expect(systemMessage.content).toContain('Turn Metadata:');
    expect(systemMessage.content).toContain('"source":"twitch"');
    expect(systemMessage.content).toContain('"channel":"subsect"');
    expect(systemMessage.content).toContain('"turnKind":"direct"');
    expect(systemMessage.content).toContain('<yw-meta>');
    expect(systemMessage.content).toContain('Available animation: little-wave [wave-01]');
    expect(systemMessage.content).toContain('launchParams: {"room":"stream"}');
    expect(systemMessage.content).toContain('Known user facts: ["likes POML"]');
    expect(systemMessage.content).toContain(
      'Prior note: use OpenAI Responses state keys carefully.',
    );
    expect(systemMessage.content).not.toContain('{{');
    expect(messages.slice(1)).toEqual([
      {
        role: 'user',
        content: 'Hey Hikari, remember I like POML.',
      },
      {
        role: 'assistant',
        content: 'Obviously. I filed it under excellent taste.',
      },
    ]);
  });

  it('omits optional POML sections when they have no useful context', async () => {
    const messages = await buildChatCompletionMessages({
      history: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Say hi to Twitch.',
          createdAt: 1,
        },
      ],
      includeHostContext: false,
      persona: DEFAULT_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
      runtimeContext: createEmptyRuntimeContext(),
    });
    const systemMessage = messages[0];
    if (!systemMessage) {
      throw new Error('Expected a POML-rendered system message.');
    }

    expect(systemMessage.content).toContain('Tool Policy:');
    expect(systemMessage.content).toContain('Turn Metadata:');
    expect(systemMessage.content).not.toContain('Speech and TTS:');
    expect(systemMessage.content).not.toContain('Animation Catalog:');
    expect(systemMessage.content).not.toContain('Host Context:');
    expect(systemMessage.content).not.toContain('Relationship Memory:');
    expect(systemMessage.content).not.toContain('Relevant Semantic Memory:');
  });

  it('splits the rendered prompt into Responses instructions and input', async () => {
    const messages = await buildChatCompletionMessages({
      history: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Say hi to Twitch.',
          createdAt: 1,
        },
      ],
      includeHostContext: false,
      persona: DEFAULT_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
      runtimeContext: createEmptyRuntimeContext(),
    });
    const systemMessage = messages[0];
    if (!systemMessage) {
      throw new Error('Expected a POML-rendered system message.');
    }

    const payload = buildYourWifeyResponsesPromptPayload(messages);

    expect(payload.instructions).toBe(systemMessage.content);
    expect(payload.input).toEqual([
      {
        role: 'user',
        content: 'Say hi to Twitch.',
      },
    ]);
  });
});
