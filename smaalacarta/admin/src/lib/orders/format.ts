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
