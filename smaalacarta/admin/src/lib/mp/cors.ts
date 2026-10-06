// CORS de los endpoints de Mercado Pago (MP-6): los menús viven en `<slug>.smaalacarta.com.ar`, otro
// origen que `www.smaalacarta.com.ar/admin`. Solo esos subdominios (y `localhost` fuera de producción).
const SUBDOMAIN = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?\.smaalacarta\.com\.ar$/;
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedOrigin(origin: string | null | undefined, production: boolean) {
  if (!origin) return false;
  return SUBDOMAIN.test(origin) || (!production && LOCAL.test(origin));
}

export function corsHeaders(origin: string | null | undefined, production: boolean): Record<string, string> {
  if (!isAllowedOrigin(origin, production)) return {};

  return {
    "Access-Control-Allow-Origin": origin as string,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
