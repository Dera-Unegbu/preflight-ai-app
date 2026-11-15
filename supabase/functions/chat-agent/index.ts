/**
 * chat-agent Edge Function
 * Powers the Live Sandbox with Groq inference, top-K chunk retrieval,
 * guardrailed JSON responses, and voice-friendly short answers.
 */

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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatAgentRequest {
  message: string;
  history: ChatMessage[];
  policyChunks: PolicyChunk[];
  mockTools: MockTool[];
  companyName: string;
  industryLabel: string;
}

interface ChatAgentResponse {
  reply: string;
  confidenceScore: number;
  sourceUrl: string | null;
  sourceSnippet: string | null;
  toolCallExecuted: { name: string; args: Record<string, string>; result: Record<string, unknown> } | null;
  escalateToHuman: boolean;
  latencyMs: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** TF-IDF keyword overlap for top-K chunk retrieval */
function scoreChunk(query: string, chunk: PolicyChunk): number {
  const stop = new Set(["the","a","an","is","are","my","i","to","do","does","can","how","what","of","for","in","on","and","it","be","will","with","you","your","me"]);
  const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stop.has(w));
  if (words.length === 0) return 0.1;
  const haystack = `${chunk.topic} ${chunk.snippet}`.toLowerCase();
  const hits = words.filter(w => haystack.includes(w)).length;
  return Math.min(0.98, 0.15 + (hits / words.length) * 0.83);
}

