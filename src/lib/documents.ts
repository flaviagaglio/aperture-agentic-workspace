export type TextChunk = {
  content: string;
  index: number;
};

export function chunkText(text: string, chunkSize = 1200, overlap = 180): TextChunk[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  if (chunkSize <= 0 || overlap < 0 || overlap >= chunkSize) {
    throw new RangeError("Chunk size must be positive and overlap smaller than chunk size.");
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(" ", end);
      if (boundary > start + Math.floor(chunkSize * 0.6)) end = boundary;
    }
    const content = normalized.slice(start, end).trim();
    if (content) chunks.push({ content, index: chunks.length });
    if (end === normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

export function normalizeDocumentText(value: string) {
  return value.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim();
}