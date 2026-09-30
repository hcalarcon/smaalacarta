import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(join(DIR, file), "utf8");
const HTML = read("index.html");
const CSS = read("landing.css");

// Lee el PNG/JPEG sin depender de librerías: solo las dimensiones.
function imageSize(file) {
  const buf = readFileSync(join(DIR, file));
  if (buf[0] === 0x89) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
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

function parse() {
  return new DOMParser().parseFromString(HTML, "text/html");
}

describe("LANDING-1 — imagen para compartir", () => {
  const doc = parse();
  const og = doc.querySelector('meta[property="og:image"]').content;
  const tw = doc.querySelector('meta[name="twitter:image"]').content;

  it("og:image y twitter:image apuntan al mismo archivo, que existe y es de 1200×630 y < 300 KB", () => {
    expect(og).toBe(tw);
    const file = new URL(og).pathname.replace(/^\//, "");
    expect(file).toMatch(/^assets\/.+\.(jpg|png)$/);
    expect(statSync(join(DIR, file)).size).toBeLessThan(300 * 1024);
    expect(imageSize(file)).toEqual({ w: 1200, h: 630 });
  });

  it("la página no carga el favicon.svg de 2,5 MB como imagen", () => {
    const imgs = [...doc.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(imgs.some((s) => s.includes("favicon.svg"))).toBe(false);
    expect(doc.querySelector('link[rel="icon"][type="image/svg+xml"]')).toBeNull();
  });
});

describe("LANDING-2 — enlaces", () => {
  const doc = parse();
  const links = [...doc.querySelectorAll("a[href]")];

  it("no hay enlaces vacíos", () => {
    expect(links.filter((a) => a.getAttribute("href") === "#")).toEqual([]);
  });

  it("los enlaces internos apuntan a una sección que existe", () => {
    for (const a of links.filter((l) => l.getAttribute("href").startsWith("#"))) {
      expect(doc.querySelector(a.getAttribute("href")), a.getAttribute("href")).not.toBeNull();
    }
  });

  it("todo enlace que abre otra pestaña lleva rel noopener", () => {
    for (const a of links.filter((l) => l.target === "_blank")) {
      expect(a.rel, a.href).toMatch(/noopener/);
    }
  });

  it("el WhatsApp de contacto es el mismo en todos lados", () => {
    const phones = new Set(
      links
        .map((a) => a.href.match(/(?:phone=|wa\.me\/|tel:\+?)(\d+)/)?.[1])
        .filter(Boolean),
    );
    expect(phones.size).toBe(1);
  });

});

// Luminancia relativa y contraste según WCAG 2.
function luminance(hex) {
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const rootVar = (name) => CSS.match(/:root\s*\{[^}]*\}/)[0].match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];

describe("LANDING-17 — el inicio vende y lleva a WhatsApp", () => {
  const doc = parse();
  const cta = doc.querySelector(".hero-cta");

  it("dice lo que se vende y el botón principal abre WhatsApp con un mensaje escrito", () => {
    expect(doc.querySelector("#inicio h1").textContent).toContain("Sin comisión");
    expect(cta.textContent.trim()).toBe("Mandanos tu carta por WhatsApp");
    const url = new URL(cta.href);
    expect(url.searchParams.get("phone")).toBe("5493644277105");
    expect(url.searchParams.get("text")).toMatch(/^Hola, quiero ver cómo quedaría mi carta/);
    expect(cta.target).toBe("");
  });

  it("usa el mismo número que el resto de la página", () => {
    const phones = new Set(
      [...doc.querySelectorAll("a[href]")].map((a) => a.href.match(/(?:phone=|wa\.me\/|tel:\+?)(\d+)/)?.[1]).filter(Boolean),
    );
    expect([...phones]).toEqual([cta.href.match(/phone=(\d+)/)[1]]);
  });

  it("el botón tiene contraste de al menos 4,5:1", () => {
    const bg = rootVar("cta-bg");
    const text = rootVar("cta-text");
    expect(bg && text).toBeTruthy();
    expect(contrast(bg, text)).toBeGreaterThanOrEqual(4.5);
  });

  it("hay una sola regla .hero-cta de fondo", () => {
    expect(CSS.match(/^\.hero-cta\s*\{/gm)).toHaveLength(1);
  });
});

describe("LANDING-3 — dominio de los menús", () => {
  it("el plan Subdominio muestra un subdominio de smaalacarta.com.ar", () => {
    expect(HTML).toContain("tunegocio.smaalacarta.com.ar");
    expect(HTML).not.toContain("tunegocio.smaalacarta.online");
  });
});

describe("LANDING-4 — lo que se ofrece está al día", () => {
  const text = parse().body.textContent.toLowerCase();

  it.each(["panel", "promociones", "seguimiento"])("menciona %s", (word) => {
    expect(text).toContain(word);
  });
});

describe("LANDING-8 — imágenes y teclado", () => {
  const doc = parse();
  const imgs = [...doc.querySelectorAll("img")];

  it("toda imagen tiene alt; las que informan, en español", () => {
    for (const img of imgs) expect(img.hasAttribute("alt"), img.src).toBe(true);
    const alts = imgs.map((i) => i.alt).filter(Boolean);
    expect(alts.length).toBeGreaterThan(3);
    for (const alt of alts) expect(alt).not.toMatch(/^(Patagonia landscape|QR code menu|Modern restaurant interior|PDF|QR Code)$/);
  });

  it("todas declaran tamaño y, salvo las del inicio de la página, carga diferida", () => {
    for (const img of imgs) {
      expect(img.getAttribute("width"), img.src).toBeTruthy();
      expect(img.getAttribute("height"), img.src).toBeTruthy();
      const aboveTheFold = img.closest(".header");
      if (!aboveTheFold) expect(img.getAttribute("loading"), img.src).toBe("lazy");
    }
  });

  it("hay un enlace para saltar al contenido que llega a un elemento existente", () => {
    const skip = doc.querySelector("a.skip-link");
    expect(skip).not.toBeNull();
    expect(doc.querySelector(skip.getAttribute("href"))).not.toBeNull();
  });

  it("el foco del teclado se ve", () => {
    expect(CSS).toMatch(/:focus-visible/);
  });
});

const heroCss = () => CSS.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]*\.hero[^{}]*\{[^}]*\}/g).join("\n");

