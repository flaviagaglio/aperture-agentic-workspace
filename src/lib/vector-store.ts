import { SupabaseClient, createClient } from "@supabase/supabase-js";
import { TaskType } from "@google/generative-ai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { config, hasVectorStore } from "@/lib/config";

export type RetrievedDocument = {
  content: string;
  source: string;
  score: number;
};

let client: SupabaseClient | undefined;
let documentEmbeddings: GoogleGenerativeAIEmbeddings | undefined;
let queryEmbeddings: GoogleGenerativeAIEmbeddings | undefined;

function getClient() {
  if (!hasVectorStore()) return undefined;
  client ??= createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

function getEmbeddings(taskType: TaskType) {
  if (!config.GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY is required for vector search.");
  const instance = taskType === TaskType.RETRIEVAL_QUERY ? queryEmbeddings : documentEmbeddings;
  if (instance) return instance;
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: config.GOOGLE_API_KEY,
    model: config.GOOGLE_EMBEDDING_MODEL,
    outputDimensionality: 1536,
    taskType,
  });
  if (taskType === TaskType.RETRIEVAL_QUERY) queryEmbeddings = embeddings;
  else documentEmbeddings = embeddings;
  return embeddings;
}

export async function insertDocumentChunks(
  chunks: Array<{ content: string; source: string; index: number }>,
) {
  const supabase = getClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const vectors = await getEmbeddings(TaskType.RETRIEVAL_DOCUMENT).embedDocuments(chunks.map(({ content }) => content));
  if (vectors.length !== chunks.length || vectors.some((vector) => vector.length !== 1536)) {
    throw new Error("Gemini returned an invalid document embedding.");
  }
  const rows = chunks.map((chunk, index) => ({
    content: chunk.content,
    source: chunk.source,
    chunk_index: chunk.index,
    embedding: vectors[index],
    embedding_model: `${config.GOOGLE_EMBEDDING_MODEL}:1536`,
  }));
  const { error } = await supabase.from("documents").insert(rows);
  if (error) throw new Error(`Could not save document chunks: ${error.message}`);
  return rows.length;
}

export async function searchDocuments(query: string, limit = 5): Promise<RetrievedDocument[]> {
  const supabase = getClient();
  if (!supabase) return [];
  const embedding = await getEmbeddings(TaskType.RETRIEVAL_QUERY).embedQuery(query);
  const { data, error } = await supabase.rpc("hybrid_search_documents", {
    query_text: query,
    query_embedding: embedding,
    query_embedding_model: `${config.GOOGLE_EMBEDDING_MODEL}:1536`,
    match_count: limit,
  });
  if (error) throw new Error(`Document search failed: ${error.message}`);
  return (data ?? []).map((row: { content: string; source: string; score: number }) => ({
    content: row.content,
    source: row.source,
    score: row.score,
  }));
}