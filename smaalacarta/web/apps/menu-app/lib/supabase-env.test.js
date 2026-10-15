import { describe, expect, it } from "vitest";

import { PRODUCTION_SUPABASE, parseSupabaseResponse, resolveSupabase } from "./supabase-env.js";

describe("resolveSupabase — WEB-ENTORNO-1 y 2", () => {
  it("WEB-ENTORNO-1: con las variables definidas, usa esos valores", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://prueba.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba",
    };
    expect(resolveSupabase(env)).toEqual({ url: "https://prueba.supabase.co", key: "sb_publishable_prueba" });
  });

  it("WEB-ENTORNO-2: sin variables, usa los de producción", () => {
    expect(resolveSupabase({})).toEqual(PRODUCTION_SUPABASE);
    expect(resolveSupabase(undefined)).toEqual(PRODUCTION_SUPABASE);
  });

  it("WEB-ENTORNO-2: si falta una o está vacía, no mezcla bases", () => {
    expect(resolveSupabase({ NEXT_PUBLIC_SUPABASE_URL: "https://prueba.supabase.co" })).toEqual(PRODUCTION_SUPABASE);
    expect(
      resolveSupabase({ NEXT_PUBLIC_SUPABASE_URL: "  ", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" }),
    ).toEqual(PRODUCTION_SUPABASE);
  });
});

describe("parseSupabaseResponse — WEB-ENTORNO-3", () => {
  it("usa la respuesta válida y cae a producción si no lo es", () => {
    expect(parseSupabaseResponse({ url: "https://x.supabase.co", key: "k" })).toEqual({
      url: "https://x.supabase.co",
      key: "k",
    });
    expect(parseSupabaseResponse(null)).toEqual(PRODUCTION_SUPABASE);
    expect(parseSupabaseResponse({ url: "https://x.supabase.co" })).toEqual(PRODUCTION_SUPABASE);
  });
});