describe("LANDING-18 — el inicio no depende de una foto", () => {
  const doc = parse();

  it("no hay imágenes en el hero", () => {
    expect(doc.querySelector("#inicio img")).toBeNull();
  });

  it("el CSS del hero no deforma ni estira nada", () => {
    const css = heroCss();
    expect(css).not.toMatch(/object-fit:\s*fill/);
    expect(css).not.toMatch(/transform:\s*scale/);
    expect(css).not.toMatch(/min-height:\s*100vh/);
  });

  it("no queda la foto del hero ni sus reglas", () => {
    expect(() => statSync(join(DIR, "assets/hero.jpg"))).toThrow();
    expect(CSS).not.toMatch(/\.hero-(bg|image|overlay|tablet|grid)/);
  });

  it("titular y botón principal están antes de cualquier otra sección", () => {
    const hero = doc.querySelector("#inicio");
    expect(hero.querySelector("h1")).not.toBeNull();
    expect(hero.querySelector("a.hero-cta")).not.toBeNull();
    expect(hero.querySelector(".hero-checks li")).not.toBeNull();
  });
});

describe("LANDING-19 — teléfono animado decorativo", () => {
  const doc = parse();
  const phone = doc.querySelector("#inicio .hp");

  it("es decorativo y tiene las 4 pantallas", () => {
    expect(phone.getAttribute("aria-hidden")).toBe("true");
    expect(phone.querySelectorAll(".hp-screen")).toHaveLength(4);
  });

  it("su CSS es propio (prefijo hp-) y con prefers-reduced-motion queda quieto", () => {
    expect(CSS).toMatch(/@keyframes hp-screen/);
    expect(CSS).toMatch(/@keyframes hp-ring/);
    const reduce = CSS.slice(CSS.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduce).toMatch(/animation:\s*none\s*!important/);
    expect(reduce).toMatch(/\.hp-screen:nth-child\(3\)\s*\{[^}]*opacity:\s*1/);
  });

  it("no usa JavaScript", () => {
    expect(phone.outerHTML).not.toMatch(/<script|onclick/);
  });
});

describe("LANDING-20 — nada de terceros", () => {
  it("todo <img> apunta al propio sitio", () => {
    for (const img of parse().querySelectorAll("img")) {
      expect(img.getAttribute("src"), img.outerHTML).toMatch(/^(\/|\.\/|assets\/)/);
    }
    expect(HTML).not.toMatch(/unsplash/i);
  });
});

describe("LANDING-21 — lo nuevo está dicho", () => {
  const doc = parse();
  const text = doc.body.textContent.replace(/\s+/g, " ");

  it.each(["Sin comisión", "Carta en español, inglés y portugués", "Se instala en el celular como una app", "Tu carta en 3 idiomas"])(
    "dice %s",
    (phrase) => expect(text).toContain(phrase),
  );

  it("la carta en 3 idiomas está en el plan Subdominio Completo", () => {
    const plan = [...doc.querySelectorAll(".plan-card")].find((p) => p.textContent.includes("Subdominio Completo"));
    expect(plan.textContent).toContain("Carta en español, inglés y portugués");
    expect(plan.textContent).toContain("Se instala en el celular");
  });

  it("las descripciones hablan de sin comisión", () => {
    for (const sel of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
      expect(doc.querySelector(sel).content).toContain("Sin comisión por pedido");
    }
  });
});

