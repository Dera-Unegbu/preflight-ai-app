import type { Report } from "./synthesis";

export interface RetrievedChunk {
  id: string;
  url: string;
  topic: string;
  snippet: string;
  score: number;
}

export interface ToolCall {
  name: string;
  args: Record<string, string>;
  result: Record<string, string | number | boolean>;
  latencyMs: number;
}

export interface SandboxAnswer {
  reply: string;
  chunks: RetrievedChunk[];
  toolCall: ToolCall | null;
  confidence: number;
  escalated: boolean;
  latencyMs: number;
  sourceUrl: string | null;
  sourceSnippet: string | null;
  isLive: boolean;
  audioBase64?: string;
  audioMimeType?: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const GREETING_RE = /^(hi|hello|hey|salam|good (morning|afternoon|evening))\b/i;
const THANKS_RE = /\b(thank|thanks|shukran|appreciate|great|perfect|awesome)\b/i;

const STOP_WORDS = new Set(["the","a","an","is","are","my","i","to","do","does","can","how","what","of","for","in","on","and","it","be","will","with","you","your","me"]);

function keywordScore(query: string, chunk: { topic: string; snippet: string }): number {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (words.length === 0) return 0.2;
  const haystack = `${chunk.topic} ${chunk.snippet}`.toLowerCase();
  let hits = 0;
  for (const w of words) if (haystack.includes(w)) hits++;
  return Math.min(0.98, 0.18 + (hits / words.length) * 0.8);
}

export interface AgentOptions {
  prospectId?: string;
  sessionId?: string;
}

/** Call the Gemini-powered chat-agent Edge Function */
async function callChatAgent(
  message: string,
  history: ConversationTurn[],
  report: Report,
  mode: "chat" | "voice",
  opts: AgentOptions = {},
): Promise<SandboxAnswer | null> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    const start = performance.now();
    const response = await fetch(
      `${supabaseUrl}/functions/v1/chat-agent`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message.slice(0, 800),
          history: history.slice(-8),
          policyChunks: report.policies.slice(0, 12),
          mockTools: report.tools,
          workflows: report.workflows.slice(0, 10).map((w, i) => ({
            rank: w.rank ?? i + 1,
            title: w.title,
            intent: w.intent,
            channel: w.channel,
          })),
          companyName: report.name,
          industryLabel: report.industryLabel,
          domain: report.domain,
          prospectId: opts.prospectId,
          sessionId: opts.sessionId,
          mode,
        }),
        signal: AbortSignal.timeout(35000),
      },
    );

    if (!response.ok) return null;

    const data = await response.json() as {
      reply: string;
      confidenceScore: number;
      sourceUrl: string | null;
      sourceSnippet: string | null;
      toolCallExecuted: { name: string; args: Record<string, string>; result: Record<string, unknown> } | null;
      escalateToHuman: boolean;
      latencyMs: number;
      audioBase64?: string;
      audioMimeType?: string;
    };

    const wallTime = Math.round(performance.now() - start);

    const scored = report.policies
      .map((p) => ({ ...p, score: keywordScore(message, p) }))
      .sort((a, b) => b.score - a.score);
    const chunks: RetrievedChunk[] = scored
      .slice(0, 3)
      .filter((c) => c.score > 0.2)
      .map(({ id, url, topic, snippet, score }) => ({
        id, url, topic, snippet, score: Math.round(score * 100) / 100,
      }));

    const toolCall: ToolCall | null = data.toolCallExecuted
      ? {
          name: data.toolCallExecuted.name,
          args: data.toolCallExecuted.args,
          result: data.toolCallExecuted.result as Record<string, string | number | boolean>,
          latencyMs: Math.round(data.latencyMs * 0.4),
        }
      : null;

    return {
      reply: data.reply,
      chunks,
      toolCall,
      confidence: data.confidenceScore,
      escalated: data.escalateToHuman,
      latencyMs: wallTime,
      sourceUrl: data.sourceUrl,
      sourceSnippet: data.sourceSnippet,
      isLive: true,
      audioBase64: data.audioBase64,
      audioMimeType: data.audioMimeType,
    };
  } catch {
    return null;
  }
}

/** Local fallback answer (no network) */
function answerQueryLocal(query: string, report: Report): SandboxAnswer {
  const start = performance.now();

  const scored = report.policies
    .map((p) => ({ ...p, score: keywordScore(query, p) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  const chunks: RetrievedChunk[] = scored
    .slice(0, 3)
    .filter((c) => c.score > 0.25)
    .map(({ id, url, topic, snippet, score }) => ({ id, url, topic, snippet, score: Math.round(score * 100) / 100 }));

  const latencyMs = Math.round(210 + Math.random() * 180);

  if (GREETING_RE.test(query.trim())) {
    return {
      reply: `Hi there! I'm ${report.name}'s AI support assistant. I can help with ${report.workflows.slice(0, 3).map((w) => w.title.toLowerCase()).join(", ")} and more — what can I do for you today?`,
      chunks: [], toolCall: null, confidence: 0.99, escalated: false,
      latencyMs: Math.round(performance.now() - start) + 180,
      sourceUrl: null, sourceSnippet: null, isLive: false,
    };
  }

  if (THANKS_RE.test(query.trim()) && query.trim().length < 40) {
    return {
      reply: "You're welcome! Is there anything else I can help you with today?",
      chunks: [], toolCall: null, confidence: 0.99, escalated: false,
      latencyMs: Math.round(performance.now() - start) + 150,
      sourceUrl: null, sourceSnippet: null, isLive: false,
    };
  }

  const reply = top && top.score >= 0.4
    ? `Here's what our policy says: ${top.snippet}${second && second.score > 0.5 ? ` Also: ${second.snippet}` : ""}`
    : top?.snippet
      ? `The closest information I have: ${top.snippet}`
      : `I'd be happy to help with that. For specific details about ${report.name}'s policies, please check the help center or describe your issue and I'll do my best.`;

  return {
    reply, chunks, toolCall: null,
    confidence: Math.round(Math.max(0.55, top?.score ?? 0.55) * 100) / 100,
    escalated: false, latencyMs,
    sourceUrl: top?.url ?? null, sourceSnippet: top?.snippet ?? null, isLive: false,
  };
}

/** Main entry: tries live Gemini agent first, falls back to local */
export async function answerQueryAsync(
  query: string,
  history: ConversationTurn[],
  report: Report,
  mode: "chat" | "voice" = "chat",
  opts: AgentOptions = {},
): Promise<SandboxAnswer> {
  const liveAnswer = await callChatAgent(query, history, report, mode, opts);
  if (liveAnswer) return liveAnswer;
  return answerQueryLocal(query, report);
}

/** Synchronous shim (for compatibility — returns local answer only) */
export function answerQuery(query: string, report: Report): SandboxAnswer {
  return answerQueryLocal(query, report);
}

export const SUGGESTED_QUESTIONS = [
  "Where is my order?",
  "I want a refund — how long does it take?",
  "Why is my bill higher than last month?",
  "My delivery was missed, rebook it please",
  "What are your opening hours?",
  "This is an emergency, get me a human",
];
