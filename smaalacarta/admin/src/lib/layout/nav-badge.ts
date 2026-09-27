// El contador junto a un enlace del menú lateral (ADMIN-RESUMEN-3): nada si es 0, y "9+"
// desde 10 para que no desborde.
export function navBadgeLabel(count: number | undefined): string | null {
  if (!count || count < 1) return null;
  return count > 9 ? "9+" : String(count);
}
