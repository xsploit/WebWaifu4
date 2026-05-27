import { pipeline } from '@huggingface/transformers';

type LocalEmbeddingRequest = {
  id: number;
  text: string;
};

type LocalEmbeddingResponse =
  | {
      embedding: number[];
      id: number;
      ok: true;
    }
  | {
      error: string;
      id: number;
      ok: false;
    };

const LOCAL_EMBEDDING_MODEL = 'onnx-community/all-MiniLM-L6-v2-ONNX';

let extractorPromise: ReturnType<typeof pipeline<'feature-extraction'>> | null = null;

function getExtractor() {
  extractorPromise ??= pipeline('feature-extraction', LOCAL_EMBEDDING_MODEL);
  return extractorPromise;
}

async function createEmbedding(text: string) {
  const extractor = await getExtractor();
  const output = await extractor(text, { normalize: true, pooling: 'mean' });
  return Array.from(output.data, (value) => Number(value));
}

self.onmessage = (event: MessageEvent<LocalEmbeddingRequest>) => {
  const { id, text } = event.data;
  void createEmbedding(text).then(
    (embedding) => {
      self.postMessage({ embedding, id, ok: true } satisfies LocalEmbeddingResponse);
    },
    (error) => {
      self.postMessage({
        error: error instanceof Error ? error.message : 'Local embedding failed.',
        id,
        ok: false,
      } satisfies LocalEmbeddingResponse);
    },
  );
};
