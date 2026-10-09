// Modo vista previa del menú (PUBLICO-58 a 63): el panel de Configuración carga esta misma app en un
// iframe con `?preview=1` y le manda la configuración y el menú por `postMessage`, para ver cómo queda
// con el código real. En ese modo la app no consulta Supabase, no guarda pedidos, no usa
// localStorage y no hace nada al tocar: solo dibuja lo que le llega.
//
// Todo lo que acá se valida viene de otra ventana, así que se trata como no confiable: el origen tiene
// que estar en la lista, y el contenido se reconstruye solo con datos planos y acotados.

// Quién puede mandar datos a la vista previa: el panel de producción.
export const PREVIEW_ORIGINS = ["https://www.smaalacarta.com.ar"];

export const PREVIEW_TEMPLATES = ["moderno", "clasico", "minimal"];

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export function isPreviewMode(search) {
  return new URLSearchParams(search || "").get("preview") === "1";
}

// Los orígenes permitidos. En desarrollo (la página misma abierta desde localhost), `?admin=<url>` suma
// el panel local; fuera de localhost ese parámetro se ignora, y solo vale una dirección local.
export function allowedOrigins({ hostname, search }) {
  const origins = [...PREVIEW_ORIGINS];
  if (!LOCAL_HOSTS.includes(hostname)) return origins;

  try {
    const dev = new URL(new URLSearchParams(search || "").get("admin") || "");
    if (["http:", "https:"].includes(dev.protocol) && LOCAL_HOSTS.includes(dev.hostname)) {
      origins.push(dev.origin);
    }
  } catch {
    // Sin parámetro o con una dirección inválida: solo la lista fija.
  }

  return origins;
}

export function isAllowedOrigin(origin, allowed) {
  return typeof origin === "string" && allowed.includes(origin);
}

const MAX_STRING = 4000;
const MAX_ARRAY = 1000;
const MAX_KEYS = 100;
const MAX_DEPTH = 8;
const MAX_NODES = 20000;
const FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"];

// Copia solo datos planos (texto, número, booleano, null, listas y objetos simples) dentro de límites.
// Devuelve `undefined` si algo no entra: la copia es nueva, así que nada de lo que mandó la otra
// ventana (prototipos, getters, funciones) llega a la app.
function clean(value, depth, budget) {
  if (--budget.nodes < 0 || depth > MAX_DEPTH) return undefined;

  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.length <= MAX_STRING ? value : undefined;

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY) return undefined;
    const items = value.map((item) => clean(item, depth + 1, budget));
    return items.includes(undefined) ? undefined : items;
  }

  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Object.keys(value);
    if (keys.length > MAX_KEYS) return undefined;

    const out = {};
    for (const key of keys) {
      if (FORBIDDEN_KEYS.includes(key)) return undefined;
      const item = clean(value[key], depth + 1, budget);
      if (item === undefined) return undefined;
      out[key] = item;
    }
    return out;
  }

  return undefined;
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// El mensaje `{ type: "preview", config, menu }`. Devuelve `{ config, menu }` limpios, o null si la
// forma no es la esperada (tipos, largos o cantidad de datos).
export function parsePreviewMessage(data) {
  if (!isObject(data) || data.type !== "preview") return null;

  const config = clean(data.config, 0, { nodes: MAX_NODES });
  const menu = clean(data.menu, 0, { nodes: MAX_NODES });

  if (!isObject(config) || !isObject(menu) || !Array.isArray(menu.categorias)) return null;
  if (menu.categorias.some((cat) => !isObject(cat) || typeof cat.nombre !== "string")) return null;

  return { config, menu };
}

// La plantilla va a la dirección de una hoja de estilo: solo las conocidas.
export function previewTemplate(config) {
  return PREVIEW_TEMPLATES.includes(config?.template) ? config.template : "moderno";
}

export function previewTheme(config) {
  return config?.tema === "oscuro" ? "oscuro" : "claro";
}

// Aplica la configuración a la página sin recargarla: plantilla, tema y variables de color. Quita las
// variables que dejó la configuración anterior (si ahora no hay un color, no queda el viejo) y devuelve
// los nombres aplicados para la próxima vez. `brandVars` son los de `brandVariables` (colors.js).
export function applyPreviewConfig(doc, config, brandVars, previousVars = []) {
  const root = doc.documentElement;
  root.dataset.template = previewTemplate(config);
  root.dataset.tema = previewTheme(config);

  previousVars.forEach((name) => root.style.removeProperty(name));

  const applied = [];
  for (const [name, value] of Object.entries(brandVars || {})) {
    if (!name.startsWith("--") || !value) continue;
    root.style.setProperty(name, value);
    applied.push(name);
  }
  return applied;
}

// Dónde está la cabecera dentro del iframe, para que el panel superponga el arrastre del punto de
// enfoque. Son píxeles de la página del iframe (sin la escala con la que el panel la muestre).
export function headerRect(doc) {
  const header = doc.querySelector(".header");
  if (!header) return null;

  const box = header.getBoundingClientRect();
  const win = doc.defaultView;
  return {
    x: box.left + (win?.scrollX ?? 0),
    y: box.top + (win?.scrollY ?? 0),
    w: box.width,
    h: box.height,
  };
}
