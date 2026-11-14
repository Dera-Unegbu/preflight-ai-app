import { ExternalLink, Zap, Quote, Star, ArrowRight } from "lucide-react";
import type { Complaint } from "@/lib/synthesis";

interface Props {
  complaints: Complaint[];
  onJumpToSandbox: (question: string) => void;
}

const SOURCE_STYLES: Record<string, { bg: string; icon: typeof Star }> = {
  Trustpilot: { bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", icon: Star },
  "App Store": { bg: "bg-sky-500/10 border-sky-500/30 text-sky-400", icon: Star },
  Reddit: { bg: "bg-orange-500/10 border-orange-500/30 text-orange-400", icon: Quote },
};

export default function FrictionModule({ complaints, onJumpToSandbox }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {complaints.map((c, i) => {
          const style = SOURCE_STYLES[c.source] ?? SOURCE_STYLES.Reddit;
          const SourceIcon = style.icon;
          return (
            <div
              key={i}
              className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-white/20"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.bg}`}>
                  <SourceIcon className="h-3 w-3" />
                  {c.source}
                </span>
                <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-neutral-400">{c.theme}</span>
              </div>

              <blockquote className="mb-4 flex-1 border-l-2 border-red-500/40 pl-3 text-sm italic leading-relaxed text-neutral-300">
                "{c.quote}"
              </blockquote>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  <Zap className="h-3 w-3" />
                  Instant AI fix
                </div>
                <p className="text-sm leading-relaxed text-neutral-300">{c.aiFix}</p>
              </div>

              <button
                onClick={() => onJumpToSandbox(c.quote.slice(0, 60))}
                className="mt-3 inline-flex items-center gap-1 self-start text-xs font-medium text-[var(--brand-light)] opacity-70 transition-opacity hover:opacity-100"
              >
                Test this in the sandbox
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-neutral-600">
        Sources: public review platforms and community threads mentioning this company's support experience.
        Quotes are representative of the themes surfaced for this vertical.
      </p>
    </div>
  );
}
