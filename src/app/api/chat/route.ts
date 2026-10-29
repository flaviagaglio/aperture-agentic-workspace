import { z } from "zod";
import { runAgent, type AgentUpdate } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
});

function encodeEvent(event: unknown) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Enter a message of up to 8,000 characters." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: unknown) => controller.enqueue(encoder.encode(encodeEvent(event)));
      try {
        const result = await runAgent(parsed.data.message, (update: AgentUpdate) => emit({ type: "status", ...update }));
        const words = result.answer.match(/\S+\s*/g) ?? [result.answer];
        for (const word of words) emit({ type: "token", content: word });
        emit({ type: "complete", sources: result.sources, usedWebSearch: result.usedWebSearch });
      } catch (error) {
        console.error("Chat request failed", error);
        emit({ type: "error", message: "The assistant could not complete this request. Check server configuration and try again." });
      } finally {
        controller.close();
      }
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}