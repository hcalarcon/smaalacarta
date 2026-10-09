// Vista previa fiel del menú (ADMIN-CONFIG-28 a 30). Un `iframe` con `srcdoc` carga el CSS real de
// `web/` (base.css y la plantilla) y arma con las mismas clases una cabecera, la barra de categorías,
// una tarjeta y los botones. admin/ no puede importar código de web/, así que el cálculo de colores y
// del fondo de la cabecera está duplicado acá, mínimo; `menu-preview.test.ts` lo compara con los
// archivos de web/ para que las copias no se separen.
//
// Los datos del negocio NO van en el HTML: viajan al iframe por `postMessage` (ver `previewMessage`)
// y el script del documento los escribe con `textContent` o con propiedades de estilo.

import { normalizeFocus, type Focus } from "./header-focus";

// Dónde están los estáticos de `web/` (base.css, plantillas). Un subdominio cualquiera de los
// menús sirve `/apps/...` y `/templates/...`; para desarrollo se pisa con NEXT_PUBLIC_MENU_ASSETS_URL
// (p. ej. un servidor estático sobre `web/`).
export const DEFAULT_MENU_ASSETS_URL = "https://demo.smaalacarta.com.ar";

export function resolveAssetsUrl(override: string | undefined): string {
  const value = (override ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s"'<>]+$/.test(value) ? value : DEFAULT_MENU_ASSETS_URL;
}

export const MENU_ASSETS_URL = resolveAssetsUrl(process.env.NEXT_PUBLIC_MENU_ASSETS_URL);

const TEMPLATE_KEYS = ["moderno", "clasico", "minimal"];
const TEMA_KEYS = ["claro", "oscuro"];
const IMAGE_URL = /^https:\/\/[^\s"'()<>]+$/;

// ---------------------------------------------------------------------------------------------
// Colores: copia mínima de `web/apps/menu-app/lib/colors.js` (brandVariables).
// ---------------------------------------------------------------------------------------------

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#111111";
const MIN_CONTRAST = 4.5;

type Rgb = number[];

function parseHex(value: unknown): Rgb | null {
  if (typeof value !== "string") return null;
  const hex = value.trim();
  if (!HEX.test(hex)) return null;
  const full = hex.length === 4 ? hex.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3") : hex;
  return [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16));
}

const toHex = (channels: Rgb) =>
  `#${channels.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

function luminance([r, g, b]: Rgb) {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function ratio(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function readableOn(colors: Rgb[]): string {
  const worst = (text: string) => Math.min(...colors.map((c) => ratio(c, parseHex(text) as Rgb)));
  return worst(LIGHT_TEXT) >= worst(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

function ensureContrastOnWhite(channels: Rgb): string {
  let current = channels;
  for (let i = 0; i < 40 && ratio(current, [255, 255, 255]) < MIN_CONTRAST; i += 1) {
    current = current.map((c) => Math.floor(c * 0.95));
  }
  return toHex(current);
}

export type BrandColors = { primary?: string; secondary?: string };

// Las variables CSS que fija `app.js` con `brandVariables`: los colores del negocio y con qué texto
// se leen encima.
export function previewBrandVariables(colores: BrandColors): Record<string, string> {
  const primary = parseHex(colores?.primary) ? (colores.primary as string).trim() : null;
  const secondary = parseHex(colores?.secondary) ? (colores.secondary as string).trim() : null;
  const main = primary ?? secondary;
  if (!main) return {};

  const second = secondary ?? main;
  const mainRgb = parseHex(main) as Rgb;
  const secondRgb = parseHex(second) as Rgb;
  const onHeader = readableOn([mainRgb, secondRgb]);
  const vars: Record<string, string> = {
    "--on-brand": readableOn([mainRgb]),
    "--on-brand-2": readableOn([secondRgb]),
    "--on-brand-mix": onHeader,
    "--on-header": onHeader,
    "--on-header-shadow":
      onHeader === DARK_TEXT ? "0 1px 2px rgba(255, 255, 255, 0.5)" : "0 1px 2px rgba(0, 0, 0, 0.35)",
    "--brand-ink": ensureContrastOnWhite(mainRgb),
  };
  if (primary) vars["--color-primary"] = primary;
  if (secondary) vars["--color-secondary"] = secondary;
  return vars;
}

// Fondo de la cabecera: copia mínima de `headerBackground` (web/apps/menu-app/lib/info.js).
export function previewHeaderBackground(input: {
  template: string;
  primary: string;
  secondary: string;
  image: string;
}): string {
  const hasColors = Boolean(input.primary || input.secondary);
  const gradient = "linear-gradient(135deg, var(--color-primary, #463AE5), var(--color-secondary, #9A6CE0))";

  if (input.image) return `url("${input.image}"), ${gradient}`;
  if (hasColors && input.template !== "minimal") return gradient;
  return "";
}

// ---------------------------------------------------------------------------------------------
// Mensaje con los datos del negocio (todo validado) y documento con el HTML fijo.
// ---------------------------------------------------------------------------------------------

export type PreviewInput = {
  name: string;
  tagline: string;
  template: string;
  primaryColor: string;
  secondaryColor: string;
  imageUrl: string;
  logoUrl: string;
  focus: Focus;
  open: boolean;
};

export type PreviewMessage = {
  sma: "state";
  name: string;
  tagline: string;
  logo: string;
  image: string;
  background: string;
  position: string;
  focus: Focus;
  open: boolean;
  vars: Record<string, string>;
};

const httpsImage = (value: string) => (IMAGE_URL.test(value.trim()) ? value.trim() : "");

export function previewMessage(input: PreviewInput): PreviewMessage {
  const image = httpsImage(input.imageUrl);
  const vars = previewBrandVariables({ primary: input.primaryColor, secondary: input.secondaryColor });
  const focus = { x: normalizeFocus(input.focus.x), y: normalizeFocus(input.focus.y) };

  return {
    sma: "state",
    name: input.name,
    tagline: input.tagline,
    logo: httpsImage(input.logoUrl),
    image,
    background: previewHeaderBackground({
      template: input.template,
      primary: vars["--color-primary"] ?? "",
      secondary: vars["--color-secondary"] ?? "",
      image,
    }),
    // Misma regla que `headerPosition` de web/: solo enteros de 0 a 100.
    position: `${focus.x}% ${focus.y}%`,
    focus,
    open: input.open,
    vars,
  };
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// El script del documento: recibe el estado, lo pinta y avisa al panel de los gestos sobre la
// cabecera (arrastrar para mover el punto de enfoque, doble clic para centrar). Solo escribe con
// `textContent`, `src` y propiedades de estilo.
const PREVIEW_SCRIPT = `
(function () {
  var header = document.querySelector(".header");
  var root = document.documentElement;
  var applied = [];
  var drag = null;

  function send(data) { parent.postMessage(data, "*"); }

  window.addEventListener("message", function (event) {
    var m = event.data;
    if (!m || m.sma !== "state") return;

    applied.forEach(function (name) { root.style.removeProperty(name); });
    applied = Object.keys(m.vars || {});
    applied.forEach(function (name) { root.style.setProperty(name, m.vars[name]); });

    document.getElementById("pv-nombre").textContent = m.name || "Nombre de tu negocio";
    document.getElementById("pv-descripcion").textContent = m.tagline || "";
    document.getElementById("pv-estado").textContent = m.open ? "Abierto" : "Cerrado";
    document.getElementById("pv-dot").style.background = m.open ? "#4ade80" : "#ef4444";

    var logo = document.getElementById("pv-logo");
    if (m.logo) { logo.src = m.logo; logo.hidden = false; } else { logo.removeAttribute("src"); logo.hidden = true; }

    header.style.backgroundImage = m.background || "";
    header.style.backgroundPosition = m.image ? m.position : "";

    var foco = document.getElementById("pv-foco");
    foco.hidden = !m.image;
    foco.style.left = m.focus.x + "%";
    foco.style.top = m.focus.y + "%";
  });

  function size() { return { w: header.clientWidth, h: header.clientHeight }; }

  header.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY };
    header.setPointerCapture(e.pointerId);
    var s = size();
    send({ sma: "drag", phase: "start", dx: 0, dy: 0, w: s.w, h: s.h });
  });
  header.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var s = size();
    send({ sma: "drag", phase: "move", dx: e.clientX - drag.x, dy: e.clientY - drag.y, w: s.w, h: s.h });
  });
  function end() { if (drag) { drag = null; send({ sma: "drag", phase: "end", dx: 0, dy: 0, w: 0, h: 0 }); } }
  header.addEventListener("pointerup", end);
  header.addEventListener("pointercancel", end);
  header.addEventListener("dblclick", function () { send({ sma: "center" }); });

  send({ sma: "ready" });
})();
`;

function documentHead(template: string, tema: string, assets: string, extraStyle: string): string {
  return `<!doctype html>
