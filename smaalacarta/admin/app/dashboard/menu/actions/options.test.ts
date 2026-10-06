// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBusiness, db } = vi.hoisted(() => ({
  requireBusiness: vi.fn(),
  db: {
    saveOptionGroup: vi.fn(),
    deleteOptionGroup: vi.fn(),
    reorderOptionGroups: vi.fn(),
    setProductOptionGroups: vi.fn(),
  },
}));

vi.mock("@/lib/get-current-business", () => ({ requireBusiness: () => requireBusiness() }));
vi.mock("@/lib/db/options", () => db);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  deleteOptionGroupAction,
  reorderOptionGroupsAction,
  saveOptionGroupAction,
  setProductOptionGroupsAction,
} from "./options";

// ADMIN-OPCIONES-15 y 16: las acciones toman el negocio de la sesión, no del navegador.
const MIO = "a1a1a1a1-0000-0000-0000-000000000001";
const AJENO = "b2b2b2b2-0000-0000-0000-000000000002";

const group = {
  id: null,
  name: " Extras ",
  minSelect: 0,
  maxSelect: 2,
  allowRepeat: false,
  active: true,
  options: [
    { name: " Queso ", priceDelta: 500, active: true, soldOut: false },
    { name: "Huevo", priceDelta: 0, active: true, soldOut: false },
  ],
};

function business(plan: Partial<Record<"plan_pdf" | "plan_web" | "plan_completo", boolean>> = {}) {
  requireBusiness.mockResolvedValue({
    business: { id: MIO, plan_pdf: false, plan_web: true, plan_completo: false, ...plan },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  business();
  db.saveOptionGroup.mockResolvedValue({ id: "g1" });
  db.setProductOptionGroups.mockResolvedValue({ ok: true });
});

describe("las acciones de opciones — ADMIN-OPCIONES-16", () => {
  it("guarda en el negocio de la sesión y limpia los textos", async () => {
    const r = await saveOptionGroupAction(MIO, group);

    expect(r).toEqual({ ok: true, id: "g1" });
    expect(db.saveOptionGroup).toHaveBeenCalledWith(
      MIO,
      expect.objectContaining({
        name: "Extras",
        options: [
          expect.objectContaining({ name: "Queso", priceDelta: 500 }),
          expect.objectContaining({ name: "Huevo" }),
        ],
      }),
    );
  });

  it.each([
    ["guardar un grupo", () => saveOptionGroupAction(AJENO, group)],
    ["borrar un grupo", () => deleteOptionGroupAction(AJENO, "g1")],
    ["reordenar grupos", () => reorderOptionGroupsAction(AJENO, ["g1"])],
    ["asociar grupos a un producto", () => setProductOptionGroupsAction(AJENO, "p1", ["g1"])],
  ])("rechaza un businessId ajeno al %s", async (_caso, call) => {
    await expect(call()).rejects.toThrow();

    for (const fn of Object.values(db)) expect(fn).not.toHaveBeenCalled();
  });

  it("sin sesión de negocio, no hace nada", async () => {
    requireBusiness.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(saveOptionGroupAction(MIO, group)).rejects.toThrow("NEXT_REDIRECT");
    expect(db.saveOptionGroup).not.toHaveBeenCalled();
  });

  // ADMIN-OPCIONES-15: un negocio solo con PDF no tiene menú digital.
  it("rechaza todo si el negocio no tiene menú digital", async () => {
    business({ plan_web: false, plan_pdf: true });

    await expect(saveOptionGroupAction(MIO, group)).rejects.toThrow();
    await expect(deleteOptionGroupAction(MIO, "g1")).rejects.toThrow();
    for (const fn of Object.values(db)) expect(fn).not.toHaveBeenCalled();
  });

  it("acepta el plan completo sin plan web", async () => {
    business({ plan_web: false, plan_completo: true });
    expect((await saveOptionGroupAction(MIO, group)).ok).toBe(true);
  });

  it("valida antes de tocar la base y devuelve los errores por campo", async () => {
    const r = await saveOptionGroupAction(MIO, { ...group, name: "", options: [] });

    expect(r.ok).toBe(false);
    expect(!r.ok && r.fieldErrors).toMatchObject({ name: expect.any(String), options: expect.any(String) });
    expect(db.saveOptionGroup).not.toHaveBeenCalled();
  });

  it("traduce el error de la base a un mensaje en español", async () => {
    db.saveOptionGroup.mockResolvedValue({ error: { code: "P0014", message: "interno" } });

    const r = await saveOptionGroupAction(MIO, { ...group, id: "g1", minSelect: 1 });

    expect(!r.ok && r.error).toMatch(/promoci/i);
    expect(!r.ok && r.error).not.toMatch(/interno/);
  });

  it("valida los grupos del producto (máximo 6, sin repetir) antes de guardar", async () => {
    const siete = ["a", "b", "c", "d", "e", "f", "g"];
    const r = await setProductOptionGroupsAction(MIO, "p1", siete);

    expect(r.ok).toBe(false);
    expect(db.setProductOptionGroups).not.toHaveBeenCalled();

    expect((await setProductOptionGroupsAction(MIO, "p1", ["a", "b"])).ok).toBe(true);
    expect(db.setProductOptionGroups).toHaveBeenCalledWith(MIO, "p1", ["a", "b"]);
  });

  it("borra y reordena con el negocio de la sesión", async () => {
    await deleteOptionGroupAction(MIO, "g1");
    await reorderOptionGroupsAction(MIO, ["g2", "g1"]);

    expect(db.deleteOptionGroup).toHaveBeenCalledWith(MIO, "g1");
    expect(db.reorderOptionGroups).toHaveBeenCalledWith(MIO, ["g2", "g1"]);
  });
});
