// Mismo contrato de siempre (`export const SUPABASE`), pero el valor sale del entorno del
// deploy vía `/api/supabase-config` (WEB-ENTORNO). Sin esa función (servidor estático en
// local) o si falla, se usan los de producción.
import { PRODUCTION_SUPABASE, parseSupabaseResponse } from "./lib/supabase-env.js";

async function load() {
  try {
    const res = await fetch("/api/supabase-config", { headers: { Accept: "application/json" } });
    if (!res.ok) return { ...PRODUCTION_SUPABASE };
    return parseSupabaseResponse(await res.json());
  } catch {
    return { ...PRODUCTION_SUPABASE };
  }
}

export const SUPABASE = await load();
