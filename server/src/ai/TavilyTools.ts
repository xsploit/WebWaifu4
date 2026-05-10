export type OpenAiFunctionTool = {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
};

export type OpenAiFunctionCall = {
  type?: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
};

export type TavilyToolOptions = {
  apiKey: string;
  searchDepth: 'basic' | 'advanced';
  maxResults: number;
  crawlLimit?: number;
  timeoutMs: number;
  fetcher?: typeof fetch;
};

type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
  favicon?: string;
};

type TavilySearchResponse = {
  answer?: string;
  query?: string;
  results?: TavilySearchResult[];
  usage?: unknown;
};

type TavilyExtractResult = {
  url?: string;
  title?: string;
  raw_content?: string;
  content?: string;
  images?: string[];
  favicon?: string;
};

type TavilyExtractResponse = {
  results?: TavilyExtractResult[];
  failed_results?: unknown[];
  usage?: unknown;
};

type TavilyCrawlResponse = {
  base_url?: string;
  results?: TavilyExtractResult[];
  response_time?: number;
  usage?: unknown;
  request_id?: string;
};

const MAX_TOOL_OUTPUT_CHARS = 8000;
const MAX_EXTRACT_CHARS_PER_URL = 6000;

export const TAVILY_OPENAI_TOOLS: OpenAiFunctionTool[] = [
  {
    type: 'function',
    name: 'web_search',
    description:
      'Search the web for current or external information. Use this only when the answer depends on recent, specific, or source-backed facts.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The concise web search query.',
        },
        max_results: {
          type: 'integer',
          description: 'Number of results to return. Defaults to server settings.',
          minimum: 1,
          maximum: 8,
        },
        search_depth: {
          type: 'string',
          enum: ['basic', 'advanced'],
          description: 'Use basic unless the query needs deeper research.',
        },
        topic: {
          type: 'string',
          enum: ['general', 'news', 'finance'],
          description: 'Search vertical.',
        },
        time_range: {
          type: ['string', 'null'],
          enum: ['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y', null],
          description: 'Optional recency filter.',
        },
        include_domains: {
          type: ['array', 'null'],
          items: { type: 'string' },
          description: 'Optional domains to include.',
        },
        exclude_domains: {
          type: ['array', 'null'],
          items: { type: 'string' },
          description: 'Optional domains to exclude.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'crawl_site',
    description:
      'Crawl a small website section to find and extract multiple related pages. Use for docs or site exploration, not for broad web search.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Root http or https URL to begin crawling.',
        },
        instructions: {
          type: ['string', 'null'],
          description:
            'Optional natural-language crawl goal. This can cost more, so keep it concise.',
        },
        max_depth: {
          type: 'integer',
          description: 'Crawl depth. Server caps this tightly.',
          minimum: 1,
          maximum: 2,
        },
        limit: {
          type: 'integer',
          description: 'Maximum pages to process. Server caps this tightly.',
          minimum: 1,
          maximum: 10,
        },
        select_paths: {
          type: ['array', 'null'],
          items: { type: 'string' },
          description: 'Optional regex path filters, such as /docs/.*.',
        },
        exclude_paths: {
          type: ['array', 'null'],
          items: { type: 'string' },
          description: 'Optional regex path exclusions.',
        },
        allow_external: {
          type: 'boolean',
          description: 'Whether to include external links in final results. Defaults false here.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'open_url',
    description:
      'Extract readable text from one URL when chat asks about a specific page or a search result needs inspection.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Fully-qualified http or https URL to extract.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
];

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function pickSearchDepth(value: unknown, fallback: 'basic' | 'advanced') {
  return value === 'advanced' ? 'advanced' : fallback;
}

function pickTopic(value: unknown) {
  return value === 'news' || value === 'finance' ? value : 'general';
}

function pickTimeRange(value: unknown) {
  return ['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'].includes(String(value))
    ? String(value)
    : undefined;
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const cleaned = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 8);
  return cleaned.length > 0 ? cleaned : undefined;
}

function parseArgs(call: OpenAiFunctionCall) {
  if (!call.arguments?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(call.arguments) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function truncateText(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(0, limit - 32)).trimEnd()}\n[truncated]`;
}

function stringifyToolResult(value: unknown) {
  return truncateText(JSON.stringify(value), MAX_TOOL_OUTPUT_CHARS);
}

async function postTavilyJson(
  options: TavilyToolOptions,
  endpoint: 'search' | 'extract' | 'crawl',
  body: Record<string, unknown>,
) {
  const timeout = createTimeoutSignal(options.timeoutMs);
  try {
    const response = await (options.fetcher ?? fetch)(`https://api.tavily.com/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        ok: false,
        error: `Tavily ${endpoint} failed with HTTP ${response.status}.`,
        detail: text.slice(0, 500),
      };
    }

    return {
      ok: true,
      data: (await response.json()) as unknown,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error && error.name === 'AbortError'
          ? `Tavily ${endpoint} timed out.`
          : `Tavily ${endpoint} request failed.`,
    };
  } finally {
    timeout.clear();
  }
}

