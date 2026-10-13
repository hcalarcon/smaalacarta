import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions", () => ({ deletePromotionAction: vi.fn(), setPromotionActiveAction: vi.fn() }));

import PromotionsClient from "./PromotionsClient";
import type { PromotionWithStock } from "@/lib/db/promotions";

const NOW = new Date("2026-10-20T15:00:00Z"); // martes 12:00 en Argentina

function promo(extra: Partial<PromotionWithStock> = {}): PromotionWithStock {
  return {
    id: "pr-1",
    business_id: "b-1",
    name: "Combo desayuno",
    description: null,
    type: "percent",
    discount_percent: 20,
    price: null,
    active: true,
    image_url: null,
    image_product_id: null,
    valid_until: null,
    stock: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    promotion_items: [
      { product_id: "p1", sort_order: 0, products: { id: "p1", name: "Café", price: 1000, active: true, image_url: null } },
      {
        product_id: "p2",
        sort_order: 1,
        products: { id: "p2", name: "Medialuna", price: 500, active: true, image_url: "https://x/medialuna.jpg" },
      },
    ],
    stats: { sold: 0, remaining: null },
    ...extra,
  };
}

const status = () => screen.getByTestId("promo-status").textContent;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("lista de promociones — ADMIN-PROMO-11", () => {
  it("una promoción sin vigencia está vigente y no muestra fechas ni unidades", () => {
    render(<PromotionsClient promotions={[promo()]} />);

    expect(status()).toBe("Vigente");
    expect(screen.queryByText(/Hasta/)).toBeNull();
    expect(screen.queryByText(/Quedan/)).toBeNull();
  });

  it.each([
    ["2026-10-21T02:59:00.000Z", "Vence hoy"], // hoy a las 23:59
    ["2026-10-22T02:59:00.000Z", "Vence mañana"],
    ["2026-10-25T02:59:00.000Z", "Vigente"],
    ["2026-10-19T02:59:00.000Z", "Vencida"],
  ])("fin %s: %s", (validUntil, label) => {
    render(<PromotionsClient promotions={[promo({ valid_until: validUntil })]} />);

    expect(status()).toBe(label);
    expect(screen.getByText(/Hasta \d\d\/\d\d a las 23:59/)).toBeTruthy();
  });

  it("agotada cuando no queda ninguna, con lo vendido", () => {
    render(<PromotionsClient promotions={[promo({ stock: 5, stats: { sold: 5, remaining: 0 } })]} />);

    expect(status()).toBe("Agotada");
    expect(screen.getByText(/Quedan 0 de 5 · 5 vendidas/)).toBeTruthy();
  });

  it("con stock muestra cuántas quedan y cuántas se vendieron", () => {
    render(<PromotionsClient promotions={[promo({ stock: 10, stats: { sold: 1, remaining: 9 } })]} />);

    expect(status()).toBe("Vigente");
    expect(screen.getByText(/Quedan 9 de 10 · 1 vendida$/)).toBeTruthy();
  });

  it("la miniatura es la imagen propia, o la del primer producto con foto", () => {
    const { container, rerender } = render(<PromotionsClient promotions={[promo()]} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://x/medialuna.jpg");

    rerender(<PromotionsClient promotions={[promo({ image_url: "https://x/propia.jpg" })]} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://x/propia.jpg");
  });

  it("sin ninguna foto, dice 'Sin foto'", () => {
    const sinFotos = promo({
      promotion_items: [
        { product_id: "p1", sort_order: 0, products: { id: "p1", name: "Café", price: 1000, active: true, image_url: null } },
      ],
    });
    const { container } = render(<PromotionsClient promotions={[sinFotos]} />);

    expect(container.querySelector("img")).toBeNull();
    expect(within(container).getByText("Sin foto")).toBeTruthy();
  });
});
