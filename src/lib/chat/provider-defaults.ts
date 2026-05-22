import {
  DEFAULT_MEMORY_AGENT_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_VERCEL_GATEWAY_MODEL,
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
  if (llmProvider === 'vercel-gateway-responses') {
    return {
      aiTransportMode: 'http-stream',
      memoryAgentModel: DEFAULT_VERCEL_GATEWAY_MODEL,
      model: DEFAULT_VERCEL_GATEWAY_MODEL,
      openAiStateMode: 'stateless',
    };
  }

  return {
    aiTransportMode: 'websocket',
    memoryAgentModel: DEFAULT_MEMORY_AGENT_MODEL,
    model: DEFAULT_OPENAI_MODEL,
    openAiStateMode: 'conversation',
  };
}

export function getProviderFallbackModels(llmProvider: LlmProvider): string[] {
  const defaults = getAiProviderSwitchDefaults(llmProvider);
  return Array.from(new Set([defaults.model, defaults.memoryAgentModel])).filter(Boolean);
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

  if (llmProvider === 'openrouter-responses' || llmProvider === 'vercel-gateway-responses') {
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

  if (
    settings.llmProvider === 'openrouter-responses' ||
    settings.llmProvider === 'vercel-gateway-responses'
  ) {
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
    memoryAgentModel,
    model,
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
