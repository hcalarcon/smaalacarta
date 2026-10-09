import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppearancePreview from "./AppearancePreview";
import { MENU_ASSETS_URL, type PreviewDraft } from "@/lib/settings/live-preview";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase-browser", () => ({ createClient: () => ({ rpc }) }));

const MENU_ORIGIN = new URL(MENU_ASSETS_URL).origin;

const saved = {
  config: { nombre: "Guardado", tipo: "cliente", template: "moderno", tema: "claro", telefono: "549351" },
  menu: { categorias: [{ nombre: "Entradas", items: [{ nombre: "Empanadas", precio: 6500 }] }] },
};

const draft = (extra: Partial<PreviewDraft> = {}): PreviewDraft => ({
  name: "Casa Resto",
  tagline: "Cocina casera",
  template: "moderno",
  theme: "claro",
  primaryColor: "#ff0000",
  secondaryColor: "#0000ff",
  imageUrl: "https://x.test/ok.jpg",
  logoUrl: "",
  focus: { x: 50, y: 50 },
  schedule: {},
  ...extra,
});

type Props = Partial<React.ComponentProps<typeof AppearancePreview>>;
const show = (props: Props & { draft?: PreviewDraft } = {}) => (
  <AppearancePreview businessId="neg-1" draft={draft()} onFocusChange={() => {}} {...props} />
);

const compactFrame = () => screen.getByTitle("Vista previa compacta del menú") as HTMLIFrameElement;

// El menú avisa que cargó, y después dónde está su cabecera.
function menuSays(frame: HTMLIFrameElement, data: object, origin = MENU_ORIGIN) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin, source: frame.contentWindow }));
  });
}
const ready = (frame: HTMLIFrameElement) => menuSays(frame, { type: "preview-ready" });
const header = (frame: HTMLIFrameElement) =>
  menuSays(frame, { type: "preview-header", rect: { x: 0, y: 0, w: 400, h: 200 }, width: 390, height: 900 });

type Sent = { type: string; config: Record<string, unknown>; menu: unknown };
const lastSent = (post: ReturnType<typeof vi.spyOn>) => post.mock.calls.at(-1)![0] as Sent;

async function loaded(props: Props = {}) {
  const view = render(show(props));
  await screen.findByTitle("Vista previa compacta del menú");
  return view;
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: saved, error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AppearancePreview — carga del menú real (ADMIN-CONFIG-46 y 47)", () => {
  it("pide menu_preview del negocio y mientras tanto avisa que carga", async () => {
    render(show());
    expect(screen.getByText("Cargando vista previa…")).toBeInTheDocument();
    await screen.findByTitle("Vista previa compacta del menú");
    expect(rpc).toHaveBeenCalledWith("menu_preview", { p_business_id: "neg-1" });
  });

  it("si no se puede leer el menú, lo dice y deja reintentar", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    render(show());

    expect(await screen.findByText("No pudimos cargar tu menú para la vista previa.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ampliar" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByTitle("Vista previa compacta del menú");
  });

  it("un menú sin productos avisa que solo se ve la cabecera", async () => {
    rpc.mockResolvedValue({ data: { ...saved, menu: { categorias: [] } }, error: null });
    await loaded();
    expect(screen.getByText(/Todavía no cargaste productos/)).toBeInTheDocument();
  });

  it("si el menú no responde, avisa que no pudo conectar y deja reintentar", async () => {
    vi.useFakeTimers();
    render(show());
    // Con el reloj falso no se puede esperar con findBy: se deja resolver la lectura del menú.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTitle("Vista previa compacta del menú")).toBeInTheDocument();
    expect(screen.getByText("Cargando vista previa…")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(13000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos conectar con el menú");

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(screen.getByText("Cargando vista previa…")).toBeInTheDocument();
  });
});

describe("AppearancePreview compacta — el menú real, con lo que no se guardó (ADMIN-CONFIG-44 y 45)", () => {
  it("carga la app del menú en modo vista previa", async () => {
    await loaded();
    expect(compactFrame().getAttribute("src")).toBe(`${MENU_ASSETS_URL}/apps/menu-app/index.html?preview=1`);
  });

  it("al avisar el menú que cargó, recibe la configuración mezclada con el formulario", async () => {
    await loaded();
    const post = vi.spyOn(compactFrame().contentWindow!, "postMessage");
    ready(compactFrame());

    const sent = lastSent(post);
    expect(sent.type).toBe("preview");
    expect(sent.menu).toEqual(saved.menu);
    expect(sent.config).toMatchObject({
      nombre: "Casa Resto",
      template: "moderno",
      telefono: "549351", // lo guardado que el formulario no edita
      colores: { primary: "#ff0000", secondary: "#0000ff" },
    });
    expect(post.mock.calls.at(-1)![1]).toBe(MENU_ORIGIN);
  });

  it("refleja el color y el tema al cambiar, con un pequeño retraso", async () => {
    const view = await loaded();
    ready(compactFrame());
    const post = vi.spyOn(compactFrame().contentWindow!, "postMessage");

    vi.useFakeTimers();
    view.rerender(show({ draft: draft({ primaryColor: "#00aa00", theme: "oscuro" }) }));
    expect(post).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(lastSent(post).config).toMatchObject({ tema: "oscuro", colores: { primary: "#00aa00" } });
  });

  it("ignora mensajes de otro origen o de otra ventana", async () => {
    await loaded();
    const post = vi.spyOn(compactFrame().contentWindow!, "postMessage");

    menuSays(compactFrame(), { type: "preview-ready" }, "https://evil.example");
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { type: "preview-ready" }, origin: MENU_ORIGIN, source: window }));
    });
    expect(post).not.toHaveBeenCalled();
  });

  it("no trae la vista previa grande a la página", async () => {
    await loaded();
    expect(screen.queryByTitle("Vista previa del menú")).toBeNull();
  });
});

