import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AnimationsSection from "./AnimationsSection";
import { MENU_ASSETS_URL, type PreviewDraft } from "@/lib/settings/live-preview";
import { DEFAULT_MENU_LOOK, type MenuLook } from "@/lib/settings/menu-look";

const { rpc, upload, getPublicUrl, from } = vi.hoisted(() => {
  const upload = vi.fn();
  const getPublicUrl = vi.fn();
  return { rpc: vi.fn(), upload, getPublicUrl, from: vi.fn(() => ({ upload, getPublicUrl })) };
});
vi.mock("@/lib/supabase-browser", () => ({ createClient: () => ({ rpc, storage: { from } }) }));

const MENU_ORIGIN = new URL(MENU_ASSETS_URL).origin;
const saved = {
  config: { nombre: "Guardado", tipo: "cliente", template: "moderno", tema: "claro" },
  menu: { categorias: [{ nombre: "Entradas", items: [{ nombre: "Empanadas", precio: 6500 }] }] },
};

const draft: PreviewDraft = {
  name: "Casa Resto",
  tagline: "",
  template: "moderno",
  theme: "claro",
  primaryColor: "#ff0000",
  secondaryColor: "#0000ff",
  imageUrl: "",
  logoUrl: "",
  focus: { x: 50, y: 50 },
  schedule: {},
};

let latest: MenuLook = DEFAULT_MENU_LOOK;

function Harness({ initial = DEFAULT_MENU_LOOK, errors = {} }: { initial?: MenuLook; errors?: object }) {
  const [look, setLook] = useState(initial);
  useEffect(() => {
    latest = look;
  });
  return <AnimationsSection businessId="neg-1" look={look} onChange={setLook} errors={errors} draft={draft} />;
}

const frame = () => screen.getByTitle("Vista previa de las animaciones del menú") as HTMLIFrameElement;
const file = (type: string, size: number) => {
  const f = new File(["x"], "a", { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};
const inputs = () => document.querySelectorAll<HTMLInputElement>('input[type="file"]');

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: saved, error: null });
  upload.mockReset();
  upload.mockResolvedValue({ error: null });
  getPublicUrl.mockReset();
  getPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/${path}` } }));
  from.mockClear();
});

afterEach(cleanup);

describe("Animaciones — PUBLICO-103", () => {
  it("ofrece las cuatro animaciones del menú, 'Sin animaciones' incluida, con la estándar elegida", () => {
    render(<Harness />);

    for (const name of ["Estándar", "Suave", "Dinámica", "Sin animaciones"]) {
      expect(screen.getByRole("radio", { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: /Estándar/ })).toBeChecked();
  });

  it("ofrece los ocho cargadores de comida y 'La mía' (apagada hasta subir un archivo)", () => {
    render(<Harness />);

    for (const name of ["Hamburguesa", "Pizza", "Café", "Helado", "Parrilla", "Sushi", "Pastas", "Panificados"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: /La mía/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Hamburguesa" })).toBeChecked();
  });

  it("elegir cambia el borrador que se guarda", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("radio", { name: /Sin animaciones/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Sushi" }));

    expect(latest).toMatchObject({ menuAnimation: "ninguna", loaderAnimation: "sushi" });
  });

  it("muestra los errores de validación", () => {
    render(<Harness errors={{ menuAnimation: "Elegí una de las animaciones." }} />);
    expect(screen.getByText("Elegí una de las animaciones.")).toBeInTheDocument();
  });
});

describe("Animaciones — subir archivos, PUBLICO-104 y 105", () => {
  it("sube la animación propia al bucket de animaciones, en la carpeta del negocio, y la deja elegida", async () => {
    render(<Harness />);
    await screen.findByTitle("Vista previa de las animaciones del menú");

    fireEvent.change(inputs()[0], { target: { files: [file("image/gif", 500_000)] } });

    await waitFor(() => expect(latest.loaderAnimation).toBe("custom"));
    expect(from).toHaveBeenCalledWith("business-animations");
    expect(upload.mock.calls[0][0]).toMatch(/^neg-1\/[0-9a-f-]+\.gif$/);
    expect(latest.loaderCustomUrl).toMatch(/^https:\/\/x\.supabase\.co\/storage\/neg-1\//);
  });

  it("un archivo de más de 1 MB o de otro tipo da error y no se sube", async () => {
    render(<Harness />);

    fireEvent.change(inputs()[0], { target: { files: [file("image/gif", 1024 * 1024 + 1)] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("1 MB");

    fireEvent.change(inputs()[0], { target: { files: [file("image/jpeg", 1000)] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/GIF, WebP o PNG/));

    expect(upload).not.toHaveBeenCalled();
    expect(latest.loaderAnimation).toBe("hamburguesa");
  });

  it("quitar la propia vuelve a la hamburguesa", () => {
    render(
      <Harness
        initial={{ ...DEFAULT_MENU_LOOK, loaderAnimation: "custom", loaderCustomUrl: "https://x.supabase.co/a.gif" }}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Quitar" })[0]);

    expect(latest).toMatchObject({ loaderAnimation: "hamburguesa", loaderCustomUrl: "" });
  });

  it("el fondo va al bucket de imágenes, y un archivo de más de 2 MB da error", async () => {
    render(<Harness />);

    fireEvent.change(inputs()[1], { target: { files: [file("image/png", 3 * 1024 * 1024)] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("2 MB");
    expect(upload).not.toHaveBeenCalled();

    fireEvent.change(inputs()[1], { target: { files: [file("image/webp", 900_000)] } });
    await waitFor(() => expect(latest.backgroundImageUrl).toMatch(/^https:\/\//));
    expect(from).toHaveBeenCalledWith("business-images");
  });
});

describe("Animaciones — vista previa, PUBLICO-108", () => {
  async function loaded() {
    const view = render(<Harness />);
    await screen.findByTitle("Vista previa de las animaciones del menú");
    return view;
  }

  it("carga el menú real en modo vista previa, con el cargador a la vista", async () => {
    await loaded();
    expect(frame().getAttribute("src")).toBe(`${MENU_ASSETS_URL}/apps/menu-app/index.html?preview=1&look=1`);
  });

  it("le manda la elección sin guardar", async () => {
    await loaded();

    fireEvent.click(screen.getByRole("radio", { name: /Dinámica/ }));
    const post = vi.spyOn(frame().contentWindow!, "postMessage");
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { data: { type: "preview-ready" }, origin: MENU_ORIGIN, source: frame().contentWindow }),
      );
    });

    await waitFor(() => expect(post).toHaveBeenCalled());
    const sent = post.mock.calls.at(-1)![0] as { config: Record<string, unknown> };
    expect(sent.config).toMatchObject({ animacionMenu: "dinamica", animacionCarga: "hamburguesa", nombre: "Casa Resto" });
    expect(post.mock.calls.at(-1)![1]).toBe(MENU_ORIGIN);
  });

  it("'Ver de nuevo' vuelve a cargar el menú desde cero", async () => {
    await loaded();
    const before = frame();

    fireEvent.click(screen.getByRole("button", { name: "Ver de nuevo" }));

    await waitFor(() => expect(frame()).not.toBe(before));
  });

  it("si no se puede leer el menú, lo dice y deja reintentar", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    render(<Harness />);

    expect(await screen.findByText("No pudimos cargar tu menú para la vista previa.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver de nuevo" })).toBeDisabled();
  });
});
