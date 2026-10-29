import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatGoogle } from "@langchain/google/node";
import { config } from "@/lib/config";
import { searchDocuments, type RetrievedDocument } from "@/lib/vector-store";

export type AgentStage = "route" | "retrieval" | "web_search" | "answer" | "quality";

export type AgentUpdate = {
  stage: AgentStage;
  message: string;
};

export type AgentResult = {
  answer: string;
  sources: string[];
  usedWebSearch: boolean;
  updates: AgentUpdate[];
};

const State = Annotation.Root({
  question: Annotation<string>(),
  intentRoute: Annotation<"documents" | "web">(),
  documents: Annotation<RetrievedDocument[]>(),
  webResults: Annotation<string[]>(),
  answer: Annotation<string>(),
  sources: Annotation<string[]>(),
  usedWebSearch: Annotation<boolean>(),
});

function getModel(streaming = false) {
  if (!config.GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY is not configured.");
  return new ChatGoogle({
    apiKey: config.GOOGLE_API_KEY,
    model: config.GOOGLE_MODEL,
    temperature: 0.2,
    streaming,
  });
}

function questionLikelyNeedsWeb(question: string) {
  return /\b(latest|today|current|news|weather|price|recent|202[5-9])\b/i.test(question);
}

async function routeNode(state: typeof State.State) {
  let route: "documents" | "web" = questionLikelyNeedsWeb(state.question) ? "web" : "documents";
  if (config.GOOGLE_API_KEY) {
    const response = await getModel().invoke([
      ["system", 'Classify the request as "web" only if it asks for current or changing information. Otherwise classify it as "documents". Reply with exactly one word: web or documents.'],
      ["human", state.question],
    ]);
    const classification = String(response.content).toLowerCase();
    if (classification.includes("web")) route = "web";
    if (classification.includes("documents")) route = "documents";
  }
  return { intentRoute: route };
}

async function retrievalNode(state: typeof State.State) {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) return { documents: [] };
  return { documents: await searchDocuments(state.question) };
}

async function webSearchNode(state: typeof State.State) {
  if (!config.TAVILY_API_KEY) return { webResults: [], usedWebSearch: false };
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: config.TAVILY_API_KEY,
      query: state.question,
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Web search failed with status ${response.status}.`);
  const payload = (await response.json()) as {
    answer?: string;
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const entries = [payload.answer, ...(payload.results ?? []).map((item) =>
    `${item.title ?? "Web result"}: ${item.content ?? ""} (${item.url ?? ""})`,
  )].filter((value): value is string => Boolean(value));
  return { webResults: entries, usedWebSearch: entries.length > 0 };
}

async function answerNode(state: typeof State.State) {
  const documents = state.documents.map((item) => `[${item.source}] ${item.content}`);
  const context = [...documents, ...state.webResults].join("\n\n");
  const response = await getModel().invoke([
    ["system", `You are Aperture, a careful knowledge-work assistant. Answer clearly and distinguish sourced facts from uncertainty. Use only the context for factual claims; if it is insufficient, say what is missing. Cite sources using their provided source names or URLs.\n\nContext:\n${context || "No context was found."}`],
    ["human", state.question],
  ]);
  const answer = typeof response.content === "string"
    ? response.content
    : response.content.map((part) => typeof part === "string" ? part : "text" in part ? part.text : "").join("");
  return {
    answer,
    sources: [...new Set([
      ...state.documents.map((item) => item.source),
      ...state.webResults.map((item) => item.match(/\((https?:\/\/[^)]+)\)$/)?.[1]).filter((item): item is string => Boolean(item)),
    ])],
  };
}

async function qualityNode(state: typeof State.State) {
  const response = await getModel().invoke([
    ["system", "Review the draft for unsupported claims relative to the supplied evidence. Remove or qualify unsupported claims. Preserve useful citations and return only the corrected answer."],
    ["human", `Question: ${state.question}\n\nEvidence:\n${[...state.documents.map((item) => item.content), ...state.webResults].join("\n\n")}\n\nDraft:\n${state.answer}`],
  ]);
  const answer = typeof response.content === "string"
    ? response.content
    : response.content.map((part) => typeof part === "string" ? part : "text" in part ? part.text : "").join("");
  return { answer };
}

const graph = new StateGraph(State)
  .addNode("route", routeNode)
  .addNode("retrieval", retrievalNode)
  .addNode("web_search", webSearchNode)
  .addNode("compose", answerNode)
  .addNode("quality", qualityNode)
  .addEdge(START, "route")
  .addConditionalEdges("route", (state) => state.intentRoute === "web" ? "web_search" : "retrieval")
  .addConditionalEdges("retrieval", (state) =>
    state.documents.some((document) => document.score >= 0.25) ? "compose" : "web_search",
  )
  .addEdge("web_search", "compose")
  .addEdge("compose", "quality")
  .addEdge("quality", END)
  .compile();

export async function runAgent(question: string, onUpdate?: (update: AgentUpdate) => void): Promise<AgentResult> {
  const updates: AgentUpdate[] = [];
  const announce = (stage: AgentStage, message: string) => {
    const update = { stage, message };
    updates.push(update);
    onUpdate?.(update);
  };

  let routeAnnounced = false;
  let retrievalAnnounced = false;
  let webAnnounced = false;
  let answerAnnounced = false;
  const stream = await graph.stream({
    question,
    intentRoute: "documents",
    documents: [],
    webResults: [],
    answer: "",
    sources: [],
    usedWebSearch: false,
  }, { streamMode: "updates" });

  let finalState: typeof State.State | undefined;
  for await (const event of stream) {
    const update = event as Record<string, Partial<typeof State.State>>;
    if (update.route && !routeAnnounced) {
      announce("route", "Analyzing intent and routing request");
      routeAnnounced = true;
    }
    if (update.retrieval && !retrievalAnnounced) {
      announce("retrieval", "Searching your connected documents");
      retrievalAnnounced = true;
    }
    if (update.web_search && !webAnnounced) {
      announce("web_search", "Searching the web for supporting evidence");
      webAnnounced = true;
    }
    if (update.compose && !answerAnnounced) {
      announce("answer", "Drafting a grounded response");
      answerAnnounced = true;
    }
    if (update.quality) announce("quality", "Checking the response against its sources");
    const nodeState = Object.values(update)[0];
    if (nodeState) finalState = { ...finalState, ...nodeState } as typeof State.State;
  }

  if (!finalState?.answer) throw new Error("The agent did not produce an answer.");
  return {
    answer: finalState.answer,
    sources: finalState.sources ?? [],
    usedWebSearch: finalState.usedWebSearch ?? false,
    updates,
  };
}