import { useCallback, useEffect, useState } from "react";
import Landing from "@/components/Landing";
import PipelineView from "@/components/PipelineView";
import Microsite from "@/components/Microsite";
import { runPipeline } from "@/lib/pipeline";
import type { Report, Channel } from "@/lib/synthesis";
import { synthesizeReport } from "@/lib/synthesis";
import { supabase } from "@/lib/supabase";

type View =
  | { screen: "landing" }
  | { screen: "pipeline"; domain: string; channels: Channel[] }
  | { screen: "microsite"; report: Report; prospectId: string; isOwnView: boolean };

interface RecentDemo {
  slug: string;
  domain: string;
  name: string;
}

function App() {
  const [view, setView] = useState<View>({ screen: "landing" });
  const [recent, setRecent] = useState<RecentDemo[]>([]);
  const [step, setStep] = useState(0);

  const loadRecent = useCallback(async () => {
    const { data, error } = await supabase
      .from("prospects")
      .select("slug, domain, name")
      .order("created_at", { ascending: false })
      .limit(6);
    if (!error && data) setRecent(data);
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const start = (domain: string, channels: Channel[]) => {
    setStep(0);
    setView({ screen: "pipeline", domain, channels });
  };

  const enterMicrosite = (report: Report, prospectId: string) => {
    window.__preflightProspectId = prospectId;
    setView({ screen: "microsite", report, prospectId, isOwnView: true });
  };

  const openRecent = async (slug: string) => {
    const { data, error } = await supabase
      .from("prospects")
      .select("id, report")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return;
    const report = data.report as unknown as Report;
    if (!report || !report.workflows) return;
    enterMicrosite(report, data.id);
  };

  useEffect(() => {
    if (view.screen !== "pipeline") return;
    const { domain, channels } = view;
    let cancelled = false;

    const run = async () => {
      try {
        let completed = 0;
        for await (const event of runPipeline(domain, channels)) {
          if (cancelled) return;
          completed += 1;
          setStep(completed);
          if (event.step === "done" && event.report) {
            const { data, error } = await supabase
              .from("prospects")
              .select("id, report")
              .eq("slug", event.report.domain)
              .maybeSingle();
            if (cancelled) return;
            if (!error && data && data.report) {
              enterMicrosite(data.report as unknown as Report, data.id);
            } else {
              enterMicrosite(event.report, event.report.domain);
            }
            void loadRecent();
          }
        }
      } catch {
        if (cancelled) return;
        const report = synthesizeReport(domain, { logoUrl: null, tagline: null, palette: [] }, channels);
        enterMicrosite(report, report.domain);
      }
    };

    void run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.screen]);

  if (view.screen === "landing") {
    return <Landing onStart={start} recent={recent} onOpenRecent={openRecent} busy={false} />;
  }
  if (view.screen === "pipeline") {
    return <PipelineView domain={view.domain} currentStep={step} />;
  }
  return (
    <Microsite
      report={view.report}
      prospectId={view.prospectId}
      isOwnView={view.isOwnView}
      onBack={() => setView({ screen: "landing" })}
    />
  );
}

export default App;
