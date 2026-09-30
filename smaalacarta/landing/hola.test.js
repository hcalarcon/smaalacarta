import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(join(DIR, file), "utf8");
const HTML = read("hola.html");
const CSS = read("hola.css");
const INDEX = read("index.html");
const TELEFONO = "5493644277105";

function parse() {
  return new DOMParser().parseFromString(HTML, "text/html");
}

function imageSize(file) {
  const buf = readFileSync(join(DIR, file));
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error("no se pudo leer " + file);
}

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const token = (nombre) => CSS.match(new RegExp(String.raw`--${nombre}:\s*(#[0-9a-fA-F]{6})\s*;`))?.[1];

describe("LANDING-10 — página para quien llega por la tarjeta", () => {
  it("existe hola.html y vercel.json la sirve en /hola", () => {
    expect(existsSync(join(DIR, "hola.html"))).toBe(true);
    const { rewrites } = JSON.parse(read("vercel.json"));
    expect(rewrites[0]).toEqual({ source: "/hola", destination: "/hola.html" });
  });

  it("no se indexa: robots noindex y fuera del sitemap", () => {
    expect(parse().querySelector('meta[name="robots"]').content).toContain("noindex");
    expect(read("sitemap.xml")).not.toContain("/hola");
  });
});

describe("LANDING-11 — un solo objetivo: WhatsApp", () => {
  const doc = parse();
  const enlaces = [...doc.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
  const wa = enlaces.filter((h) => h.startsWith("https://api.whatsapp.com/send"));

  it("no tiene menú de navegación ni enlaces a secciones", () => {
    expect(doc.querySelector("nav")).toBeNull();
    expect(enlaces.filter((h) => h.startsWith("#"))).toEqual([]);
  });

  it("todo enlace es WhatsApp, llamada, el menú de ejemplo o la landing", () => {
    for (const h of enlaces) {
      const ok =
        h.startsWith("https://api.whatsapp.com/send?phone=") ||
        h.startsWith("tel:") ||
        h === "https://moderno.smaalacarta.com.ar/" ||
        h === "/";
      expect(ok, h).toBe(true);
    }
  });

  it("usa un solo teléfono, el mismo que index.html", () => {
    expect(INDEX).toContain(TELEFONO);
    const numeros = new Set([
      ...wa.map((h) => new URL(h).searchParams.get("phone")),
      ...enlaces.filter((h) => h.startsWith("tel:")).map((h) => h.replace(/\D/g, "")),
    ]);
    expect([...numeros]).toEqual([TELEFONO]);
  });

  it("los WhatsApp llevan un mensaje que empieza con Hola y menciona la tarjeta", () => {
    expect(wa.length).toBeGreaterThan(0);
    for (const h of wa) {
      const texto = new URL(h).searchParams.get("text");
      expect(texto).toMatch(/^Hola/);
      expect(texto).toContain("tarjeta");
    }
  });
});

describe("LANDING-12 — botón fijo de WhatsApp en el celular", () => {
  it("existe .dock con un enlace de WhatsApp", () => {
    const a = parse().querySelector(".dock a[href^='https://api.whatsapp.com/send']");
    expect(a).not.toBeNull();
  });

  it("el CSS lo oculta desde 768 px", () => {
    expect(CSS).toMatch(/@media\s*\(min-width:\s*768px\)\s*\{[^@]*\.dock\s*\{[^}]*display:\s*none/);
  });
});

describe("LANDING-13 — animación decorativa solo de CSS", () => {
  const doc = parse();

  it("el teléfono animado es decorativo y los 4 pasos están escritos en una lista", () => {
    expect(doc.querySelector(".phone").getAttribute("aria-hidden")).toBe("true");
    expect(doc.querySelectorAll("ol.pasos li").length).toBe(4);
  });

  it("declara @keyframes screen y con prefers-reduced-motion no anima nada", () => {
    expect(CSS).toContain("@keyframes screen");
    const bloque = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(bloque).toMatch(/animation:\s*none/);
  });
});

describe("LANDING-14 — página liviana", () => {
  const doc = parse();

  it("hola.html + hola.css pesan menos de 30 KB", () => {
    const total = statSync(join(DIR, "hola.html")).size + statSync(join(DIR, "hola.css")).size;
    expect(total).toBeLessThan(30 * 1024);
  });

  it("no lleva <script>", () => {
    expect(doc.querySelectorAll("script").length).toBe(0);
  });

  it("cada imagen existe, tiene alt, width y height", () => {
    for (const img of doc.querySelectorAll("img")) {
      const src = img.getAttribute("src");
      expect(existsSync(join(DIR, src.replace(/^\//, ""))), src).toBe(true);
      expect(img.hasAttribute("alt"), src).toBe(true);
      expect(img.getAttribute("width"), src).toBeTruthy();
      expect(img.getAttribute("height"), src).toBeTruthy();
    }
  });

  it("herni.jpg pesa menos de 80 KB y es cuadrada", () => {
    expect(statSync(join(DIR, "assets/herni.jpg")).size).toBeLessThan(80 * 1024);
    const { w, h } = imageSize("assets/herni.jpg");
    expect(w).toBe(h);
  });
});

describe("LANDING-15 — se lee bien en el celular", () => {
  it("el botón principal tiene contraste de al menos 4,5:1", () => {
    expect(contraste(token("cta-bg"), token("cta-text"))).toBeGreaterThanOrEqual(4.5);
  });

  it("el foco del teclado se ve", () => {
    expect(CSS).toContain(":focus-visible");
  });

  it("el botón principal y el del dock miden al menos 48 px de alto", () => {
    for (const selector of [/\n\.cta\s*\{[^}]*/, /\.dock\s+a\s*\{[^}]*/]) {
      const regla = CSS.match(selector)?.[0];
      expect(regla).toBeTruthy();
      expect(Number(regla.match(/min-height:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(48);
    }
  });
});

describe("LANDING-16 — precios iguales a los de index.html", () => {
  it("los importes de hola.html están también en index.html", () => {
    const importes = HTML.match(/\$\d{1,3}(\.\d{3})+/g) ?? [];
    expect(importes).toEqual(expect.arrayContaining(["$15.000", "$25.000"]));
    for (const i of importes.filter((x) => ["$15.000", "$25.000"].includes(x))) expect(INDEX).toContain(i);
  });
});
