import { readFileSync } from 'node:fs';
import path from 'node:path';
import { read, write } from 'pomljs';
import type { Message, RichContent } from 'pomljs';

type PromptRole = 'system' | 'user' | 'assistant';

export type PomlPromptMessage = {
  role: PromptRole;
  content: string;
};

export type PomlRenderVariables = Record<string, string>;
export type PomlRenderResponse =
  | {
      messages: PomlPromptMessage[];
      ok: true;
    }
  | {
      error: string;
      ok: false;
    };

let cachedTemplate: string | null = null;

export function normalizePomlRenderVariables(value: unknown): PomlRenderVariables {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => /^[a-zA-Z0-9_]+$/.test(key))
      .map(([key, variableValue]) => [key, String(variableValue ?? '').slice(0, 16000)]),
  );
}

export async function renderYourWifeyPomlMessages(
  variables: PomlRenderVariables,
  template = loadYourWifeyPomlTemplate(),
): Promise<PomlPromptMessage[]> {
  const ir = await read(template, undefined, variables);
  return write(ir, { speaker: true })
    .map(toPromptMessage)
    .filter((message) => message.content.trim());
}

export async function renderYourWifeyPomlResponse(variables: unknown): Promise<PomlRenderResponse> {
  try {
    return {
      messages: await renderYourWifeyPomlMessages(normalizePomlRenderVariables(variables)),
      ok: true,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'POML render failed.',
    };
  }
}

function loadYourWifeyPomlTemplate() {
  cachedTemplate ??= readFileSync(
    path.resolve(process.cwd(), 'src/lib/chat/templates/yourwifey-responses.poml'),
    'utf8',
  );
  return cachedTemplate;
}

function toPromptMessage(message: Message): PomlPromptMessage {
  return {
    role: toPromptRole(message.speaker),
    content: normalizePromptText(stringifyPomlContent(message.content)),
  };
}

function toPromptRole(speaker: string): PromptRole {
  if (speaker === 'human') {
    return 'user';
  }
  if (speaker === 'ai') {
    return 'assistant';
  }
  return 'system';
}

function stringifyPomlContent(content: RichContent): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(stringifyRichContentPart).filter(Boolean).join('\n');
  }
  return stringifyRichContentPart(content);
}

function stringifyRichContentPart(content: unknown): string {
  if (content === null || content === undefined) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (typeof content === 'number' || typeof content === 'boolean') {
    return String(content);
  }
  if (Array.isArray(content)) {
    return content.map(stringifyRichContentPart).filter(Boolean).join('\n');
  }
  if (typeof content !== 'object') {
    return '';
  }

  const record = content as Record<string, unknown>;
  const type = typeof record['type'] === 'string' ? record['type'].toLowerCase() : '';
  const childContent =
    record['children'] ??
    record['content'] ??
    record['contents'] ??
    record['value'] ??
    record['text'];
  const text = stringifyRichContentPart(childContent).trim();

  if (type === 'item' || type === 'listitem' || type === 'li') {
    return text
      .split('\n')
      .map((line, index) => (index === 0 ? `- ${line}` : `  ${line}`))
      .join('\n');
  }
  if (type === 'list' || type === 'ul' || type === 'ol') {
    return stringifyRichContentPart(childContent);
  }
  if (text) {
    return text;
  }

  const values = Object.entries(record)
    .filter(([key]) => !['type', 'speaker', 'role'].includes(key))
    .map(([, value]) => stringifyRichContentPart(value).trim())
    .filter(Boolean);
  return values.join('\n');
}

function normalizePromptText(text: string) {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
