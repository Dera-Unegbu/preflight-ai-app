import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function hex(c: number): string | null {
  if (!Number.isFinite(c)) return null;
  if (c > 0xffffff) return null;
  const v = c.toString(16).padStart(6, "0");
  return `#${v}`;
}

function safeUrl(host: string, path: string): string | null {
  try {
    const u = new URL(path, host);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

// Extract brand palette, logo and tagline from a page's HTML (no CSS color
// parsing in JS — color resolution only works for stylesheets, not inline
// styles, so we read the HTML directly).
function extractBrand(html: string, baseUrl: string) {
  const pick = (re: RegExp): string | null => {
    const m = html.match(re);
    return m ? m[1] : null;
  };

  // Logo: img tags, then <link rel="... icon...">, then og:image.
  const logo =
    pick(/<img[^>]+class=["'][^"']*(?:logo|brand)[^"']*["'][^>]*>/i)?.match(
      /src=["']([^"']+)["']/i,
    )?.[1] ??
    pick(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/i)?.match(
      /href=["']([^"']+)["']/i,
    )?.[1] ??
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    pick(/<img[^>]+src=["']([^"']*logo[^"']*)["'][^>]*>/i)?.[1] ??
    null;

  let logoUrl: string | null = null;
  if (logo) {
    const abs = safeUrl(baseUrl, logo);
    if (abs) logoUrl = abs;
  }

  const tagline =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,200})["']/i)?.[1] ??
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{0,200})["']/i)?.[1] ??
    pick(/<title[^>]*>([^<]{0,120})<\/title>/i)?.[1] ??
    null;

  // Candidate palette: inline styles, then og:image dominant color heuristic is
  // skipped; use theme-color meta, then body tag inline, then link rel stylesheet
  // hrefs are NOT fetched (cross-origin + parsing cost) — instead scan the raw
  // HTML for hex codes which most branded sites inline in <style> blocks.
  const palette: string[] = [];
  const themeColor = pick(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
  if (themeColor) {
    const c = hex(Number(themeColor.replace("#", "0x")));
    if (c) palette.push(c);
  }
  const hexMatches = html.match(/#(?:[0-9a-fA-F]{6})\b/g) ?? [];
  for (const h of hexMatches.slice(0, 400)) {
    const c = hex(Number(h.replace("#", "0x")));
    if (c && !palette.includes(c)) palette.push(c);
    if (palette.length >= 6) break;
  }

  return { logoUrl, tagline: tagline?.trim() ?? null, palette };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const { domain } = (await req.json()) as { domain?: string };
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim())) {
      return new Response(
        JSON.stringify({ error: "A valid domain is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const host = `https://${domain.trim().toLowerCase()}`;
    const brand = { logoUrl: null as string | null, tagline: null as string | null, palette: [] as string[] };

    try {
      const res = await fetch(host, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });
      if (res.ok) {
        const html = await res.text();
        const b = extractBrand(html, host);
        brand.logoUrl = b.logoUrl;
        brand.tagline = b.tagline;
        brand.palette = b.palette;
      }
    } catch {
      // Site unreachable — caller falls back to a static palette.
    }

    return new Response(JSON.stringify(brand), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