async function runWebSearch(options: TavilyToolOptions, args: Record<string, unknown>) {
  const query = typeof args['query'] === 'string' ? args['query'].trim() : '';
  if (!query) {
    return stringifyToolResult({ ok: false, error: 'query is required' });
  }

  const maxResults = clampInteger(args['max_results'], options.maxResults, 1, 8);
  const body: Record<string, unknown> = {
    query,
    search_depth: pickSearchDepth(args['search_depth'], options.searchDepth),
    topic: pickTopic(args['topic']),
    max_results: maxResults,
    include_answer: 'basic',
    include_raw_content: false,
    include_images: false,
    include_favicon: true,
    include_usage: true,
  };
  const timeRange = pickTimeRange(args['time_range']);
  const includeDomains = cleanStringArray(args['include_domains']);
  const excludeDomains = cleanStringArray(args['exclude_domains']);
  if (timeRange) {
    body.time_range = timeRange;
  }
  if (includeDomains) {
    body.include_domains = includeDomains;
  }
  if (excludeDomains) {
    body.exclude_domains = excludeDomains;
  }

  const result = await postTavilyJson(options, 'search', body);
  if (!result.ok) {
    return stringifyToolResult(result);
  }

  const data = result.data as TavilySearchResponse;
  return stringifyToolResult({
    ok: true,
    query: data.query ?? query,
    answer: data.answer ?? '',
    results: (data.results ?? []).slice(0, maxResults).map((item) => ({
      title: item.title ?? '',
      url: item.url ?? '',
      content: item.content ?? '',
      score: item.score,
      published_date: item.published_date,
      favicon: item.favicon,
    })),
    usage: data.usage,
  });
}

async function runOpenUrl(options: TavilyToolOptions, args: Record<string, unknown>) {
  const rawUrl = typeof args['url'] === 'string' ? args['url'].trim() : '';
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return stringifyToolResult({ ok: false, error: 'url must be a valid absolute URL' });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return stringifyToolResult({ ok: false, error: 'url must use http or https' });
  }

  const result = await postTavilyJson(options, 'extract', {
    urls: [url.toString()],
    extract_depth: 'basic',
    format: 'markdown',
    include_images: false,
    include_favicon: true,
    timeout: Math.ceil(options.timeoutMs / 1000),
    include_usage: true,
  });
  if (!result.ok) {
    return stringifyToolResult(result);
  }

  const data = result.data as TavilyExtractResponse;
  return stringifyToolResult({
    ok: true,
    results: (data.results ?? []).map((item) => ({
      url: item.url ?? url.toString(),
      title: item.title ?? '',
      content: truncateText(item.raw_content ?? item.content ?? '', MAX_EXTRACT_CHARS_PER_URL),
      favicon: item.favicon,
    })),
    failed_results: data.failed_results ?? [],
    usage: data.usage,
  });
}

async function runCrawlSite(options: TavilyToolOptions, args: Record<string, unknown>) {
  const rawUrl = typeof args['url'] === 'string' ? args['url'].trim() : '';
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return stringifyToolResult({ ok: false, error: 'url must be a valid absolute URL' });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return stringifyToolResult({ ok: false, error: 'url must use http or https' });
  }

  const instructions =
    typeof args['instructions'] === 'string' ? args['instructions'].trim().slice(0, 300) : '';
  const body: Record<string, unknown> = {
    url: url.toString(),
    max_depth: clampInteger(args['max_depth'], 1, 1, 2),
    max_breadth: 20,
    limit: clampInteger(args['limit'], options.crawlLimit ?? 8, 1, Math.min(options.crawlLimit ?? 8, 10)),
    allow_external: args['allow_external'] === true,
    include_images: false,
    extract_depth: 'basic',
    format: 'markdown',
    include_favicon: true,
    timeout: Math.min(150, Math.max(10, Math.ceil(options.timeoutMs / 1000))),
    include_usage: true,
  };
  if (instructions) {
    body.instructions = instructions;
    body.chunks_per_source = 3;
  }
  const selectPaths = cleanStringArray(args['select_paths']);
  const excludePaths = cleanStringArray(args['exclude_paths']);
  if (selectPaths) {
    body.select_paths = selectPaths;
  }
  if (excludePaths) {
    body.exclude_paths = excludePaths;
  }

  const result = await postTavilyJson(options, 'crawl', body);
  if (!result.ok) {
    return stringifyToolResult(result);
  }

  const data = result.data as TavilyCrawlResponse;
  return stringifyToolResult({
    ok: true,
    base_url: data.base_url ?? url.hostname,
    results: (data.results ?? []).slice(0, options.crawlLimit ?? 8).map((item) => ({
      url: item.url ?? '',
      title: item.title ?? '',
      content: truncateText(item.raw_content ?? item.content ?? '', 1800),
      favicon: item.favicon,
    })),
    response_time: data.response_time,
    usage: data.usage,
    request_id: data.request_id,
  });
}

export async function runTavilyToolCall(options: TavilyToolOptions, call: OpenAiFunctionCall) {
  const args = parseArgs(call);
  if (call.name === 'web_search') {
    return runWebSearch(options, args);
  }
  if (call.name === 'crawl_site') {
    return runCrawlSite(options, args);
  }
  if (call.name === 'open_url') {
    return runOpenUrl(options, args);
  }
  return stringifyToolResult({ ok: false, error: `Unknown tool ${call.name ?? 'unknown'}` });
}
