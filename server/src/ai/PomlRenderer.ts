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

function stringifyPomlContent(content: RichContent) {
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content);
}

function normalizePromptText(text: string) {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
