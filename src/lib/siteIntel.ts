import { supabase } from "./supabase";
import type { Brand } from "./synthesis";

export async function fetchBrand(domain: string): Promise<Brand> {
  const fallback: Brand = { logoUrl: null, tagline: null, palette: [] };
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/site-intel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain }),
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!response.ok) return fallback;
    const data = (await response.json()) as Partial<Brand>;
    if (typeof data !== "object" || data === null) return fallback;
    return {
      logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : null,
      tagline: typeof data.tagline === "string" ? data.tagline : null,
      palette: Array.isArray(data.palette) ? data.palette.filter((c): c is string => typeof c === "string") : [],
    };
  } catch {
    return fallback;
  }
}
