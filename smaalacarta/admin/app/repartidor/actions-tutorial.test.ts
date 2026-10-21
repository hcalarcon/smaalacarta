// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCourier, tutorialDb } = vi.hoisted(() => ({
  requireCourier: vi.fn(),
  tutorialDb: { markTutorialSeen: vi.fn() },
}));

vi.mock("@/lib/auth/courier", () => ({ requireCourier: () => requireCourier() }));
vi.mock("@/lib/db/courier-tutorial", () => tutorialDb);
vi.mock("@/lib/db/courier", () => ({}));
vi.mock("@/lib/db/courier-terms", () => ({}));
vi.mock("@/lib/db/availability", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { markTutorialSeenAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireCourier.mockResolvedValue({ user: { id: "u" }, courierId: "c" });
  tutorialDb.markTutorialSeen.mockResolvedValue({ ok: true });
});

// ENVIO-212 y 213: el repartidor sale de la sesión; la acción no recibe ningún id.
describe("marcar el tutorial como visto", () => {
  it("quien no es repartidor no llega a la base", async () => {
    requireCourier.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(markTutorialSeenAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(tutorialDb.markTutorialSeen).not.toHaveBeenCalled();
  });

  it("llama a la base sin argumentos", async () => {
    expect(await markTutorialSeenAction()).toEqual({ ok: true });
    expect(tutorialDb.markTutorialSeen).toHaveBeenCalledWith();
  });

  it("si la base falla, responde con el mensaje general", async () => {
    tutorialDb.markTutorialSeen.mockResolvedValue({ error: { code: "XX", message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await markTutorialSeenAction();
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain("boom");
  });
});
