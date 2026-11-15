import { supabase } from "./supabase";

// Realtime channel for live activity feed
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

export function logEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
): void {
  const prospectId = window.__preflightProspectId;
  if (!prospectId) return;

  void supabase
    .from("demo_events")
    .insert({ prospect_id: prospectId, event_type: eventType, payload });
}

// Active dwell-time tracker
let dwellStart: number | null = null;
let dwellAccumulated = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isActive = false;

function getActiveDwellSeconds(): number {
  if (dwellStart !== null && isActive) {
    return Math.round(dwellAccumulated + (Date.now() - dwellStart) / 1000);
  }
  return Math.round(dwellAccumulated);
}

function pauseDwell() {
  if (dwellStart !== null && isActive) {
    dwellAccumulated += (Date.now() - dwellStart) / 1000;
    dwellStart = null;
  }
  isActive = false;
}

function resumeDwell() {
  if (!isActive) {
    dwellStart = Date.now();
    isActive = true;
  }
}

export function initDwellTracking(): () => void {
  resumeDwell();

  const handleVisibilityChange = () => {
    if (document.hidden) {
      pauseDwell();
    } else {
      resumeDwell();
    }
  };

  const handleBlur = () => pauseDwell();
  const handleFocus = () => resumeDwell();

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("blur", handleBlur);
  window.addEventListener("focus", handleFocus);

  // Heartbeat every 15 seconds
  heartbeatTimer = setInterval(() => {
    const activeSecs = getActiveDwellSeconds();
    if (activeSecs > 0) {
      logEvent("dwell_heartbeat", { active_seconds: activeSecs });
    }
  }, 15000);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("blur", handleBlur);
    window.removeEventListener("focus", handleFocus);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    // Log final dwell on unmount
    logEvent("dwell_end", { active_seconds: getActiveDwellSeconds() });
  };
}

export interface DemoEvent {
  id: string;
  prospect_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Subscribe to real-time demo events for a given prospect */
export function subscribeToEvents(
  prospectId: string,
  onEvent: (event: DemoEvent) => void,
): () => void {
  if (realtimeChannel) {
    void supabase.removeChannel(realtimeChannel);
  }

  const ch = supabase.channel(`telemetry-${prospectId}`);
  realtimeChannel = ch
    .on(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "postgres_changes" as any,
      {
        event: "INSERT",
        schema: "public",
        table: "demo_events",
        filter: `prospect_id=eq.${prospectId}`,
      },
      (payload: { new: DemoEvent }) => {
        onEvent(payload.new);
      },
    )
    .subscribe();

  return () => {
    if (realtimeChannel) {
      void supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}

declare global {
  interface Window {
    __preflightProspectId?: string;
  }
}
