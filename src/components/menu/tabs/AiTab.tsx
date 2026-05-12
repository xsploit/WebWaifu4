import type { Dispatch, SetStateAction } from 'react';
import { GPT_MODEL_OPTIONS } from '../../../lib/chat/defaults';
import type { AiProxyHealth, AiSettings, RuntimeContextSnapshot } from '../../../lib/chat/types';
import { Slider } from '../ui/Slider';
import { Toggle } from '../ui/Toggle';

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
  runtimeContext: RuntimeContextSnapshot;
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
  runtimeContext,
  setAiSettings,
}: AiTabProps) {
  const hasContext =
    Object.keys(runtimeContext.launchParams).length > 0 ||
    Object.keys(runtimeContext.shareParams).length > 0 ||
    Object.keys(runtimeContext.notificationParams).length > 0;
  const gptModelIds = new Set<string>(GPT_MODEL_OPTIONS.map((model) => model.id));
  const customModels = availableModels.filter((model) => !gptModelIds.has(model));
  const selectedModel =
    GPT_MODEL_OPTIONS.find((model) => model.id === aiSettings.model) ??
    (aiSettings.model
      ? {
          id: aiSettings.model,
          label: aiSettings.model,
          description: 'Custom model from the current environment or chat command.',
        }
      : null);
  const providerState = aiProxyHealth?.providerState ?? null;

  return (
    <>
      <div className="control-group">
        <div className="control-label">OpenAI GPT Model</div>
        <select
          className="select-tech"
          onChange={(event) =>
            updateAiSettings(setAiSettings, {
              model: event.target.value,
            })
          }
          value={aiSettings.model}
        >
          <optgroup label="GPT stream models">
            {GPT_MODEL_OPTIONS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </optgroup>
          {customModels.length > 0 ? (
            <optgroup label="Configured / custom">
              {customModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </optgroup>
          ) : null}
          {selectedModel &&
          !gptModelIds.has(selectedModel.id) &&
          !customModels.includes(selectedModel.id) ? (
            <option key={selectedModel.id} value={selectedModel.id}>
              {selectedModel.label}
            </option>
          ) : null}
        </select>
        {selectedModel ? <div className="field-hint">{selectedModel.description}</div> : null}
        <button className="btn-tech secondary" onClick={onRefreshModels} type="button">
          {modelsLoading ? 'Refreshing...' : 'Refresh Models'}
        </button>
        {modelsError ? <div className="status-copy">{modelsError}</div> : null}
      </div>

      <div className="control-group">
        <div className="control-label">Backend Transport</div>
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
        <div className="toggle-row">
          <span>Include Host Context</span>
          <Toggle
            checked={aiSettings.includeHostContext}
            onChange={(checked) => updateAiSettings(setAiSettings, { includeHostContext: checked })}
          />
        </div>
        <div className="status-copy">
          Active persona: <strong>{activePersonaName}</strong>
        </div>
        <pre className="context-preview">
          {hasContext
            ? JSON.stringify(runtimeContext, null, 2)
            : 'No launch, share, or notification params are present right now.'}
        </pre>
      </div>

      <div className="control-group">
        <div className="control-label">Local Browser Override</div>
        <input
          autoComplete="off"
          className="input-tech"
          onChange={(event) =>
            updateAiSettings(setAiSettings, {
              localDevApiKey: event.target.value,
            })
          }
          placeholder="Optional API key for local browser testing only..."
          type="password"
          value={aiSettings.localDevApiKey}
        />
        <div className="field-hint">
          Used only for local static testing. Server-backed chat uses the backend environment key.
        </div>
      </div>
    </>
  );
}