describe("LANDING-22 — botón fijo de WhatsApp", () => {
  const doc = parse();
  const dock = doc.querySelector("a.wa-dock");
  const z = (re) => Number(CSS.match(re)?.[1]);

  it("es el último hijo de body y abre WhatsApp", () => {
    expect(dock).not.toBeNull();
    expect(doc.body.lastElementChild).toBe(dock);
    expect(dock.href).toContain("phone=5493644277105");
  });

  it("queda por debajo del encabezado, del menú y del modal, y se oculta con el menú abierto", () => {
    const dockZ = z(/\.wa-dock\s*\{[^}]*z-index:\s*(\d+)/);
    expect(dockZ).toBeGreaterThan(0);
    expect(dockZ).toBeLessThan(z(/\.header\s*\{[^}]*z-index:\s*(\d+)/));
    expect(dockZ).toBeLessThan(z(/\.mobile-nav-overlay\s*\{[^}]*z-index:\s*(\d+)/));
    expect(dockZ).toBeLessThan(z(/\.modal-overlay\s*\{[^}]*z-index:\s*(\d+)/));
    expect(CSS).toMatch(/body\.menu-open\s+\.wa-dock/);
  });

  it("deja lugar abajo en el celular y desde 768 px no se muestra", () => {
    expect(CSS).toMatch(/body\s*\{[^}]*padding-bottom/);
    expect(CSS).toMatch(/@media \(min-width: 768px\)\s*\{\s*\.wa-dock\s*\{\s*display:\s*none/);
  });
});

describe("LANDING-7 — movimiento", () => {
  it("el contenido no nace oculto en el CSS: solo lo oculta el JS al activar la animación", () => {
    expect(CSS).toMatch(/\.js-reveal\s+\.reveal/);
    expect(CSS).not.toMatch(/^\.(step|benefit-card|plan-card|contact-method)\s*\{[^}]*opacity:\s*0/m);
  });

  it("con prefers-reduced-motion se apagan las animaciones", () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it("el JS no fija estilos en línea para animar", () => {
    const js = read("landing.js");
    expect(js).not.toMatch(/style\.(opacity|transform)/);
    expect(js).not.toMatch(/setInterval/);
  });
});

describe("LANDING-9 — indexación", () => {
  it("robots.txt permite todo y apunta al sitemap", () => {
    const robots = read("robots.txt");
    expect(robots).toMatch(/User-agent: \*/);
    expect(robots).toContain("Sitemap: https://www.smaalacarta.com.ar/sitemap.xml");
  });

  it("sitemap.xml lista la home", () => {
    expect(read("sitemap.xml")).toContain("<loc>https://www.smaalacarta.com.ar/</loc>");
  });

  it("hay datos estructurados válidos de LocalBusiness", () => {
    const script = parse().querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script.textContent);
    expect(data["@type"]).toBe("LocalBusiness");
    expect(data.name).toBe("SMA a la Carta");
    expect(data.areaServed).toBeTruthy();
  });

  it("el manifest tiene el nombre real y sus íconos existen", () => {
    const manifest = JSON.parse(read("assets/site.webmanifest"));
    expect(manifest.name).toBe("SMA a la Carta");
    expect(manifest.short_name).toBeTruthy();
    for (const icon of manifest.icons) statSync(join(DIR, icon.src.replace(/^\//, "")));
    expect(parse().querySelector('link[rel="manifest"]')).not.toBeNull();
  });
});

// ---- Comportamiento: se carga la página real y su landing.js en jsdom.
async function loadPage({ reducedMotion = false, observer = true } = {}) {
  vi.resetModules();
  document.documentElement.className = "";
  document.documentElement.innerHTML = HTML.replace(/<script src="\.\/landing\.js"><\/script>/, "");
  window.scrollTo = vi.fn();
  window.matchMedia = (query) => ({
    matches: reducedMotion && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
  if (observer) {
    window.IntersectionObserver = class {
      constructor(cb) {
        window.__io = this;
        this.cb = cb;
        this.seen = [];
      }
      observe(el) {
        this.seen.push(el);
      }
      disconnect() {}
      unobserve() {}
    };
  } else {
    delete window.IntersectionObserver;
  }
  await import("./landing.js");
}

const $ = (sel) => document.querySelector(sel);
const key = (k, extra = {}) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...extra }));

describe("LANDING-5 — menú del celular", () => {
  beforeEach(() => loadPage());
  afterEach(() => (document.body.style.cssText = ""));

  it("el botón declara qué controla y su estado", () => {
    const btn = $("#mobileMenuBtn");
    expect(btn.getAttribute("aria-controls")).toBe($(".nav").id);
    expect(btn.getAttribute("aria-label")).toBeTruthy();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("abrir y cerrar actualiza aria-expanded", () => {
    const btn = $("#mobileMenuBtn");
    btn.click();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect($(".nav").classList.contains("mobile-nav-open")).toBe(true);
    btn.click();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect($(".nav").classList.contains("mobile-nav-open")).toBe(false);
  });

  it("Escape lo cierra y devuelve el foco al botón", () => {
    const btn = $("#mobileMenuBtn");
    btn.click();
    key("Escape");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(btn);
  });

  it("elegir una sección lo cierra", () => {
    $("#mobileMenuBtn").click();
    $(".nav-link").click();
    expect($("#mobileMenuBtn").getAttribute("aria-expanded")).toBe("false");
  });

  it("cerrado, el menú no es accesible por teclado fuera de pantalla (CSS con visibility)", () => {
    expect(CSS).toMatch(/\.nav\s*\{[^}]*visibility:\s*hidden/);
    expect(CSS).toMatch(/\.nav\.mobile-nav-open\s*\{[^}]*visibility:\s*visible/);
  });
});

describe("LANDING-6 — modal de demos", () => {
  beforeEach(() => loadPage());

  it("es un diálogo con título", () => {
    const modal = $("#demosModal .modal-content");
    expect(modal.getAttribute("role")).toBe("dialog");
    expect(modal.getAttribute("aria-modal")).toBe("true");
    const title = document.getElementById(modal.getAttribute("aria-labelledby"));
    expect(title?.textContent.trim().length).toBeGreaterThan(0);
  });

  it("al abrir, muestra el modal y mueve el foco adentro", () => {
    $("#demosBtn").click();
    expect($("#demosModal").classList.contains("show")).toBe(true);
    expect($("#demosModal").contains(document.activeElement)).toBe(true);
  });

  it("Escape lo cierra y el foco vuelve al botón", () => {
    $("#demosBtn").click();
    key("Escape");
    expect($("#demosModal").classList.contains("show")).toBe(false);
    expect(document.activeElement).toBe($("#demosBtn"));
  });

  it("se cierra con el botón Cerrar y tocando afuera", () => {
    $("#demosBtn").click();
    $("#demosModal .modal-close").click();
    expect($("#demosModal").classList.contains("show")).toBe(false);

    $("#demosBtn").click();
    $("#demosModal").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect($("#demosModal").classList.contains("show")).toBe(false);
  });

  it("tocar dentro del contenido no lo cierra", () => {
    $("#demosBtn").click();
    $("#demosModal .modal-content").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect($("#demosModal").classList.contains("show")).toBe(true);
  });

  it("Tab no saca el foco del modal: del último vuelve al primero y Shift+Tab al revés", () => {
    $("#demosBtn").click();
    const focusable = [...$("#demosModal").querySelectorAll("a[href], button")];
    const first = focusable[0];
    const last = focusable.at(-1);

    last.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    first.focus();
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it("Escape con el modal cerrado no rompe nada", () => {
    expect(() => key("Escape")).not.toThrow();
  });

  it("mientras está abierto no se desplaza la página de fondo", () => {
    $("#demosBtn").click();
    expect(document.body.style.overflow).toBe("hidden");
    key("Escape");
    expect(document.body.style.overflow).toBe("");
  });
});

describe("LANDING-7 — animación de entrada", () => {
  it("con IntersectionObserver, marca los bloques y los muestra al entrar", async () => {
    await loadPage();
    expect(document.documentElement.classList.contains("js-reveal")).toBe(true);
    const el = $(".plan-card");
    expect(el.classList.contains("reveal")).toBe(true);
    window.__io.cb([{ isIntersecting: true, target: el }]);
    expect(el.classList.contains("is-visible")).toBe(true);
  });

  it("con prefers-reduced-motion no activa nada", async () => {
    await loadPage({ reducedMotion: true });
    expect(document.documentElement.classList.contains("js-reveal")).toBe(false);
    expect($(".plan-card").classList.contains("reveal")).toBe(false);
  });

  it("sin IntersectionObserver el contenido queda visible", async () => {
    await loadPage({ observer: false });
    expect(document.documentElement.classList.contains("js-reveal")).toBe(false);
    expect($(".plan-card").classList.contains("reveal")).toBe(false);
  });
});

describe("encabezado", () => {
  it("toma el estilo de scroll pasados 50 px", async () => {
    await loadPage();
    Object.defineProperty(window, "scrollY", { value: 120, configurable: true });
    window.dispatchEvent(new Event("scroll"));
    expect($(".header").classList.contains("scrolled")).toBe(true);
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    window.dispatchEvent(new Event("scroll"));
    expect($(".header").classList.contains("scrolled")).toBe(false);
  });
});
