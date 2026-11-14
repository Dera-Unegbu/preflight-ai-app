import { useEffect, useRef } from "react";
import { CheckCircle2, Loader2, Globe, Palette, FileText, Database, Workflow, MessageSquareWarning, Wrench, BarChart3, PartyPopper } from "lucide-react";

interface Props {
  domain: string;
  currentStep: number;
}

const ICONS = [Globe, Globe, Palette, Database, Workflow, MessageSquareWarning, Wrench, BarChart3];

const STEP_TIMES = [900, 2300, 3000, 3700, 4800, 6100, 7100, 7900];

export default function PipelineView({ domain, currentStep }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [currentStep]);

  const allDone = currentStep >= 8;
  const pct = Math.min(100, Math.round((currentStep / 8) * 100));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-white">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 relative h-24 w-24">
            <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" style={{ animationDuration: "2s" }} />
            <div className="absolute inset-0 flex items-center justify-center rounded-full border-2 border-amber-500/40 bg-amber-500/10">
              {allDone ? (
                <PartyPopper className="h-10 w-10 text-amber-400" />
              ) : (
                <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
              )}
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {allDone ? "Prototype ready" : `Building ${domain}'s prototype…`}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            {allDone ? "Loading the brand-matched microsite." : "Live ingestion & synthesis pipeline running."}
          </p>
        </div>

        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div ref={listRef} className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900/60 p-5">
          {STEP_TIMES.map((t, i) => {
            const Icon = ICONS[i];
            const done = i < currentStep;
            const active = i === currentStep && !allDone;
            if (!done && !active) return null;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-300 ${
                  active ? "bg-amber-500/5" : ""
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                ) : (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-amber-400" />
                )}
                <Icon className={`h-4 w-4 shrink-0 ${done ? "text-neutral-500" : "text-amber-400"}`} />
                <span className={`text-sm ${done ? "text-neutral-400" : "text-white"}`}>
                  {PIPELINE_LABELS[i]}
                </span>
                {active && (
                  <span className="ml-auto text-xs tabular-nums text-neutral-500">
                    {Math.floor(t / 1000)}s
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const PIPELINE_LABELS = [
  "Discovering help center & FAQ pages",
  "Crawling top 25 highest-signal pages",
  "Extracting brand assets (logo + hex colors)",
  "Indexing policies into vector store",
  "Mapping top 10 automation workflows",
  "Mining public friction signals",
  "Generating mock API tools",
  "Pre-filling ROI benchmarks",
];
