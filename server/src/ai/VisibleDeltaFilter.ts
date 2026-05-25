import type { ChatProviderRequest } from './ChatProvider.js';

const ASSISTANT_METADATA_DELIMITERS = [
  { open: '<yw-meta>', close: '</yw-meta>' },
  { open: '<hidden block>', close: '</hidden block>' },
  { open: '<hidden-block>', close: '</hidden-block>' },
] as const;

function responseFormatHasMessageField(value: ChatProviderRequest['responseFormat']) {
  if (!value || value.type !== 'json_schema') {
    return false;
  }
  const properties = (value.schema as { properties?: unknown }).properties;
  return Boolean(
    properties &&
      typeof properties === 'object' &&
      typeof (properties as Record<string, unknown>).message === 'object',
  );
}

function createJsonMessageDeltaFilter() {
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
    flush() {
      return '';
    },
  };
}

function createMetadataDeltaFilter() {
  let buffer = '';
  let suppressing = false;
  let activeCloseTag: string = ASSISTANT_METADATA_DELIMITERS[0].close;

  const safeLength = (value: string) => {
    const maxTail = Math.max(
      ...ASSISTANT_METADATA_DELIMITERS.map((delimiter) => delimiter.open.length - 1),
    );
    for (let tail = Math.min(maxTail, value.length); tail > 0; tail -= 1) {
      const suffix = value.slice(value.length - tail);
      if (ASSISTANT_METADATA_DELIMITERS.some((delimiter) => delimiter.open.startsWith(suffix))) {
        return value.length - tail;
      }
    }
    return value.length;
  };

  const findNextOpen = (value: string) => {
    let match: { close: string; index: number; open: string } | null = null;
    for (const delimiter of ASSISTANT_METADATA_DELIMITERS) {
      const index = value.indexOf(delimiter.open);
      if (index === -1 || (match && index >= match.index)) {
        continue;
      }
      match = { close: delimiter.close, index, open: delimiter.open };
    }
    return match;
  };

  return {
    push(delta: string) {
      buffer += delta;
      let visible = '';
      while (buffer) {
        if (suppressing) {
          const closeIndex = buffer.indexOf(activeCloseTag);
          if (closeIndex === -1) {
            buffer = '';
            break;
          }
          buffer = buffer.slice(closeIndex + activeCloseTag.length);
          suppressing = false;
          activeCloseTag = ASSISTANT_METADATA_DELIMITERS[0].close;
          continue;
        }

        const openMatch = findNextOpen(buffer);
        if (openMatch) {
          visible += buffer.slice(0, openMatch.index);
          buffer = buffer.slice(openMatch.index + openMatch.open.length);
          suppressing = true;
          activeCloseTag = openMatch.close;
          continue;
        }

        const length = safeLength(buffer);
        if (length === 0) {
          break;
        }
        visible += buffer.slice(0, length);
        buffer = buffer.slice(length);
      }
      return visible;
    },
    flush() {
      if (suppressing) {
        buffer = '';
        suppressing = false;
        return '';
      }
      const visible = buffer;
      buffer = '';
      return visible;
    },
  };
}

export function createAiVisibleDeltaFilter(responseFormat: ChatProviderRequest['responseFormat']) {
  const metadataFilter = createMetadataDeltaFilter();
  const jsonMessageFilter = createJsonMessageDeltaFilter();
  let mode: 'unknown' | 'metadata' | 'json' = responseFormatHasMessageField(responseFormat)
    ? 'json'
    : 'unknown';
  let probe = '';

  return {
    push(delta: string) {
      if (!delta) {
        return '';
      }
      if (mode === 'json') {
        return jsonMessageFilter.push(delta);
      }
      if (mode === 'metadata') {
        return metadataFilter.push(delta);
      }

      probe += delta;
      const trimmedStart = probe.trimStart();
      if (!trimmedStart) {
        return '';
      }
      if (trimmedStart.startsWith('{')) {
        mode = 'json';
        const leadingWhitespaceLength = probe.length - trimmedStart.length;
        const payload = probe.slice(leadingWhitespaceLength);
        probe = '';
        return jsonMessageFilter.push(payload);
      }

      mode = 'metadata';
      const payload = probe;
      probe = '';
      return metadataFilter.push(payload);
    },
    flush() {
      if (mode === 'json') {
        return jsonMessageFilter.flush();
      }
      if (mode === 'metadata') {
        return metadataFilter.flush();
      }
      const payload = probe;
      probe = '';
      return payload.trimStart().startsWith('{')
        ? jsonMessageFilter.push(payload) + jsonMessageFilter.flush()
        : metadataFilter.push(payload) + metadataFilter.flush();
    },
  };
}

export function getSafeFinalVisibleText(
  text: string,
  responseFormat: ChatProviderRequest['responseFormat'],
) {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  if (!trimmed.startsWith('{')) {
    return trimmed;
  }
  const filter = createJsonMessageDeltaFilter();
  return `${filter.push(trimmed)}${filter.flush()}`.trim();
}
