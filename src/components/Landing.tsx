import { useState } from "react";
import {
  Globe, MessageSquare, Smartphone, PhoneCall, ArrowRight,
  Zap, ShieldCheck, BarChart3, Mic, Workflow, Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Channel } from "@/lib/synthesis";

interface Props {
  onStart: (domain: string, channels: Channel[]) => void;
  recent: { slug: string; domain: string; name: string }[];
  onOpenRecent: (slug: string) => void;
  busy: boolean;
}

const CHANNELS: { id: Channel; label: string; icon: typeof Globe }[] = [
  { id: "web", label: "Web Chat", icon: MessageSquare },
  { id: "whatsapp", label: "WhatsApp", icon: Smartphone },
  { id: "voice", label: "Voice / IVR", icon: PhoneCall },
];

const FEATURES = [
  { icon: Workflow, title: "Automation Opportunity Matrix", body: "Top 10 workflows ranked by ticket volume, complexity and best-fit channel — before your first discovery call." },
  { icon: MessageSquare, title: "Grounded Live Sandbox", body: "A brand-matched AI agent trained on their real policies, with inline citations and simulated backend actions." },
  { icon: ShieldCheck, title: "External Friction Audit", body: "Real public complaints about their current support, each paired with an instant AI fix." },
  { icon: BarChart3, title: "CFO-Ready ROI Model", body: "Editable deflection model with vertical benchmarks — the exact numbers champions need for budget sign-off." },
];

export default function Landing({ onStart, recent, onOpenRecent, busy }: Props) {
  const [domain, setDomain] = useState("");
  const [domainError, setDomainError] = useState("");
  const [selected, setSelected] = useState<Channel[]>(["web", "whatsapp", "voice"]);

  const toggle = (c: Channel) =>
    setSelected((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = domain.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (domain.trim() && !cleaned.includes(".")) {
      setDomainError("Input a valid URL (e.g. Yellow.ai))");
      return;
    }
    if (!cleaned || selected.length === 0) return;
    setDomainError("");
    onStart(cleaned, selected);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 text-white">
      {/* Backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-amber-500/10 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[600px] rounded-full bg-orange-600/5 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
      </div>

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 shadow-lg shadow-amber-500/30">
            <Zap className="h-5 w-5 text-neutral-950" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-bold tracking-tight">PreFlight AI</span>
          <span className="ml-2 hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-neutral-400 sm:inline">
            Pre-Sales &amp; Discovery Engine
          </span>
        </div>
        <span className="hidden text-sm text-neutral-500 md:inline">Internal GTM tool</span>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-24">
        <div className="pt-14 text-center md:pt-20">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/5 px-4 py-1.5 text-sm text-amber-400">
            <Gauge className="h-4 w-4" />
            Prospect demo live in 60 seconds
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-[1.15] tracking-tight md:text-6xl">
            Drop in a URL. Walk out with a{" "}
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
              live, brand-matched AI prototype
            </span>
            .
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-neutral-400">
            PreFlight turns any company's public support pages into a working Voice &amp; Chat AI demo,
            a top-10 automation blueprint, and a CFO-ready ROI case — the 3-week pre-sales cycle, compressed
            into one minute.
          </p>
        </div>

        {/* Input card */}
        <form
          onSubmit={submit}
          className="mx-auto mt-12 max-w-3xl rounded-2xl border border-white/10 bg-neutral-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur md:p-8"
        >
          <label htmlFor="domain" className="mb-2 block text-sm font-medium text-neutral-300">
            Prospect's website
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Globe className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" />
              <input
                id="domain"
                type="text"
                value={domain}
                onChange={(e) => {
                  setDomain(e.target.value);
                  setDomainError("");
                }}
                placeholder="noon.com, aramex.com, emiratesnbd.com…"
                className="h-12 w-full rounded-xl border border-white/10 bg-neutral-950 pl-12 pr-4 text-white placeholder:text-neutral-600 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
            <Button type="submit" size="lg" disabled={busy} className="sm:w-auto">
              {busy ? "Generating…" : "Generate demo"}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
          {domainError && <p className="mt-2 text-sm text-red-400" role="alert">{domainError}</p>}

          <div className="mt-5">
            <span className="mb-2 block text-sm font-medium text-neutral-300">Target channels</span>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map(({ id, label, icon: Icon }) => {
                const active = selected.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                      active
                        ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                        : "border-white/10 text-neutral-400 hover:border-white/25 hover:text-neutral-200"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </form>

        {recent.length > 0 && (
          <div className="mx-auto mt-6 max-w-3xl">
            <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">Recent demos</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {recent.map((r) => (
                <button
                  key={r.slug}
                  onClick={() => onOpenRecent(r.slug)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-neutral-300 transition-colors hover:border-amber-500/40 hover:text-amber-300"
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Feature grid */}
        <div className="mt-24 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-neutral-400">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Mic className="h-4 w-4" />
            <span>Voice simulator included — prospects can literally speak to their future agent.</span>
          </div>
        </div>
      </main>
    </div>
  );
}
