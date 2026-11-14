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
}

const GREETING_RE = /^(hi|hello|hey|salam|good (morning|afternoon|evening))\b/i;
const THANKS_RE = /\b(thank|thanks|shukran|appreciate)\b/i;

const TOOL_TRIGGER: Record<string, RegExp> = {
  get_order_status: /\b(order|track|package|parcel|delivery)\b/i,
  get_shipment: /\b(shipment|tracking|tracking_id|pod|proof of delivery)\b/i,
  check_shipment_status: /\b(shipment|tracking|parcel|courier)\b/i,
  check_return_eligibility: /\b(return|refund|exchange|money back)\b/i,
  verify_payment_status: /\b(payment|charged|debit|double.?charg|reversal)\b/i,
  cancel_order: /\b(cancel)\b/i,
  reschedule_delivery: /\b(reschedul|redeliver|missed delivery|not home)\b/i,
  schedule_pickup: /\b(pickup|collect)\b/i,
  get_rate_quote: /\b(rate|price to ship|cost to send|quote)\b/i,
  hold_at_location: /\b(hold|depot|collect from)\b/i,
  get_billing_breakdown: /\b(bill|billing|charge|invoice|why.*(high|expensive))\b/i,
  get_data_balance: /\b(data|balance|gb|minutes|allowance)\b/i,
  run_line_diagnostics: /\b(down|outage|no (service|internet)|not working|fault|slow)\b/i,
  change_plan: /\b(upgrade|downgrade|change.*plan|switch plan)\b/i,
  get_retention_offers: /\b(cancel|leave|switch|loyalty|discount|offer)\b/i,
  block_card: /\b(stolen|lost|block|freeze|fraud)\b/i,
  open_dispute: /\b(dispute|fraud|unauthorized|didn.?t make|scam)\b/i,
  get_statement: /\b(statement|iban|bank letter)\b/i,
  check_preapproval: /\b(loan|credit|pre.?approv|borrow|finance)\b/i,
  book_appointment: /\b(appointment|book|visit|slot|see (a )?(doctor|specialist)|schedule)\b/i,
  verify_policy_coverage: /\b(cover|covered|insurance|co.?pay|pre.?auth)\b/i,
  request_refill: /\b(refill|prescription|medicine|repeat)\b/i,
  create_referral: /\b(referral|specialist)\b/i,
  get_rebooking_options: /\b(rebook|change.*flight|new flight|reschedul)\b/i,
  check_refund_eligibility: /\b(refund|money back|cancel.*flight)\b/i,
  trace_baggage: /\b(bag|baggage|luggage|suitcase)\b/i,
  get_loyalty_balance: /\b(miles|points|loyalty|tier)\b/i,
  amend_booking: /\b(amend|change.*dates|move.*booking|hotel)\b/i,
  get_invoice: /\b(invoice|receipt|billing|payment method|card on file)\b/i,
  check_integration_health: /\b(webhook|api|integration|sdk)\b/i,
  apply_trial_extension: /\b(trial|extend)\b/i,
  get_incident_status: /\b(outage|incident|downtime|status page|is.*down)\b/i,
  get_bill_breakdown: /\b(bill|charge|tariff|meter|why.*high)\b/i,
  submit_meter_reading: /\b(meter reading|submit reading)\b/i,
  check_outage_status: /\b(power cut|outage|no (power|water)|interrupt)\b/i,
  arrange_payment_plan: /\b(payment plan|installment|hardship|split.*bill|arrears)\b/i,
  register_complaint: /\b(complain|complaint|escalate)\b/i,
};

