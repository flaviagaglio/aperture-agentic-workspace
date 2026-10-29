import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { chunkText, normalizeDocumentText } from "@/lib/documents";
import { insertDocumentChunks } from "@/lib/vector-store";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const fileSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["application/pdf", "text/plain"]),
});

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Upload must use multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a PDF or TXT file." }, { status: 400 });
  const validated = fileSchema.safeParse({ name: file.name, type: file.type });
  if (!validated.success) return Response.json({ error: "Only PDF and plain-text files are supported." }, { status: 415 });
  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "Files must be between 1 byte and 10 MB." }, { status: 413 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text: string;
    if (file.type === "application/pdf") {
      const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
      if (pdf.numPages > MAX_PDF_PAGES) {
        return Response.json({ error: "PDFs are limited to 100 pages." }, { status: 413 });
      }
      text = (await extractText(pdf, { mergePages: true })).text;
    } else {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }

    text = normalizeDocumentText(text);
    if (!text) return Response.json({ error: "No readable text was found in the file." }, { status: 422 });
    const chunks = chunkText(text);
    const count = await insertDocumentChunks(chunks.map(({ content, index }) => ({
      content,
      index,
      source: validated.data.name,
    })));
    return Response.json({ filename: validated.data.name, chunks: count }, { status: 201 });
  } catch (error) {
    console.error("Document ingestion failed", error);
    return Response.json({ error: "Could not process this document. Verify OpenAI and Supabase configuration." }, { status: 500 });
  }
}