<html lang="es" data-template="${template}" data-tema="${tema}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${assets}/apps/menu-app/base.css">
<link rel="stylesheet" href="${assets}/templates/carrito/${template}/styles.css">
<link rel="stylesheet" href="${assets}/apps/menu-app/desktop.css" media="(min-width: 1024px)">
<style>
${extraStyle}</style>
</head>
`;
}

export function menuPreviewDocument(input: PreviewDocumentInput): string {
  const template = TEMPLATE_KEYS.includes(input.template) ? input.template : "moderno";
  const tema = TEMA_KEYS.includes(input.tema) ? input.tema : "claro";
  const assets = escapeAttr(input.assetsUrl);

  return `${documentHead(
    template,
    tema,
    assets,
    `  html { scroll-behavior: auto; }
  body { min-height: 100vh; }
  .header { position: relative; touch-action: none; cursor: grab; user-select: none; }
  .header:active { cursor: grabbing; }
  .sma-foco { position: absolute; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%;
    border: 2px solid #fff; box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.55); pointer-events: none; z-index: 5; }
  .sma-foco::after { content: ""; position: absolute; inset: 5px; border-radius: 50%; background: #fff; }
  .categorias { position: static; }
`,
  )}<body class="menu-estatico">
<header class="header">
  <div class="header-top">
    <span class="badge-estado"><span class="dot" id="pv-dot"></span><span id="pv-estado">Abierto</span></span>
  </div>
  <img class="logo-negocio" id="pv-logo" alt="" hidden>
  <h1 id="pv-nombre">Nombre de tu negocio</h1>
  <p id="pv-descripcion"></p>
  <span class="sma-foco" id="pv-foco" hidden></span>
</header>
<nav class="categorias">
  <a href="#" class="active">Entradas</a>
  <a href="#">Principales</a>
  <a href="#">Postres</a>
</nav>
<main class="menu-container">
  <section class="categoria">
    <h2 class="categoria-titulo">Entradas</h2>
    <div class="categoria-grid">
      <article class="producto">
        <div class="producto-info">
          <h3>Empanadas de carne</h3>
          <p>Media docena, fritas o al horno.</p>
          <div class="producto-precio">$ 6.500</div>
        </div>
        <button type="button" class="btn-add">+</button>
      </article>
    </div>
  </section>
  <div class="carrito-header">
    <h2>Tu pedido</h2>
    <button type="button" aria-label="Cerrar">✕</button>
  </div>
</main>
<div class="contacto-estatico"><a class="btn-cta" href="#">Pedir por WhatsApp</a></div>
<button type="button" id="btn-carrito" class="btn-carrito visible"><span id="carrito-count">2</span></button>
<script>${PREVIEW_SCRIPT}</script>
</body>
</html>`;
}
