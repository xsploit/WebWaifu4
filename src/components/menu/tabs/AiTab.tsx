import type { Dispatch, SetStateAction } from 'react';
import type { AiProxyHealth, AiSettings } from '../../../lib/chat/types';
import { getReplyLengthLabel, REPLY_LENGTH_MODES } from '../../../lib/chat/reply-length';
import { Slider } from '../ui/Slider';

type AiTabProps = {
  activePersonaName: string;
  aiProxyHealth: AiProxyHealth | null;
  aiProxyHealthError: string | null;
  aiSettings: AiSettings;
  availableModels: string[];
  modelsError: string | null;
  modelsLoading: boolean;
  onRefreshAiProxyHealth: () => void;
  onRefreshModels: () => void;
  setAiSettings: Dispatch<SetStateAction<AiSettings>>;
};

function updateAiSettings(
  setAiSettings: Dispatch<SetStateAction<AiSettings>>,
  patch: Partial<AiSettings>,
) {
  setAiSettings((current) => ({
    ...current,
    ...patch,
  }));
}

function formatProviderTransport(providerState: AiProxyHealth['providerState']) {
  const transport =
    providerState?.transport === 'websocket'
      ? 'Responses WebSocket'
      : providerState?.transport === 'http-stream'
        ? 'HTTP stream'
        : 'unknown';
  if (providerState?.websocketLifecycle === 'request-scoped') {
    return `${transport} (opens per reply)`;
  }
  return transport;
}

function formatProviderSocket(providerState: AiProxyHealth['providerState']) {
  if (!providerState?.websocketConfigured) {
    return 'disabled';
  }
  const status = providerState.websocketStatus ?? 'idle';
  if (providerState.websocketLifecycle === 'request-scoped' && status === 'idle') {
    return 'idle between replies';
  }
  return status;
}

function formatProviderStateId(providerState: AiProxyHealth['providerState']) {
  const activeState = providerState?.activeState;
  const id =
    providerState?.stateMode === 'conversation'
      ? (activeState?.conversationId ?? providerState.conversationId)
      : (activeState?.previousResponseId ?? providerState?.previousResponseId);
  if (!id) {
    return 'not created yet';
  }
  return `${id.slice(0, 14)}...`;
}

function describeProviderState(providerState: AiProxyHealth['providerState']) {
  switch (providerState?.stateMode) {
    case 'conversation':
      return 'Conversation mode creates an OpenAI conversation after the first stateful reply for this channel/persona. Fresh POML instructions still go with each turn.';
    case 'previous-response':
      return 'Previous-response mode tracks the latest response id per channel/persona when the backend can chain it.';
    case 'stateless':
      return 'Stateless mode does not keep provider-side state, but the app still sends diary, semantic memory, and current transcript context.';
    default:
      return 'The backend reports the active provider state after transport refresh.';
  }
}

