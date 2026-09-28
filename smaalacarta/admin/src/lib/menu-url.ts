// La dirección pública del menú de un negocio (ADMIN-RESUMEN-2): su slug es el subdominio.
export const MENU_DOMAIN = "smaalacarta.com.ar";

export function menuUrl(slug: string): string {
  return `https://${slug}.${MENU_DOMAIN}`;
}

export type BusinessPlan = {
  planPdf: boolean;
  planWeb: boolean;
  planCompleto: boolean;
};

export type MenuLinks = {
  // El menú interactivo (con carrito) solo existe por subdominio (RUTAS-4): sin
  // plan_completo, no hay dirección que mostrar.
  interactivo: string | null;
  // El estático y el PDF van por subdominio si además tiene plan_completo, o por
  // el path del dominio raíz si no — nunca los dos al mismo tiempo (RUTAS-4).
  estatico: string | null;
  pdf: string | null;
};

// Las direcciones que de verdad responden hoy, según el plan del negocio
// (mismo criterio que `public_menu`/`public_business_pdf` en la base).
export function menuLinks(slug: string, plan: BusinessPlan): MenuLinks {
  const sub = menuUrl(slug);
  const path = `https://${MENU_DOMAIN}/${slug}`;

  return {
    interactivo: plan.planCompleto ? sub : null,
    estatico: plan.planCompleto
      ? `${sub}/menu.html`
      : plan.planWeb
        ? `${path}/menu.html`
        : null,
    pdf: plan.planCompleto ? `${sub}/pdf` : plan.planPdf ? `${path}/pdf` : null,
  };
}

// La dirección para "Ver mi menú": la más completa que tenga el negocio.
export function primaryMenuLink(links: MenuLinks): string | null {
  return links.interactivo ?? links.estatico ?? links.pdf;
}
