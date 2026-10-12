import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "./manifest";

// ADMIN-PWA-9: lo que el navegador necesita para ofrecer instalar el panel.
describe("manifest del panel — ADMIN-PWA-9", () => {
  const m = manifest();

  it("se llama SMA a la Carta y en la pantalla de inicio, SMA Panel", () => {
    expect(m.name).toBe("SMA a la Carta");
    expect(m.short_name).toBe("SMA Panel");
  });

  it("se acota en /admin/, se muestra como app y conserva su id", () => {
    expect(m.scope).toBe("/admin/");
    expect(m.id).toBe("/admin/");
    expect(m.display).toBe("standalone");
  });

  // ADMIN-PWA-31: `/admin/` con barra final no lo resuelve el landing (404); arrancar en una página real
  // del panel evita redirecciones y queda dentro del scope.
  it("arranca en una página real del panel, dentro del scope y sin barra final suelta", () => {
    expect(m.start_url).toBe("/admin/dashboard");
    expect(m.start_url?.startsWith(m.scope ?? "")).toBe(true);
    expect(m.start_url?.endsWith("/")).toBe(false);
  });

  it("usa los colores de la marca", () => {
    expect(m.theme_color).toBe("#5a4a3a");
    expect(m.background_color).toBe("#faf8f3");
  });

  it("trae los íconos de 192, 512 y el maskable, y los archivos existen", () => {
    const icons = m.icons ?? [];

    expect(icons.map((i) => `${i.sizes}:${i.purpose ?? "any"}`)).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);

    for (const icon of icons) {
      // `/admin/icons/x.png` está en `public/icons/x.png`: el basePath no es parte del archivo.
      const file = join(process.cwd(), "public", icon.src.replace(/^\/admin\//, ""));
      expect(existsSync(file), icon.src).toBe(true);
      expect(icon.type).toBe("image/png");
    }
  });
});
