import type { SequencerSettings, SettingsTabId, VisualSettings } from '../menu/types';

export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

export type PersonaProfile = {
  id: string;
  name: string;
  systemPrompt: string;
  description: string;
  userNickname: string;
};

export type PersonaDraft = Omit<PersonaProfile, 'id'>;

export type TtsProvider = 'piper' | 'fish-speech' | 'inworld';
export type FishSpeechLatency = 'balanced' | 'normal';
export type InworldDeliveryMode = 'STABLE' | 'BALANCED' | 'CREATIVE';

export type AiSettings = {
  model: string;
  memoryAgentModel: string;
  temperature: number;
  maxTokens: number;
  includeHostContext: boolean;
  localDevApiKey: string;
  ttsEnabled: boolean;
  ttsAutoSpeak: boolean;
  ttsSimulatedStreaming: boolean;
  ttsExpressionTagsEnabled: boolean;
  ttsProvider: TtsProvider;
  ttsVoice: string;
  fishSpeechVoiceId: string;
  fishSpeechModel: string;
  fishSpeechLatency: FishSpeechLatency;
  fishSpeechConditionOnPreviousChunks: boolean;
  fishSpeechChunkLength: number;
  inworldVoiceId: string;
  inworldModelId: string;
  inworldDeliveryMode: InworldDeliveryMode;
  inworldBufferCharThreshold: number;
  ttsPlaybackRate: number;
  ttsVolume: number;
};

export type RelationshipStage = 'new' | 'familiar' | 'close';

export type RelationshipMood =
  | 'cold'
  | 'guarded'
  | 'curious'
  | 'teasing'
  | 'flustered'
  | 'annoyed'
  | 'soft'
  | 'affectionate';

export type RelationshipActionTag =
  | 'none'
  | 'compliment'
  | 'flirt'
  | 'tease'
  | 'apologize'
  | 'ask_personal'
  | 'challenge'
  | 'reassure'
  | 'push_boundaries'
  | 'stay_silent'
  | 'ask_follow'
  | 'ask_open_up';

export type RelationshipMemory = {
  version: 2;
  turnCount: number;
  lastSeenAt: number | null;
  lastDiaryTurnCount: number;
  relationshipStage: RelationshipStage;
  mood: RelationshipMood;
  trust: number;
  attraction: number;
  respect: number;
  irritation: number;
  jealousy: number;
  guard: number;
  lastActionTag: RelationshipActionTag;
  facts: string[];
  summary: string;
  diaryEntry: string;
  diaryHistory: string[];
};

export type RuntimeContextSnapshot = {
  launchParams: Record<string, string>;
  shareParams: Record<string, string>;
  notificationParams: Record<string, string>;
};

export type UiState = {
  menuOpen: boolean;
  chatLogOpen: boolean;
  chatDraft: string;
};

export type PersistedChatState = {
  personas: PersonaProfile[];
  activePersonaId: string;
  aiSettings: AiSettings;
  chatHistory: ChatMessage[];
  relationshipMemory: RelationshipMemory;
  uiState: UiState;
  activeTab: SettingsTabId;
  currentBundledModelId: string;
  sequencerSettings: SequencerSettings;
  visualSettings: VisualSettings;
};