/** Retrieve top 3 most relevant chunks */
function retrieveTopChunks(query: string, chunks: PolicyChunk[]): PolicyChunk[] {
  return [...chunks]
    .map(c => ({ chunk: c, score: scoreChunk(query, c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .filter(x => x.score > 0.15)
    .map(x => x.chunk);
}

/** Detect if query wants a tool call and which one */
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
  open_dispute: /\b(dispute|unauthorized|fraud)\b/i,
  book_appointment: /\b(appointment|book|visit|slot|schedule)\b/i,
  verify_policy_coverage: /\b(cover|covered|insurance|co.?pay)\b/i,
  check_shipment_status: /\b(shipment|tracking|parcel|courier)\b/i,
  get_rebooking_options: /\b(rebook|change.*flight|reschedul)\b/i,
  trace_baggage: /\b(bag|baggage|luggage|suitcase)\b/i,
  get_incident_status: /\b(outage|incident|downtime|status page)\b/i,
  check_outage_status: /\b(power cut|no (power|water)|outage)\b/i,
};

function detectTool(query: string, tools: MockTool[]): MockTool | null {
  for (const tool of tools) {
    const re = TOOL_TRIGGERS[tool.name];
    if (re?.test(query)) return tool;
  }
  // Fallback: check tool name against generic triggers
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
    if (arg.includes("tracking") || arg.includes("tag")) {
      args[arg] = idMatch?.[1] ?? "1Z-84729104";
    } else if (arg.includes("order") || arg.includes("ref") || arg.includes("id")) {
      args[arg] = refMatch?.[1] ?? idMatch?.[1] ?? numMatch?.[0] ?? "ORD-77821";
    } else if (arg.includes("account") || arg.includes("no")) {
      args[arg] = numMatch?.[0] ?? "ACC-55102";
    } else {
      args[arg] = "CU-77821";
    }
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
  get_incident_status: { active_incidents: 0, eta: "All systems operational" },
  check_outage_status: { affected: "2 streets in your area", eta_restore: "By 6:30 PM" },
};

function simulateToolCall(tool: MockTool, args: Record<string, string>): Record<string, unknown> {
  for (const [key, result] of Object.entries(MOCK_RESULTS)) {
    if (tool.name.includes(key) || key.includes(tool.name)) return result;
  }
  return { result: "Completed", reference: `TXN-${Math.floor(Math.random() * 90000 + 10000)}` };
}

// ─── Groq inference ───────────────────────────────────────────────────────────

async function callGroq(
  systemPrompt: string,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  groqKey: string,
): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
      ],
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "";
}

// ─── Main Edge Function ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
  const start = Date.now();

  try {
    const body = await req.json() as ChatAgentRequest;
    const { message, history, policyChunks, mockTools, companyName, industryLabel } = body;

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Greeting shortcut ─────────────────────────────────────────────────────
    if (/^(hi|hello|hey|salam|good (morning|afternoon|evening))\b/i.test(message.trim())) {
      return new Response(JSON.stringify({
        reply: `Hi! I'm ${companyName}'s AI support agent. I can help with orders, returns, billing, and more. What can I do for you?`,
        confidenceScore: 0.99,
        sourceUrl: null,
        sourceSnippet: null,
        toolCallExecuted: null,
        escalateToHuman: false,
        latencyMs: Date.now() - start,
      } satisfies ChatAgentResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Thanks shortcut ───────────────────────────────────────────────────────
    if (/\b(thank|thanks|shukran|appreciate)\b/i.test(message) && message.trim().length < 30) {
      return new Response(JSON.stringify({
        reply: "You're welcome! Anything else I can help with?",
        confidenceScore: 0.99,
        sourceUrl: null,
        sourceSnippet: null,
        toolCallExecuted: null,
        escalateToHuman: false,
        latencyMs: Date.now() - start,
      } satisfies ChatAgentResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Top-K chunk retrieval ─────────────────────────────────────────────────
    const topChunks = retrieveTopChunks(message, policyChunks);
    const topScore = topChunks.length > 0
      ? topChunks.reduce((s, c) => s + scoreChunk(message, c), 0) / topChunks.length
      : 0;

    // ── Tool detection ────────────────────────────────────────────────────────
    const matchedTool = detectTool(message, mockTools);
    let toolCallExecuted: ChatAgentResponse["toolCallExecuted"] = null;

    if (matchedTool) {
      const args = extractArgs(message, matchedTool);
      const result = simulateToolCall(matchedTool, args);
      toolCallExecuted = { name: matchedTool.name, args, result };
    }

    // ── Groq inference ────────────────────────────────────────────────────────
    if (!groqKey) {
      // Fallback: rule-based answer without Groq
      if (topScore < 0.25) {
        return new Response(JSON.stringify({
          reply: "I want to make sure you get an accurate answer, so I'm connecting you with a human colleague who specializes in this. I've shared our conversation — you won't need to repeat yourself.",
          confidenceScore: 0.2,
          sourceUrl: null,
          sourceSnippet: null,
          toolCallExecuted,
          escalateToHuman: true,
          latencyMs: Date.now() - start,
        } satisfies ChatAgentResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const top = topChunks[0];
      return new Response(JSON.stringify({
        reply: toolCallExecuted
          ? `I've checked that live. ${top?.snippet ?? "Please check our help center for details."}`
          : top?.snippet ?? "Let me connect you with a specialist for this.",
        confidenceScore: Math.round(Math.max(0.4, topScore) * 100) / 100,
        sourceUrl: top?.url ?? null,
        sourceSnippet: top?.snippet ?? null,
        toolCallExecuted,
        escalateToHuman: false,
        latencyMs: Date.now() - start,
      } satisfies ChatAgentResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Choose model: use 8b-instant for standard Q&A, 70b for tool calls
    const model = matchedTool
      ? "llama-3.3-70b-versatile"
      : "llama-3.1-8b-instant";
    const maxTokens = matchedTool ? 400 : 350;

    const policyContext = topChunks.length > 0
      ? topChunks.map(c => `[${c.topic}] (${c.url})\n${c.snippet}`).join("\n\n")
      : "No specific policy pages found for this query.";

    const toolContext = toolCallExecuted
      ? `\n\nTOOL EXECUTED: ${toolCallExecuted.name}(${JSON.stringify(toolCallExecuted.args)})\nRESULT: ${JSON.stringify(toolCallExecuted.result)}`
      : "";

    const systemPrompt = `You are ${companyName}'s AI support agent (${industryLabel}). Answer ONLY from the policy excerpts below. Be concise (max 3 sentences), cite the policy source inline, and speak like a friendly support rep. If you cannot answer from the policies, say you'll connect a human specialist. Never hallucinate.

POLICY EXCERPTS:
${policyContext}${toolContext}

Respond with this JSON only: { "reply": string, "confidenceScore": number 0-1, "escalateToHuman": boolean }`;

    const groqMessages: ChatMessage[] = [
      ...history.slice(-6),
      { role: "user", content: message },
    ];

    let parsed: { reply?: string; confidenceScore?: number; escalateToHuman?: boolean } = {};
    try {
      const raw = await callGroq(systemPrompt, groqMessages, model, maxTokens, groqKey);
      const clean = raw.replace(/```json\n?|```\n?/g, "").trim();
      parsed = JSON.parse(clean) as typeof parsed;
    } catch {
      // JSON parse failed — use text as reply
      parsed = { reply: "I'm connecting you with a specialist who can help.", confidenceScore: 0.3, escalateToHuman: false };
    }

    const confidence = Math.min(0.98, Math.max(0, Number(parsed.confidenceScore ?? topScore)));
    const escalate = Boolean(parsed.escalateToHuman) || confidence < 0.3;

    const response: ChatAgentResponse = {
      reply: parsed.reply ?? "I'm connecting you with a specialist who can help.",
      confidenceScore: Math.round(confidence * 100) / 100,
      sourceUrl: topChunks[0]?.url ?? null,
      sourceSnippet: topChunks[0]?.snippet ?? null,
      toolCallExecuted,
      escalateToHuman: escalate,
      latencyMs: Date.now() - start,
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
