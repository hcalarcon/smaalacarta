import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

// ADMIN-MOVIL-10: la identidad de la marca vive en los tokens y en las fuentes del layout; si alguien
// los cambia sin querer, el panel deja de verse de SMA a la Carta.
describe("identidad visual — ADMIN-MOVIL-10", () => {
  const css = read("app/globals.css");

  it("los colores de la marca están en los tokens", () => {
    for (const color of ["#241d16", "#5a4a3a", "#3b3026", "#12332c", "#f0f2ee", "#d97706", "#047857"]) {
      expect(css.toLowerCase()).toContain(color);
    }
  });

  it("el verde de acción es un token propio (--color-action)", () => {
    expect(css).toMatch(/--color-action:\s*#047857/i);
  });

  it("el texto usa Instrument Sans y los títulos Bricolage Grotesque", () => {
    const layout = read("app/layout.tsx");

    expect(layout).toContain("Instrument_Sans");
    expect(layout).toContain("Bricolage_Grotesque");
    expect(layout).not.toContain("Inter(");
    expect(css).toMatch(/--font-sans:\s*var\(--font-instrument-sans\)/);
    expect(css).toMatch(/--font-display:\s*var\(--font-bricolage\)/);
  });
});
