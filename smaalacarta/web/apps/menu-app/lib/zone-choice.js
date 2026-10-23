// Zona del cliente al entrar al menú (PUBLICO-73 a 78). Lógica pura: `app.js` pinta la tarjeta y el
// chip. La tarjeta solo ayuda: el checkout valida la zona como siempre (lib/delivery-zones.js).

const PREFIX = "sma-zona:";

// ¿Se pregunta? Solo si el local ofrece "delivery" y tiene al menos un barrio cargado.
export function askZone({ zones, deliveryOptions }) {
  return Boolean(
    zones && zones.zones.length > 0 && Array.isArray(deliveryOptions) && deliveryOptions.includes("delivery"),
  );
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
