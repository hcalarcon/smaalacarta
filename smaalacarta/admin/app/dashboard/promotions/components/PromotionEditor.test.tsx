import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { savePromotionAction, push } = vi.hoisted(() => ({ savePromotionAction: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ savePromotionAction }));
vi.mock("@/components/ui/ImageUploader", () => ({
  default: ({ value, onChange }: { value: string; onChange: (url: string) => void }) => (
    <button type="button" onClick={() => onChange("https://x/subida.jpg")}>
      Subir imagen propia ({value || "vacía"})
    </button>
  ),
}));

import PromotionEditor, { type ProductOption, type PromotionInitial } from "./PromotionEditor";

const products: ProductOption[] = [
  { id: "p1", name: "Café", price: 1000, active: true, categoryName: "Bebidas", imageUrl: "https://x/cafe.jpg" },
  { id: "p2", name: "Medialuna", price: 500, active: true, categoryName: "Panadería", imageUrl: null },
];

const initial: PromotionInitial = {
  id: "pr-1",
  name: "Combo desayuno",
  description: "",
  type: "percent",
  discountPercent: 20,
  price: null,
  active: true,
  items: [
    { productId: "p1", quantity: 1 },
    { productId: "p2", quantity: 1 },
  ],
  imageUrl: null,
  imageProductId: null,
  validUntil: null,
  stock: null,
  sold: 0,
  remaining: null,
};

