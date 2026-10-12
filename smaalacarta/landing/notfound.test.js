import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(join(DIR, file), "utf8").replace(/\r\n/g, "\n");

describe("rewrite del panel — ADMIN-PWA-31", () => {
  const { rewrites } = JSON.parse(read("vercel.json"));

  it("/admin/ con barra final también llega al panel (el comodín no la cubre)", () => {
    const regla = rewrites.find((r) => r.source === "/admin/");

    expect(regla).toBeTruthy();
    expect(regla.destination).toBe("https://smaalacarta-admin.vercel.app/admin");
  });
});

describe("404 del landing — LANDING-30", () => {
  const doc = new DOMParser().parseFromString(read("404.html"), "text/html");

  it("dice que no existe la página y vuelve al inicio", () => {
    expect(doc.querySelector("h1").textContent).toMatch(/No encontramos esta página/);
    expect(doc.querySelector('a[href="/"]')).toBeTruthy();
  });

  it("usa el estilo del landing con rutas absolutas (sirve en cualquier dirección)", () => {
    const hojas = [...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute("href"));
    expect(hojas).toContain("/landing.css");
    for (const img of doc.querySelectorAll("img")) expect(img.getAttribute("src")).toMatch(/^\//);
  });

  it("no la indexan los buscadores", () => {
    expect(doc.querySelector('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
  });
});
