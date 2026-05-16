import type { Dispatch, SetStateAction } from 'react';
import type { AiProxyHealth, AiSettings } from '../../../lib/chat/types';
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
          State: <strong>{providerState?.stateMode ?? 'unknown'}</strong> / WS:{' '}
          <strong>{providerState?.websocketConnected ? 'connected' : 'not connected'}</strong>
        </div>
        <div className="status-copy">
          Cache: <strong>{providerState?.promptCacheKey ?? 'none'}</strong> / cached tokens:{' '}
          <strong>{providerState?.cachedTokens ?? 0}</strong>
        </div>
        <div className="status-copy">
          Tools:{' '}
          <strong>
            {providerState?.toolsAvailable
              ? providerState.toolNames?.join(', ') || 'available'
              : 'not configured'}
          </strong>
        </div>
        <div className="field-hint">
          Previous Response keeps the latest response id per channel. Conversation mode uses the
          OpenAI conversation object when the backend supports it. Stateless still receives memory
          and diary context from the app.
        </div>
        <button className="btn-tech secondary" onClick={onRefreshAiProxyHealth} type="button">
          Refresh Transport
        </button>
        {aiProxyHealthError ? <div className="status-copy">{aiProxyHealthError}</div> : null}
      </div>

      <div className="control-group">
        <div className="control-label">Generation Params</div>
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