function extractArgs(query: string, toolName: string): Record<string, string> {
  const args: Record<string, string> = {};
  const tracking = query.match(/\b([A-Z]{2,4}\d{6,12}|\d{8,14})\b/);
  const order = query.match(/\b(?:order|booking|pnr|account|policy|case)[\s#]*([A-Za-z0-9-]{5,16})\b/i);
  const idish = query.match(/\b\d{6,}\b/);

  if (toolName.toLowerCase().includes("shipment") || toolName === "trace_baggage") {
    args[tracking ? "tracking_id" : "tag_no"] = tracking ? tracking[1] : "1Z-84729104";
  } else if (order) {
    const key = toolName.includes("account") || toolName.includes("billing")
      ? "account_no"
      : toolName.includes("policy")
        ? "policy_no"
        : toolName.includes("pnr") || toolName.includes("rebook")
          ? "pnr"
          : "order_id";
    args[key] = order[1];
  } else if (idish) {
    args.ref = idish[1];
  } else {
    args.id = "CU-77821";
  }
  return args;
}

function mockToolResult(name: string, args: Record<string, string>): Record<string, string | number | boolean> {
  const generic: Record<string, Record<string, string | number | boolean>> = {
    get_order_status: { status: "Out for delivery", eta: "Today, 2:00 PM – 6:00 PM", tracking_url: "https://track.example.com/84729104" },
    check_shipment_status: { status: "In transit — cleared hub", location: "Regional Sort Facility", eta: "Tomorrow by 12:00 PM", pod_url: null as unknown as string },
    check_return_eligibility: { eligible: true, window_ends: "In 6 days", pickup_slots: "Tomorrow 9–12, Tomorrow 2–6" },
    verify_payment_status: { settled: true, duplicate_charge: false, reversal_eta: "3 business days" },
    cancel_order: { cancelled: true, refund_issued: true },
    reschedule_delivery: { confirmed_slot: "Thursday, 14:00–18:00" },
    schedule_pickup: { pickup_id: "PU-88213", time_window: "Tomorrow, 10:00–14:00" },
    get_rate_quote: { price: "AED 28.50", transit_days: 2 },
    hold_at_location: { held_until: "7 days from arrival" },
    get_billing_breakdown: { line_items: 4, usage_drivers: "Data overage 3.2 GB + international calls 41 min", disputes_window: "60 days" },
    get_data_balance: { remaining: "8.4 GB of 15 GB", throttled: false, renewal_date: "In 11 days" },
    run_line_diagnostics: { line_status: "Fault confirmed", fault_found: "Fibre splice degradation", eta_fix: "Today, by 8:00 PM", credit_applied: true },
    change_plan: { new_plan: "Fibre 500", effective_date: "Next billing cycle" },
    get_retention_offers: { offers: "20% off 6 months; free speed upgrade", expiry: "7 days" },
    block_card: { blocked: true, replacement_eta: "3–5 business days" },
    open_dispute: { case_id: "DSP-40912", provisional_credit: "Within 10 business days" },
    get_statement: { pdf_url: "Signed statement (PDF) sent to your WhatsApp" },
    check_preapproval: { offers: "Personal loan up to AED 150,000 at 6.9% APR", max_amount: 150000 },
    book_appointment: { confirmation_code: "APT-5521", slot: "Confirmed" },
    verify_policy_coverage: { covered: true, co_pay: "10% (AED 150 cap)", preauth_required: false },
    request_refill: { status: "Sent to clinician queue", pickup_eta: "2 business days" },
    create_referral: { referral_id: "REF-7741", eligible_clinics: 3 },
    get_rebooking_options: { options: "Option 1: 09:40 (+1 stop) / Option 2: 14:15 (direct, fare diff AED 120)", fare_diff: "AED 120" },
    check_refund_eligibility: { eligible: true, amount: "Full fare", method: "Original payment method", eta: "7 business days" },
    trace_baggage: { last_scan: "DXB — arrived, awaiting transfer", status: "In custody of carrier", claim_id: "BAG-3390" },
    get_loyalty_balance: { points: "24,850", tier: "Gold", expiry: "12,000 points in 90 days" },
    amend_booking: { price_diff: "AED 0", confirmed: true },
    get_invoice: { pdf_url: "Invoice PDF sent to your email", status: "Paid" },
    check_integration_health: { status: "Healthy", last_error: "None in 30 days", last_success: "2 minutes ago" },
    apply_trial_extension: { new_expiry: "14 days added", eligible: true },
    get_incident_status: { active_incidents: 0, eta: "All systems operational" },
    get_bill_breakdown: { charges: "4 line items", usage_graph: "Usage +22% vs. last month (AC season)", due_date: "In 9 days" },
    submit_meter_reading: { accepted: true, next_billing: "In 5 days" },
    check_outage_status: { affected: "2 streets in your area", eta_restore: "By 6:30 PM" },
    arrange_payment_plan: { plan_id: "PP-2277", installment: "4 monthly payments", start_date: "Next month" },
    register_complaint: { complaint_id: "CMP-8801", sla_days: 10 },
  };
  const found = Object.keys(generic).find((k) => name.includes(k));
  if (found) {
    const res = { ...generic[found] };
    for (const k of Object.keys(res)) if (res[k] === null) delete res[k];
    return res;
  }
  return { result: "Completed", reference: `TXN-${Math.floor(Math.random() * 90000 + 10000)}` };
}

function keywordScore(query: string, chunk: { topic: string; snippet: string }): number {
  const stop = new Set(["the", "a", "an", "is", "are", "my", "i", "to", "do", "does", "can", "how", "what", "of", "for", "in", "on", "and", "it", "be", "will", "with", "you", "your", "me"]);
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !stop.has(w));
  if (words.length === 0) return 0.2;
  const haystack = `${chunk.topic} ${chunk.snippet}`.toLowerCase();
  let hits = 0;
  for (const w of words) if (haystack.includes(w)) hits++;
  return Math.min(0.98, 0.18 + (hits / words.length) * 0.8);
}

export function answerQuery(query: string, report: Report): SandboxAnswer {
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

  const toolName = report.tools.find((t) => {
    const re = TOOL_TRIGGER[t.name];
    return re && re.test(query);
  })?.name;

  const wantsTool = toolName && !GREETING_RE.test(query.trim()) && !THANKS_RE.test(query);
  const toolCall: ToolCall | null = wantsTool
    ? (() => {
        const args = extractArgs(query, toolName);
        return {
          name: toolName,
          args,
          result: mockToolResult(toolName, args),
          latencyMs: Math.round(180 + Math.random() * 340),
        };
      })()
    : null;

  const latencyMs = Math.round(210 + Math.random() * 180 + (toolCall?.latencyMs ?? 0) * 0.4);

  if (GREETING_RE.test(query.trim())) {
    return {
      reply: `Hi! I'm ${report.name}'s AI support agent. I can help with ${report.workflows.slice(0, 3).map((w) => w.title.toLowerCase()).join(", ")} and more. What can I do for you?`,
      chunks: [],
      toolCall: null,
      confidence: 0.99,
      escalated: false,
      latencyMs: Math.round(performance.now() - start) + 180,
    };
  }

  if (THANKS_RE.test(query.trim()) && query.trim().length < 30) {
    return {
      reply: "You're welcome! Anything else I can help you with?",
      chunks: [],
      toolCall: null,
      confidence: 0.99,
      escalated: false,
      latencyMs: Math.round(performance.now() - start) + 150,
    };
  }

  const strongGrounding = top && top.score >= 0.55;
  const weakGrounding = !top || top.score < 0.32;

  if (weakGrounding) {
    return {
      reply: `I want to make sure you get an accurate answer, so I'm connecting you with a human colleague who specializes in this. I've shared our conversation and everything you've told me so far — you won't need to repeat yourself.`,
      chunks,
      toolCall,
      confidence: Math.round((top?.score ?? 0.2) * 100) / 100,
      escalated: true,
      latencyMs,
    };
  }

  const toolLine = toolCall
    ? `I've just checked that for you live.`
    : "";
  const reply = strongGrounding
    ? `${toolLine}Here's what our policy says: ${top.snippet}${second && second.score > 0.5 ? ` Related: ${second.snippet}` : ""}`
    : `I checked our published policies and support pages for you.${toolLine ? " " + toolLine : ""} The closest guidance I have: ${top.snippet}`;

  return {
    reply,
    chunks,
    toolCall,
    confidence: Math.round(Math.max(0.55, top.score) * 100) / 100,
    escalated: false,
    latencyMs,
  };
}

export const SUGGESTED_QUESTIONS = [
  "Where is my order?",
  "I want a refund — how long does it take?",
  "Why is my bill higher than last month?",
  "My delivery was missed, rebook it please",
  "What are your opening hours?",
  "This is an emergency, get me a human",
];
