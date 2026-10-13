// Cuánto puede guardar el borde el menú estático (ESTATICO-13). Por defecto 60 segundos y, mientras se revalida,
// hasta 5 minutos más de uno viejo. Con una promoción que vence en unos minutos eso serviría una vencida: el
// tiempo se acorta hasta su fin y deja de servirse uno viejo mientras se revalida.

const FRESH_SECONDS = 60;
const STALE_SECONDS = 300;

export function staticCacheControl(menu, now = new Date()) {
  let nearest = Infinity;

  for (const category of menu?.menu?.categorias ?? []) {
    for (const item of category?.items ?? []) {
      if (item?.esPromo !== true || typeof item.validaHasta !== "string") continue;

      const end = new Date(item.validaHasta).getTime();
      const left = Math.ceil((end - now.getTime()) / 1000);
      if (Number.isFinite(left) && left > 0) nearest = Math.min(nearest, left);
    }
  }

  // Lo que dure el dato más el tiempo viejo permitido no puede pasarse del fin de la promoción.
  if (nearest > FRESH_SECONDS + STALE_SECONDS) {
    return `public, s-maxage=${FRESH_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`;
  }

  return `public, s-maxage=${Math.max(1, Math.min(FRESH_SECONDS, nearest))}`;
}
