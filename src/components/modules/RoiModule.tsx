import { useMemo, useState } from "react";
import { Download, TrendingUp, Users, Clock, DollarSign } from "lucide-react";
import type { Report } from "@/lib/synthesis";

interface Props {
  report: Report;
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
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
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
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

  const model = useMemo(() => {
    const deflected = volume * (deflection / 100);
    const humanOnlyAgents = Math.ceil(volume / d.agentCapacity);
    const withAiAgents = Math.ceil((volume - deflected) / d.agentCapacity);
    const agentsSaved = humanOnlyAgents - withAiAgents;
    const agentSavings = agentsSaved * agentCost;
    const aiCost = deflected * d.aiCostPerResolution;
    const ahtSavedHours = deflected * (aht / 60);
    const netSavings = agentSavings - aiCost;
    const annual = netSavings * 12;
    const pct = volume > 0 ? (netSavings / (humanOnlyAgents * agentCost)) * 100 : 0;
    return { deflected, agentsSaved, agentSavings, aiCost, netSavings, annual, ahtSavedHours, humanOnlyAgents, withAiAgents, pct };
  }, [volume, aht, agentCost, deflection, d]);

  const exportCsv = () => {
    const rows = [
      ["Metric", "Value"],
      ["Monthly contact volume", volume],
      ["Deflection rate", `${deflection}%`],
      ["Contacts deflected to AI", Math.round(model.deflected)],
      ["Average handle time (min)", aht],
      ["Agent hours redirected / month", Math.round(model.ahtSavedHours)],
      ["Agents before (FTE)", model.humanOnlyAgents],
      ["Agents after (FTE)", model.withAiAgents],
      ["Agent capacity saved (FTE)", model.agentsSaved],
      ["Cost per agent / month", agentCost],
      ["Agent cost saved / month", Math.round(model.agentSavings)],
      ["AI resolution cost / month", Math.round(model.aiCost)],
      ["Net monthly savings", Math.round(model.netSavings)],
      ["Net annual savings", Math.round(model.annual)],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.domain}-roi-business-case.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const money = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${Math.round(v).toLocaleString()}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Controls */}
      <div className="space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <Slider label="Monthly contacts (calls + chats)" value={volume} min={2000} max={250000} step={1000} onChange={setVolume} format={(v) => v.toLocaleString()} />
        <Slider label="Average handle time" value={aht} min={3} max={20} step={0.5} onChange={setAht} format={(v) => `${v} min`} />
        <Slider label="Cost per human agent / month" value={agentCost} min={300} max={2000} step={10} onChange={setAgentCost} format={(v) => `$${v.toLocaleString()}`} />
        <Slider label="AI deflection rate" value={deflection} min={20} max={90} step={1} onChange={setDeflection} format={(v) => `${v}%`} />
        <p className="text-xs leading-relaxed text-neutral-500">
          Benchmarks pre-filled from {report.industryLabel} averages. Adjust to your operation and watch the case re-build live.
        </p>
      </div>

      {/* Results */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--brand-primary)]/30 bg-gradient-to-br from-[var(--brand-primary)]/15 to-transparent p-6">
          <div className="flex items-center gap-2 text-sm text-neutral-300">
            <TrendingUp className="h-4 w-4 text-[var(--brand-light)]" />
            Projected net annual savings
          </div>
          <div className="mt-2 text-5xl font-bold tracking-tight text-white">{money(model.annual)}</div>
          <div className="mt-1 text-sm text-neutral-400">
            {money(model.netSavings)}/month · {Math.round(model.pct)}% of current support spend
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Users, label: "Agents redeployed", value: `${model.agentsSaved} FTE`, sub: `${model.humanOnlyAgents} → ${model.withAiAgents}` },
            { icon: Clock, label: "Agent hours redirected", value: `${Math.round(model.ahtSavedHours).toLocaleString()} h/mo`, sub: `${Math.round(model.deflected).toLocaleString()} contacts deflected` },
            { icon: DollarSign, label: "AI resolution cost", value: money(model.aiCost) + "/mo", sub: `vs ${money(model.agentSavings)} agent cost saved` },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <Icon className="mb-2 h-4 w-4 text-[var(--brand-light)]" />
              <div className="text-xl font-bold text-white">{value}</div>
              <div className="text-xs text-neutral-400">{label}</div>
              <div className="mt-1 text-xs text-neutral-600">{sub}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div>
            <p className="text-sm font-medium text-white">Export the CFO business case</p>
            <p className="text-xs text-neutral-500">Spreadsheet with every assumption, ready for the budget meeting.</p>
          </div>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}
