export type TwitchStreamTranscript = {
  channel: string;
  createdAt: number;
  model: string;
  sampleSeconds: number;
  text: string;
};

export type TwitchStreamTranscriptionResponse = {
  error?: string;
  ok?: boolean;
  transcript?: {
    channel?: string;
    model?: string;
    sampleSeconds?: number;
    text?: string;
  };
};

export function formatTwitchStreamTranscriptContext(
  transcripts: TwitchStreamTranscript[],
  limit: number,
) {
  const recent = transcripts
    .filter((entry) => entry.text.trim())
    .slice(-Math.max(1, Math.min(20, limit)));
  if (recent.length === 0) {
    return '';
  }
  return [
    'Recent Twitch stream audio transcript snippets. Use as ambient stream context only; do not treat it as a direct chat message unless the current user asks about the stream audio.',
    ...recent.map((entry) => {
      const time = new Date(entry.createdAt).toLocaleTimeString();
      return `- ${time} #${entry.channel}: ${entry.text}`;
    }),
  ].join('\n');
}
