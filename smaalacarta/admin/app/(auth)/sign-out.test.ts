// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabase } = vi.hoisted(() => ({
  supabase: { rpc: vi.fn(), auth: { signOut: vi.fn() } },
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/supabase-admin", () => ({ createAdminClient: vi.fn() }));

import { signOutAction } from "./actions";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  supabase.rpc.mockResolvedValue({ error: null });
  supabase.auth.signOut.mockResolvedValue({ error: null });
});

// ADMIN-PWA-29: salir saca de la cuenta el aparato que se va, mientras la sesión sigue abierta.
describe("signOutAction — ADMIN-PWA-29", () => {
  it("borra la suscripción del aparato antes de cerrar la sesión", async () => {
    const order: string[] = [];
    supabase.rpc.mockImplementation(async () => {
      order.push("rpc");
      return { error: null };
    });
    supabase.auth.signOut.mockImplementation(async () => {
      order.push("signOut");
      return { error: null };
    });

    await expect(signOutAction(form({ pushEndpoint: "https://push.example/1" }))).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );

    expect(supabase.rpc).toHaveBeenCalledWith("delete_push_subscription", { p_endpoint: "https://push.example/1" });
    expect(order).toEqual(["rpc", "signOut"]);
  });

  it("sin aparato suscripto solo cierra la sesión", async () => {
    await expect(signOutAction(form({}))).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it("si borrar la suscripción falla, igual sale", async () => {
    supabase.rpc.mockRejectedValue(new Error("sin red"));

    await expect(signOutAction(form({ pushEndpoint: "https://push.example/1" }))).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );

    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});
