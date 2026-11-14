import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ExternalLink, Workflow, MessageSquare, ShieldCheck, BarChart3,
  ChevronDown, FileJson, Copy, Check,
} from "lucide-react";
import type { Report } from "@/lib/synthesis";
import MatrixModule from "@/components/modules/MatrixModule";
import SandboxModule from "@/components/modules/SandboxModule";
import FrictionModule from "@/components/modules/FrictionModule";
import RoiModule from "@/components/modules/RoiModule";
import ShareBar from "@/components/ShareBar";
import { logEvent } from "@/lib/telemetry";

interface Props {
  report: Report;
  prospectId: string;
  isOwnView: boolean;
  onBack: () => void;
}

type TabId = "matrix" | "sandbox" | "friction" | "roi";

const TABS: { id: TabId; label: string; icon: typeof Workflow }[] = [
  { id: "matrix", label: "Automation Matrix", icon: Workflow },
  { id: "sandbox", label: "Live Sandbox", icon: MessageSquare },
  { id: "friction", label: "Friction Audit", icon: ShieldCheck },
  { id: "roi", label: "ROI Model", icon: BarChart3 },
];

export default function Microsite({ report, prospectId, isOwnView, onBack }: Props) {
  const [tab, setTab] = useState<TabId>("matrix");
  const [seedQuestion, setSeedQuestion] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const sandboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEvent("demo_opened", { via: isOwnView ? "creator" : "shared_link" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [primary, dark, light] = useMemo(() => {
    const p = report.brand.palette;
    const darken = (hex: string, f: number) => {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.max(0, Math.round(((n >> 16) & 255) * f));
      const g = Math.max(0, Math.round(((n >> 8) & 255) * f));
      const b = Math.max(0, Math.round((n & 255) * f));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
    };
    const lighten = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const f = (c: number) => Math.min(255, Math.round(c + (255 - c) * 0.45));
      return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
    };
    const base = p[0] ?? "#2563EB";
    return [base, darken(base, 0.55), lighten(base)];
  }, [report.brand.palette]);

  const jumpToSandbox = (question: string) => {
    setSeedQuestion(question);
    setTab("sandbox");
    logEvent("friction_jump", { question });
    setTimeout(() => sandboxRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  };

  const exportBlueprint = () => {
    const blueprint = {
      prospect: { name: report.name, domain: report.domain, industry: report.industryLabel },
      brand: report.brand,
      channels: report.channels,
      workflows: report.workflows.map((w) => ({
        rank: w.rank, title: w.title, intent: w.intent, channel: w.channel,
        complexity: w.complexity, est_monthly_volume: w.estMonthlyVolume,
        tool: w.tool ?? undefined,
      })),
      tools: report.tools,
      policies: report.policies,
      roi_defaults: report.roiDefaults,
    };
    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.domain}-agent-blueprint.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  const totalVolume = report.roiDefaults.monthlyVolume;

  return (
    <div
      className="min-h-screen bg-neutral-950 text-white"
      style={{ ["--brand-primary" as string]: primary, ["--brand-dark" as string]: dark, ["--brand-light" as string]: light }}
    >
      {/* Header */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          {isOwnView && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              New demo
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {report.brand.logoUrl && (
              <img
                src={report.brand.logoUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-1"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-bold">{report.name}</h1>
                <a
                  href={`https://${report.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-neutral-500 transition-colors hover:text-[var(--brand-light)]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="truncate text-xs text-neutral-500">
                {report.industryLabel} · AI support prototype built in 60 seconds
              </p>
            </div>
          </div>
          <button
            onClick={exportBlueprint}
            className="flex items-center gap-2 rounded-lg border border-white/15 px-3.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-[var(--brand-light)] hover:text-white"
          >
            {exported ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <FileJson className="h-3.5 w-3.5" />}
            {exported ? "Exported" : "Export Blueprint"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {isOwnView && (
          <div className="mb-6">
            <ShareBar slug={report.domain} />
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-1.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                tab === id
                  ? "bg-[var(--brand-primary)] text-white shadow-lg"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div ref={sandboxRef}>
          {tab === "matrix" && (
            <section>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">Automation Opportunity Matrix</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  {report.name}'s top 10 automation workflows, ranked by estimated contact volume — mapped before the first discovery call.
                </p>
              </div>
              <MatrixModule workflows={report.workflows} channels={report.channels} totalVolume={totalVolume} showVolumes />
            </section>
          )}

          {tab === "sandbox" && (
            <section>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">Live Grounded Sandbox</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  A working AI agent on {report.name}'s real policies. Every answer cites its source; try an edge case to see the human-handoff.
                </p>
              </div>
              <SandboxModule key={seedQuestion ?? "clean"} report={report} prospectId={prospectId} isOwnView={isOwnView} />
            </section>
          )}

          {tab === "friction" && (
            <section>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">External Friction Audit</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  What {report.name}'s customers say publicly about support today — and what the AI fix looks like.
                </p>
              </div>
              <FrictionModule complaints={report.complaints} onJumpToSandbox={jumpToSandbox} />
            </section>
          )}

          {tab === "roi" && (
            <section>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">Deflection ROI Model</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  {report.industryLabel} benchmarks pre-filled. Adjust the sliders to build the CFO-ready case.
                </p>
              </div>
              <RoiModule report={report} />
            </section>
          )}
        </div>
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-neutral-600">
        Generated by PreFlight AI · grounded in public support pages from {report.domain}
      </footer>
    </div>
  );
}
