import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderYourWifeyPomlMessages } from '../../../server/src/ai/PomlRenderer';
import { createDefaultRelationshipMemory, DEFAULT_PERSONA } from './defaults';
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
    expect(YOURWIFEY_POML_TEMPLATE).toContain(
      '<system-msg name="responses-instructions" syntax="markdown" whiteSpace="pre">',
    );
    expect(YOURWIFEY_POML_TEMPLATE).toContain('<let');
    expect(YOURWIFEY_POML_TEMPLATE).toContain('name="response_priorities"');
    expect(YOURWIFEY_POML_TEMPLATE).toContain('caption="Relationship Dynamics"');
    expect(YOURWIFEY_POML_TEMPLATE).toContain('caption="Grillo Context Packet"');
    expect(YOURWIFEY_POML_TEMPLATE).toContain('<human-msg name="current-turn"');
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
      semanticMemoryContext: 'Prior note: use OpenAI Responses state keys carefully.',
      turnContext: {
        channel: 'subsect',
        intakePolicy: 'activeChatters > 10; @mentions disabled; batch every 10 messages',
        source: 'twitch',
        turnKind: 'batch',
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
    expect(systemMessage.content).toContain('# Prompt State');
    expect(systemMessage.content).toContain('relationship_mood: teasing');
    expect(systemMessage.content).toContain('# Response Priority Stack');
    expect(systemMessage.content).toContain('# Style Controls');
    expect(systemMessage.content).toContain('# Conditional Conversation Mode');
    expect(systemMessage.content).toContain('Twitch mode is active');
    expect(systemMessage.content).toContain('Batch mode is active');
    expect(systemMessage.content).toContain('# Relationship Dynamics');
    expect(systemMessage.content).toContain('Familiar relationship');
    expect(systemMessage.content).toContain('Guarded state');
    expect(systemMessage.content).toContain('# Tool Policy');
    expect(systemMessage.content).toContain('You are Hikari');
    expect(systemMessage.content).toContain('Subsect');
    expect(systemMessage.content).toContain('Speech expression tags are enabled');
    expect(systemMessage.content).toContain('# Turn Metadata');
    expect(systemMessage.content).toContain('"source":"twitch"');
    expect(systemMessage.content).toContain('"channel":"subsect"');
    expect(systemMessage.content).toContain('"turnKind":"batch"');
    expect(systemMessage.content).toContain('"intakePolicy"');
    expect(systemMessage.content).toContain('direct tagged reply or a balanced batch response');
    expect(systemMessage.content).toContain('<yw-meta>');
    expect(systemMessage.content).toContain('Available animation: little-wave [wave-01]');
    expect(systemMessage.content).toContain('# Animation Selection Policy');
    expect(systemMessage.content).toContain('# Grillo Context Packet');
    expect(systemMessage.content).toContain('## relationship_memory');
    expect(systemMessage.content).toContain('known_facts=["likes POML"]');
    expect(systemMessage.content).toContain('## recalled_memories');
    expect(systemMessage.content).toContain(
      'Prior note: use OpenAI Responses state keys carefully.',
    );
    expect(systemMessage.content).toContain('# Semantic Memory Usage');
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

  it('renders the current Twitch turn as a POML human message', async () => {
    const messages = await buildChatCompletionMessages({
      currentTurnContext: [
        'Live Twitch chat mode: balanced batch for Hikari.',
        'Current batch:',
        '- Subsect: @Hikari test the batch',
        '  metadata: login=subsect display=SUBSECT broadcaster=true mod=false badges=broadcaster/1 sentAt=2026-05-13T09:00:00.000Z',
      ].join('\n'),
      history: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'I am listening.',
          createdAt: 1,
        },
      ],
      persona: DEFAULT_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
      channelHistory: [
        {
          id: 'tw-1',
          source: 'twitch',
          channel: 'subsect',
          login: 'subsect',
          displayName: 'Subsect',
          text: '@Hikari test the batch',
          timestamp: Date.parse('2026-05-13T09:00:00.000Z'),
          badges: ['broadcaster/1'],
          isMod: false,
          isBroadcaster: true,
          isLocal: false,
          isTrustedController: true,
        },
      ],
      turnContext: {
        channel: 'subsect',
        source: 'twitch',
        turnKind: 'batch',
      },
    });

    expect(messages.slice(1)).toEqual([
      {
        role: 'assistant',
        content: 'I am listening.',
      },
      {
        role: 'user',
        content: expect.stringContaining('Live Twitch chat mode: balanced batch for Hikari.'),
      },
    ]);
    expect(messages[2]?.content).toContain('metadata: login=subsect');
    expect(messages[0]?.content).toContain('## channel_history');
    expect(messages[0]?.content).toContain('Subsect: @Hikari test the batch');
  });

  it('renders local chat as a participant transcript turn instead of legacy sole user', async () => {
    const messages = await buildChatCompletionMessages({
      currentTurnContext: [
        'Local chat mode: direct queue for Hikari.',
        'Current queued message:',
        '- Subby: @Hikari hello from the local box',
        '  metadata: source=local channel=local login=subby display=Subby local=true trustedController=true',
      ].join('\n'),
      history: [],
      persona: {
        ...DEFAULT_PERSONA,
        name: 'Hikari',
        userNickname: 'Subby',
      },
      relationshipMemory: createDefaultRelationshipMemory(),
      channelHistory: [
        {
          id: 'local-1',
          source: 'local',
          channel: 'local',
          login: 'subby',
          displayName: 'Subby',
          text: '@Hikari hello from the local box',
          timestamp: Date.parse('2026-05-13T09:00:00.000Z'),
          badges: ['local-controller'],
          isMod: true,
          isBroadcaster: true,
          isLocal: true,
          isTrustedController: true,
        },
      ],
      turnContext: {
        conversationScope: 'local-chat',
        currentTurnText: 'Local viewer Subby: @Hikari hello from the local box',
        displayName: 'Subby',
        isLocal: true,
        isTrustedController: true,
        source: 'local',
        turnKind: 'direct',
      },
    });

    expect(messages[0]?.content).toContain('source: local');
    expect(messages[0]?.content).toContain('speaker: Subby');
    expect(messages[0]?.content).toContain('interface_path: local/subby');
    expect(messages[0]?.content).toContain('local=true');
    expect(messages[1]?.role).toBe('user');
    expect(messages[1]?.content).toContain('Local chat mode: direct queue for Hikari.');
    expect(messages[1]?.content).toContain('trustedController=true');
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
      persona: DEFAULT_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
    });
    const systemMessage = messages[0];
    if (!systemMessage) {
      throw new Error('Expected a POML-rendered system message.');
    }

    expect(systemMessage.content).toContain('# Tool Policy');
    expect(systemMessage.content).toContain('# Prompt State');
    expect(systemMessage.content).toContain('# Relationship Dynamics');
    expect(systemMessage.content).toContain('New relationship');
    expect(systemMessage.content).toContain('# Turn Metadata');
    expect(systemMessage.content).toContain('# Grillo Context Packet');
    expect(systemMessage.content).not.toContain('# Speech and TTS');
    expect(systemMessage.content).not.toContain('# Avatar Animation Catalog');
    expect(systemMessage.content).not.toContain('# Relationship Memory');
    expect(systemMessage.content).not.toContain('# Relevant Semantic Memory');
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
      persona: DEFAULT_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
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