describe("AppearancePreview compacta — punto de enfoque (ADMIN-CONFIG-45)", () => {
  const dragArea = () => screen.getByTestId("header-drag");

  it("con la cabecera informada se puede arrastrar el punto; el doble clic lo centra", async () => {
    const onFocusChange = vi.fn();
    await loaded({ onFocusChange });

    // La imagen mide 1200 × 200 y la cabecera 400 × 200: sobran 800 px en horizontal.
    const probe = document.querySelector("img")!;
    Object.defineProperty(probe, "naturalWidth", { value: 1200 });
    Object.defineProperty(probe, "naturalHeight", { value: 200 });
    fireEvent.load(probe);

    expect(screen.queryByTestId("header-drag")).toBeNull();
    header(compactFrame());

    // En jsdom el iframe no se achica (escala 1): 80 px de arrastre son 80 px del menú.
    fireEvent.pointerDown(dragArea(), { clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerMove(dragArea(), { clientX: 280, clientY: 100 });
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 40, y: 50 });

    fireEvent.doubleClick(dragArea());
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 50, y: 50 });
  });

  it("las flechas y 'Centrar imagen' siguen funcionando", async () => {
    const onFocusChange = vi.fn();
    await loaded({ draft: draft({ focus: { x: 10, y: 90 } }), onFocusChange });

    fireEvent.keyDown(screen.getByRole("group", { name: /Vista previa del menú/ }), { key: "ArrowRight" });
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 12, y: 90 });

    fireEvent.click(screen.getByRole("button", { name: "Centrar imagen" }));
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 50, y: 50 });
  });

  it("pasar de una imagen rota a una válida vuelve a intentarla (ADMIN-CONFIG-24)", async () => {
    const view = await loaded({ draft: draft({ imageUrl: "https://x.test/rota.jpg" }) });
    fireEvent.error(document.querySelector("img")!);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByRole("button", { name: "Centrar imagen" })).toBeNull();

    view.rerender(show({ draft: draft({ imageUrl: "https://x.test/ok.jpg" }) }));
    expect(document.querySelector("img")).toHaveAttribute("src", "https://x.test/ok.jpg");
  });

  it("sin imagen de cabecera no hay nada que arrastrar", async () => {
    await loaded({ draft: draft({ imageUrl: "" }) });
    header(compactFrame());
    expect(screen.queryByTestId("header-drag")).toBeNull();
    expect(screen.queryByRole("button", { name: "Centrar imagen" })).toBeNull();
  });
});

describe("AppearancePreview — Ampliar (ADMIN-CONFIG-46)", () => {
  async function expand() {
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Ampliar" }));
    return screen.getByRole("dialog", { name: "Vista previa del menú" });
  }

  it("abre el menú en un modal con formato y tema, y se cierra con Esc", async () => {
    const dialog = await expand();
    expect(within(dialog).getByTitle("Vista previa del menú")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Celular" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Escritorio" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Oscuro" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTitle("Vista previa del menú")).toBeNull();
  });

  it("también se cierra con el botón y tocando afuera", async () => {
    await expand();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ampliar" }));
    fireEvent.click(screen.getByTestId("preview-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cambiar el tema o el formato se ve en el modal sin tocar el formulario", async () => {
    const dialog = await expand();
    const frame = within(dialog).getByTitle("Vista previa del menú") as HTMLIFrameElement;
    ready(frame);
    const post = vi.spyOn(frame.contentWindow!, "postMessage");

    vi.useFakeTimers();
    fireEvent.click(within(dialog).getByRole("button", { name: "Oscuro" }));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(lastSent(post).config).toMatchObject({ tema: "oscuro" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Escritorio" }));
    expect(frame.style.width).toBe("1120px");
  });

  it("sigue los cambios del formulario en vivo", async () => {
    const view = render(show());
    await screen.findByTitle("Vista previa compacta del menú");
    fireEvent.click(screen.getByRole("button", { name: "Ampliar" }));
    const frame = screen.getByTitle("Vista previa del menú") as HTMLIFrameElement;
    ready(frame);
    const post = vi.spyOn(frame.contentWindow!, "postMessage");

    vi.useFakeTimers();
    view.rerender(show({ draft: draft({ primaryColor: "#00aa00" }) }));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(lastSent(post).config).toMatchObject({ colores: { primary: "#00aa00" } });
  });

  it("en celular la vista previa se colapsa y vuelve a abrirse", async () => {
    await loaded();
    const toggle = screen.getByRole("button", { name: /Vista previa/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
