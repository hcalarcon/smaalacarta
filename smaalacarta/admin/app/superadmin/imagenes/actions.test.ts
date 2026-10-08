// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSuperAdmin, db } = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  db: {
    createDefaultImage: vi.fn(),
    updateDefaultImage: vi.fn(),
    deleteDefaultImage: vi.fn(),
    suggestDefaultImage: vi.fn(),
  },
}));

vi.mock("@/lib/auth/superadmin", () => ({ requireSuperAdmin: () => requireSuperAdmin() }));
vi.mock("@/lib/db/default-images", () => db);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteDefaultImageAction, probeDefaultImageAction, saveDefaultImageAction } from "./actions";

// ADMIN-SUPER-24: cada acción comprueba que quien la pide es superadmin antes de actuar.
const ID = "11111111-1111-1111-1111-111111111111";
const input = {
  name: " Hamburguesa ",
  keywords: "hamburguesa, burger,",
  imageUrl: "https://www.smaalacarta.com.ar/assets/defaults/hamburguesa.svg",
  priority: 5,
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperAdmin.mockResolvedValue({ id: "super" });
  db.createDefaultImage.mockResolvedValue({});
  db.updateDefaultImage.mockResolvedValue({});
  db.deleteDefaultImage.mockResolvedValue({});
  db.suggestDefaultImage.mockResolvedValue(null);
});

describe("quien no es superadmin no llega a la base — ADMIN-SUPER-24", () => {
  beforeEach(() => {
    requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
  });

  it("guardar", async () => {
    await expect(saveDefaultImageAction(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(db.createDefaultImage).not.toHaveBeenCalled();
    expect(db.updateDefaultImage).not.toHaveBeenCalled();
  });

  it("borrar", async () => {
    await expect(deleteDefaultImageAction(ID)).rejects.toThrow("NEXT_REDIRECT");
    expect(db.deleteDefaultImage).not.toHaveBeenCalled();
  });

  it("probar", async () => {
    await expect(probeDefaultImageAction("pizza", "")).rejects.toThrow("NEXT_REDIRECT");
    expect(db.suggestDefaultImage).not.toHaveBeenCalled();
  });
});

describe("saveDefaultImageAction — ADMIN-SUPER-21", () => {
  it("crea una entrada con las claves separadas y el nombre recortado", async () => {
    expect(await saveDefaultImageAction(input)).toEqual({ ok: true });
    expect(db.createDefaultImage).toHaveBeenCalledWith({
      name: " Hamburguesa ",
      keywords: ["hamburguesa", "burger"],
      imageUrl: input.imageUrl,
      priority: 5,
      active: true,
    });
  });

  it("con id edita en vez de crear", async () => {
    await saveDefaultImageAction({ ...input, id: ID });
    expect(db.updateDefaultImage).toHaveBeenCalledWith(ID, expect.objectContaining({ priority: 5 }));
    expect(db.createDefaultImage).not.toHaveBeenCalled();
  });

  it("un id que no es un uuid no llega a la base", async () => {
    const r = await saveDefaultImageAction({ ...input, id: "1 or 1=1" });
    expect(r.ok).toBe(false);
    expect(db.updateDefaultImage).not.toHaveBeenCalled();
  });

  it("datos inválidos vuelven con el error por campo y no se guardan", async () => {
    const r = await saveDefaultImageAction({ ...input, name: " ", keywords: "", imageUrl: "http://x" });
    expect(r.ok).toBe(false);
    expect(!r.ok && Object.keys(r.fieldErrors ?? {}).sort()).toEqual(["imageUrl", "keywords", "name"]);
    expect(db.createDefaultImage).not.toHaveBeenCalled();
  });

  it("si la base rechaza (RLS), avisa sin detalles", async () => {
    db.createDefaultImage.mockResolvedValue({ error: { code: "42501", message: "permiso" } });
    const r = await saveDefaultImageAction(input);
    expect(r).toEqual({ ok: false, error: "No pudimos guardar la imagen. Probá de nuevo." });
  });
});

describe("probeDefaultImageAction — ADMIN-SUPER-22", () => {
  it("devuelve lo que sugiere la base, con la categoría si hay", async () => {
    db.suggestDefaultImage.mockResolvedValue({ name: "Pizza", imageUrl: "https://x/p.svg", keyword: "pizza", byCategory: false });
    const r = await probeDefaultImageAction("Pizza muzzarella", "Comidas");
    expect(db.suggestDefaultImage).toHaveBeenCalledWith("Pizza muzzarella", "Comidas");
    expect(r).toMatchObject({ ok: true, match: { name: "Pizza" } });
  });

  it("una categoría vacía se manda como nula", async () => {
    await probeDefaultImageAction("Pizza", "");
    expect(db.suggestDefaultImage).toHaveBeenCalledWith("Pizza", null);
  });
});
