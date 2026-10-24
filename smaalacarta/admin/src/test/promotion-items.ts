// `p_items` de `save_promotion` como SQL: `[{product_id, quantity}]`, con cantidad 1 salvo que se indique.
export function promotionItems(products: string[], quantities: Record<string, number> = {}) {
  const items = products.map((id) => ({ product_id: id, quantity: quantities[id] ?? 1 }));
  return `'${JSON.stringify(items)}'::jsonb`;
}
