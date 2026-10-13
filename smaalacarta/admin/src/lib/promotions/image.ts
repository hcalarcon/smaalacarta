// La imagen que representa a una promoción en el panel (ADMIN-PROMO-1 y 11): la propia, la del producto
// elegido o la del primer producto de la promoción que tenga una. Es el mismo orden que sigue el menú
// público, sin las ilustraciones predeterminadas (el panel no las resuelve).
export function promotionImage(input: {
  imageUrl: string | null | undefined;
  imageProductId: string | null | undefined;
  products: { id: string; imageUrl: string | null | undefined }[];
}): string | null {
  const own = (input.imageUrl ?? "").trim();
  if (own) return own;

  const chosen = input.products.find((p) => p.id === input.imageProductId);
  const chosenUrl = (chosen?.imageUrl ?? "").trim();
  if (chosenUrl) return chosenUrl;

  for (const product of input.products) {
    const url = (product.imageUrl ?? "").trim();
    if (url) return url;
  }

  return null;
}