export function AiTab({
  activePersonaName,
  aiProxyHealth,
  aiProxyHealthError,
  aiSettings,
  availableModels,
  modelsError,
  modelsLoading,
  onRefreshAiProxyHealth,
  onRefreshModels,
  setAiSettings,
}: AiTabProps) {
  const selectedModel = aiSettings.model.trim();
  const modelOptions = selectedModel
    ? Array.from(new Set([...availableModels, selectedModel]))
    : availableModels;
  const providerState = aiProxyHealth?.providerState ?? null;

  return (
    <>
      <div className="control-group">
        <div className="control-label">LLM Provider</div>
        <select
          className="select-tech"
          onChange={(event) => {
            const llmProvider = event.target.value as AiSettings['llmProvider'];
            updateAiSettings(setAiSettings, {
              llmProvider,
              memoryAgentModel: '',
              model: '',
              openAiStateMode:
                llmProvider === 'openrouter-responses' ? 'stateless' : aiSettings.openAiStateMode,
            });
          }}
          value={aiSettings.llmProvider}
        >
          <option value="openai-responses">OpenAI Responses</option>
          <option value="openrouter-responses">OpenRouter Responses (App Memory)</option>
        </select>
        <div className="field-hint">
          OpenRouter uses the Responses-compatible endpoint with YourWifey-owned history, diary,
          semantic memory, and prompt compaction. OpenAI can still use Conversations or previous
          response IDs when available.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">
          {aiSettings.llmProvider === 'openrouter-responses'
            ? 'OpenRouter Model'
            : 'OpenAI GPT Model'}
        </div>
        <select
          className="select-tech"
          onChange={(event) =>
            updateAiSettings(setAiSettings, {
              model: event.target.value,
            })
          }
          value={aiSettings.model}
        >
          {modelOptions.length > 0 ? (
            <optgroup label="Provider API models">
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </optgroup>
          ) : null}
          {modelOptions.length === 0 ? (
            <option value="">Refresh models from provider</option>
          ) : null}
        </select>
        <div className="field-hint">
          Models are loaded directly from the selected provider API through the backend. The list is
          not curated or filtered by YourWifey.
        </div>
        <button className="btn-tech secondary" onClick={onRefreshModels} type="button">
          {modelsLoading ? 'Refreshing...' : 'Refresh Models'}
        </button>
        {modelsError ? <div className="status-copy">{modelsError}</div> : null}
      </div>

      <div className="control-group">
        <div className="control-label">Backend Transport</div>
        <select
          className="select-tech"
          onChange={(event) =>
            updateAiSettings(setAiSettings, {
              aiTransportMode: event.target.value as AiSettings['aiTransportMode'],
            })
          }
          value={aiSettings.aiTransportMode}
        >
          <option value="server-default">Server Default</option>
          <option value="websocket">Responses WebSocket</option>
          <option value="http-stream">Responses HTTP Stream</option>
        </select>
        <select
          className="select-tech"
          onChange={(event) =>
            updateAiSettings(setAiSettings, {
              openAiStateMode: event.target.value as AiSettings['openAiStateMode'],
            })
          }
          value={aiSettings.openAiStateMode}
        >
          <option value="server-default">Server Default State</option>
          <option value="conversation">Conversations API</option>
          <option value="previous-response">Previous Response ID</option>
          <option value="stateless">Stateless</option>
        </select>
        {aiSettings.llmProvider === 'openrouter-responses' ? (
          <div className="status-copy">
            OpenRouter state: <strong>app-owned</strong>. The request is sent stateless with the
            rendered POML, current transcript, diary, and memory context.
          </div>
        ) : null}
        <div className="status-copy">
          Provider: <strong>{aiProxyHealth?.aiProvider ?? 'unknown'}</strong>
        </div>
        <div className="status-copy">
          State: <strong>{providerState?.stateMode ?? 'unknown'}</strong> / id:{' '}
          <strong>{formatProviderStateId(providerState)}</strong>
        </div>
        <div className="status-copy">
          Active state:{' '}
          <strong>
            {providerState?.activeState?.stateKey ??
              providerState?.activeStateKey ??
              providerState?.stateKey ??
              'default'}
          </strong>
        </div>
        <div className="status-copy">
          Transport: <strong>{formatProviderTransport(providerState)}</strong>
        </div>
        <div className="status-copy">
          Socket: <strong>{formatProviderSocket(providerState)}</strong>
        </div>
        <div className="status-copy">
          Prompt cache: <strong>{providerState?.promptCacheKey ?? 'none'}</strong> / last cached
          tokens: <strong>{providerState?.cachedTokens ?? 0}</strong>
        </div>
        <div className="status-copy">
          Tools:{' '}
          <strong>
            {providerState?.toolsAvailable
              ? `${providerState.toolNames?.join(', ') || 'available'}${
                  providerState.toolsSource ? ` (${providerState.toolsSource})` : ''
                }`
              : 'not configured'}
          </strong>
        </div>
        <div className="field-hint">{describeProviderState(providerState)}</div>
        <div className="field-hint">
          Cached tokens are the last value reported by the provider. A zero here means no cached
          token usage has been reported yet, not that prompt caching is disabled.
        </div>
        <button className="btn-tech secondary" onClick={onRefreshAiProxyHealth} type="button">
          Refresh Transport
        </button>
        {aiProxyHealthError ? <div className="status-copy">{aiProxyHealthError}</div> : null}
      </div>

      <div className="control-group">
        <div className="control-label">Generation Params</div>
        <select
          className="select-tech"
          onChange={(event) =>
            updateAiSettings(setAiSettings, {
              replyLength: event.target.value as AiSettings['replyLength'],
            })
          }
          value={aiSettings.replyLength}
        >
          {REPLY_LENGTH_MODES.map((mode) => (
            <option key={mode} value={mode}>
              Reply Length: {getReplyLengthLabel(mode)}
            </option>
          ))}
        </select>
        <div className="field-hint">
          Max Output is only a ceiling. Reply Length controls whether the prompt asks her to stay
          tight, balanced, or actually yap.
        </div>
        <Slider
          label="Temp"
          max={2}
          min={0}
          onInput={(value) => updateAiSettings(setAiSettings, { temperature: value })}
          step={0.05}
          value={aiSettings.temperature}
        />
        <Slider
          label="Max Output"
          max={1000}
          min={80}
          onInput={(value) => updateAiSettings(setAiSettings, { maxTokens: value })}
          step={20}
          value={aiSettings.maxTokens}
        />
      </div>

      <div className="control-group">
        <div className="control-label">Prompt Context</div>
        <div className="status-copy">
          Active persona: <strong>{activePersonaName}</strong>
        </div>
        <div className="field-hint">
          Prompt context now comes from persona, memory, Twitch/local chat turns, tools, TTS, and
          animation state. External host launch/share params are no longer injected.
        </div>
      </div>
    </>
  );
}
