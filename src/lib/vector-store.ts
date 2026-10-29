import { SupabaseClient, createClient } from "@supabase/supabase-js";
import { OpenAIEmbeddings } from "@langchain/openai";
import { config, hasVectorStore } from "@/lib/config";

export type RetrievedDocument = {
  content: string;
  source: string;
  score: number;
};

let client: SupabaseClient | undefined;
let embeddings: OpenAIEmbeddings | undefined;

function getClient() {
  if (!hasVectorStore()) return undefined;
  client ??= createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

function getEmbeddings() {
  if (!config.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for vector search.");
  embeddings ??= new OpenAIEmbeddings({
    apiKey: config.OPENAI_API_KEY,
    model: "text-embedding-3-small",
  });
  return embeddings;
}

export async function insertDocumentChunks(
  chunks: Array<{ content: string; source: string; index: number }>,
) {
  const supabase = getClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const vectors = await getEmbeddings().embedDocuments(chunks.map(({ content }) => content));
  const rows = chunks.map((chunk, index) => ({
    content: chunk.content,
    source: chunk.source,
    chunk_index: chunk.index,
    embedding: vectors[index],
  }));
  const { error } = await supabase.from("documents").insert(rows);
  if (error) throw new Error(`Could not save document chunks: ${error.message}`);
  return rows.length;
}

export async function searchDocuments(query: string, limit = 5): Promise<RetrievedDocument[]> {
  const supabase = getClient();
  if (!supabase) return [];
  const embedding = await getEmbeddings().embedQuery(query);
  const { data, error } = await supabase.rpc("hybrid_search_documents", {
    query_text: query,
    query_embedding: embedding,
    match_count: limit,
  });
  if (error) throw new Error(`Document search failed: ${error.message}`);
  return (data ?? []).map((row: { content: string; source: string; score: number }) => ({
    content: row.content,
    source: row.source,
    score: row.score,
  }));
}