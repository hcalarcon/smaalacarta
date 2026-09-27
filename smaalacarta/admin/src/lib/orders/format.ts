const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

// Día, mes y hora en horario argentino: para la línea de tiempo del detalle y el
// historial de pedidos terminados.
export function formatDateTime(date: string) {
  return dateTimeFormatter.format(new Date(date));
}

// Cuánto pasó desde una fecha, para las tarjetas del tablero. `now` se inyecta para
// poder probarlo. Una fecha futura (reloj desfasado) cuenta como "ahora".
export function timeAgo(date: string, now: Date = new Date()) {
  const time = new Date(date).getTime();
  if (Number.isNaN(time)) return "";

  const minutes = Math.floor((now.getTime() - time) / 60_000);

  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

// Dónde sigue el cliente su pedido: el subdominio del negocio + /pedido/<código>
// (SEGUIMIENTO-5). El dominio base es el de producción de los menús.
export function trackingUrl(
  slug: string,
  code: string,
  baseDomain = "smaalacarta.com.ar",
) {
  return `https://${slug}.${baseDomain}/pedido/${code}`;
}
