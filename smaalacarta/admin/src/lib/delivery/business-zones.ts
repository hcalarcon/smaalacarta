import {
  createBusinessZone,
  deleteBusinessZone,
  listBusinessZones,
  saveBusinessZoneOrder,
  updateBusinessZone,
} from "@/lib/db/business-zones";
import { validateZone } from "@/lib/superadmin/zones";

// Zonas y precios propios de un negocio con envío propio (ENVIO-247 y 260). Las usan las dos pantallas que las editan:
// Configuración → Envíos (el local) y el detalle del negocio (superadmin). Quien llama ya comprobó quién es: acá solo
// se validan los datos y se delega en la base, que vuelve a exigir el permiso con el RLS.

export type ZoneResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

const GENERIC = "No pudimos guardar el cambio. Probá de nuevo.";
const ID = /^[0-9a-f-]{36}$/i;

function failed(error: { code?: string }): ZoneResult {
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

  // 42501: sin permiso. La pantalla ya lo oculta; esto cubre una sesión que cambió mientras estaba abierta.
  if (error.code === "42501") {
    return { ok: false, error: "No tenés permiso para editar las zonas de este negocio." };
  }

  return { ok: false, error: GENERIC };
}

export async function createZoneFor(businessId: string, input: { name: string; price: string }): Promise<ZoneResult> {
  const validation = validateZone(input, await listBusinessZones(businessId));
  if (!validation.ok) return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };

  const result = await createBusinessZone(businessId, { name: validation.name, price: validation.price });
  return "error" in result ? failed(result.error) : { ok: true };
}

export async function updateZoneFor(
  businessId: string,
  zoneId: string,
  input: { name: string; price: string },
): Promise<ZoneResult> {
  if (!ID.test(zoneId)) return { ok: false, error: GENERIC };

  const validation = validateZone(input, await listBusinessZones(businessId), zoneId);
  if (!validation.ok) return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };

  const result = await updateBusinessZone(businessId, zoneId, { name: validation.name, price: validation.price });
  return "error" in result ? failed(result.error) : { ok: true };
}

export async function setZoneActiveFor(businessId: string, zoneId: string, active: boolean): Promise<ZoneResult> {
  if (!ID.test(zoneId)) return { ok: false, error: GENERIC };

  const result = await updateBusinessZone(businessId, zoneId, { active: Boolean(active) });
  return "error" in result ? failed(result.error) : { ok: true };
}

export async function deleteZoneFor(businessId: string, zoneId: string): Promise<ZoneResult> {
  if (!ID.test(zoneId)) return { ok: false, error: GENERIC };

  const result = await deleteBusinessZone(businessId, zoneId);
  return "error" in result ? failed(result.error) : { ok: true };
}

export async function reorderZonesFor(businessId: string, orderedIds: string[]): Promise<ZoneResult> {
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string" || !ID.test(id))) {
    return { ok: false, error: GENERIC };
  }

  const result = await saveBusinessZoneOrder(businessId, orderedIds);
  return "error" in result ? failed(result.error) : { ok: true };
}
