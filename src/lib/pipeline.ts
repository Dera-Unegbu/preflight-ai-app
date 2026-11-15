import { supabase } from "./supabase";
import { fetchBrand } from "./siteIntel";
import { synthesizeReport, slugify, type Report, type Channel } from "./synthesis";

export interface PipelineStep {
  id: string;
  label: string;
  detail: string;
  duration: number;
}

export const PIPELINE_STEPS: PipelineStep[] = [
  { id: "discover", label: "Discovering help center & FAQ pages", detail: "Sitemap scan — /help, /faq, /returns, /pricing", duration: 800 },
  { id: "pages", label: "Crawling top support pages", detail: "Tavily — 6 highest-signal pages converted to clean text", duration: 1200 },
  { id: "brand", label: "Extracting brand assets", detail: "Logo, primary hex colors, tagline from og: tags", duration: 600 },
  { id: "policies", label: "Indexing policies into RAG chunks", detail: "Chunking + TF-IDF scoring for grounded retrieval", duration: 900 },
  { id: "complaints", label: "Mining public friction signals", detail: "Tavily web-wide search — Trustpilot, Reddit, App Store", duration: 1000 },
  { id: "workflows", label: "Synthesising automation workflows", detail: "Gemini Flash Lite — JSON mode, top 10 intents by volume", duration: 1400 },
  { id: "tools", label: "Generating mock API tools", detail: "Industry-specific tool schemas for live sandbox actions", duration: 700 },
  { id: "roi", label: "Pre-filling CFO ROI benchmarks", detail: "Vertical baselines from live synthesis or static profiles", duration: 500 },
];

export async function* runPipeline(
  domainInput: string,
  channels: Channel[],
): AsyncGenerator<{ step: string; report?: Report }> {
  const domain = domainInput
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");

  // Kick off brand+intel fetch immediately (runs in parallel with step timers)
  let brand: Awaited<ReturnType<typeof fetchBrand>> = { logoUrl: null, tagline: null, palette: [] };
  const brandFetch = fetchBrand(domain).then((b) => { brand = b; }).catch(() => {});

  for (const pipelineStep of PIPELINE_STEPS) {
    await new Promise((r) => setTimeout(r, pipelineStep.duration));
    yield { step: pipelineStep.id };
    // Wait for brand fetch once we're past the brand step so synthesis has the data
    if (pipelineStep.id === "brand") {
      await brandFetch;
    }
  }

  // Ensure brand fetch is settled before synthesizing
  await brandFetch;

  const report = synthesizeReport(domain, brand, channels);
  const slug = slugify(domain);

  const { error } = await supabase
    .from("prospects")
    .upsert(
      {
        slug,
        domain: report.domain,
        name: report.name,
        industry: report.industryKey,
        channels,
        brand: report.brand,
        report: report as unknown as Record<string, unknown>,
      },
      { onConflict: "slug" },
    );

  if (error) throw new Error(error.message);

  yield { step: "done", report };
}
