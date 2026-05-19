import { useEffect, useMemo, useState } from 'react';
import type {
  AiSettings,
  PersonaProfile,
  PersonaVoiceBinding,
  VoiceCreationProvider,
  VoiceLabSample,
  VoiceLabVoice,
} from '../../../lib/chat/types';
import type { PiperVoiceProfile } from '../../../lib/tts/piper';

type VoiceLabTabProps = {
  activePersona: PersonaProfile | null;
  aiSettings: AiSettings;
  onApplyPersonaVoice: (personaId: string) => void;
  onDeleteVoice: (voiceId: string) => void;
  onSaveVoice: (voice: VoiceLabVoice) => void;
  onUseCurrentVoiceAsPersonaDefault: (personaId: string) => void;
  personaVoiceBindings: Record<string, PersonaVoiceBinding>;
  personas: PersonaProfile[];
  ttsVoices: PiperVoiceProfile[];
  voiceLabVoices: VoiceLabVoice[];
};

type VoiceDraft = Omit<VoiceLabVoice, 'createdAt' | 'id' | 'status' | 'updatedAt'> & {
  id?: string;
  createdAt?: number;
};

const EMPTY_DRAFT: VoiceDraft = {
  accent: '',
  ageVibe: '',
  assignedPersonaIds: [],
  description: '',
  emotionalTone: '',
  expressiveness: 0.65,
  modelId: '',
  name: '',
  provider: 'inworld',
  providerVoiceId: '',
  sample: null,
  speakingStyle: '',
  stability: 0.55,
};

function providerLabel(provider: VoiceCreationProvider | PersonaVoiceBinding['provider']) {
  switch (provider) {
    case 'fish-speech':
      return 'Fish Speech';
    case 'inworld':
      return 'Inworld';
    case 'orpheus':
      return 'Orpheus';
    case 'piper':
      return 'Piper';
    default:
      return provider;
  }
}

function describeBinding(
  binding: PersonaVoiceBinding | undefined,
  voices: VoiceLabVoice[],
  piperVoices: PiperVoiceProfile[],
) {
  if (!binding) {
    return 'No voice assigned.';
  }

  const customVoice = binding.customVoiceId
    ? voices.find((voice) => voice.id === binding.customVoiceId)
    : null;
  const piperVoice =
    binding.provider === 'piper'
      ? piperVoices.find((voice) => voice.key === binding.voiceId)
      : null;
  const label = customVoice?.name ?? piperVoice?.name ?? binding.label ?? binding.voiceId;
  return `${providerLabel(binding.provider)} / ${label}`;
}

function sampleLabel(sample: VoiceLabSample | null) {
  if (!sample) {
    return 'No sample selected';
  }
  const sizeKb = Math.max(1, Math.round(sample.size / 1024));
  return `${sample.fileName} (${sizeKb} KB)`;
}

