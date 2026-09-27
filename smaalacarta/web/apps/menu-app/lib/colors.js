// Colores del negocio (PUBLICO-15). Cada negocio elige sus colores y algunos son claros:
// el texto blanco sobre un amarillo no se lee. Estas funciones calculan con qué texto
// leerse sobre la marca, sin depender del navegador.

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#111111";
const MIN_CONTRAST = 4.5;

function parseHex(value) {
  if (typeof value !== "string") return null;
  const hex = value.trim();
  if (!HEX.test(hex)) return null;
  const full = hex.length === 4 ? hex.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3") : hex;
  return [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function toHex(channels) {
  return `#${channels.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

function luminance([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function contrastRatio(a, b) {
  const first = parseHex(a);
  const second = parseHex(b);
  if (!first || !second) return null;
  return ratio(first, second);
}

// Texto (blanco u oscuro) que mejor se lee sobre uno o varios colores, como un degradé.
export function readableOn(colors) {
  const list = (Array.isArray(colors) ? colors : [colors]).map(parseHex);
  if (list.length === 0 || list.some((c) => !c)) return null;

  const worst = (text) => Math.min(...list.map((c) => ratio(c, parseHex(text))));
  return worst(LIGHT_TEXT) >= worst(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

// Versión del color apta para escribir texto sobre blanco: se oscurece sin cambiar de tono.
export function ensureContrastOnWhite(color) {
  const channels = parseHex(color);
  if (!channels) return null;

  let current = channels;
  for (let i = 0; i < 40 && ratio(current, [255, 255, 255]) < MIN_CONTRAST; i += 1) {
    current = current.map((c) => Math.floor(c * 0.95));
  }
  return toHex(current);
}

export function brandVariables(colores) {
  const primary = parseHex(colores?.primary) ? colores.primary.trim() : null;
  const secondary = parseHex(colores?.secondary) ? colores.secondary.trim() : null;
  const main = primary ?? secondary;
  if (!main) return {};

  const second = secondary ?? main;
  const onHeader = readableOn([main, second]);
  const vars = {
    "--on-brand": readableOn(main),
    "--on-brand-2": readableOn(second),
    "--on-brand-mix": onHeader,
    "--on-header": onHeader,
    "--on-header-shadow":
      onHeader === DARK_TEXT ? "0 1px 2px rgba(255, 255, 255, 0.5)" : "0 1px 2px rgba(0, 0, 0, 0.35)",
    "--brand-ink": ensureContrastOnWhite(main),
  };
  if (primary) vars["--color-primary"] = primary;
  if (secondary) vars["--color-secondary"] = secondary;
  return vars;
}
