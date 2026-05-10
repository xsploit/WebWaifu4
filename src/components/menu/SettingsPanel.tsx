import { useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  AiSettings,
  PersonaDraft,
  PersonaProfile,
  RelationshipMemory,
  RuntimeContextSnapshot,
} from '../../lib/chat/types';
import type {
  BundledVrmOption,
  ManualPlayRequest,
  SequencerSettings,
  SettingsTabId,
  VisualSettings,
} from '../../lib/menu/types';
import type { PiperVoiceProfile } from '../../lib/tts/piper';
import type { RemoteTtsProvider, RemoteTtsVoice } from '../../lib/tts/remote';
import { DEFAULT_PERSONA } from '../../lib/chat/defaults';
import { AiTab } from './tabs/AiTab';
import { AnimTab } from './tabs/AnimTab';
import { CharacterTab } from './tabs/CharacterTab';
import { ContextTab } from './tabs/ContextTab';
import { TtsTab } from './tabs/TtsTab';
import { VrmTab } from './tabs/VrmTab';

type SettingsPanelProps = {
  activePersona: PersonaProfile | null;
  activeTab: SettingsTabId;
  aiSettings: AiSettings;
  availableModels: string[];
  bundledModels: BundledVrmOption[];
  chatDraftLength: number;
  messageCount: number;
  currentBundledModelId: string;
  onClose: () => void;
  onDeletePersona: (id: string) => void;
  onActivatePersona: (id: string) => void;
  onImportAnimationFile: (file: File) => void;
  onCacheVoice: () => void;
  onClearChat: () => void;
  onClearDraft: () => void;
  onClearMemory: () => void;
  onLoadBundledModel: (modelId: string) => void;
  onLoadModelFile: (file: File) => void;
  onLoadSample: () => void;
  onPlayAnimation: (request: ManualPlayRequest) => void;
  onRefreshModels: () => void;
  onRefreshRemoteVoices: (provider: RemoteTtsProvider) => void;
  onRefreshVoices: () => void;
  onResetContext: () => void;
  onRunMemoryAgent: () => void;
  onSavePersona: (draft: PersonaDraft, personaId?: string) => void;
  onSelectVoice: (voiceId: string) => void;
  onSpeakLastReply: () => void;
  onStopTts: () => void;
  onTabChange: (tab: SettingsTabId) => void;
  onTestVoice: () => void;
  open: boolean;
  personas: PersonaProfile[];
  relationshipMemory: RelationshipMemory;
  runtimeContext: RuntimeContextSnapshot;
  memoryAgentBusy: boolean;
  memoryAgentStatus: string;
  setAiSettings: Dispatch<SetStateAction<AiSettings>>;
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>;
  setVisualSettings: Dispatch<SetStateAction<VisualSettings>>;
  sequencerSettings: SequencerSettings;
  ttsActiveVoice: PiperVoiceProfile | null;
  ttsBusy: boolean;
  ttsCached: boolean;
  ttsStatus: string;
  ttsVoices: PiperVoiceProfile[];
  remoteTtsVoices: RemoteTtsVoice[];
  remoteVoicesError: string | null;
  remoteVoicesLoading: boolean;
  visualSettings: VisualSettings;
  modelsError: string | null;
  modelsLoading: boolean;
  voicesError: string | null;
  voicesLoading: boolean;
};

const TABS: { id: SettingsTabId; label: string }[] = [
  { id: 'vrm', label: 'VRM' },
  { id: 'anim', label: 'Anim' },
  { id: 'character', label: 'Char' },
  { id: 'ai', label: 'AI' },
  { id: 'context', label: 'Ctx' },
  { id: 'tts', label: 'TTS' },
];

