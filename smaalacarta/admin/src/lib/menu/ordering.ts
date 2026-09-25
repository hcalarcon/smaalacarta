export type Orderable = {
  id: string;
  sort_order?: number | null;
  created_at?: string | null;
};

// Orden en que se muestran las categorías, y los productos de cada categoría
// (ADMIN-MENU-3): primero los que el negocio ordenó, por su posición; después los
// que todavía no tienen orden, del más viejo al más nuevo. Así un producto recién
// creado aparece al final, y no cambia nada de lo que ya se acomodó.
export function sortByOrder<T extends Orderable>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aNull = a.sort_order == null;
    const bNull = b.sort_order == null;

    if (aNull !== bNull) return aNull ? 1 : -1;

    if (!aNull && !bNull && a.sort_order !== b.sort_order) {
      return (a.sort_order as number) - (b.sort_order as number);
    }

    const byDate = (a.created_at ?? "").localeCompare(b.created_at ?? "");
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });
}

// Mueve `activeId` a la posición de `overId`, como al soltar un elemento
// arrastrado sobre otro. Con ids desconocidos devuelve la lista igual.
export function moveItem(ids: string[], activeId: string, overId: string) {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);

  if (from === -1 || to === -1 || from === to) return [...ids];

  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Lo que se guarda al reordenar: la posición de cada elemento, desde 0
// (ADMIN-MENU-4).
export function toOrderRows(ids: string[]) {
  return ids.map((id, index) => ({ id, sort_order: index }));
}
