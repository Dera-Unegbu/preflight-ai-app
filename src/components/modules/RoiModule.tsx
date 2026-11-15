import { useMemo, useState } from "react";
import {
  Download, TrendingUp, Users, Clock, DollarSign, ShoppingCart, BarChart2,
} from "lucide-react";
import type { Report } from "@/lib/synthesis";
import { logEvent } from "@/lib/telemetry";

interface Props {
  report: Report;
}

type Scenario = "conservative" | "base" | "full";

const SCENARIO_CONFIG: Record<Scenario, { label: string; deflectionMult: number; revenueMult: number }> = {
  conservative: { label: "Conservative", deflectionMult: 0.75, revenueMult: 0.5 },
  base: { label: "Base Case", deflectionMult: 1.0, revenueMult: 1.0 },
  full: { label: "Full Omnichannel", deflectionMult: 1.2, revenueMult: 1.6 },
};

function Slider({
  label, value, min, max, step, onChange, format,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm text-neutral-300">{label}</label>
        <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-sm text-[var(--brand-light)]">
          {format(value)}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--brand-primary)]"
      />
    </div>
  );
}

export default function RoiModule({ report }: Props) {
  const d = report.roiDefaults;
  const [volume, setVolume] = useState(d.monthlyVolume);
  const [aht, setAht] = useState(d.ahtMinutes);
  const [agentCost, setAgentCost] = useState(d.costPerAgentMonth);
  const [deflection, setDeflection] = useState(Math.round(d.deflectionRate * 100));
  const [aov, setAov] = useState(120); // avg order/customer value — user-adjustable
  const [scenario, setScenario] = useState<Scenario>("base");

  const sc = SCENARIO_CONFIG[scenario];

  const model = useMemo(() => {
    const effDeflection = Math.min(0.95, (deflection / 100) * sc.deflectionMult);

    // ── Pillar 1: OpEx savings ────────────────────────────────────────────────
    const deflected = volume * effDeflection;
    const humanOnlyAgents = Math.ceil(volume / d.agentCapacity);
    const withAiAgents = Math.ceil((volume - deflected) / d.agentCapacity);
    const agentsSaved = Math.max(0, humanOnlyAgents - withAiAgents);
    const agentSavings = agentsSaved * agentCost;
    const aiCost = deflected * d.aiCostPerResolution;
    const ahtSavedHours = deflected * (aht / 60);
    const netMonthlySavings = Math.max(0, agentSavings - aiCost);
    const annualSavings = netMonthlySavings * 12;
    const savingsPct = volume > 0 ? (netMonthlySavings / (humanOnlyAgents * agentCost)) * 100 : 0;

    // ── Pillar 2: Revenue generated ───────────────────────────────────────────
    // After-hours & queue recovery: 8% of monthly volume × 12% conversion × AOV
    const queueRecovery = Math.round(volume * 0.08 * 0.12 * aov * sc.revenueMult);
    // Proactive upsell: 5% of AI-handled contacts × 7% upsell rate × AOV × 0.4
    const upsellRevenue = Math.round(deflected * 0.05 * 0.07 * aov * 0.4 * sc.revenueMult);
    // Churn prevention: 2% of volume × 60% save rate × AOV × 3 LTV multiplier
    const churnPrevention = Math.round(volume * 0.02 * 0.6 * aov * 3 * sc.revenueMult);
    const totalMonthlyRevenue = queueRecovery + upsellRevenue + churnPrevention;
    const annualRevenue = totalMonthlyRevenue * 12;

    // ── Combined ──────────────────────────────────────────────────────────────
    const totalAnnual = annualSavings + annualRevenue;
    const paybackDays = aiCost > 0 ? Math.round((aiCost * 12) / (totalAnnual / 365)) : 0;

    return {
      deflected, agentsSaved, agentSavings, aiCost, ahtSavedHours,
      humanOnlyAgents, withAiAgents, netMonthlySavings, annualSavings, savingsPct,
      queueRecovery, upsellRevenue, churnPrevention, totalMonthlyRevenue, annualRevenue,
      totalAnnual, paybackDays,
    };
  }, [volume, aht, agentCost, deflection, aov, scenario, d, sc]);

  const money = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${Math.round(v).toLocaleString()}`;

  const exportTxt = () => {
    const lines = [
      `PreFlight AI — CFO Business Case`,
      `Prospect: ${report.name} (${report.domain})`,
      `Industry: ${report.industryLabel}`,
      `Scenario: ${sc.label}`,
      `Generated: ${new Date().toLocaleDateString()}`,
      "",
      "── Pillar 1: Direct OpEx Savings ──────────────────",
      `Monthly contact volume:        ${volume.toLocaleString()}`,
      `AI deflection rate:            ${Math.round((deflection / 100) * sc.deflectionMult * 100)}%`,
      `Contacts deflected to AI:      ${Math.round(model.deflected).toLocaleString()}`,
      `Avg handle time:               ${aht} min`,
      `Agent hours freed / month:     ${Math.round(model.ahtSavedHours).toLocaleString()} h`,
      `Agents before (FTE):           ${model.humanOnlyAgents}`,
      `Agents after (FTE):            ${model.withAiAgents}`,
      `Agent cost saved / month:      ${money(model.agentSavings)}`,
      `AI resolution cost / month:    ${money(model.aiCost)}`,
      `Net savings / month:           ${money(model.netMonthlySavings)}`,
      `Annual OpEx savings:           ${money(model.annualSavings)}`,
      "",
      "── Pillar 2: Potential New Revenue ─────────────────",
      `After-hours lead recovery:     ${money(model.queueRecovery)}/mo`,
      `Proactive AI upsell:           ${money(model.upsellRevenue)}/mo`,
      `Churn prevention (LTV):        ${money(model.churnPrevention)}/mo`,
      `Total new revenue / month:     ${money(model.totalMonthlyRevenue)}`,
      `Annual revenue generated:      ${money(model.annualRevenue)}`,
      "",
      "── Combined Impact ──────────────────────────────────",
      `Total annual value:            ${money(model.totalAnnual)}`,
      `Payback period (est.):         ${model.paybackDays} days`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.domain}-cfo-business-case.txt`;
    a.click();
    URL.revokeObjectURL(url);
    logEvent("business_case_exported", { scenario, domain: report.domain });
  };

  const savingsFraction = model.totalAnnual > 0
    ? model.annualSavings / model.totalAnnual
    : 0.5;

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Controls */}
      <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        {/* Scenario toggle */}
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-300">Scenario</p>
          <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
            {(Object.keys(SCENARIO_CONFIG) as Scenario[]).map((s) => (
              <button
                key={s}
                onClick={() => { setScenario(s); logEvent("roi_scenario_changed", { scenario: s }); }}
                className={`flex-1 cursor-pointer rounded-md py-1.5 text-xs font-medium transition-colors ${
                  scenario === s ? "bg-[var(--brand-primary)] text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                {SCENARIO_CONFIG[s].label}
              </button>
            ))}
          </div>
        </div>

        <Slider label="Monthly contacts" value={volume} min={2000} max={250000} step={1000}
          onChange={(v) => { setVolume(v); logEvent("roi_slider_adjusted", { field: "volume", value: v }); }}
          format={(v) => v.toLocaleString()} />
        <Slider label="Average handle time" value={aht} min={3} max={20} step={0.5}
          onChange={(v) => { setAht(v); logEvent("roi_slider_adjusted", { field: "aht", value: v }); }}
          format={(v) => `${v} min`} />
        <Slider label="Cost per human agent / month" value={agentCost} min={300} max={2000} step={10}
          onChange={(v) => { setAgentCost(v); logEvent("roi_slider_adjusted", { field: "agentCost", value: v }); }}
          format={(v) => `$${v.toLocaleString()}`} />
        <Slider label="AI deflection rate" value={deflection} min={20} max={90} step={1}
          onChange={(v) => { setDeflection(v); logEvent("roi_slider_adjusted", { field: "deflection", value: v }); }}
          format={(v) => `${v}%`} />
        <Slider label="Avg order / customer value" value={aov} min={20} max={2000} step={10}
          onChange={(v) => { setAov(v); logEvent("roi_slider_adjusted", { field: "aov", value: v }); }}
          format={(v) => `$${v}`} />

        <p className="text-xs leading-relaxed text-neutral-500">
          Benchmarks pre-filled from {report.isLive ? "live synthesis" : `${report.industryLabel} averages`}. Adjust to your operation and watch the case rebuild live.
        </p>
      </div>

      {/* Results */}
      <div className="space-y-4">
        {/* Hero metric */}
        <div className="rounded-2xl border border-[var(--brand-primary)]/30 bg-gradient-to-br from-[var(--brand-primary)]/15 to-transparent p-6">
          <div className="flex items-center gap-2 text-sm text-neutral-300">
            <TrendingUp className="h-4 w-4 text-[var(--brand-light)]" />
            Total annual value ({sc.label})
          </div>
          <div className="mt-2 text-5xl font-bold tracking-tight text-white">{money(model.totalAnnual)}</div>
          <div className="mt-1 text-sm text-neutral-400">
            {money(model.netMonthlySavings + model.totalMonthlyRevenue)}/month · payback in {model.paybackDays} days
          </div>

          {/* Split bar */}
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[11px] text-neutral-500">
              <span>OpEx savings {Math.round(savingsFraction * 100)}%</span>
              <span>New revenue {Math.round((1 - savingsFraction) * 100)}%</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-l-full bg-[var(--brand-primary)] transition-all duration-500"
                style={{ width: `${savingsFraction * 100}%` }}
              />
              <div
                className="h-full rounded-r-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${(1 - savingsFraction) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Pillar 1: OpEx */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="mb-3 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-[var(--brand-light)]" />
            <span className="text-sm font-semibold text-white">Pillar 1 — Direct OpEx Savings</span>
            <span className="ml-auto text-lg font-bold text-white">{money(model.annualSavings)}/yr</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Users, label: "Agents redeployed", value: `${model.agentsSaved} FTE`, sub: `${model.humanOnlyAgents} → ${model.withAiAgents}` },
              { icon: Clock, label: "Agent hours freed", value: `${Math.round(model.ahtSavedHours).toLocaleString()} h/mo`, sub: `${Math.round(model.deflected).toLocaleString()} contacts deflected` },
              { icon: DollarSign, label: "AI resolution cost", value: money(model.aiCost) + "/mo", sub: `vs ${money(model.agentSavings)} saved` },
            ].map(({ icon: Icon, label, value, sub }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <Icon className="mb-1.5 h-3.5 w-3.5 text-[var(--brand-light)]" />
                <div className="text-lg font-bold text-white">{value}</div>
                <div className="text-xs text-neutral-400">{label}</div>
                <div className="mt-0.5 text-xs text-neutral-600">{sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Pillar 2: Revenue */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-semibold text-white">Pillar 2 — Potential New Revenue</span>
            <span className="ml-auto text-lg font-bold text-white">{money(model.annualRevenue)}/yr</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "24/7 Queue & After-Hours Recovery", value: money(model.queueRecovery) + "/mo", detail: "Leads & queries captured outside staffed hours" },
              { label: "Proactive AI Upsell & Cross-Sell", value: money(model.upsellRevenue) + "/mo", detail: "Contextual offers triggered mid-conversation" },
              { label: "Churn Prevention (LTV)", value: money(model.churnPrevention) + "/mo", detail: "At-risk customers saved × lifetime value" },
            ].map(({ label, value, detail }) => (
              <div key={label} className="rounded-xl border border-emerald-500/15 bg-black/20 p-4">
                <div className="text-lg font-bold text-emerald-300">{value}</div>
                <div className="text-xs text-neutral-300">{label}</div>
                <div className="mt-0.5 text-xs text-neutral-600">{detail}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Export */}
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div>
            <p className="text-sm font-medium text-white">Export the CFO business case</p>
            <p className="text-xs text-neutral-500">Plain-text summary with every assumption — ready for the budget meeting.</p>
          </div>
          <button
            onClick={exportTxt}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
          >
            <Download className="h-4 w-4" />
            Export .txt
          </button>
        </div>
      </div>
    </div>
  );
}
