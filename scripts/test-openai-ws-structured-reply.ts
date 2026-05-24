import 'dotenv/config';
import WebSocket from 'ws';

type Args = {
  debug: boolean;
  maxOutputTokens: number;
  model: string;
  reasoning: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  text: string;
  url: string;
};

const REPLY_FORMAT = {
  type: 'json_schema',
  name: 'yourwifey_assistant_reply',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Natural spoken dialogue to show and speak. TTS tags like [pause] are allowed.',
      },
      emotion: {
        type: 'string',
        enum: [
          'neutral',
          'amused',
          'happy',
          'excited',
          'curious',
          'confused',
          'thinking',
          'surprised',
          'angry',
          'annoyed',
          'embarrassed',
          'grateful',
          'optimistic',
          'proud',
          'nervous',
          'sad',
          'caring',
        ],
        description: 'The single emotion felt toward the current message. This is not an animation name.',
      },
    },
    required: ['message', 'emotion'],
    additionalProperties: false,
  },
} as const;

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const read = (name: string, fallback = '') => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
  };
  const reasoning = read('reasoning', 'minimal');
  if (!['none', 'minimal', 'low', 'medium', 'high'].includes(reasoning)) {
    throw new Error('Invalid --reasoning value. Use none, minimal, low, medium, or high.');
  }
  return {
    debug: args.includes('--debug'),
    maxOutputTokens: Number(read('max-output-tokens', '1000')),
    model: read('model', process.env.OPENAI_MODEL || 'gpt-5-nano'),
    reasoning: reasoning as Args['reasoning'],
    text: read('text', 'Give me one short playful line and include a [pause] tag.'),
    url: read('url', process.env.OPENAI_RESPONSES_WS_URL || 'wss://api.openai.com/v1/responses'),
  };
}

function extractDeltaText(event: Record<string, unknown>) {
  if (typeof event.delta === 'string') {
    return event.delta;
  }
  if (typeof event.text === 'string' && String(event.type ?? '').toLowerCase().endsWith('.delta')) {
    return event.text;
  }
  const item = event.item;
  if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).text === 'string') {
    return (item as Record<string, unknown>).text as string;
  }
  return '';
}

