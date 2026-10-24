import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import ProductCard from "./ProductCard";
import ProductOptionGroupsPicker, { type PickerGroup } from "./ProductOptionGroupsPicker";
import PromotionEditor from "../../../app/dashboard/promotions/components/PromotionEditor";
import type { Product } from "@/lib/db/products";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../../app/dashboard/promotions/actions", () => ({ savePromotionAction: vi.fn() }));

// ADMIN-OPCIONES-13 y 14: lo que se ve en el panel.
const group = (id: string, name: string, min = 0, max = 2): PickerGroup => ({
  id,
  name,
  min_select: min,
  max_select: max,
  allow_repeat: false,
});

function Picker(props: {
  groups: PickerGroup[];
  initial?: string[];
  onChange?: (ids: string[]) => void;
}) {
  const [value, setValue] = useState(props.initial ?? []);
  return (
    <ProductOptionGroupsPicker
      groups={props.groups}
      value={value}
      onChange={(ids) => {
        setValue(ids);
        props.onChange?.(ids);
      }}
    />
  );
}

const names = () => screen.queryAllByRole("listitem").map((li) => li.textContent);

describe("selector de opciones y extras del producto — ADMIN-OPCIONES-13", () => {
  const groups = [group("a", "Extras"), group("b", "Salsas"), group("c", "Sabores", 1, 1)];

  it("agrega grupos en el orden elegido y los puede reordenar y quitar", () => {
    const onChange = vi.fn();
    render(<Picker groups={groups} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("Agregar Salsas"));
    fireEvent.click(screen.getByLabelText("Agregar Extras"));
    expect(onChange).toHaveBeenLastCalledWith(["b", "a"]);

    fireEvent.click(screen.getByLabelText("Subir Extras"));
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);

    fireEvent.click(screen.getByLabelText("Quitar Extras"));
    expect(onChange).toHaveBeenLastCalledWith(["b"]);
  });

  it("muestra la regla de cada grupo", () => {
    render(<Picker groups={groups} />);
    expect(screen.getByText(/Obligatorio: elegí 1/)).toBeInTheDocument();
    expect(screen.getAllByText(/Opcional, hasta 2/)).toHaveLength(2);
  });

  it("no deja pasar de 6 grupos", () => {
    const many = Array.from({ length: 7 }, (_, i) => group(`g${i}`, `Grupo ${i}`));
    render(<Picker groups={many} initial={many.slice(0, 6).map((g) => g.id)} />);

    expect(screen.getByLabelText("Agregar Grupo 6")).toBeDisabled();
    expect(screen.getByText(/hasta 6 grupos/i)).toBeInTheDocument();
  });

  // ADMIN-PROMOS-7: un grupo obligatorio se puede agregar aunque el producto esté en una promoción.
  it("deja agregar los grupos obligatorios y los opcionales", () => {
    render(<Picker groups={groups} />);

    expect(screen.getByLabelText("Agregar Sabores")).toBeEnabled();
    expect(screen.getByLabelText("Agregar Extras")).toBeEnabled();
    expect(screen.queryByText(/está en una promoción/i)).not.toBeInTheDocument();
  });

  it("sin grupos creados, lo dice en vez de mostrar un selector vacío", () => {
    render(<Picker groups={[]} />);
    expect(screen.getByText(/Todavía no creaste grupos/)).toBeInTheDocument();
    expect(names()).toEqual([]);
  });
});

const product = (extra: Partial<Product> = {}): Product => ({
  id: "p1",
  business_id: "b1",
  category_id: "c1",
  name: "Hamburguesa",
  description: null,
  price: 1000,
  active: true,
  image_url: null,
  featured: false,
  sold_out: false,
  name_en: null,
  name_pt: null,
  description_en: null,
  description_pt: null,
  created_at: "",
  updated_at: "",
  ...extra,
});

describe("chip 'Con opciones' — ADMIN-OPCIONES-13", () => {
  const noop = () => {};
  const card = (p: Product) =>
    render(
      <ProductCard
        product={p}
        onEdit={noop}
        onDelete={noop}
        onToggleActive={noop}
        onToggleSoldOut={noop}
      />,
    );

  it("aparece si el producto tiene grupos", () => {
    card(product({ has_options: true }));
    expect(screen.getByText("Con opciones")).toBeInTheDocument();
  });

  it("no aparece si no tiene", () => {
    card(product({ has_options: false }));
    expect(screen.queryByText("Con opciones")).not.toBeInTheDocument();
  });
});

describe("editor de promociones — ADMIN-PROMOS-7", () => {
  const products = [
    { id: "p1", name: "Café", price: 1000, active: true, categoryName: "Bebidas" },
    {
      id: "p2",
      name: "Helado",
      price: 3000,
      active: true,
      categoryName: "Postres",
    },
  ];

  it("deja agregar productos con opciones obligatorias, sin avisos", () => {
    render(<PromotionEditor businessId="b1" products={products} />);

    expect(screen.getByLabelText("Agregar Helado")).toBeEnabled();
    expect(screen.queryByText(/opciones obligatorias/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Agregar Helado"));
    expect(screen.getByLabelText("Quitar Helado")).toBeInTheDocument();
  });
});
