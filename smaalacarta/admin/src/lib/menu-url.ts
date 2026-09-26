// La dirección pública del menú de un negocio (ADMIN-RESUMEN-2): su slug es el subdominio.
export const MENU_DOMAIN = "smaalacarta.com.ar";

export function menuUrl(slug: string): string {
  return `https://${slug}.${MENU_DOMAIN}`;
}
