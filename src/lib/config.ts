import { z } from "zod";

const serverEnvSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1).optional(),
  GOOGLE_MODEL: z.string().default("gemini-2.5-flash"),
  GOOGLE_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  TAVILY_API_KEY: z.string().min(1).optional(),
  LANGSMITH_API_KEY: z.string().min(1).optional(),
  LANGSMITH_PROJECT: z.string().default("aperture-agent"),
});

export const config = serverEnvSchema.parse(process.env);

export function hasVectorStore() {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);
}