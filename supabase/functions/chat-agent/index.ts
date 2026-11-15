/**
 * chat-agent Edge Function
 * Gemini-powered grounded CX agent with Deepgram Flux TTS,
 * conversational steering, and iron-clad no-loop escalation logic.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface PolicyChunk {
  id: string;
  url: string;
  topic: string;
  snippet: string;
}

interface MockTool {
  name: string;
  args: string;
  returns: string;
}

interface WorkflowSummary {
  rank: number;
  title: string;
  intent: string;
  channel?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatAgentRequest {
  message: string;
  history: ChatMessage[];
  policyChunks: PolicyChunk[];
  mockTools: MockTool[];
  workflows?: WorkflowSummary[];
  companyName: string;
  industryLabel: string;
  domain?: string;
  prospectId?: string;
  mode?: "chat" | "voice";
  sessionId?: string;
}

interface ChatAgentResponse {
  reply: string;
  confidenceScore: number;
  sourceUrl: string | null;
  sourceSnippet: string | null;
  toolCallExecuted: { name: string; args: Record<string, string>; result: Record<string, unknown> } | null;
  escalateToHuman: boolean;
  latencyMs: number;
  audioBase64?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** TF-IDF keyword overlap for top-K chunk retrieval */
function scoreChunk(query: string, chunk: PolicyChunk): number {
  const stop = new Set(["the","a","an","is","are","my","i","to","do","does","can","how","what","of","for","in","on","and","it","be","will","with","you","your","me","we","our","they","this","that","at","by","from"]);
  const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stop.has(w));
  if (words.length === 0) return 0.1;
  const haystack = `${chunk.topic} ${chunk.snippet}`.toLowerCase();
  const hits = words.filter(w => haystack.includes(w)).length;
  return Math.min(0.98, 0.15 + (hits / words.length) * 0.83);
}

