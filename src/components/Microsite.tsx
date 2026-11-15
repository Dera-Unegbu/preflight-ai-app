import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ExternalLink, Workflow, MessageSquare, ShieldCheck, BarChart3,
  FileJson, Check, Activity, Zap,
} from "lucide-react";
import type { Report } from "@/lib/synthesis";
import MatrixModule from "@/components/modules/MatrixModule";
import SandboxModule from "@/components/modules/SandboxModule";
import FrictionModule from "@/components/modules/FrictionModule";
import RoiModule from "@/components/modules/RoiModule";
import ShareBar from "@/components/ShareBar";
import { logEvent, initDwellTracking, subscribeToEvents, type DemoEvent } from "@/lib/telemetry";

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

const EVENT_LABELS: Record<string, string> = {
  microsite_opened: "opened the demo",
  demo_opened: "opened the demo",
  tab_viewed: "viewed a tab",
  workflow_clicked: "clicked a workflow",
  roi_slider_adjusted: "adjusted ROI sliders",
  sandbox_message: "sent a chat message",
  voice_call_started: "started a voice call",
  business_case_exported: "exported the business case",
  escalation: "triggered human escalation",
  tool_call: "triggered a tool call",
  dwell_heartbeat: "is actively viewing",
};

export default function Microsite({ report, prospectId, isOwnView, onBack }: Props) {
  const [tab, setTab] = useState<TabId>("matrix");
  const [seedQuestion, setSeedQuestion] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const [recentEvents, setRecentEvents] = useState<DemoEvent[]>([]);
  const sandboxRef = useRef<HTMLDivElement>(null);

  // Boot dwell tracking
  useEffect(() => {
    logEvent("demo_opened", { via: isOwnView ? "creator" : "shared_link" });
    const cleanup = initDwellTracking();
    return cleanup;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Log tab changes
  useEffect(() => {
    logEvent("tab_viewed", { tab });
  }, [tab]);

  // Realtime activity feed (shared link view)
  useEffect(() => {
    if (!prospectId) return;
    const unsubscribe = subscribeToEvents(prospectId, (event) => {
      setRecentEvents((prev) => [event, ...prev].slice(0, 8));
    });
    return unsubscribe;
  }, [prospectId]);

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
      isLive: report.isLive ?? false,
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
    logEvent("business_case_exported", { domain: report.domain });
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
              className="flex cursor-pointer items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-white"
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
                {report.isLive && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    <Zap className="h-2.5 w-2.5" /> Live data
                  </span>
                )}
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
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-[var(--brand-light)] hover:text-white"
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

        {/* Live activity feed */}
        {recentEvents.length > 0 && (
          <div className="mb-6 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
              <Activity className="h-3.5 w-3.5 text-[var(--brand-light)]" />
              <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Live activity</span>
              <span className="ml-auto flex h-1.5 w-1.5 items-center rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-none">
              {recentEvents.map((e) => (
                <div
                  key={e.id}
                  className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]" />
                  <span className="text-[11px] text-neutral-300">
                    A viewer {EVENT_LABELS[e.event_type] ?? e.event_type}
                  </span>
                  <span className="text-[10px] text-neutral-600">
                    {new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-1.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
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
                  {report.name}'s top 10 automation workflows, ranked by estimated contact volume{report.isLive ? " — synthesized live from real support pages" : " — mapped before the first discovery call"}.
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
                  {report.isLive
                    ? `A working AI agent powered by Groq, grounded in ${report.name}'s real support pages. Every answer cites its source.`
                    : `A working AI agent on ${report.name}'s policies. Every answer cites its source; try an edge case to see the human-handoff.`}
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
                  {report.isLive
                    ? `Real complaints about ${report.name}'s support surfaced from public reviews — with AI resolutions.`
                    : `What ${report.name}'s customers say publicly about support today — and what the AI fix looks like.`}
                </p>
              </div>
              <FrictionModule complaints={report.complaints} onJumpToSandbox={jumpToSandbox} />
            </section>
          )}

          {tab === "roi" && (
            <section>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">CFO ROI Model</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  {report.isLive
                    ? `Benchmarks synthesized from ${report.name}'s industry profile. Adjust sliders to build the CFO-ready case.`
                    : `${report.industryLabel} benchmarks pre-filled. Adjust the sliders to build the CFO-ready case.`}
                </p>
              </div>
              <RoiModule report={report} />
            </section>
          )}
        </div>
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-neutral-600">
        Generated by PreFlight AI · grounded in public support pages from {report.domain}
        {report.isLive && " · powered by Tavily + Gemini + Groq"}
      </footer>
    </div>
  );
}
