import {
  DEFAULT_MEMORY_AGENT_MODEL,
  DEFAULT_AI_GATEWAY_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
} from './defaults';
import type { AiSettings, LlmProvider } from './types';

export type AiProviderSwitchDefaults = Pick<
  AiSettings,
  'aiTransportMode' | 'memoryAgentModel' | 'model' | 'openAiStateMode'
>;

export function getAiProviderSwitchDefaults(llmProvider: LlmProvider): AiProviderSwitchDefaults {
  if (llmProvider === 'openrouter-responses') {
    return {
      aiTransportMode: 'http-stream',
      memoryAgentModel: DEFAULT_OPENROUTER_MODEL,
      model: DEFAULT_OPENROUTER_MODEL,
      openAiStateMode: 'stateless',
    };
  }
  if (llmProvider === 'vercel-gateway') {
    return {
      aiTransportMode: 'http-stream',
      memoryAgentModel: DEFAULT_AI_GATEWAY_MODEL,
      model: DEFAULT_AI_GATEWAY_MODEL,
      openAiStateMode: 'stateless',
    };
  }
  return {
    aiTransportMode: 'http-stream',
    memoryAgentModel: DEFAULT_MEMORY_AGENT_MODEL,
    model: DEFAULT_OPENAI_MODEL,
    openAiStateMode: 'stateless',
  };
}

export function getProviderFallbackModels(llmProvider: LlmProvider): string[] {
  const defaults = getAiProviderSwitchDefaults(llmProvider);
  return Array.from(new Set([defaults.model, defaults.memoryAgentModel])).filter(Boolean);
}

export function isPremiumCostModelId(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  const parts = normalized.split('/');
  const provider = parts.length > 1 ? parts[0] : '';
  const leaf = (normalized.split('/').pop() ?? normalized).replace(/_/g, '.');
  const isOpenAiModel = !provider || provider === 'openai';
  const isO1Model =
    leaf === 'o1' ||
    leaf.startsWith('o1-') ||
    leaf.startsWith('o1.') ||
    leaf.startsWith('o1pro');
  const isProModel = /(^|[.-])pro([.-]|$)/.test(leaf);
  return isOpenAiModel && (isO1Model || isProModel);
}

export function filterSafeProviderModels(models: readonly string[]) {
  return models.filter((model) => !isPremiumCostModelId(model));
}

function normalizeModelId(value: string | undefined) {
  return (value ?? '').trim();
}

function isRoutedModelId(value: string) {
  return value.includes('/');
}

function pickProviderModel(llmProvider: LlmProvider, value: string, fallback: string) {
  const model = normalizeModelId(value);
  if (!model) {
    return fallback;
  }
  if (isPremiumCostModelId(model)) {
    return fallback;
  }

  if (llmProvider === 'openrouter-responses' || llmProvider === 'vercel-gateway') {
    return isRoutedModelId(model) ? model : fallback;
  }

  return isRoutedModelId(model) ? fallback : model;
}

export function normalizeLlmProviderCompatibility(settings: AiSettings): AiSettings {
  const defaults = getAiProviderSwitchDefaults(settings.llmProvider);
  const model = pickProviderModel(settings.llmProvider, settings.model, defaults.model);
  const memoryAgentModel = pickProviderModel(
    settings.llmProvider,
    settings.memoryAgentModel,
    defaults.memoryAgentModel,
  );

  if (settings.llmProvider === 'openrouter-responses' || settings.llmProvider === 'vercel-gateway') {
    return {
      ...settings,
      aiTransportMode: defaults.aiTransportMode,
      memoryAgentModel,
      model,
      openAiStateMode: defaults.openAiStateMode,
    };
  }

  return {
    ...settings,
    aiTransportMode: defaults.aiTransportMode,
    memoryAgentModel,
    model,
    openAiStateMode: defaults.openAiStateMode,
  };
}

export function applyLlmProviderSwitchDefaults(
  current: AiSettings,
  llmProvider: LlmProvider,
): AiSettings {
  if (current.llmProvider === llmProvider) {
    return normalizeLlmProviderCompatibility(current);
  }

  return {
    ...current,
    ...getAiProviderSwitchDefaults(llmProvider),
    llmProvider,
  };
}