function retrieveTopChunks(query: string, chunks: PolicyChunk[]): PolicyChunk[] {
  return [...chunks]
    .map(c => ({ chunk: c, score: scoreChunk(query, c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .filter(x => x.score > 0.1)
    .map(x => x.chunk);
}

/** Only escalate when user explicitly requests a human or irreversible live account action */
const EXPLICIT_HUMAN_RE = /\b(speak\s+to\s+(a\s+)?(human|agent|person|representative|rep|manager|supervisor)|transfer\s+(me\s+)?to\s+(a\s+)?(human|agent|person)|get\s+me\s+(a\s+)?(human|agent|person)|talk\s+to\s+(a\s+)?(human|agent|person|real)|connect\s+me\s+(to\s+)?(a\s+)?(human|agent|person)|i\s+want\s+(a\s+)?(human|agent|person)|real\s+(human|person|agent)|live\s+agent)\b/i;

const TOOL_TRIGGERS: Record<string, RegExp> = {
  get_order_status: /\b(order|track|package|parcel|delivery)\b/i,
  check_return_eligibility: /\b(return|refund|exchange|money back)\b/i,
  verify_payment_status: /\b(payment|charged|debit|double.?charg|reversal)\b/i,
  cancel_order: /\b(cancel)\b/i,
  reschedule_delivery: /\b(reschedul|redeliver|missed delivery)\b/i,
  schedule_pickup: /\b(pickup|collect)\b/i,
  get_billing_breakdown: /\b(bill|billing|charge|invoice|why.*(high|expensive))\b/i,
  get_data_balance: /\b(data|balance|gb|allowance)\b/i,
  run_line_diagnostics: /\b(down|outage|no (service|internet)|not working|fault)\b/i,
  block_card: /\b(stolen|lost|block|freeze|fraud)\b/i,
  open_dispute: /\b(dispute|unauthorized)\b/i,
  book_appointment: /\b(appointment|book|visit|slot|schedule)\b/i,
  verify_policy_coverage: /\b(cover|covered|insurance|co.?pay)\b/i,
  check_shipment_status: /\b(shipment|tracking|parcel|courier)\b/i,
  get_rebooking_options: /\b(rebook|change.*flight|reschedul)\b/i,
  trace_baggage: /\b(bag|baggage|luggage|suitcase)\b/i,
};

function detectTool(query: string, tools: MockTool[]): MockTool | null {
  for (const tool of tools) {
    const re = TOOL_TRIGGERS[tool.name];
    if (re?.test(query)) return tool;
  }
  for (const [name, re] of Object.entries(TOOL_TRIGGERS)) {
    if (re.test(query) && tools.some(t => t.name.includes(name.split("_")[0]))) {
      return tools.find(t => t.name.includes(name.split("_")[0])) ?? null;
    }
  }
  return null;
}

function extractArgs(query: string, tool: MockTool): Record<string, string> {
  const args: Record<string, string> = {};
  const argNames = tool.args.split(",").map(a => a.trim().split(/[\s:]/)[0]);
  const idMatch = query.match(/\b([A-Z]{2,4}\d{6,12}|\d{8,14})\b/);
  const refMatch = query.match(/\b(?:order|booking|pnr|account|policy|case)[\s#]*([A-Za-z0-9-]{5,16})\b/i);
  const numMatch = query.match(/\b\d{5,}\b/);
  for (const arg of argNames) {
    if (arg.includes("tracking") || arg.includes("tag")) args[arg] = idMatch?.[1] ?? "1Z-84729104";
    else if (arg.includes("order") || arg.includes("ref") || arg.includes("id")) args[arg] = refMatch?.[1] ?? idMatch?.[1] ?? numMatch?.[0] ?? "ORD-77821";
    else if (arg.includes("account") || arg.includes("no")) args[arg] = numMatch?.[0] ?? "ACC-55102";
    else args[arg] = "CU-77821";
  }
  return args;
}

const MOCK_RESULTS: Record<string, Record<string, unknown>> = {
  get_order_status: { status: "Out for delivery", eta: "Today 2:00–6:00 PM", tracking_url: "https://track.example.com" },
  check_return_eligibility: { eligible: true, window_ends: "In 6 days", pickup_slots: "Tomorrow 9–12" },
  verify_payment_status: { settled: true, duplicate_charge: false, reversal_eta: "3 business days" },
  cancel_order: { cancelled: true, refund_issued: true, refund_eta: "5–7 business days" },
  reschedule_delivery: { confirmed_slot: "Thursday 14:00–18:00" },
  schedule_pickup: { pickup_id: "PU-88213", time_window: "Tomorrow 10:00–14:00" },
  get_billing_breakdown: { line_items: 4, usage_drivers: "Data overage + international calls", disputes_window: "60 days" },
  get_data_balance: { remaining: "8.4 GB of 15 GB", throttled: false, renewal_date: "In 11 days" },
  run_line_diagnostics: { line_status: "Fault confirmed", eta_fix: "Today by 8:00 PM", credit_applied: true },
  block_card: { blocked: true, replacement_eta: "3–5 business days" },
  open_dispute: { case_id: "DSP-40912", provisional_credit: "Within 10 business days" },
  book_appointment: { confirmation_code: "APT-5521", slot: "Confirmed" },
  verify_policy_coverage: { covered: true, co_pay: "10%", preauth_required: false },
  check_shipment_status: { status: "In transit", location: "Regional hub", eta: "Tomorrow by 12:00 PM" },
  get_rebooking_options: { options: "09:40 (+1 stop) or 14:15 (direct, AED 120 diff)", fare_diff: "AED 120" },
  trace_baggage: { last_scan: "DXB — arrived", status: "In custody of carrier", claim_id: "BAG-3390" },
};

function simulateToolCall(tool: MockTool): Record<string, unknown> {
  for (const [key, result] of Object.entries(MOCK_RESULTS)) {
    if (tool.name.includes(key) || key.includes(tool.name)) return result;
  }
  return { result: "Completed", reference: `TXN-${Math.floor(Math.random() * 90000 + 10000)}` };
}

// ─── Gemini inference ─────────────────────────────────────────────────────────

async function callGemini(
  systemPrompt: string,
  messages: ChatMessage[],
  isVoice: boolean,
  geminiKey: string,
): Promise<string> {
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const voiceFormatNote = isVoice
    ? "\nIMPORTANT: Since this will be read aloud, format your reply in natural spoken language only — 2 to 3 concise sentences. Zero markdown asterisks, no bullet points, no raw URLs, no code."
    : "";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt + voiceFormatNote }] },
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.4,
          maxOutputTokens: 400,
        },
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ─── Deepgram Flux TTS ────────────────────────────────────────────────────────

async function synthesizeVoice(text: string, deepgramKey: string): Promise<string | null> {
  try {
    // Strip any residual markdown before sending to TTS
    const spoken = text.replace(/[*_`#]/g, "").replace(/\bhttps?:\/\/\S+/g, "").trim();
    const res = await fetch("https://api.deepgram.com/v1/speak?model=aura-2-thalia-en", {
      method: "POST",
      headers: {
        Authorization: `Token ${deepgramKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: spoken }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      console.error("Deepgram TTS error:", res.status, await res.text());
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    // Encode binary to base64
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch (e) {
    console.error("Deepgram TTS failed:", e);
    return null;
  }
}

// ─── Supabase prospect fallback ───────────────────────────────────────────────

async function fetchProspectContext(
  domain: string | undefined,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<{ policyChunks: PolicyChunk[]; workflows: WorkflowSummary[]; tools: MockTool[] } | null> {
  if (!domain || !supabaseUrl || !supabaseKey) return null;
  try {
    const sb = createClient(supabaseUrl, supabaseKey);
    const { data } = await sb
      .from("prospects")
      .select("report")
      .eq("domain", domain.replace(/^www\./, ""))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.report) return null;
    const r = data.report as Record<string, unknown>;
    return {
      policyChunks: (r.policies as PolicyChunk[] | undefined) ?? [],
      workflows: (r.workflows as WorkflowSummary[] | undefined) ?? [],
      tools: (r.tools as MockTool[] | undefined) ?? [],
    };
  } catch {
    return null;
  }
}

// ─── Main Edge Function ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const start = Date.now();

  try {
    const body = await req.json() as ChatAgentRequest;
    let {
      message, history, policyChunks, mockTools, workflows,
      companyName, industryLabel, domain, mode,
    } = body;

    // ── Guard: cap input ──────────────────────────────────────────────────────
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    message = message.trim().slice(0, 800);
    history = (history ?? []).slice(-8);
    const isVoice = mode === "voice";

    // ── Explicit human escalation gate ────────────────────────────────────────
    if (EXPLICIT_HUMAN_RE.test(message)) {
      const reply = `Of course — I'm connecting you with a live agent right now. I've shared our full conversation so you won't need to repeat yourself. One moment please.`;
      let audioBase64: string | undefined;
      if (isVoice && deepgramKey) {
        audioBase64 = (await synthesizeVoice(reply, deepgramKey)) ?? undefined;
      }
      return new Response(JSON.stringify({
        reply,
        confidenceScore: 0.99,
        sourceUrl: null,
        sourceSnippet: null,
        toolCallExecuted: null,
        escalateToHuman: true,
        latencyMs: Date.now() - start,
        ...(audioBase64 ? { audioBase64 } : {}),
      } satisfies ChatAgentResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Greeting shortcut ─────────────────────────────────────────────────────
    if (/^(hi|hello|hey|salam|good (morning|afternoon|evening))\b/i.test(message)) {
      const reply = `Hi there! I'm ${companyName}'s AI support assistant. I can help with orders, returns, billing, delivery scheduling, and more — what can I do for you today?`;
      let audioBase64: string | undefined;
      if (isVoice && deepgramKey) {
        audioBase64 = (await synthesizeVoice(reply, deepgramKey)) ?? undefined;
      }
      return new Response(JSON.stringify({
        reply,
        confidenceScore: 0.99,
        sourceUrl: null,
        sourceSnippet: null,
        toolCallExecuted: null,
        escalateToHuman: false,
        latencyMs: Date.now() - start,
        ...(audioBase64 ? { audioBase64 } : {}),
      } satisfies ChatAgentResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Thanks shortcut ───────────────────────────────────────────────────────
    if (/\b(thank|thanks|shukran|appreciate|great|perfect|awesome)\b/i.test(message) && message.length < 40) {
      const reply = `You're welcome! Is there anything else I can help you with today?`;
      let audioBase64: string | undefined;
      if (isVoice && deepgramKey) {
        audioBase64 = (await synthesizeVoice(reply, deepgramKey)) ?? undefined;
      }
      return new Response(JSON.stringify({
        reply,
        confidenceScore: 0.99,
        sourceUrl: null,
        sourceSnippet: null,
        toolCallExecuted: null,
        escalateToHuman: false,
        latencyMs: Date.now() - start,
        ...(audioBase64 ? { audioBase64 } : {}),
      } satisfies ChatAgentResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Enrich context from Supabase if chunks are thin ──────────────────────
    if ((!policyChunks || policyChunks.length < 2) && domain) {
      const ctx = await fetchProspectContext(domain, supabaseUrl, supabaseServiceKey);
      if (ctx) {
        if (ctx.policyChunks.length > 0) policyChunks = ctx.policyChunks;
        if (ctx.tools.length > 0 && (!mockTools || mockTools.length === 0)) mockTools = ctx.tools;
        if (ctx.workflows.length > 0 && (!workflows || workflows.length === 0)) workflows = ctx.workflows;
      }
    }
    policyChunks = policyChunks ?? [];
    mockTools = mockTools ?? [];
    workflows = workflows ?? [];

    // ── Top-K chunk retrieval ─────────────────────────────────────────────────
    const topChunks = retrieveTopChunks(message, policyChunks);

    // ── Tool detection ────────────────────────────────────────────────────────
    const matchedTool = detectTool(message, mockTools);
    let toolCallExecuted: ChatAgentResponse["toolCallExecuted"] = null;
    if (matchedTool) {
      const args = extractArgs(message, matchedTool);
      const result = simulateToolCall(matchedTool);
      toolCallExecuted = { name: matchedTool.name, args, result };
    }

    // ── Build Gemini context ──────────────────────────────────────────────────
    const policyContext = topChunks.length > 0
      ? topChunks.map(c => `[${c.topic}]\n${c.snippet}`).join("\n\n")
      : "No policy excerpts available for this specific query.";

    const workflowSummary = workflows.slice(0, 10)
      .map(w => `- ${w.title} (${w.channel ?? "any channel"}): "${w.intent}"`)
      .join("\n");

    const toolContext = toolCallExecuted
      ? `\n\nLIVE TOOL CALL EXECUTED:\n${toolCallExecuted.name}(${JSON.stringify(toolCallExecuted.args)})\nRESULT: ${JSON.stringify(toolCallExecuted.result)}`
      : "";

    const systemPrompt = `You are ${companyName}'s AI customer support specialist (${industryLabel} industry).

COMPANY SUPPORT CAPABILITIES (what you can help with):
${workflowSummary || "General customer support inquiries"}

SCRAPED POLICY EXCERPTS (use these to ground your answers):
${policyContext}${toolContext}

BEHAVIOUR RULES:
1. Respond naturally and helpfully like a knowledgeable, friendly CX specialist.
2. Ground answers in the policy excerpts above. If excerpts don't cover the question, use your general knowledge of the ${industryLabel} industry to give a helpful, reasonable answer — do NOT escalate just because a topic isn't in the excerpts.
3. If a question is completely off-topic (e.g. sports, cooking, unrelated topics), acknowledge it warmly in one sentence then steer back: "That's outside my area, but I'd love to help with your [order / account / booking] — what can I assist with?"
4. NEVER set escalateToHuman: true unless the user explicitly asks to speak to a human agent or representative. Normal questions, even complex ones, stay at escalateToHuman: false.
5. Keep replies concise and conversational (2–4 sentences for chat; 2–3 for voice).

Respond ONLY with valid JSON: { "reply": string, "confidenceScore": number 0-1, "escalateToHuman": boolean }
escalateToHuman must be false unless the user literally asked to speak to a human.`;

    // ── Gemini inference ──────────────────────────────────────────────────────
    const geminiMessages: ChatMessage[] = [
      ...history,
      { role: "user", content: message },
    ];

    let parsed: { reply?: string; confidenceScore?: number; escalateToHuman?: boolean } = {};
    let geminiSucceeded = false;

    if (geminiKey) {
      try {
        const raw = await callGemini(systemPrompt, geminiMessages, isVoice, geminiKey);
        const clean = raw.replace(/```json\n?|```\n?/g, "").trim();
        const candidate = JSON.parse(clean) as typeof parsed;
        // Hard-enforce: never escalate unless user explicitly asked
        if (candidate.escalateToHuman && !EXPLICIT_HUMAN_RE.test(message)) {
          candidate.escalateToHuman = false;
          candidate.confidenceScore = Math.max(0.55, Number(candidate.confidenceScore ?? 0.6));
        }
        parsed = candidate;
        geminiSucceeded = true;
      } catch (e) {
        console.error("Gemini inference/parse failed:", e);
      }
    }

    // ── Fallback: rule-based if Gemini failed ─────────────────────────────────
    if (!geminiSucceeded) {
      const topScore = topChunks.length > 0
        ? topChunks.reduce((s, c) => s + scoreChunk(message, c), 0) / topChunks.length
        : 0.5;
      const top = topChunks[0];
      parsed = {
        reply: toolCallExecuted
          ? `I've checked that for you. ${top?.snippet ?? "Please check the help center for more details."}`
          : top?.snippet ?? `I'd be happy to help with that. For the most accurate information about ${companyName}'s policies, please check the help center or let me know the specific topic and I'll do my best.`,
        confidenceScore: Math.max(0.55, topScore),
        escalateToHuman: false,
      };
    }

    const confidence = Math.min(0.98, Math.max(0.1, Number(parsed.confidenceScore ?? 0.6)));

    // ── Deepgram TTS (voice mode only) ────────────────────────────────────────
    let audioBase64: string | undefined;
    const replyText = parsed.reply ?? "I'm here to help! What would you like to know?";
    if (isVoice && deepgramKey) {
      audioBase64 = (await synthesizeVoice(replyText, deepgramKey)) ?? undefined;
    }

    const response: ChatAgentResponse = {
      reply: replyText,
      confidenceScore: Math.round(confidence * 100) / 100,
      sourceUrl: topChunks[0]?.url ?? null,
      sourceSnippet: topChunks[0]?.snippet ?? null,
      toolCallExecuted,
      escalateToHuman: Boolean(parsed.escalateToHuman),
      latencyMs: Date.now() - start,
      ...(audioBase64 ? { audioBase64 } : {}),
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("chat-agent error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
