export type MemoryPromptDebugSnapshot = {
  grilloDiaryThoughts: string[];
  grilloRecalledMemories: string[];
  grilloRelationshipMemory: string[];
  semanticMemoryContext: string;
  source: string;
  stateKey: string;
  turnText: string;
  updatedAt: number;
};

export type MemoryWorkerDebugSnapshot = {
  error?: string;
  model?: string;
  processedChatTurnCount: number;
  reason: 'chat-cadence' | 'manual' | 'scheduled';
  rounds?: number;
  stateKey: string;
  status: 'running' | 'updated' | 'no-json' | 'failed';
  toolCalls?: number;
  updatedAt: number;
};
