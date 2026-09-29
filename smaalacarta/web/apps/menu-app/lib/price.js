// Precios del menú (MENU-4): "$12.000", nunca "$12000". Lo usan el menú interactivo,
// el estático y el mensaje de WhatsApp, para que se vean igual en los tres.

const FORMAT = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

// Devuelve el número con separador de miles y sin decimales si es entero. Si el precio
// no es un número (texto libre), lo devuelve como vino. El resultado sigue pasando por
// `escapeHtml` donde se arma HTML.
export function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return FORMAT.format(n);
}
