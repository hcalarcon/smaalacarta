import { toTranslationColumns, type Translations } from "@/lib/menu/translations";

export type ProductInput = Translations & {
  name: string;
  description?: string;
  price: number;
  active?: boolean;
  // Dirección de la imagen. Vacía o nula, el producto queda sin imagen.
  image_url?: string | null;
  // Aparece en la categoría "Destacados" del menú público (ADMIN-MENU-7).
  featured?: boolean;
  // Sin stock: se ve en el menú pero no se puede pedir (ADMIN-MENU-8). Distinto de `active`.
  sold_out?: boolean;
};

// Fila para crear un producto. Siempre lleva categoría (ADMIN-MENU-1).
export function toProductInsert(
  businessId: string,
  input: ProductInput & { category_id: string },
) {
  return {
    business_id: businessId,
    category_id: input.category_id,
    name: input.name,
    description: input.description || null,
    price: input.price,
    active: input.active ?? true,
    image_url: input.image_url || null,
    featured: input.featured ?? false,
    sold_out: input.sold_out ?? false,
    ...toTranslationColumns(input),
  };
}

// Campos a modificar. Lo que no se indica no se toca: en particular la
// categoría (ADMIN-MENU-2). El negocio no cambia nunca: filtra la consulta.
export function toProductUpdate(input: ProductInput & { category_id?: string }) {
  return {
    ...(input.category_id !== undefined && { category_id: input.category_id }),
    name: input.name,
    description: input.description || null,
    price: input.price,
    ...(input.active !== undefined && { active: input.active }),
    // Sin indicarla se conserva; con nula o vacía se quita (ADMIN-MENU-6).
    ...(input.image_url !== undefined && { image_url: input.image_url || null }),
    ...(input.featured !== undefined && { featured: input.featured }),
    ...(input.sold_out !== undefined && { sold_out: input.sold_out }),
    ...toTranslationColumns(input),
  };
}

// Cómo está un producto en el panel (ADMIN-MENU-9). Oculto gana: un producto oculto no se ve
// en el menú, tenga o no stock.
export type ProductStatus = "hidden" | "sold_out" | "available";

export function productStatus(product: { active: boolean; sold_out?: boolean }): ProductStatus {
  if (!product.active) return "hidden";
  return product.sold_out ? "sold_out" : "available";
}

export type StatusFilter = "all" | "active" | "hidden" | "sold_out";

// "Activos" incluye los que están sin stock: siguen visibles en el menú.
export function matchesStatusFilter(
  product: { active: boolean; sold_out?: boolean },
  filter: StatusFilter,
): boolean {
  switch (filter) {
    case "active":
      return product.active;
    case "hidden":
      return !product.active;
    case "sold_out":
      return productStatus(product) === "sold_out";
    default:
      return true;
  }
}
