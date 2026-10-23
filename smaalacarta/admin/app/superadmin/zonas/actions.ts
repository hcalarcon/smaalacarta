"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/superadmin";
import {
  createDeliveryZone,
  deleteDeliveryZone,
  listDeliveryZones,
  saveDeliveryZoneOrder,
  updateDeliveryZone,
} from "@/lib/db/delivery-zones";
import {
  DELIVERY_MODES,
  setAssignMinutesSetting,
  setCourierAvailabilitySwitch,
  setCourierTermsSwitch,
  setDeliveryMode,
  setVehicleSwitch,
  type DeliveryMode,
} from "@/lib/db/platform-settings";
import { ASSIGN_MINUTES_MAX, ASSIGN_MINUTES_MIN, parseAssignMinutes } from "@/lib/orders/assign-minutes";
import { validateZone } from "@/lib/superadmin/zones";

export type ZoneActionResult =
  | { ok: true; notice?: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

const GENERIC = "No pudimos guardar el cambio. Probá de nuevo.";
const ID = /^[0-9a-f-]{36}$/i;

// Todas las acciones empiezan por comprobar que quien las pide es superadmin; el RLS de la base lo
// vuelve a exigir (ENVIO-46).

function zoneError(error: { code?: string }): ZoneActionResult {
  if (error.code === "23505") {
    return {
      ok: false,
      error: "Ya existe una zona con ese nombre.",
      fieldErrors: { name: "Ya existe una zona con ese nombre." },
    };
  }
  return { ok: false, error: GENERIC };
}

// El modo de envíos de toda la plataforma (ENVIO-145): vale para los pedidos nuevos; los que están en
// curso siguen con el modo con el que nacieron.
export async function setDeliveryModeAction(mode: DeliveryMode): Promise<ZoneActionResult> {
  await requireSuperAdmin();

  if (!DELIVERY_MODES.includes(mode)) return { ok: false, error: GENERIC };

  const result = await setDeliveryMode(mode);
  if ("error" in result) return { ok: false, error: GENERIC };

  revalidatePath("/superadmin/zonas");
  return { ok: true };
}

// El interruptor "Vehículo del repartidor (moto/auto)" (ENVIO-175): apagado, nada de lo del vehículo se ve ni
// filtra; los datos cargados se conservan.
export async function setVehicleSwitchAction(enabled: boolean): Promise<ZoneActionResult> {
  await requireSuperAdmin();

  if (typeof enabled !== "boolean") return { ok: false, error: GENERIC };

  const result = await setVehicleSwitch(enabled);
  if ("error" in result) return { ok: false, error: GENERIC };

  // Cambia lo que ven el local y el repartidor.
  revalidatePath("/superadmin/zonas");
  revalidatePath("/dashboard/orders");
  revalidatePath("/repartidor");
  return { ok: true };
}

// El interruptor "Exigir términos a repartidores" (ENVIO-181): apagado, no se muestra la pantalla ni se bloquea
// a nadie; las aceptaciones guardadas se conservan.
export async function setCourierTermsSwitchAction(required: boolean): Promise<ZoneActionResult> {
  await requireSuperAdmin();

  if (typeof required !== "boolean") return { ok: false, error: GENERIC };

  const result = await setCourierTermsSwitch(required);
  if ("error" in result) return { ok: false, error: GENERIC };

  revalidatePath("/superadmin/zonas");
  revalidatePath("/superadmin/repartidores");
  revalidatePath("/repartidor", "layout");
  return { ok: true };
}

// El interruptor "Disponibilidad de repartidores" (ENVIO-193): apagado, no se ve el interruptor del repartidor ni
// ningún aviso, y el aviso push de pedido nuevo llega a todos. Lo registrado se conserva.
export async function setCourierAvailabilitySwitchAction(enabled: boolean): Promise<ZoneActionResult> {
  await requireSuperAdmin();

  if (typeof enabled !== "boolean") return { ok: false, error: GENERIC };

  const result = await setCourierAvailabilitySwitch(enabled);
  if ("error" in result) return { ok: false, error: GENERIC };

  revalidatePath("/superadmin/zonas");
  revalidatePath("/superadmin/repartidores");
  revalidatePath("/dashboard/orders");
  revalidatePath("/repartidor", "layout");
  return { ok: true };
}

// "Tiempo para asignar a mano" (ENVIO-241 y 244): minutos sin ofertas antes de destacar el pedido y avisar al local.
export async function setAssignMinutesAction(value: string): Promise<ZoneActionResult> {
  await requireSuperAdmin();

  const minutes = parseAssignMinutes(value);
  if (minutes === null) {
    return { ok: false, error: `Poné un número entero de ${ASSIGN_MINUTES_MIN} a ${ASSIGN_MINUTES_MAX} minutos.` };
  }

  const result = await setAssignMinutesSetting(minutes);
  if ("error" in result) return { ok: false, error: GENERIC };

  revalidatePath("/superadmin/zonas");
  revalidatePath("/dashboard/orders");
  return { ok: true };
}

export async function createZoneAction(input: { name: string; price: string }): Promise<ZoneActionResult> {
  await requireSuperAdmin();

  const validation = validateZone(input, await listDeliveryZones());
  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const result = await createDeliveryZone({ name: validation.name, price: validation.price });
  if ("error" in result) return zoneError(result.error);

  revalidatePath("/superadmin/zonas");
  return { ok: true };
}

// Un precio nuevo vale para los pedidos nuevos: los que ya se hicieron guardan su precio de lista.
export async function updateZoneAction(
  zoneId: string,
  input: { name: string; price: string },
): Promise<ZoneActionResult> {
  await requireSuperAdmin();

  if (!ID.test(zoneId)) return { ok: false, error: GENERIC };

  const validation = validateZone(input, await listDeliveryZones(), zoneId);
  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const result = await updateDeliveryZone(zoneId, { name: validation.name, price: validation.price });
  if ("error" in result) return zoneError(result.error);

  revalidatePath("/superadmin/zonas");
  return { ok: true };
}

export async function setZoneActiveAction(zoneId: string, active: boolean): Promise<ZoneActionResult> {
  await requireSuperAdmin();

  if (!ID.test(zoneId)) return { ok: false, error: GENERIC };

  const result = await updateDeliveryZone(zoneId, { active: Boolean(active) });
  if ("error" in result) return zoneError(result.error);

  revalidatePath("/superadmin/zonas");
  return { ok: true };
}

// Una zona que ya usan pedidos no se borra: la base la desactiva y acá se avisa (ENVIO-56).
export async function deleteZoneAction(zoneId: string): Promise<ZoneActionResult> {
  await requireSuperAdmin();

  if (!ID.test(zoneId)) return { ok: false, error: GENERIC };

  const result = await deleteDeliveryZone(zoneId);
  if ("error" in result) return zoneError(result.error);

  revalidatePath("/superadmin/zonas");

  if (result.result === "deactivated") {
    return {
      ok: true,
      notice:
        "Esa zona ya tiene pedidos, así que no se borró: quedó desactivada y no se ofrece más. Los pedidos conservan su nombre y precio.",
    };
  }

  return { ok: true };
}

export async function reorderZonesAction(orderedIds: string[]): Promise<ZoneActionResult> {
  await requireSuperAdmin();

  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string" || !ID.test(id))) {
    return { ok: false, error: GENERIC };
  }

  const result = await saveDeliveryZoneOrder(orderedIds);
  if ("error" in result) return zoneError(result.error);

  revalidatePath("/superadmin/zonas");
  return { ok: true };
}
