import { MessageSquare, Smartphone, PhoneCall, Brain, Wrench } from "lucide-react";
import type { Workflow, Channel } from "@/lib/synthesis";

interface Props {
  workflows: Workflow[];
  channels: Channel[];
  totalVolume: number;
  showVolumes: boolean;
}

const CHANNEL_ICON = {
  "Web Chat": MessageSquare,
  "WhatsApp": Smartphone,
  "Voice": PhoneCall,
};

const COMPLEXITY_STYLE = {
  "API Tool-Call": "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "RAG-Only": "bg-sky-500/10 text-sky-400 border-sky-500/30",
};

export default function MatrixModule({ workflows, channels, totalVolume, showVolumes }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-neutral-500">
              <th className="px-5 py-3 font-medium">#</th>
              <th className="px-5 py-3 font-medium">Workflow</th>
              {showVolumes && <th className="px-5 py-3 font-medium">Est. monthly volume</th>}
              <th className="px-5 py-3 font-medium">Share</th>
              <th className="px-5 py-3 font-medium">Complexity</th>
              <th className="px-5 py-3 font-medium">Best channel</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((w) => {
              const ChIcon = CHANNEL_ICON[w.channel];
              return (
                <tr key={w.rank} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]">
                  <td className="px-5 py-4">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-primary)]/15 text-xs font-bold text-[var(--brand-light)]">
                      {w.rank}
                    </span>
                  </td>
                  <td className="max-w-xs px-5 py-4">
                    <div className="font-medium text-white">{w.title}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">"{w.intent}"</div>
                  </td>
                  {showVolumes && (
                    <td className="px-5 py-4 tabular-nums text-neutral-300">
                      {w.estMonthlyVolume.toLocaleString()}
                    </td>
                  )}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[var(--brand-primary)]"
                          style={{ width: `${Math.min(100, (w.pctVolume / workflows[0].pctVolume) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-neutral-400">{w.pctVolume}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${COMPLEXITY_STYLE[w.complexity]}`}>
                      {w.complexity === "API Tool-Call" ? <Wrench className="h-3 w-3" /> : <Brain className="h-3 w-3" />}
                      {w.complexity}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                      channels.includes(w.channel.toLowerCase() as Channel)
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-white/10 bg-white/5 text-neutral-400"
                    }`}>
                      <ChIcon className="h-3 w-3" />
                      {w.channel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-white/10 bg-black/20 px-5 py-3 text-xs text-neutral-500">
        Estimated from public help-center coverage, complaint themes and {totalVolume.toLocaleString()} modeled monthly contacts for the {""}
        vertical. Complexity: RAG-Only = answers from policy docs; API Tool-Call = performs a live backend action.
      </div>
    </div>
  );
}
