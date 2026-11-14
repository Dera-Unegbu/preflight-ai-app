import { supabase } from "./supabase";

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

declare global {
  interface Window {
    __preflightProspectId?: string;
  }
}