function open(extra: Partial<PromotionInitial> = {}) {
  render(<PromotionEditor businessId="b-1" products={products} initial={{ ...initial, ...extra }} />);
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
const lastCall = () => savePromotionAction.mock.calls.at(-1)?.[0];

beforeEach(() => {
  savePromotionAction.mockReset();
  savePromotionAction.mockResolvedValue({ ok: true });
  push.mockReset();
});

afterEach(cleanup);

describe("editor de promoción — imagen (ADMIN-PROMO-2 y 3)", () => {
  it("una promoción sin imagen ni vigencia guarda todo en nulo", async () => {
    open();
    save();

    await waitFor(() => expect(savePromotionAction).toHaveBeenCalled());
    expect(lastCall()).toMatchObject({ imageUrl: null, imageProductId: null, validUntil: null, stock: null });
  });

  it("ofrece como opciones los productos de la promoción, con su miniatura", () => {
    open();

    expect(screen.getByRole("radio", { name: /Café/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Medialuna/ })).toBeTruthy();
    expect(screen.getByText("Sin foto")).toBeTruthy();
  });

  it("elegir la foto de un producto guarda la referencia", async () => {
    open();

    fireEvent.click(screen.getByRole("radio", { name: /Café/ }));
    save();

    await waitFor(() => expect(savePromotionAction).toHaveBeenCalled());
    expect(lastCall()).toMatchObject({ imageUrl: null, imageProductId: "p1" });
  });

  it("subir una imagen propia descarta la del producto, y al revés", async () => {
    open({ imageProductId: "p1" });

    fireEvent.click(screen.getByRole("button", { name: /Subir imagen propia/ }));
    expect((screen.getByRole("radio", { name: /Café/ }) as HTMLInputElement).checked).toBe(false);

    save();
    await waitFor(() => expect(savePromotionAction).toHaveBeenCalledTimes(1));
    expect(lastCall()).toMatchObject({ imageUrl: "https://x/subida.jpg", imageProductId: null });

    fireEvent.click(screen.getByRole("radio", { name: /Medialuna/ }));
    expect(screen.getByRole("button", { name: /Subir imagen propia \(vacía\)/ })).toBeTruthy();
  });
});

describe("editor de promoción — vigencia y stock (ADMIN-PROMO-5, 7 y 10)", () => {
  it("la fecha sin hora vale hasta las 23:59 de Argentina", async () => {
    open();

    fireEvent.change(screen.getByLabelText("Fecha de fin"), { target: { value: "2099-10-20" } });
    save();

    await waitFor(() => expect(savePromotionAction).toHaveBeenCalled());
    expect(lastCall().validUntil).toBe("2099-10-21T02:59:00.000Z");
  });

  it("con hora, la toma como hora de Argentina", async () => {
    open();

    fireEvent.change(screen.getByLabelText("Fecha de fin"), { target: { value: "2099-10-20" } });
    fireEvent.change(screen.getByLabelText("Hora de fin"), { target: { value: "18:30" } });
    save();

    await waitFor(() => expect(savePromotionAction).toHaveBeenCalled());
    expect(lastCall().validUntil).toBe("2099-10-20T21:30:00.000Z");
  });

  it("los atajos cargan hoy y el fin de semana, y se puede sacar la fecha", () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    const hoy = (screen.getByLabelText("Fecha de fin") as HTMLInputElement).value;
    expect(hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    fireEvent.click(screen.getByRole("button", { name: "Este fin de semana" }));
    const finde = (screen.getByLabelText("Fecha de fin") as HTMLInputElement).value;
    expect(finde >= hoy).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Sin fecha de fin" }));
    expect((screen.getByLabelText("Fecha de fin") as HTMLInputElement).value).toBe("");
  });

  it("una vigencia que no se tocó se manda tal cual estaba", async () => {
    open({ validUntil: "2026-10-01T02:59:30.000Z" });

    save();

    await waitFor(() => expect(savePromotionAction).toHaveBeenCalled());
    expect(lastCall()).toMatchObject({
      validUntil: "2026-10-01T02:59:30.000Z",
      initialValidUntil: "2026-10-01T02:59:30.000Z",
    });
  });

  it("las unidades se mandan como número, y vacío es sin límite", async () => {
    open();

    fireEvent.change(screen.getByLabelText(/Unidades disponibles/), { target: { value: "12" } });
    save();

    await waitFor(() => expect(savePromotionAction).toHaveBeenCalled());
    expect(lastCall().stock).toBe(12);
  });

  it("muestra cuántas quedan y cuántas se vendieron", () => {
    open({ stock: 10, remaining: 7, sold: 3 });

    const text = screen.getByTestId("promo-stock-stats").textContent ?? "";
    expect(text).toContain("Quedan 7 de 10");
    expect(text).toContain("vendieron 3 unidades");
  });

  it("muestra el error de la acción en el campo", async () => {
    savePromotionAction.mockResolvedValue({
      ok: false,
      error: "Revisá los datos marcados.",
      fieldErrors: { stock: "Las unidades disponibles tienen que ser un número entero de 1 en adelante." },
    });
    open();

    fireEvent.change(screen.getByLabelText(/Unidades disponibles/), { target: { value: "0" } });
    save();

    expect(await screen.findByText(/número entero de 1 en adelante/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("editor de promoción — cantidad por producto (ADMIN-PROMOS-1)", () => {
  it("guarda la cantidad de cada producto en el orden elegido", async () => {
    open({ items: [{ productId: "p1", quantity: 3 }, { productId: "p2", quantity: 1 }] });
    fireEvent.click(screen.getByLabelText("Más Medialuna"));
    save();

    await waitFor(() => expect(savePromotionAction).toHaveBeenCalled());
    expect(lastCall().items).toEqual([
      { productId: "p1", quantity: 3 },
      { productId: "p2", quantity: 2 },
    ]);
  });

  it("un producto recién agregado lleva 1 y no baja de 1 ni pasa de 20", () => {
    open({ items: [{ productId: "p1", quantity: 20 }, { productId: "p2", quantity: 1 }] });

    expect(screen.getByLabelText("Menos Medialuna")).toBeDisabled();
    expect(screen.getByLabelText("Más Café")).toBeDisabled();
    expect(screen.getByLabelText("Menos Café")).toBeEnabled();
  });

  it("muestra el subtotal del producto con su cantidad", () => {
    open({ items: [{ productId: "p1", quantity: 3 }, { productId: "p2", quantity: 1 }] });

    expect(screen.getByText(/× 3 =/)).toBeTruthy();
  });
});