function createJsonMessageExtractor() {
  let state:
    | 'start'
    | 'keyStart'
    | 'key'
    | 'colon'
    | 'valueStart'
    | 'valueString'
    | 'skipValue'
    | 'afterValue' = 'start';
  let key = '';
  let activeKey = '';
  let keyEscape = false;
  let valueEscape = false;
  let unicodeEscape = '';
  let skipString = false;
  let skipEscape = false;
  let skipDepth = 0;

  const emitEscaped = (value: string) => {
    switch (value) {
      case '"':
      case '\\':
      case '/':
        return value;
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      default:
        return value;
    }
  };

  return {
    push(delta: string) {
      let visible = '';
      for (const char of delta) {
        if (state === 'start') {
          if (/\s/.test(char)) continue;
          if (char === '{') state = 'keyStart';
          continue;
        }
        if (state === 'keyStart') {
          if (/\s|,/.test(char)) continue;
          if (char === '}') {
            state = 'afterValue';
            continue;
          }
          if (char === '"') {
            key = '';
            keyEscape = false;
            state = 'key';
          }
          continue;
        }
        if (state === 'key') {
          if (keyEscape) {
            key += emitEscaped(char);
            keyEscape = false;
            continue;
          }
          if (char === '\\') {
            keyEscape = true;
            continue;
          }
          if (char === '"') {
            activeKey = key;
            state = 'colon';
            continue;
          }
          key += char;
          continue;
        }
        if (state === 'colon') {
          if (/\s/.test(char)) continue;
          if (char === ':') state = 'valueStart';
          continue;
        }
        if (state === 'valueStart') {
          if (/\s/.test(char)) continue;
          if (char === '"') {
            valueEscape = false;
            unicodeEscape = '';
            state = 'valueString';
            continue;
          }
          skipString = false;
          skipEscape = false;
          skipDepth = char === '{' || char === '[' ? 1 : 0;
          state = 'skipValue';
          continue;
        }
        if (state === 'valueString') {
          if (unicodeEscape) {
            unicodeEscape += char;
            if (unicodeEscape.length === 4) {
              if (activeKey === 'message') {
                visible += String.fromCharCode(Number.parseInt(unicodeEscape, 16));
              }
              unicodeEscape = '';
              valueEscape = false;
            }
            continue;
          }
          if (valueEscape) {
            if (char === 'u') {
              unicodeEscape = '';
              continue;
            }
            if (activeKey === 'message') {
              visible += emitEscaped(char);
            }
            valueEscape = false;
            continue;
          }
          if (char === '\\') {
            valueEscape = true;
            continue;
          }
          if (char === '"') {
            state = 'afterValue';
            continue;
          }
          if (activeKey === 'message') {
            visible += char;
          }
          continue;
        }
        if (state === 'skipValue') {
          if (skipString) {
            if (skipEscape) {
              skipEscape = false;
            } else if (char === '\\') {
              skipEscape = true;
            } else if (char === '"') {
              skipString = false;
            }
            continue;
          }
          if (char === '"') {
            skipString = true;
            continue;
          }
          if (char === '{' || char === '[') {
            skipDepth += 1;
            continue;
          }
          if (char === '}' || char === ']') {
            skipDepth -= 1;
            if (skipDepth <= 0) {
              state = 'afterValue';
            }
            continue;
          }
          if (skipDepth === 0 && (char === ',' || char === '}')) {
            state = char === ',' ? 'keyStart' : 'afterValue';
          }
          continue;
        }
        if (state === 'afterValue') {
          if (/\s/.test(char)) continue;
          if (char === ',') {
            state = 'keyStart';
          }
        }
      }
      return visible;
    },
  };
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Set OPENAI_API_KEY before running this harness.');
  }

  const args = parseArgs();
  const extractor = createJsonMessageExtractor();
  let raw = '';
  let message = '';
  let firstRawAt = 0;
  let firstMessageAt = 0;
  const startedAt = performance.now();

  const socket = new WebSocket(args.url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error('Responses WebSocket test timed out.'));
    }, 45000);

    socket.once('open', () => {
      if (args.debug) {
        console.error(`[debug] websocket open: ${args.url}`);
      }
      const responseCreate: Record<string, unknown> = {
        type: 'response.create',
        model: args.model,
        store: false,
        instructions:
          'Return only the required JSON. The message field is spoken aloud. The emotion field is metadata.',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: args.text }],
          },
        ],
        text: { format: REPLY_FORMAT },
        max_output_tokens: args.maxOutputTokens,
      };
      if (args.reasoning !== 'none') {
        responseCreate.reasoning = { effort: args.reasoning };
      }
      socket.send(
        JSON.stringify(responseCreate),
      );
    });

    socket.on('message', (data) => {
      const event = JSON.parse(data.toString()) as Record<string, unknown>;
      if (args.debug) {
        console.error(`[debug] event: ${String(event.type ?? 'unknown')}`);
      }
      if (event.type === 'error' || event.type === 'response.failed' || event.type === 'response.incomplete') {
        clearTimeout(timeout);
        socket.close();
        reject(new Error(JSON.stringify(event)));
        return;
      }

      const delta = extractDeltaText(event);
      if (delta) {
        raw += delta;
        firstRawAt ||= performance.now();
        const visible = extractor.push(delta);
        if (visible) {
          message += visible;
          firstMessageAt ||= performance.now();
          process.stdout.write(visible);
        }
      }

      if (event.type === 'response.completed' || event.type === 'response.done') {
        clearTimeout(timeout);
        socket.close();
        resolve();
      }
    });

    socket.once('error', (error) => {
      if (args.debug) {
        console.error(`[debug] websocket error: ${error.message}`);
      }
      clearTimeout(timeout);
      reject(error);
    });

    socket.once('close', (code, reason) => {
      if (args.debug) {
        console.error(`[debug] websocket close: ${code} ${reason.toString()}`);
      }
    });
  });

  const parsed = JSON.parse(raw) as { emotion?: string; message?: string };
  const leakPattern = /[{}]|"message"|"emotion"/;
  console.log('\n\nStructured WS reply harness');
  console.table([
    {
      model: args.model,
      reasoning: args.reasoning,
      firstRawMs: firstRawAt ? Math.round(firstRawAt - startedAt) : null,
      firstMessageMs: firstMessageAt ? Math.round(firstMessageAt - startedAt) : null,
      rawChars: raw.length,
      streamedMessageChars: message.length,
      finalMessageMatches: parsed.message === message,
      emotion: parsed.emotion ?? null,
      leakedJsonToMessage: leakPattern.test(message),
    },
  ]);
  console.log('\nraw JSON:', raw);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
