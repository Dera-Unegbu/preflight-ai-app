import { supabase } from "./supabase";
import { fetchBrand, type Brand } from "./siteIntel";
import { synthesizeReport, slugify, type Report, type Channel } from "./synthesis";

export interface PipelineStep {
  id: string;
  label: string;
  detail: string;
  duration: number;
}

export const PIPELINE_STEPS: PipelineStep[] = [
  { id: "discover", label: "Discovering help center & FAQ pages", detail: "Sitemap scan — /help, /faq, /returns, /pricing", duration: 900 },
  { id: "pages", label: "Crawling top pages", detail: "25 highest-signal pages converted to clean text", duration: 1400 },
  { id: "brand", label: "Extracting brand assets", detail: "Logo, primary hex colors, tone of voice", duration: 700 },
  { id: "policies", label: "Indexing policies into vector store", detail: "Chunking + embeddings for grounded RAG", duration: 1100 },
  { id: "workflows", label: "Mapping automation workflows", detail: "Ranking top 10 intents by volume & complexity", duration: 1300 },
  { id: "complaints", label: "Mining public friction signals", detail: "Trustpilot, App Store & Reddit complaint scan", duration: 1000 },
  { id: "tools", label: "Generating mock API tools", detail: "Industry-specific tool schemas for live actions", duration: 800 },
  { id: "roi", label: "Pre-filling ROI benchmarks", detail: "Vertical benchmarks for the CFO model", duration: 600 },
];

export async function* runPipeline(
  domainInput: string,
  channels: Channel[],
): AsyncGenerator<{ step: string; report?: Report }> {
  const domain = domainInput.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  let brand: Brand = { logoUrl: null, tagline: null, palette: [] };
  const brandFetch = (async () => {
    brand = await fetchBrand(domain);
  })();

  for (const step of PIPELINE_STEPS) {
    await new Promise((r) => setTimeout(r, step.duration));
    yield { step: step.id };

    if (step.id === "brand") {
      await brandFetch.catch(() => {});
    }
  }

  await brandFetch.catch(() => {});

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
