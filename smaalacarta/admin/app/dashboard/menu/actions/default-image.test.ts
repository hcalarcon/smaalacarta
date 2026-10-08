// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBusiness, suggest } = vi.hoisted(() => ({
  requireBusiness: vi.fn(),
  suggest: vi.fn(),
}));

vi.mock("@/lib/get-current-business", () => ({ requireBusiness: () => requireBusiness() }));
vi.mock("@/lib/db/default-images", () => ({ suggestDefaultImage: suggest }));

import { suggestProductImageAction } from "./default-image";

// ADMIN-CONFIG-32: la acción exige un negocio y usa la función de la base.
beforeEach(() => {
  vi.clearAllMocks();
  requireBusiness.mockResolvedValue({ business: { id: "x" } });
  suggest.mockResolvedValue(null);
});

describe("suggestProductImageAction — ADMIN-CONFIG-32", () => {
  it("sin negocio no consulta", async () => {
    requireBusiness.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(suggestProductImageAction("Pizza", null)).rejects.toThrow("NEXT_REDIRECT");
    expect(suggest).not.toHaveBeenCalled();
  });

  it("devuelve el nombre y la imagen de la entrada que coincide", async () => {
    suggest.mockResolvedValue({ name: "Pizza", imageUrl: "https://x/p.svg", keyword: "pizza", byCategory: false });
    expect(await suggestProductImageAction(" Pizza muzzarella ", "Comidas")).toEqual({
      ok: true,
      suggestion: { name: "Pizza", imageUrl: "https://x/p.svg" },
    });
    expect(suggest).toHaveBeenCalledWith("Pizza muzzarella", "Comidas");
  });

  it("sin coincidencia, o con el nombre vacío, no hay sugerencia", async () => {
    expect(await suggestProductImageAction("Plato misterioso", null)).toEqual({ ok: true, suggestion: null });
    expect(await suggestProductImageAction("   ", null)).toEqual({ ok: true, suggestion: null });
    expect(suggest).toHaveBeenCalledTimes(1);
  });

  it("si la base falla, avisa sin romper el diálogo", async () => {
    suggest.mockRejectedValue(new Error("boom"));
    expect(await suggestProductImageAction("Pizza", null)).toEqual({ ok: false });
  });
});
