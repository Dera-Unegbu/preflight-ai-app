import { ExternalLink, Zap, Quote, Star, AlertTriangle, MessageCircle } from "lucide-react";
import type { Complaint } from "@/lib/synthesis";

interface Props {
  complaints: Complaint[];
  onJumpToSandbox: (question: string) => void;
}

const PLATFORM_STYLES: Record<string, { bg: string; icon: typeof Star }> = {
  Trustpilot:      { bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", icon: Star },
  "App Store":     { bg: "bg-sky-500/10 border-sky-500/30 text-sky-400", icon: Star },
  "Google Play":   { bg: "bg-sky-500/10 border-sky-500/30 text-sky-400", icon: Star },
  "Google Reviews":{ bg: "bg-amber-500/10 border-amber-500/30 text-amber-400", icon: Star },
  Reddit:          { bg: "bg-orange-500/10 border-orange-500/30 text-orange-400", icon: Quote },
  "Twitter/X":     { bg: "bg-neutral-500/10 border-neutral-500/30 text-neutral-300", icon: MessageCircle },
  G2:              { bg: "bg-indigo-500/10 border-indigo-500/30 text-indigo-400", icon: Star },
};

const SEVERITY_BADGES: Record<string, string> = {
  high:   "bg-red-500/15 text-red-400 border border-red-500/30",
  medium: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  low:    "bg-neutral-500/10 text-neutral-400 border border-neutral-500/20",
};

function getPlatformStyle(source: string) {
  // Try direct match first, then hostname match
  if (PLATFORM_STYLES[source]) return PLATFORM_STYLES[source];
  const lower = source.toLowerCase();
  if (lower.includes("trustpilot")) return PLATFORM_STYLES.Trustpilot;
  if (lower.includes("reddit")) return PLATFORM_STYLES.Reddit;
  if (lower.includes("apple") || lower.includes("appstore") || lower.includes("app store")) return PLATFORM_STYLES["App Store"];
  if (lower.includes("google")) return PLATFORM_STYLES["Google Reviews"];
  if (lower.includes("twitter") || lower.includes("x.com")) return PLATFORM_STYLES["Twitter/X"];
  if (lower.includes("g2")) return PLATFORM_STYLES.G2;
  return PLATFORM_STYLES.Reddit; // default
}

export default function FrictionModule({ complaints, onJumpToSandbox }: Props) {
  // No truncation — render all complaints provided (5–6+)
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {complaints.map((c, i) => {
          const style = getPlatformStyle(c.source ?? "");
          const SourceIcon = style.icon;
          const severity = (c as Complaint & { severity?: string }).severity ?? (i < 2 ? "high" : i < 4 ? "medium" : "low");
          const sourceUrl = (c as Complaint & { sourceUrl?: string }).sourceUrl;
          const platform = (c as Complaint & { platform?: string }).platform ?? c.source;

          return (
            <div
              key={i}
              className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-white/20"
            >
              {/* Header: platform badge + severity + theme */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.bg}`}>
                  <SourceIcon className="h-3 w-3" />
                  {platform}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SEVERITY_BADGES[severity] ?? SEVERITY_BADGES.medium}`}>
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  {severity.charAt(0).toUpperCase() + severity.slice(1)} severity
                </span>
                <span className="ml-auto rounded-full bg-white/5 px-2.5 py-1 text-xs text-neutral-400">{c.theme}</span>
              </div>

              {/* Quote */}
              <blockquote className="mb-4 flex-1 border-l-2 border-red-500/40 pl-3 text-sm italic leading-relaxed text-neutral-300">
                "{c.quote}"
              </blockquote>

              {/* AI Fix */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  <Zap className="h-3 w-3" />
                  Instant AI fix
                </div>
                <p className="text-sm leading-relaxed text-neutral-300">{c.aiFix}</p>
              </div>

              {/* Footer: source link + sandbox button */}
              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={() => onJumpToSandbox(c.quote.slice(0, 80))}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--brand-light)] opacity-70 transition-opacity hover:opacity-100"
                >
                  Test in sandbox →
                </button>
                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View source
                  </a>
                )}
              </div>
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
