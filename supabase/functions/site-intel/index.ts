import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeUrl(host: string, path: string): string | null {
  try {
    const u = new URL(path, host);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch { return null; }
}

/** Strip navbar/footer/cookie clutter and trim to max chars */
function pruneContent(raw: string, maxChars = 2000): string {
  return raw
    .replace(/<(nav|footer|header|script|style|noscript|aside)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/!\[.*?\]\(.*?\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/[*_`]{1,3}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxChars);
}

/** Lightweight TF-IDF keyword overlap for chunk retrieval */
function chunkScore(query: string, text: string): number {
  const stopWords = new Set(["the","a","an","is","are","my","i","to","do","does","can","how","what","of","for","in","on","and","it","be","will","with","you","your","me","we","our","their","at","by"]);
  const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stopWords.has(w));
  if (words.length === 0) return 0;
  const haystack = text.toLowerCase();
  const hits = words.filter(w => haystack.includes(w)).length;
  return hits / words.length;
}

/** Extract brand identity from raw HTML */
function extractBrand(html: string, baseUrl: string) {
  const pick = (re: RegExp): string | null => { const m = html.match(re); return m ? m[1] : null; };

  const logo =
    pick(/<img[^>]+class=[\"'][^\"']*(?:logo|brand)[^\"']*[\"'][^>]*>/i)?.match(/src=[\"']([^\"']+)[\"']/i)?.[1] ??
    pick(/<link[^>]+rel=[\"'][^\"']*icon[^\"']*[\"'][^>]*>/i)?.match(/href=[\"']([^\"']+)[\"']/i)?.[1] ??
    pick(/<meta[^>]+property=[\"']og:image[\"'][^>]+content=[\"']([^\"']+)[\"']/i)?.[1] ??
    pick(/<img[^>]+src=[\"']([^\"']*logo[^\"']*)[\"'][^>]*>/i)?.[1] ??
    null;

  const logoUrl = logo ? safeUrl(baseUrl, logo) : null;

  const tagline =
    pick(/<meta[^>]+name=[\"']description[\"'][^>]+content=[\"']([^\"']{0,200})[\"']/i)?.[1] ??
    pick(/<meta[^>]+property=[\"']og:description[\"'][^>]+content=[\"']([^\"']{0,200})[\"']/i)?.[1] ??
    pick(/<title[^>]*>([^<]{0,120})<\/title>/i)?.[1] ??
    null;

  const palette: string[] = [];
  const themeColor = pick(/<meta[^>]+name=[\"']theme-color[\"'][^>]+content=[\"']([^\"']+)[\"']/i);
  if (themeColor?.startsWith("#")) palette.push(themeColor);
  const hexMatches = html.match(/#(?:[0-9a-fA-F]{6})\b/g) ?? [];
  for (const h of hexMatches.slice(0, 400)) {
    if (!palette.includes(h)) palette.push(h);
    if (palette.length >= 8) break;
  }

  return { logoUrl, tagline: tagline?.trim() ?? null, palette };
}

/** Gemini Flash Lite structured JSON synthesis */
async function synthesizeWithGemini(
  companyName: string,
  domain: string,
  policyContent: string,
  reviewContent: string,
  geminiKey: string,
): Promise<Record<string, unknown> | null> {
  const systemPrompt = `You are a JSON-only response AI. Output ONLY valid JSON matching the schema. No markdown, no preamble.
Schema: {
  "companyProfile": { "name":string, "industry":string, "vertical":string, "monthlyTicketVolume":number, "avgHumanCostUSD":number, "avgOrderValue":number },
  "workflows": [{ "rank":number, "title":string, "intent":string, "pctVolume":number, "complexity":"RAG-Only"|"API Tool-Call", "channel":"Voice"|"WhatsApp"|"Web Chat", "toolName":string|null }],
  "frictionPoints": [{ "source":string, "theme":string, "quote":string, "aiFix":string }],
  "roiDefaults": { "monthlyVolume":number, "ahtMinutes":number, "costPerAgentMonth":number, "aiCostPerResolution":number, "deflectionRate":number, "agentCapacity":number, "fteHour":number },
  "mockTools": [{ "name":string, "args":string, "returns":string }]
}
Rules: exactly 10 workflows ranked by volume, 3-5 frictionPoints, exactly 3 mockTools. Keep strings under 80 chars. Deflection rate 0.0-1.0.`;

  const userPrompt = `Company: ${companyName} (${domain})
Policy content (top pages): ${policyContent.slice(0, 10000)}
Customer reviews/complaints: ${reviewContent.slice(0, 2400)}
Generate the JSON analysis.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!res.ok) {
      console.error("Gemini error:", res.status, await res.text());
      return null;
    }
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    return JSON.parse(clean) as Record<string, unknown>;
  } catch (e) {
    console.error("Gemini synthesis failed:", e);
    return null;
  }
}

/** Tavily search helper */
async function tavilySearch(
  query: string,
  options: {
    includeDomains?: string[];
    searchDepth?: "basic" | "advanced";
    maxResults?: number;
    includeRawContent?: boolean;
  },
  apiKey: string,
): Promise<{ results: { title: string; url: string; content: string; raw_content?: string }[] }> {
  const body: Record<string, unknown> = {
    query,
    max_results: options.maxResults ?? 6,
    search_depth: options.searchDepth ?? "basic",
    include_answer: false,
    include_raw_content: options.includeRawContent ?? false,
  };
  if (options.includeDomains?.length) body.include_domains = options.includeDomains;

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ results: { title: string; url: string; content: string; raw_content?: string }[] }>;
}

// ─── Main Edge Function ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const tavilyKey = Deno.env.get("TAVILY_API_KEY") ?? "";
  const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

  try {
    const body = await req.json() as { domain?: string; forceRefresh?: boolean };
    const domainRaw = body.domain?.trim().toLowerCase() ?? "";
    if (!domainRaw || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domainRaw)) {
      return new Response(JSON.stringify({ error: "A valid domain is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const domain = domainRaw.replace(/^www\./, "");
    const host = `https://${domain}`;

    // ── 1. Cache check (7-day) ────────────────────────────────────────────────
    if (!body.forceRefresh && supabaseUrl && supabaseServiceKey) {
      try {
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await sb
          .from("prospects")
          .select("brand, report")
          .eq("domain", domain)
          .gte("created_at", cutoff)
          .maybeSingle();
        if (data?.brand) {
          const b = data.brand as { logoUrl?: string; tagline?: string; palette?: string[] };
          return new Response(
            JSON.stringify({
              logoUrl: b.logoUrl ?? null,
              tagline: b.tagline ?? null,
              palette: Array.isArray(b.palette) ? b.palette : [],
              cached: true,
              synthesis: data.report as Record<string, unknown> ?? null,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch { /* cache miss – proceed */ }
    }

    // ── 2. Parallel data collection ───────────────────────────────────────────
    const companyName = domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    const [brandResult, policyResult, reviewResult] = await Promise.allSettled([
      // 2a. Brand identity from homepage HTML
      (async () => {
        const res = await fetch(host, {
          headers: { "User-Agent": UA, Accept: "text/html" },
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
        });
        if (!res.ok) return { logoUrl: null, tagline: null, palette: [] };
        const html = await res.text();
        return extractBrand(html, host);
      })(),

      // 2b. Policy & FAQ crawl via Tavily
      tavilyKey
        ? tavilySearch(
            `${companyName} customer support return policy refund billing FAQ contact help`,
            { includeDomains: [domain], maxResults: 6, includeRawContent: true },
            tavilyKey,
          )
        : Promise.resolve({ results: [] }),

      // 2c. Customer friction audit via Tavily (web-wide)
      tavilyKey
        ? tavilySearch(
            `"${companyName}" customer service complaints hold time support review`,
            { searchDepth: "advanced", maxResults: 4 },
            tavilyKey,
          )
        : Promise.resolve({ results: [] }),
    ]);

    // ── 3. Assemble brand ─────────────────────────────────────────────────────
    const brand = brandResult.status === "fulfilled"
      ? brandResult.value
      : { logoUrl: null, tagline: null, palette: [] };

    // ── 4. Assemble policy chunks ─────────────────────────────────────────────
    const policyResults = policyResult.status === "fulfilled" ? policyResult.value.results : [];
    const policyContent = policyResults
      .slice(0, 6)
      .map(r => {
        const raw = r.raw_content ?? r.content ?? "";
        return `PAGE: ${r.url}\n${pruneContent(raw, 2000)}`;
      })
      .join("\n\n---\n\n");

    // ── 5. Assemble review content ────────────────────────────────────────────
    const reviewResults = reviewResult.status === "fulfilled" ? reviewResult.value.results : [];
    const reviewContent = reviewResults
      .slice(0, 4)
      .map(r => `SOURCE: ${r.url}\n${pruneContent(r.content, 600)}`)
      .join("\n\n");

    // ── 6. Gemini synthesis ───────────────────────────────────────────────────
    let synthesis: Record<string, unknown> | null = null;
    if (geminiKey && (policyContent || reviewContent)) {
      synthesis = await synthesizeWithGemini(companyName, domain, policyContent, reviewContent, geminiKey);
    }

    // ── 7. Build policy chunks for RAG ────────────────────────────────────────
    const policyChunks = policyResults.slice(0, 6).map((r, i) => {
      const raw = r.raw_content ?? r.content ?? "";
      return {
        id: `chunk_${String(i + 1).padStart(3, "0")}`,
        url: r.url,
        topic: r.title.slice(0, 60),
        snippet: pruneContent(raw, 500),
      };
    });

    // ── 8. Build friction items from synthesis or reviews ─────────────────────
    const frictionPoints = synthesis?.frictionPoints as unknown[] | null
      ?? reviewResults.slice(0, 4).map((r, i) => ({
          source: new URL(r.url).hostname.replace("www.", ""),
          theme: `Support issue ${i + 1}`,
          quote: pruneContent(r.content, 220),
          aiFix: "An AI agent can resolve this automatically with grounded policy answers and live API tools.",
        }));

    // ── 9. Full payload ───────────────────────────────────────────────────────
    const payload = {
      logoUrl: brand.logoUrl,
      tagline: brand.tagline,
      palette: brand.palette,
      synthesis,
      policyChunks,
      frictionPoints,
      companyName,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("site-intel error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
