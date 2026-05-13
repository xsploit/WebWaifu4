import { describe, expect, it } from 'vitest';
import { renderYourWifeyPomlMessages } from './PomlRenderer';

describe('PomlRenderer', () => {
  it('renders the YourWifey template with the fixed pomljs parser', async () => {
    const messages = await renderYourWifeyPomlMessages({
      animation_catalog_context: 'Available animation if mood_points < 8 && mood_points > 2',
      diary_context: '',
      host_context: '',
      persona_context: 'You are Hikari. Stay in character.',
      relationship_memory_context: 'Known user facts: ["likes POML"]',
      reply_metadata_instruction: '<yw-meta>{"emotion":"neutral"}</yw-meta>',
      semantic_memory_context: '',
      turn_metadata_context: 'Turn metadata: {"source":"twitch"}',
      tts_context: '',
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: 'system' });
    expect(messages[0]?.content).toContain('You are Hikari');
    expect(messages[0]?.content).toContain('mood_points < 8 && mood_points > 2');
    expect(messages[0]?.content).toContain('<yw-meta>');
    expect(messages[0]?.content).not.toContain('{{');
  });

  it('supports patched POML condition expressions and tool policy blocks', async () => {
    const messages = await renderYourWifeyPomlMessages(
      {
        mood_points: '4',
      },
      `<poml>
        <system-msg>
          <tool-policy>Use web_search only when fresh data would help.</tool-policy>
          <if condition="{{ mood_points < 8 && mood_points > 2 }}">
            Conditional Twitch context is enabled.
          </if>
        </system-msg>
      </poml>`,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toContain('Use web_search only when fresh data would help.');
    expect(messages[0]?.content).toContain('Conditional Twitch context is enabled.');
  });
});
