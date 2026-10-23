import {
  createOwnZone,
  deleteOwnZone,
  listOwnZones,
  saveOwnZoneOrder,
  updateOwnZone,
} from "@/lib/db/courier-own-zones";
import { validateZone } from "@/lib/superadmin/zones";

// Zonas y precios propios de un repartidor (ENVIO-221). Las usan las dos pantallas que las editan: el detalle del
// repartidor (superadmin) y "Mis zonas y precios" (el repartidor, con permiso). Quien llama ya comprobó quién es:
// acá solo se validan los datos y se delega en la base, que vuelve a exigir el permiso con el RLS.

export type OwnZoneResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

const GENERIC = "No pudimos guardar el cambio. Probá de nuevo.";
const ID = /^[0-9a-f-]{36}$/i;

function failed(error: { code?: string }): OwnZoneResult {
  if (error.code === "23505") {
    return {
      ok: false,
      error: "Ya tenés una zona con ese nombre.",
      fieldErrors: { name: "Ya tenés una zona con ese nombre." },
    };
  }

  // P0029: la zona tiene un pedido en curso.
  if (error.code === "P0029") {
    return { ok: false, error: "Esa zona tiene un pedido en curso. Desactivala en vez de borrarla." };
  }

  // 42501: sin permiso. La pantalla ya lo oculta; esto cubre un permiso quitado mientras estaba abierta.
  if (error.code === "42501") {
    return { ok: false, error: "No tenés permiso para editar tus zonas y precios." };
  }

  return { ok: false, error: GENERIC };
}

export async function createOwnZoneFor(
  courierId: string,
  input: { name: string; price: string },
): Promise<OwnZoneResult> {
  const validation = validateZone(input, await listOwnZones(courierId));
  if (!validation.ok) return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };

  const result = await createOwnZone(courierId, { name: validation.name, price: validation.price });
  return "error" in result ? failed(result.error) : { ok: true };
}

export async function updateOwnZoneFor(
  courierId: string,
  zoneId: string,
  input: { name: string; price: string },
): Promise<OwnZoneResult> {
  if (!ID.test(zoneId)) return { ok: false, error: GENERIC };

  const validation = validateZone(input, await listOwnZones(courierId), zoneId);
  if (!validation.ok) return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };

  const result = await updateOwnZone(courierId, zoneId, { name: validation.name, price: validation.price });
  return "error" in result ? failed(result.error) : { ok: true };
}

export async function setOwnZoneActiveFor(courierId: string, zoneId: string, active: boolean): Promise<OwnZoneResult> {
  if (!ID.test(zoneId)) return { ok: false, error: GENERIC };

  const result = await updateOwnZone(courierId, zoneId, { active: Boolean(active) });
  return "error" in result ? failed(result.error) : { ok: true };
}

export async function deleteOwnZoneFor(courierId: string, zoneId: string): Promise<OwnZoneResult> {
  if (!ID.test(zoneId)) return { ok: false, error: GENERIC };

  const result = await deleteOwnZone(courierId, zoneId);
  return "error" in result ? failed(result.error) : { ok: true };
}

export async function reorderOwnZonesFor(courierId: string, orderedIds: string[]): Promise<OwnZoneResult> {
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string" || !ID.test(id))) {
    return { ok: false, error: GENERIC };
  }

  const result = await saveOwnZoneOrder(courierId, orderedIds);
  return "error" in result ? failed(result.error) : { ok: true };
}
