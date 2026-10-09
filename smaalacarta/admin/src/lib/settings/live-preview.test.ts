import { describe, expect, it } from "vitest";

import {
  DEFAULT_MENU_ASSETS_URL,
  fetchMenuPreview,
  mergePreviewConfig,
  previewPayload,
  previewSrc,
  resolveAssetsUrl,
  type PreviewDraft,
} from "./live-preview";

const draft = (extra: Partial<PreviewDraft> = {}): PreviewDraft => ({
  name: "Casa Resto",
  tagline: "Cocina casera",
  template: "clasico",
  theme: "oscuro",
  primaryColor: "#ff0000",
  secondaryColor: "#0000ff",
  imageUrl: "https://x.test/cabecera.jpg",
  logoUrl: "https://x.test/logo.png",
  focus: { x: 20, y: 80 },
  schedule: { lunes: ["12:00-15:00"] },
  ...extra,
});

// Lo que devuelve `menu_preview` (formato de `public_menu`), con los valores guardados.
const saved = {
  nombre: "Nombre guardado",
  descripcion: "Vieja",
  template: "moderno",
  tema: "claro",
  tipo: "cliente",
  telefono: "5493510000000",
  colores: { primary: "#111111", secondary: "#222222" },
  header: { imagen: "https://x.test/vieja.jpg", posicion: { x: 50, y: 50 } },
  entrega: ["delivery"],
};

describe("mergePreviewConfig — ADMIN-CONFIG-44", () => {
  it("pisa lo guardado con lo que hay en el formulario sin guardar", () => {
    const config = mergePreviewConfig(saved, draft());
    expect(config).toMatchObject({
      nombre: "Casa Resto",
      descripcion: "Cocina casera",
      template: "clasico",
      tema: "oscuro",
      colores: { primary: "#ff0000", secondary: "#0000ff" },
      logo: "https://x.test/logo.png",
      header: { imagen: "https://x.test/cabecera.jpg", posicion: { x: 20, y: 80 } },
      horarios: { lunes: ["12:00-15:00"] },
    });
  });

  it("conserva lo que el formulario no edita (teléfono, entrega…) y no toca lo guardado", () => {
    const config = mergePreviewConfig(saved, draft());
    expect(config.telefono).toBe("5493510000000");
    expect(config.entrega).toEqual(["delivery"]);
    expect(saved.nombre).toBe("Nombre guardado");
    expect(saved.header.imagen).toBe("https://x.test/vieja.jpg");
  });

  it("lo que se vació en el formulario se quita aunque estuviera guardado", () => {
    const config = mergePreviewConfig(
      { ...saved, logo: "https://x.test/logo-viejo.png", horarios: { martes: ["10:00-12:00"] } },
      draft({ tagline: "  ", imageUrl: "", logoUrl: "", schedule: {}, primaryColor: "", secondaryColor: "" }),
    );
    expect(config).not.toHaveProperty("descripcion");
    expect(config).not.toHaveProperty("header");
    expect(config).not.toHaveProperty("logo");
    expect(config).not.toHaveProperty("horarios");
    expect(config).not.toHaveProperty("colores");
  });

  it("una imagen o un logo que no son https no se mandan", () => {
    const config = mergePreviewConfig(saved, draft({ imageUrl: "javascript:alert(1)", logoUrl: "http://x.test/l.png" }));
    expect(config).not.toHaveProperty("header");
    expect(config).not.toHaveProperty("logo");
  });

  it("sin nombre en el formulario se usa el guardado", () => {
    expect(mergePreviewConfig(saved, draft({ name: "  " })).nombre).toBe("Nombre guardado");
  });
});

describe("previewPayload y previewSrc — ADMIN-CONFIG-44", () => {
  it("el mensaje lleva el tipo que espera el menú", () => {
    expect(previewPayload({ a: 1 }, { categorias: [] })).toEqual({
      type: "preview",
      config: { a: 1 },
      menu: { categorias: [] },
    });
  });

  it("la dirección abre el menú en modo vista previa", () => {
    expect(previewSrc("https://demo.smaalacarta.com.ar")).toBe("https://demo.smaalacarta.com.ar/apps/menu-app/index.html?preview=1");
  });

  it("contra un menú local, avisa de qué origen del panel acepta mensajes", () => {
    expect(previewSrc("http://localhost:8080", "http://localhost:3000")).toBe(
      "http://localhost:8080/apps/menu-app/index.html?preview=1&admin=http%3A%2F%2Flocalhost%3A3000",
    );
    // En producción el origen del panel va fijo en el menú: no se manda.
    expect(previewSrc("https://demo.smaalacarta.com.ar", "http://localhost:3000")).toBe(
      "https://demo.smaalacarta.com.ar/apps/menu-app/index.html?preview=1",
    );
  });
});

describe("resolveAssetsUrl — ADMIN-CONFIG-45", () => {
  it("por defecto es el menú de producción", () => {
    expect(resolveAssetsUrl(undefined)).toBe(DEFAULT_MENU_ASSETS_URL);
    expect(resolveAssetsUrl("  ")).toBe(DEFAULT_MENU_ASSETS_URL);
  });

  it("la variable pública lo pisa (sin barra final), p. ej. el web/ local", () => {
    expect(resolveAssetsUrl("http://localhost:8080/")).toBe("http://localhost:8080");
  });

  it("lo que no es http(s) se ignora", () => {
    expect(resolveAssetsUrl("javascript:alert(1)")).toBe(DEFAULT_MENU_ASSETS_URL);
  });
});

describe("fetchMenuPreview — ADMIN-CONFIG-46", () => {
  const client = (result: { data: unknown; error: unknown }) => ({
    rpc: async (name: string, args: unknown) => {
      expect(name).toBe("menu_preview");
      expect(args).toEqual({ p_business_id: "neg-1" });
      return result;
    },
  });

  it("devuelve la configuración y el menú", async () => {
    const result = await fetchMenuPreview(
      client({ data: { config: saved, menu: { categorias: [{ nombre: "A", items: [] }] } }, error: null }),
      "neg-1",
    );
    expect(result).toEqual({ ok: true, config: saved, menu: { categorias: [{ nombre: "A", items: [] }] } });
  });

  it("un error de la base o una respuesta que no es un menú son un error", async () => {
    expect((await fetchMenuPreview(client({ data: null, error: { message: "x" } }), "neg-1")).ok).toBe(false);
    expect((await fetchMenuPreview(client({ data: { nada: 1 }, error: null }), "neg-1")).ok).toBe(false);
  });

  it("si la llamada se cae, también es un error y no una excepción", async () => {
    const roto = {
      rpc: async () => {
        throw new Error("sin red");
      },
    };
    expect((await fetchMenuPreview(roto, "neg-1")).ok).toBe(false);
  });
});
