// Vista previa de Apariencia con el menú real (ADMIN-CONFIG-43 a 47): el panel carga el menú de verdad
// (`web/apps/menu-app` con `?preview=1`) en un iframe y le manda, por `postMessage`, la configuración y
// el menú del negocio mezclados con lo que hay en el formulario sin guardar. Acá está lo que no es
// pantalla: las direcciones, la mezcla y la lectura del menú.

import type { Focus } from "./header-focus";
import type { Schedule } from "./schedule";

// Dónde está el menú. Un subdominio cualquiera de los menús sirve la app; para desarrollo se pisa con
// NEXT_PUBLIC_MENU_ASSETS_URL (un servidor estático sobre `web/`).
export const DEFAULT_MENU_ASSETS_URL = "https://demo.smaalacarta.com.ar";

export function resolveAssetsUrl(override: string | undefined): string {
  const value = (override ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s"'<>]+$/.test(value) ? value : DEFAULT_MENU_ASSETS_URL;
}

export const MENU_ASSETS_URL = resolveAssetsUrl(process.env.NEXT_PUBLIC_MENU_ASSETS_URL);

// El iframe. Contra un menú local, `?admin=` le dice qué origen del panel aceptar (el menú solo lo
// respeta si él mismo corre en localhost); en producción el origen va fijo en el menú.
export function previewSrc(base: string, adminOrigin?: string): string {
  // La ruta del archivo (y no `/`): un servidor estático común también la sirve, sin los rewrites de Vercel.
  const url = `${base}/apps/menu-app/index.html?preview=1`;
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(base);
  return local && adminOrigin ? `${url}&admin=${encodeURIComponent(adminOrigin)}` : url;
}

type Json = Record<string, unknown>;

// Lo que el formulario edita y la vista previa refleja sin guardar.
export type PreviewDraft = {
  name: string;
  tagline: string;
  template: string;
  theme: string;
  primaryColor: string;
  secondaryColor: string;
  imageUrl: string;
  logoUrl: string;
  focus: Focus;
  schedule: Schedule;
};

const HTTPS = /^https:\/\/[^\s"'()<>]+$/;

// La configuración que recibe el menú: la guardada (`menu_preview`) con los valores del formulario
// encima. Lo que se vació en el formulario se quita, aunque estuviera guardado. No modifica la guardada.
export function mergePreviewConfig(saved: Json, draft: PreviewDraft): Json {
  const config: Json = { ...saved };
  const drop = (key: string) => {
    delete config[key];
  };

  config.nombre = draft.name.trim() || saved.nombre;

  if (draft.tagline.trim()) config.descripcion = draft.tagline.trim();
  else drop("descripcion");

  config.template = draft.template;
  config.tema = draft.theme;

  const colores: Json = {};
  if (draft.primaryColor.trim()) colores.primary = draft.primaryColor.trim();
  if (draft.secondaryColor.trim()) colores.secondary = draft.secondaryColor.trim();
  if (Object.keys(colores).length > 0) config.colores = colores;
  else drop("colores");

  const logo = draft.logoUrl.trim();
  if (HTTPS.test(logo)) config.logo = logo;
  else drop("logo");

  const image = draft.imageUrl.trim();
  if (HTTPS.test(image)) config.header = { imagen: image, posicion: { x: draft.focus.x, y: draft.focus.y } };
  else drop("header");

  if (Object.keys(draft.schedule).length > 0) config.horarios = draft.schedule;
  else drop("horarios");

  return config;
}

export function previewPayload(config: Json, menu: Json) {
  return { type: "preview" as const, config, menu };
}

type RpcClient = {
  rpc: (name: string, args: Json) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type MenuPreviewResult = { ok: true; config: Json; menu: Json } | { ok: false };

const isObject = (value: unknown): value is Json =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Pide el menú del negocio a `menu_preview`. Nunca lanza: un error de la base, una respuesta que no es un
// menú o una llamada caída son `{ ok: false }` y la pantalla lo muestra.
export async function fetchMenuPreview(client: RpcClient, businessId: string): Promise<MenuPreviewResult> {
  try {
    const { data, error } = await client.rpc("menu_preview", { p_business_id: businessId });
    if (error || !isObject(data) || !isObject(data.config) || !isObject(data.menu)) return { ok: false };
    return { ok: true, config: data.config, menu: data.menu };
  } catch {
    return { ok: false };
  }
}
