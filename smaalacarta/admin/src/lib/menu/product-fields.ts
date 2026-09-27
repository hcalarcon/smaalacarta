export type ProductInput = {
  name: string;
  description?: string;
  price: number;
  active?: boolean;
  // Dirección de la imagen. Vacía o nula, el producto queda sin imagen.
  image_url?: string | null;
  // Aparece en la categoría "Destacados" del menú público (ADMIN-MENU-7).
  featured?: boolean;
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
  };
}