export function SettingsPanel({
  activePersona,
  activeTab,
  aiSettings,
  availableModels,
  bundledModels,
  chatDraftLength,
  messageCount,
  currentBundledModelId,
  onCacheVoice,
  onClearChat,
  onClearDraft,
  onClearMemory,
  onClose,
  onDeletePersona,
  onActivatePersona,
  onImportAnimationFile,
  onLoadBundledModel,
  onLoadModelFile,
  onLoadSample,
  onPlayAnimation,
  onRefreshModels,
  onRefreshRemoteVoices,
  onRefreshVoices,
  onResetContext,
  onRunMemoryAgent,
  onSavePersona,
  onSelectVoice,
  onSpeakLastReply,
  onStopTts,
  onTabChange,
  onTestVoice,
  open,
  personas,
  relationshipMemory,
  runtimeContext,
  memoryAgentBusy,
  memoryAgentStatus,
  setAiSettings,
  setSequencerSettings,
  setVisualSettings,
  sequencerSettings,
  ttsActiveVoice,
  ttsBusy,
  ttsCached,
  ttsStatus,
  ttsVoices,
  remoteTtsVoices,
  remoteVoicesError,
  remoteVoicesLoading,
  visualSettings,
  modelsError,
  modelsLoading,
  voicesError,
  voicesLoading,
}: SettingsPanelProps) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const activeContent =
    activeTab === 'anim' ? (
      <AnimTab
        onImportAnimationFile={onImportAnimationFile}
        onPlayAnimation={onPlayAnimation}
        sequencerSettings={sequencerSettings}
        setSequencerSettings={setSequencerSettings}
      />
    ) : activeTab === 'character' ? (
      <CharacterTab
        activePersona={activePersona}
        onActivatePersona={onActivatePersona}
        onDeletePersona={onDeletePersona}
        onSavePersona={onSavePersona}
        personas={personas}
      />
    ) : activeTab === 'ai' ? (
      <AiTab
        activePersonaName={activePersona?.name ?? DEFAULT_PERSONA.name}
        aiSettings={aiSettings}
        availableModels={availableModels}
        modelsError={modelsError}
        modelsLoading={modelsLoading}
        onRefreshModels={onRefreshModels}
        runtimeContext={runtimeContext}
        setAiSettings={setAiSettings}
      />
    ) : activeTab === 'context' ? (
      <ContextTab
        aiSettings={aiSettings}
        availableModels={availableModels}
        chatDraftLength={chatDraftLength}
        messageCount={messageCount}
        onClearChat={onClearChat}
        onClearDraft={onClearDraft}
        onClearMemory={onClearMemory}
        onRefreshModels={onRefreshModels}
        onResetContext={onResetContext}
        onRunMemoryAgent={onRunMemoryAgent}
        relationshipMemory={relationshipMemory}
        memoryAgentBusy={memoryAgentBusy}
        memoryAgentStatus={memoryAgentStatus}
        modelsError={modelsError}
        modelsLoading={modelsLoading}
        setAiSettings={setAiSettings}
      />
    ) : activeTab === 'tts' ? (
      <TtsTab
        aiSettings={aiSettings}
        onCacheVoice={onCacheVoice}
        onRefreshVoices={onRefreshVoices}
        onRefreshRemoteVoices={onRefreshRemoteVoices}
        onSelectVoice={onSelectVoice}
        onSpeakLastReply={onSpeakLastReply}
        onStopTts={onStopTts}
        onTestVoice={onTestVoice}
        setAiSettings={setAiSettings}
        ttsBusy={ttsBusy}
        ttsCached={ttsCached}
        ttsStatus={ttsStatus}
        ttsVoices={ttsVoices}
        remoteTtsVoices={remoteTtsVoices}
        remoteVoicesError={remoteVoicesError}
        remoteVoicesLoading={remoteVoicesLoading}
        ttsActiveVoice={ttsActiveVoice}
        voicesError={voicesError}
        voicesLoading={voicesLoading}
      />
    ) : (
      <VrmTab
        bundledModels={bundledModels}
        currentBundledModelId={currentBundledModelId}
        onLoadBundledModel={onLoadBundledModel}
        onLoadModelFile={onLoadModelFile}
        onLoadSample={onLoadSample}
        setVisualSettings={setVisualSettings}
        visualSettings={visualSettings}
      />
    );

  return (
    <div
      className={`settings-panel ${open ? 'open' : ''}`}
      onClick={(event) => event.stopPropagation()}
      onTouchEnd={(event) => {
        const touch = event.changedTouches.item(0);
        if (!touch) {
          return;
        }

        const deltaY = touch.clientY - touchStartY.current;
        const deltaX = Math.abs(touch.clientX - touchStartX.current);
        if (deltaY > 80 && deltaY > deltaX && touchStartY.current < 160) {
          onClose();
        }
      }}
      onTouchStart={(event) => {
        const touch = event.touches.item(0);
        if (!touch) {
          return;
        }

        touchStartY.current = touch.clientY;
        touchStartX.current = touch.clientX;
      }}
    >
      <svg className="svg-ui-bg panel-frame" preserveAspectRatio="none" viewBox="0 0 500 800">
        <path
          d="M0,20 L20,0 L500,0 L500,780 L480,800 L0,800 Z"
          fill="var(--c-panel)"
          stroke="var(--c-border)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <line
          stroke="var(--c-border)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          x1="20"
          x2="480"
          y1="60"
          y2="60"
        />
        <rect fill="var(--c-text-accent)" height="4" opacity="0.5" width="50" x="20" y="790" />
      </svg>

      <div className="tabs-header">
        {TABS.map((tab) => (
          <button
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="panel-scroll">{activeContent}</div>
    </div>
  );
}
