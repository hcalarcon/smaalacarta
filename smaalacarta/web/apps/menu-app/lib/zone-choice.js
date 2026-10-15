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

// Variables de "Enviamos a {zona} · ${precio} aprox." (el texto vive en i18n.js).
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

// La elección sigue valiendo si el retiro, o si la zona todavía está en la lista del local.
export function validateChoice(choice, zones) {
  if (!choice) return null;
  if (choice.type === "pickup") return choice;
  if (choice.type === "zone" && zones?.zones.some((zone) => zone.id === choice.zoneId)) return choice;
  return null;
}
