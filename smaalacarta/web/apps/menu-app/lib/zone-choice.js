// Zona del cliente al entrar al menú (PUBLICO-73 a 78). Lógica pura: `app.js` pinta la tarjeta y el
// chip. La tarjeta solo ayuda: el checkout valida la zona como siempre (lib/delivery-zones.js).

const PREFIX = "sma-zona:";

// ¿Se pregunta? Solo si el local ofrece "delivery" y tiene al menos un barrio cargado, o envía con el costo a
// coordinar (ENVIO-263).
export function askZone({ zones, deliveryOptions }) {
  return Boolean(
    zones &&
      (zones.zones.length > 0 || zones.coordinate === true) &&
      Array.isArray(deliveryOptions) &&
      deliveryOptions.includes("delivery"),
  );
}

// ¿"Envío" lleva a la lista de barrios o, sin barrios con precio, directo a "el costo se coordina"?
export function deliveryStep(zones) {
  return zones && zones.zones.length > 0 ? "zones" : "coordinate";
}

const fold = (text) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Filtra por nombre, sin acentos ni mayúsculas.
export function filterZones(zones, query) {
  const needle = fold(query);
  if (!needle) return zones;
  return zones.filter((zone) => fold(zone.name).includes(needle));
}

// Qué texto lleva la tarjeta: "Envío $X" con precio fijo y "Envío aprox. $X" si puede cambiar (ENVIO-228).
export function zoneLabelKey(zone) {
  return zone?.fixed === true ? "zone.availableFixed" : "zone.available";
}

// Variables de "Enviamos a {zona} · Envío aprox. ${precio}" (el texto vive en i18n.js).
export function zoneLabel(zone, formatPrice) {
  return { zona: zone.name, precio: formatPrice(zone.price) };
}

export function readChoice(storage, slug) {
  try {
    const parsed = JSON.parse(storage?.getItem(PREFIX + slug) ?? "null");
    if (parsed?.type === "pickup") return { type: "pickup" };
    if (parsed?.type === "zone" && typeof parsed.zoneId === "string") {
      return { type: "zone", zoneId: parsed.zoneId };
    }
  } catch {
    // Sin almacenamiento o JSON roto: como si no hubiera elegido.
  }
  return null;
}

export function saveChoice(storage, slug, choice) {
  try {
    storage.setItem(PREFIX + slug, JSON.stringify(choice));
  } catch {
    // El menú anda igual sin recordar.
  }
}

export function clearChoice(storage, slug) {
  try {
    storage.removeItem(PREFIX + slug);
  } catch {
    // ver arriba
  }
}

// La elección sigue valiendo si es el retiro (y el local todavía lo ofrece), o si la zona todavía
// está en la lista del local.
export function validateChoice(choice, zones, { pickup = true } = {}) {
  if (!choice) return null;
  if (choice.type === "pickup") return pickup ? choice : null;
  if (choice.type === "zone" && zones?.zones.some((zone) => zone.id === choice.zoneId)) return choice;
  return null;
}

// Un envío con el costo a coordinar tampoco se guarda: el barrio se escribe en cada pedido. En un negocio que
// ofrece coordinar, "Mi barrio no está" lleva a este caso en vez de bloquear el envío (ENVIO-263).
export function isCoordinateChoice(choice) {
  return choice?.type === "coordinate";
}

// "Mi barrio no está" (PUBLICO-80): no es una elección que se guarde (al volver se pregunta de nuevo), pero
// mientras vale el checkout queda solo en retiro y el envío, deshabilitado.
export function deliveryBlocked(choice) {
  return choice?.type === "notListed";
}

// Foco atrapado en el diálogo (PUBLICO-81): a qué elemento pasa el foco con Tab (o Shift+Tab) entre `count`
// elementos enfocables, dando la vuelta en los extremos. `current` es -1 si el foco está fuera del diálogo.
export function nextFocusIndex(current, count, backwards) {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? -1 : 1) + count) % count;
}

// Qué paso muestra el diálogo después de elegir (PUBLICO-75): una zona o el retiro lo cierran al instante
// (null) y el aviso chico confirma; "Mi barrio no está" sigue en su propio paso, con el aviso de que no hay envío.
export function stepAfterChoice(choice) {
  return choice?.type === "notListed" ? "notListed" : null;
}

// Cuánto dura el aviso de la zona elegida (PUBLICO-111).
export const ZONE_TOAST_MS = 4000;

// Texto del aviso chico: la clave de i18n y sus variables, o null si no hay nada que avisar (solo una zona avisa).
// Con el costo a coordinar (ENVIO-263) avisa que se acuerda con el local.
export function choiceToast(choice, zones, formatPrice) {
  if (choice?.type === "coordinate") return { key: "zone.coordinate", vars: {} };
  if (choice?.type !== "zone") return null;
  const zone = zones?.zones.find((item) => item.id === choice.zoneId);
  if (!zone) return null;
  return { key: zoneLabelKey(zone), vars: zoneLabel(zone, formatPrice) };
}
