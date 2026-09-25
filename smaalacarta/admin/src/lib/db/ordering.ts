import { updateRecord } from "@/lib/db/resources";
import { toOrderRows } from "@/lib/menu/ordering";

// Guarda la posición de cada elemento de una lista (ADMIN-MENU-4). Cada
// actualización filtra por negocio y por id, así que un id ajeno no cambia nada
// (ADMIN-MENU-5), y el RLS lo respalda.
export async function saveOrder(
  table: "categories" | "products",
  businessId: string,
  orderedIds: string[],
) {
  await Promise.all(
    toOrderRows(orderedIds).map((row) =>
      updateRecord(table, row.id, businessId, { sort_order: row.sort_order }),
    ),
  );
}
