import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { logEvent } from "@/lib/telemetry";

export default function ShareBar({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const [notified, setNotified] = useState(false);
  const url = `app.preflight.ai/d/${slug}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard unavailable (permissions / non-secure context)
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const simulateProspectOpen = async () => {
    logEvent("demo_opened", { via: "simulated_push" });
    setNotified(true);
    setTimeout(() => setNotified(false), 4000);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <span className="text-sm text-neutral-400">Shareable link:</span>
      <code className="rounded-md bg-black/40 px-2 py-1 text-sm text-white/80">{url}</code>
      <Button variant="ghost" size="sm" onClick={copy} className="gap-1.5">
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button variant="outline" size="sm" onClick={simulateProspectOpen}>
        {notified ? "Prospect opened it — ping sent" : "Simulate prospect opening"}
      </Button>
    </div>
  );
}
