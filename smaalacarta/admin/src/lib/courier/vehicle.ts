// El vehículo del repartidor (ENVIO-174 a 178): moto, auto o los dos. Reglas puras; la base valida lo mismo
// (`courier_save_vehicles`, `couriers_vehicle_check`).

export type Vehicle = "moto" | "auto";

export const VEHICLES: readonly Vehicle[] = ["moto", "auto"];

export const VEHICLE_LABELS: Record<Vehicle, string> = { moto: "Moto", auto: "Auto" };

export type CourierVehicles = { moto: boolean; auto: boolean };

// Los repartidores que ya existían quedan con Moto.
export const DEFAULT_VEHICLES: CourierVehicles = { moto: true, auto: false };

export type VehiclesValidation = { ok: true; value: CourierVehicles } | { ok: false; error: string };

// Lo que llega del navegador no es de fiar: dos booleanos y al menos uno marcado.
export function validateVehicles(input: unknown): VehiclesValidation {
  if (!input || typeof input !== "object") return { ok: false, error: "Revisá los datos." };

  const raw = input as Record<string, unknown>;
  const value = { moto: raw.moto === true, auto: raw.auto === true };

  if (!value.moto && !value.auto) return { ok: false, error: "Elegí al menos un vehículo: moto o auto." };

  return { ok: true, value };
}

export function fromRow(row: { moto: boolean; auto: boolean } | null | undefined): CourierVehicles {
  return row ? { moto: row.moto, auto: row.auto } : DEFAULT_VEHICLES;
}

// La lista de vehículos tal como la entregan las funciones de la base (`["moto", "auto"]`), o `[]` si no hay
// (el interruptor está apagado o es un dato viejo): lo que no se conoce no se muestra.
export function parseVehicles(value: unknown): Vehicle[] {
  if (!Array.isArray(value)) return [];

  return VEHICLES.filter((vehicle) => value.includes(vehicle));
}

// "Moto", "Auto" o "Moto y auto": para el texto accesible junto al ícono.
export function vehiclesLabel(vehicles: readonly Vehicle[]): string {
  const names = vehicles.map((vehicle) => VEHICLE_LABELS[vehicle]);
  if (names.length < 2) return names[0] ?? "";

  return `${names[0]} y ${names[1].toLowerCase()}`;
}

// ¿Este repartidor puede llevar un pedido que necesita auto? Solo vale con el interruptor prendido: apagado, el
// servidor no filtra a nadie y la pantalla tampoco.
export function canTake(vehicles: readonly Vehicle[] | undefined, order: { needs_car?: boolean }, enabled: boolean) {
  if (!enabled || !order.needs_car) return true;

  return Boolean(vehicles?.includes("auto"));
}
