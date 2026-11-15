import type { Workflow, Complaint, PolicyChunk, Channel } from "./industryProfiles";
import { resolveIndustry, PROFILES, industryLabel } from "./industryProfiles";
import type { SiteIntelPayload, GeminiSynthesis } from "./siteIntel";

export interface Brand {
  logoUrl: string | null;
  tagline: string | null;
  palette: string[];
}

export interface Report {
  name: string;
  domain: string;
  industryKey: string;
  industryLabel: string;
  channels: Channel[];
  brand: Brand;
  workflows: Workflow[];
  complaints: Complaint[];
  policies: PolicyChunk[];
  tools: { name: string; args: string; returns: string }[];
  roiDefaults: {
    monthlyVolume: number;
    ahtMinutes: number;
    costPerAgentMonth: number;
    aiCostPerResolution: number;
    deflectionRate: number;
    agentCapacity: number;
    fteHour: number;
  };
  // Live data flags
  isLive?: boolean;
  livePolicyChunks?: PolicyChunk[];
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function domainToName(domain: string): string {
  const bare = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split(".")[0];
  return bare
    .split(/[-.]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const FALLBACK_PALETTES: Record<string, string[]> = {
  finance: ["#0F4C81", "#1B6FB5", "#3D8ED4", "#0A3558", "#6FAEDC"],
  travel: ["#0E7490", "#0891B2", "#22B8CF", "#155E70", "#67D3E3"],
  logistics: ["#C2410C", "#EA580C", "#F97316", "#9A3412", "#FDBA74"],
  telecom: ["#7E22CE", "#9333EA", "#A855F7", "#5B1A96", "#C084FC"],
  healthcare: ["#047857", "#059669", "#10B981", "#065F46", "#6EE7B7"],
  ecommerce: ["#B91C1C", "#DC2626", "#EF4444", "#7F1D1D", "#FCA5A5"],
  saas: ["#1D4ED8", "#2563EB", "#3B82F6", "#1E3A8A", "#93C5FD"],
  utilities: ["#166534", "#15803D", "#22C55E", "#14532D", "#86EFAC"],
};

function normalizeHex(raw: string): string | null {
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  const named: Record<string, string> = {
    red: "#DC2626", blue: "#2563EB", green: "#16A34A", orange: "#EA580C",
    purple: "#7C3AED", teal: "#0D9488", navy: "#1E3A8A", black: "#111111",
    white: "#FFFFFF", gray: "#6B7280", grey: "#6B7280", yellow: "#EAB308",
    pink: "#EC4899", gold: "#D4AF37", maroon: "#7F1D1D", brown: "#78350F",
  };
  const lower = raw.toLowerCase().trim();
  const m = lower.match(/^(?:rgb\s*)?\(?([\d.]{1,5})\s*,\s*([\d.]{1,5})\s*,\s*([\d.]{1,5})\)?$/);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    if (r <= 255 && g <= 255 && b <= 255)
      return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  return named[lower] ?? null;
}

function scoreColor(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const light = (max + min) / 2;
  const lightPenalty = Math.abs(light - 0.45) * 1.2;
  return sat - lightPenalty;
}

export function pickPalette(brand: Brand, industryKey: string): string[] {
  const candidates = brand.palette
    .map(normalizeHex)
    .filter((h): h is string => !!h);
  const unique = Array.from(new Set(candidates));
  if (unique.length >= 2) {
    const ranked = [...unique].sort((a, b) => scoreColor(b) - scoreColor(a));
    const primary = ranked[0];
    const rest = ranked.slice(1, 4);
    const fb = FALLBACK_PALETTES[industryKey] ?? FALLBACK_PALETTES.ecommerce;
    return [primary, ...rest, ...fb.filter((c) => !ranked.includes(c))].slice(0, 5);
  }
  return FALLBACK_PALETTES[industryKey] ?? FALLBACK_PALETTES.ecommerce;
}

/** Merge Gemini synthesis into Report, falling back to static profiles */
function mergeGeminiWorkflows(
  synthesis: GeminiSynthesis,
  staticProfile: ReturnType<typeof resolveIndustry>,
  totalVolume: number,
): Workflow[] {
  const synWf = synthesis.workflows;
  if (!synWf?.length) {
    return staticProfile.workflows.map((w, i) => ({
      ...w,
      rank: i + 1,
      estMonthlyVolume: Math.round((totalVolume * w.pctVolume) / 100),
    }));
  }

  return synWf.slice(0, 10).map((w, i) => {
    const tool = w.toolName
      ? { name: w.toolName, args: "id", returns: "result" }
      : undefined;
    return {
      rank: w.rank ?? i + 1,
      title: w.title,
      description: w.intent,
      intent: w.intent,
      pctVolume: w.pctVolume ?? Math.round(100 / (synWf.length || 10)),
      complexity: w.complexity ?? "RAG-Only",
      channel: w.channel ?? "Web Chat",
      estMonthlyVolume: Math.round((totalVolume * (w.pctVolume ?? 10)) / 100),
      tool,
    };
  });
}

export function synthesizeReport(
  domain: string,
  brand: Brand & { _intel?: SiteIntelPayload },
  channels: Channel[],
): Report {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  const name = domainToName(cleanDomain);
  const profile = resolveIndustry(cleanDomain, brand.tagline);
  const key = Object.keys(PROFILES).find((k) => PROFILES[k] === profile) ?? "ecommerce";
  const palette = pickPalette(brand, key);

  const intel = (brand as Brand & { _intel?: SiteIntelPayload })._intel;
  const synthesis = intel?.synthesis ?? null;

  // ROI defaults: prefer live synthesis, fallback to static
  const roiDefaults = synthesis?.roiDefaults
    ? {
        monthlyVolume: synthesis.roiDefaults.monthlyVolume || profile.benchmarks.monthlyVolume,
        ahtMinutes: synthesis.roiDefaults.ahtMinutes || profile.benchmarks.ahtMinutes,
        costPerAgentMonth: synthesis.roiDefaults.costPerAgentMonth || profile.benchmarks.costPerAgentMonth,
        aiCostPerResolution: synthesis.roiDefaults.aiCostPerResolution || profile.benchmarks.aiCostPerResolution,
        deflectionRate: synthesis.roiDefaults.deflectionRate || profile.benchmarks.deflectionRate,
        agentCapacity: synthesis.roiDefaults.agentCapacity || profile.benchmarks.agentCapacity,
        fteHour: synthesis.roiDefaults.fteHour || profile.benchmarks.fteHour,
      }
    : profile.benchmarks;

  const totalVolume = roiDefaults.monthlyVolume;

  // Workflows: live synthesis preferred
  const workflows = synthesis
    ? mergeGeminiWorkflows(synthesis, profile, totalVolume)
    : profile.workflows.map((w, i) => ({
        ...w,
        rank: i + 1,
        estMonthlyVolume: Math.round((totalVolume * w.pctVolume) / 100),
      }));

  // Tools: live synthesis preferred
  const tools = synthesis?.mockTools?.length
    ? synthesis.mockTools
    : profile.tools;

  // Complaints/friction: prefer live data
  const frictionData = intel?.frictionPoints ?? [];
  const complaintWorkflowMap = [1, 2, 3, 1, 5, 4, 2, 3];
  // Use live data if we have at least 3 items, otherwise fall back to static (which has 6)
  const complaints: Complaint[] = frictionData.length >= 3
    ? frictionData.map((f, i) => ({
        source: (f as typeof f & { platform?: string }).platform ?? f.source,
        quote: f.quote,
        theme: f.theme,
        aiFix: f.aiFix,
        workflowRef: complaintWorkflowMap[i] ?? null,
        // Pass through extended fields if present
        ...(((f as typeof f & { severity?: string }).severity) && { severity: (f as typeof f & { severity?: string }).severity as "high" | "medium" | "low" }),
        ...(((f as typeof f & { sourceUrl?: string }).sourceUrl) && { sourceUrl: (f as typeof f & { sourceUrl?: string }).sourceUrl }),
        ...(((f as typeof f & { platform?: string }).platform) && { platform: (f as typeof f & { platform?: string }).platform }),
      }))
    : profile.complaints.map((c, i) => ({
        ...c,
        workflowRef: complaintWorkflowMap[i] ?? null,
      }));

  // Policy chunks: prefer live scraped data
  const livePolicyChunks = intel?.policyChunks ?? [];
  const policies: PolicyChunk[] = livePolicyChunks.length > 0
    ? livePolicyChunks.map((p) => ({
        id: p.id,
        url: p.url,
        topic: p.topic,
        snippet: p.snippet,
      }))
    : profile.policies.map((p, i) => ({
        id: `chunk_${String(i + 1).padStart(3, "0")}`,
        url: `https://${cleanDomain}/help/${slugify(p.topic)}`,
        topic: p.topic,
        snippet: p.snippet,
      }));

  return {
    name: synthesis?.companyProfile?.name ?? name,
    domain: cleanDomain,
    industryKey: key,
    industryLabel: synthesis?.companyProfile?.industry ?? industryLabel(key),
    channels,
    brand: { logoUrl: brand.logoUrl, tagline: brand.tagline, palette },
    workflows,
    complaints,
    policies,
    tools,
    roiDefaults,
    isLive: !!synthesis,
    livePolicyChunks: livePolicyChunks.length > 0 ? livePolicyChunks : undefined,
  };
}

export type { Workflow, Complaint, PolicyChunk, Channel };
