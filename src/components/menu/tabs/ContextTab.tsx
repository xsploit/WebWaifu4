import type { Dispatch, SetStateAction } from 'react';
import type { AiSettings, RelationshipMemory } from '../../../lib/chat/types';

type ContextTabProps = {
  aiSettings: AiSettings;
  availableModels: string[];
  chatDraftLength: number;
  messageCount: number;
  onClearChat: () => void;
  onClearDraft: () => void;
  onClearMemory: () => void;
  onRefreshModels: () => void;
  onResetContext: () => void;
  onRunMemoryAgent: () => void;
  relationshipMemory: RelationshipMemory;
  memoryAgentBusy: boolean;
  memoryAgentStatus: string;
  modelsError: string | null;
  modelsLoading: boolean;
  setAiSettings: Dispatch<SetStateAction<AiSettings>>;
};

export function ContextTab({
  aiSettings,
  availableModels,
  chatDraftLength,
  messageCount,
  onClearChat,
  onClearDraft,
  onClearMemory,
  onRefreshModels,
  onResetContext,
  onRunMemoryAgent,
  relationshipMemory,
  memoryAgentBusy,
  memoryAgentStatus,
  modelsError,
  modelsLoading,
  setAiSettings,
}: ContextTabProps) {
  return (
    <>
      <div className="control-group">
        <div className="control-label">Diary Model</div>
        <select
          className="select-tech"
          onChange={(event) =>
            setAiSettings((current) => ({
              ...current,
              memoryAgentModel: event.target.value,
            }))
          }
          value={aiSettings.memoryAgentModel}
        >
          <option value="">Auto (preferred cheap model)</option>
          {availableModels.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        <button className="btn-tech secondary" onClick={onRefreshModels} type="button">
          {modelsLoading ? 'Refreshing...' : 'Refresh Models'}
        </button>
        <div className="field-hint">
          Controls the background diary/classifier pass, not the main reply model.
        </div>
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            disabled={memoryAgentBusy}
            onClick={onRunMemoryAgent}
            type="button"
          >
            {memoryAgentBusy ? 'Running...' : 'Run Diary Pass'}
          </button>
        </div>
        <div className="status-copy">{memoryAgentStatus}</div>
        {modelsError ? <div className="status-copy">{modelsError}</div> : null}
      </div>

      <div className="control-group">
        <div className="control-label">Current Context</div>
        <div className="status-copy">
          Messages: <strong>{messageCount}</strong>
        </div>
        <div className="status-copy">
          Draft chars: <strong>{chatDraftLength}</strong>
        </div>
        <div className="status-copy">
          Relationship stage: <strong>{relationshipMemory.relationshipStage}</strong>
        </div>
        <div className="status-copy">
          Mood: <strong>{relationshipMemory.mood}</strong>
        </div>
        <div className="status-copy">
          Stored facts: <strong>{relationshipMemory.facts.length}</strong>
        </div>
        <div className="status-copy">
          Prior turns: <strong>{relationshipMemory.turnCount}</strong>
        </div>
        <div className="status-copy">
          Last diary pass: <strong>{relationshipMemory.lastDiaryTurnCount}</strong>
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Relationship Stats</div>
        <div className="status-copy">
          Trust: <strong>{relationshipMemory.trust}</strong>
        </div>
        <div className="status-copy">
          Attraction: <strong>{relationshipMemory.attraction}</strong>
        </div>
        <div className="status-copy">
          Respect: <strong>{relationshipMemory.respect}</strong>
        </div>
        <div className="status-copy">
          Irritation: <strong>{relationshipMemory.irritation}</strong>
        </div>
        <div className="status-copy">
          Jealousy: <strong>{relationshipMemory.jealousy}</strong>
        </div>
        <div className="status-copy">
          Guard: <strong>{relationshipMemory.guard}</strong>
        </div>
        <div className="status-copy">
          Last action tag: <strong>{relationshipMemory.lastActionTag}</strong>
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Persistent Memory</div>
        <pre className="context-preview">
          {relationshipMemory.summary
            ? relationshipMemory.summary
            : 'No stored relationship summary yet.'}
        </pre>
      </div>

      <div className="control-group">
        <div className="control-label">Private Diary</div>
        <pre className="context-preview">
          {relationshipMemory.diaryEntry
            ? relationshipMemory.diaryEntry
            : 'No diary entry written yet.'}
        </pre>
      </div>

      <div className="control-group">
        <div className="control-label">Reset Controls</div>
        <div className="btn-row">
          <button className="btn-tech secondary" onClick={onClearChat} type="button">
            Clear Chat
          </button>
          <button className="btn-tech secondary" onClick={onClearDraft} type="button">
            Clear Draft
          </button>
        </div>
        <div className="btn-row">
          <button className="btn-tech secondary" onClick={onClearMemory} type="button">
            Clear Memory
          </button>
          <button className="btn-tech danger" onClick={onResetContext} type="button">
            Reset All Context
          </button>
        </div>
        <div className="field-hint">
          Reset All Context clears chat history, draft text, relationship memory, pending assistant
          playback, and any in-flight reply for the current session.
        </div>
      </div>
    </>
  );
}