export function VoiceLabTab({
  activePersona,
  aiSettings,
  onApplyPersonaVoice,
  onDeleteVoice,
  onSaveVoice,
  onUseCurrentVoiceAsPersonaDefault,
  personaVoiceBindings,
  personas,
  ttsVoices,
  voiceLabVoices,
}: VoiceLabTabProps) {
  const [draft, setDraft] = useState<VoiceDraft>(EMPTY_DRAFT);
  const [selectedPersonaId, setSelectedPersonaId] = useState(
    activePersona?.id ?? personas[0]?.id ?? '',
  );

  useEffect(() => {
    if (activePersona?.id) {
      setSelectedPersonaId(activePersona.id);
    }
  }, [activePersona?.id]);

  const selectedPersonaBinding = selectedPersonaId
    ? personaVoiceBindings[selectedPersonaId]
    : undefined;
  const activeRuntimeVoice = useMemo(() => {
    if (aiSettings.ttsProvider === 'piper') {
      const voice = ttsVoices.find((entry) => entry.key === aiSettings.ttsVoice);
      return `Piper / ${(voice?.name ?? aiSettings.ttsVoice) || 'none'}`;
    }
    if (aiSettings.ttsProvider === 'fish-speech') {
      return `Fish Speech / ${aiSettings.fishSpeechVoiceId || 'no voice id'}`;
    }
    return `Inworld / ${aiSettings.inworldVoiceId || 'no voice id'}`;
  }, [
    aiSettings.fishSpeechVoiceId,
    aiSettings.inworldVoiceId,
    aiSettings.ttsProvider,
    aiSettings.ttsVoice,
    ttsVoices,
  ]);

  const updateDraft = (patch: Partial<VoiceDraft>) => {
    setDraft((current) => ({
      ...current,
      ...patch,
    }));
  };

  const toggleAssignedPersona = (personaId: string) => {
    setDraft((current) => {
      const nextIds = current.assignedPersonaIds.includes(personaId)
        ? current.assignedPersonaIds.filter((id) => id !== personaId)
        : [...current.assignedPersonaIds, personaId];
      return {
        ...current,
        assignedPersonaIds: nextIds,
      };
    });
  };

  const handleEditVoice = (voice: VoiceLabVoice) => {
    setDraft({
      accent: voice.accent,
      ageVibe: voice.ageVibe,
      assignedPersonaIds: voice.assignedPersonaIds,
      createdAt: voice.createdAt,
      description: voice.description,
      emotionalTone: voice.emotionalTone,
      expressiveness: voice.expressiveness,
      id: voice.id,
      modelId: voice.modelId,
      name: voice.name,
      provider: voice.provider,
      providerVoiceId: voice.providerVoiceId,
      sample: voice.sample,
      speakingStyle: voice.speakingStyle,
      stability: voice.stability,
    });
  };

  const handleSave = () => {
    const now = Date.now();
    const name = draft.name.trim();
    if (!name) {
      return;
    }

    onSaveVoice({
      accent: draft.accent.trim(),
      ageVibe: draft.ageVibe.trim(),
      assignedPersonaIds: draft.assignedPersonaIds,
      createdAt: draft.createdAt ?? now,
      description: draft.description.trim(),
      emotionalTone: draft.emotionalTone.trim(),
      expressiveness: draft.expressiveness,
      id: draft.id ?? `voice-lab-${now}`,
      modelId: draft.modelId.trim(),
      name,
      provider: draft.provider,
      providerVoiceId: draft.providerVoiceId.trim(),
      sample: draft.sample,
      speakingStyle: draft.speakingStyle.trim(),
      stability: draft.stability,
      status: draft.providerVoiceId.trim() ? 'ready' : 'draft',
      updatedAt: now,
    });
    setDraft(EMPTY_DRAFT);
  };

  return (
    <>
      <div className="control-group">
        <div className="control-label">Persona Voice Defaults</div>
        <select
          className="select-tech"
          onChange={(event) => setSelectedPersonaId(event.target.value)}
          value={selectedPersonaId}
        >
          {personas.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.name}
            </option>
          ))}
        </select>
        <div className="status-grid">
          <div className="status-copy">
            Assigned{' '}
            <strong>{describeBinding(selectedPersonaBinding, voiceLabVoices, ttsVoices)}</strong>
          </div>
          <div className="status-copy">
            Current TTS <strong>{activeRuntimeVoice}</strong>
          </div>
        </div>
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            disabled={!selectedPersonaId}
            onClick={() => onUseCurrentVoiceAsPersonaDefault(selectedPersonaId)}
            type="button"
          >
            Save Current As Default
          </button>
          <button
            className="btn-tech secondary"
            disabled={!selectedPersonaBinding || !selectedPersonaId}
            onClick={() => onApplyPersonaVoice(selectedPersonaId)}
            type="button"
          >
            Apply Default Voice
          </button>
        </div>
        <div className="field-hint">
          Persona switches use this binding first, then fall back to the built-in Piper preset.
          Neuro-sama defaults to the Neuro-sama Piper voice until you override it.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Create / Register Voice</div>
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ name: event.target.value })}
          placeholder="Voice name..."
          type="text"
          value={draft.name}
        />
        <select
          className="select-tech"
          onChange={(event) =>
            updateDraft({ provider: event.target.value as VoiceCreationProvider })
          }
          value={draft.provider}
        >
          <option value="inworld">Inworld zero-shot / custom voice</option>
          <option value="orpheus">Orpheus zero-shot / custom voice</option>
        </select>
        <input
          accept="audio/*"
          className="input-tech"
          onChange={(event) => {
            const file = event.target.files?.[0];
            updateDraft({
              sample: file
                ? {
                    fileName: file.name,
                    lastModified: file.lastModified,
                    mimeType: file.type,
                    size: file.size,
                  }
                : null,
            });
          }}
          type="file"
        />
        <div className="field-hint">Sample: {sampleLabel(draft.sample)}</div>
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ providerVoiceId: event.target.value })}
          placeholder="Provider voice id after creation..."
          type="text"
          value={draft.providerVoiceId}
        />
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ modelId: event.target.value })}
          placeholder="Model id, e.g. inworld-tts-2 or Orpheus model..."
          type="text"
          value={draft.modelId}
        />
        <textarea
          className="textarea-tech"
          onChange={(event) => updateDraft({ description: event.target.value })}
          placeholder="Voice design notes: sarcastic raspy vtuber, energetic, dry delivery..."
          rows={3}
          value={draft.description}
        />
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ ageVibe: event.target.value })}
          placeholder="Age vibe / register, e.g. late teen to young adult..."
          type="text"
          value={draft.ageVibe}
        />
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ accent: event.target.value })}
          placeholder="Accent / language notes..."
          type="text"
          value={draft.accent}
        />
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ speakingStyle: event.target.value })}
          placeholder="Speaking style..."
          type="text"
          value={draft.speakingStyle}
        />
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ emotionalTone: event.target.value })}
          placeholder="Emotional tone..."
          type="text"
          value={draft.emotionalTone}
        />
        <div className="slider-row slider-row-compact">
          <span>Stability</span>
          <input
            max={1}
            min={0}
            onChange={(event) => updateDraft({ stability: Number(event.target.value) })}
            step={0.01}
            type="range"
            value={draft.stability}
          />
          <span className="val">{draft.stability.toFixed(2)}</span>
        </div>
        <div className="slider-row slider-row-compact">
          <span>Expressive</span>
          <input
            max={1}
            min={0}
            onChange={(event) => updateDraft({ expressiveness: Number(event.target.value) })}
            step={0.01}
            type="range"
            value={draft.expressiveness}
          />
          <span className="val">{draft.expressiveness.toFixed(2)}</span>
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Attach To Personas</div>
        {personas.map((persona) => (
          <label className="toggle-row" key={persona.id}>
            <span>{persona.name}</span>
            <input
              checked={draft.assignedPersonaIds.includes(persona.id)}
              onChange={() => toggleAssignedPersona(persona.id)}
              type="checkbox"
            />
          </label>
        ))}
        <div className="btn-row">
          <button
            className="btn-tech"
            disabled={!draft.name.trim()}
            onClick={handleSave}
            type="button"
          >
            Save Voice
          </button>
          <button
            className="btn-tech secondary"
            onClick={() => setDraft(EMPTY_DRAFT)}
            type="button"
          >
            New Voice
          </button>
        </div>
        <div className="field-hint">
          Saving a ready voice with a provider id also updates the selected persona defaults.
          Orpheus voices can be saved and attached now; playback needs an Orpheus runtime adapter.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Voice Library</div>
        {voiceLabVoices.length === 0 ? (
          <div className="status-copy">No custom voices saved yet.</div>
        ) : (
          voiceLabVoices.map((voice) => (
            <div className="memory-entry" key={voice.id}>
              <div className="memory-entry-header">
                <strong>{voice.name}</strong>
                <span>
                  {providerLabel(voice.provider)} / {voice.status}
                </span>
              </div>
              <div className="status-copy">
                {voice.providerVoiceId || 'No provider voice id yet'}{' '}
                {voice.modelId ? `/ ${voice.modelId}` : ''}
              </div>
              <div className="status-copy">{voice.description || 'No description.'}</div>
              <div className="status-copy">Sample: {sampleLabel(voice.sample)}</div>
              <div className="btn-row">
                <button
                  className="btn-tech secondary"
                  onClick={() => handleEditVoice(voice)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="btn-tech danger"
                  onClick={() => onDeleteVoice(voice.id)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
