import type { Brand } from "./synthesis";

export type { Brand };

export interface SiteIntelPayload {
  logoUrl: string | null;
  tagline: string | null;
  palette: string[];
  cached?: boolean;
  synthesis: GeminiSynthesis | null;
  policyChunks: LivePolicyChunk[];
  frictionPoints: LiveFrictionPoint[];
  companyName: string;
}

export interface GeminiSynthesis {
  companyProfile: {
    name: string;
    industry: string;
    vertical: string;
    monthlyTicketVolume: number;
    avgHumanCostUSD: number;
    avgOrderValue: number;
  };
  workflows: {
    rank: number;
    title: string;
    intent: string;
    pctVolume: number;
    complexity: "RAG-Only" | "API Tool-Call";
    channel: "Voice" | "WhatsApp" | "Web Chat";
    toolName: string | null;
  }[];
  frictionPoints: {
    source: string;
    theme: string;
    quote: string;
    aiFix: string;
  }[];
  roiDefaults: {
    monthlyVolume: number;
    ahtMinutes: number;
    costPerAgentMonth: number;
    aiCostPerResolution: number;
    deflectionRate: number;
    agentCapacity: number;
    fteHour: number;
  };
  mockTools: { name: string; args: string; returns: string }[];
}

export interface LivePolicyChunk {
  id: string;
  url: string;
  topic: string;
  snippet: string;
}

export interface LiveFrictionPoint {
  source: string;
  theme: string;
  quote: string;
  aiFix: string;
  workflowRef?: number | null;
}

export async function fetchBrand(domain: string): Promise<Brand & { _intel?: SiteIntelPayload }> {
  const fallback: Brand = { logoUrl: null, tagline: null, palette: [] };
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/site-intel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain }),
        signal: AbortSignal.timeout(35000),
      },
    );
    if (!response.ok) return fallback;
    const data = (await response.json()) as Partial<SiteIntelPayload>;
    if (typeof data !== "object" || data === null) return fallback;

    const brand: Brand & { _intel?: SiteIntelPayload } = {
      logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : null,
      tagline: typeof data.tagline === "string" ? data.tagline : null,
      palette: Array.isArray(data.palette) ? data.palette.filter((c): c is string => typeof c === "string") : [],
      _intel: {
        logoUrl: data.logoUrl ?? null,
        tagline: data.tagline ?? null,
        palette: Array.isArray(data.palette) ? data.palette.filter(Boolean) as string[] : [],
        cached: data.cached,
        synthesis: data.synthesis ?? null,
        policyChunks: Array.isArray(data.policyChunks) ? data.policyChunks as LivePolicyChunk[] : [],
        frictionPoints: Array.isArray(data.frictionPoints) ? data.frictionPoints as LiveFrictionPoint[] : [],
        companyName: typeof data.companyName === "string" ? data.companyName : "",
      },
    };
    return brand;
  } catch {
    return fallback;
  }
}
