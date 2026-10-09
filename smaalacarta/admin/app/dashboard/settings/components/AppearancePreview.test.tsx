import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AppearancePreview from "./AppearancePreview";

type Props = Partial<React.ComponentProps<typeof AppearancePreview>>;

const show = (props: Props = {}) => (
  <AppearancePreview
    businessName="Casa Resto"
    tagline="Cocina casera"
    template="moderno"
    theme="claro"
    primaryColor="#ff0000"
    secondaryColor="#0000ff"
    imageUrl="https://x.test/ok.jpg"
    logoUrl=""
    focus={{ x: 50, y: 50 }}
    onFocusChange={() => {}}
    {...props}
  />
);

const header = () => screen.getByRole("group", { name: /Cabecera de la vista previa/ });
const headerFrame = () => screen.getByTitle("Cabecera del menú") as HTMLIFrameElement;
const buttonsFrame = () => screen.getByTitle("Botones del menú") as HTMLIFrameElement;
const sentTo = (frame: HTMLIFrameElement) => vi.spyOn(frame.contentWindow!, "postMessage");
const lastVars = (post: ReturnType<typeof sentTo>) =>
  (post.mock.calls.at(-1)![0] as { vars: Record<string, string> }).vars;

describe("AppearancePreview compacta — el menú real, achicado (ADMIN-CONFIG-41)", () => {
  it("la cabecera es la misma vista del modal: un iframe con el CSS real y la plantilla elegida", () => {
    const view = render(show());
    expect(headerFrame().getAttribute("sandbox")).toBe("allow-scripts");
    expect(headerFrame().getAttribute("srcdoc")).toContain("/apps/menu-app/base.css");
    expect(headerFrame().getAttribute("srcdoc")).toContain('data-template="moderno"');

    view.rerender(show({ template: "clasico" }));
    expect(headerFrame().getAttribute("srcdoc")).toContain('data-template="clasico"');
  });

  it("le manda al iframe los colores y el nombre cada vez que cambian", () => {
    const view = render(show());
    const post = sentTo(headerFrame());

    view.rerender(show({ primaryColor: "#00aa00", businessName: "Lo de Ana" }));
    expect(lastVars(post)["--color-primary"]).toBe("#00aa00");
    expect((post.mock.calls.at(-1)![0] as { name: string }).name).toBe("Lo de Ana");
  });

  it("la fila de botones es un iframe aparte con el CSS real, la plantilla y el tema elegidos", () => {
    const view = render(show());
    expect(buttonsFrame().getAttribute("srcdoc")).toContain("/apps/menu-app/base.css");
    expect(buttonsFrame().getAttribute("srcdoc")).toContain('data-tema="claro"');

    view.rerender(show({ theme: "oscuro", template: "clasico" }));
    expect(buttonsFrame().getAttribute("srcdoc")).toContain('data-tema="oscuro"');
    expect(buttonsFrame().getAttribute("srcdoc")).toContain('data-template="clasico"');
  });

  it("le manda los colores al iframe de botones cada vez que cambian", () => {
    const view = render(show());
    const post = sentTo(buttonsFrame());

    view.rerender(show({ primaryColor: "#00aa00" }));
    expect(lastVars(post)["--color-primary"]).toBe("#00aa00");
  });

  it("no trae la vista previa completa a la página", () => {
    render(show());
    expect(screen.queryByTitle("Vista previa del menú")).toBeNull();
  });
});

describe("AppearancePreview compacta — punto de enfoque (ADMIN-CONFIG-41)", () => {
  it("las flechas y 'Centrar imagen' siguen funcionando", () => {
    const onFocusChange = vi.fn();
    render(show({ focus: { x: 10, y: 90 }, onFocusChange }));

    fireEvent.keyDown(header(), { key: "ArrowRight" });
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 12, y: 90 });

    fireEvent.click(screen.getByRole("button", { name: "Centrar imagen" }));
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 50, y: 50 });
  });

  it("arrastrar la cabecera del iframe mueve el punto; el doble clic lo centra", () => {
    const onFocusChange = vi.fn();
    render(show({ onFocusChange }));

    // La imagen mide 1200 × 200 y la cabecera 400 × 200: sobran 800 px en horizontal.
    const probe = document.querySelector("img")!;
    Object.defineProperty(probe, "naturalWidth", { value: 1200 });
    Object.defineProperty(probe, "naturalHeight", { value: 200 });
    fireEvent.load(probe);

    const send = (data: object) =>
      act(() => {
        window.dispatchEvent(new MessageEvent("message", { data, source: headerFrame().contentWindow }));
      });

    send({ sma: "drag", phase: "start", dx: 0, dy: 0, w: 400, h: 200 });
    send({ sma: "drag", phase: "move", dx: 80, dy: 0, w: 400, h: 200 });
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 40, y: 50 });

    send({ sma: "center" });
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 50, y: 50 });
  });
});

describe("AppearancePreview — Ampliar (ADMIN-CONFIG-42)", () => {
  it("abre la vista previa completa en un modal y se cierra con Esc", () => {
    render(show());
    fireEvent.click(screen.getByRole("button", { name: "Ampliar" }));

    const dialog = screen.getByRole("dialog", { name: "Vista previa del menú" });
    expect(within(dialog).getByTitle("Vista previa del menú")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Escritorio" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTitle("Vista previa del menú")).toBeNull();
  });

  it("también se cierra con el botón y tocando afuera", () => {
    render(show());
    fireEvent.click(screen.getByRole("button", { name: "Ampliar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ampliar" }));
    fireEvent.click(screen.getByTestId("preview-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("el modal sigue los cambios en vivo", () => {
    const view = render(show());
    fireEvent.click(screen.getByRole("button", { name: "Ampliar" }));
    const frame = () => screen.getByTitle("Vista previa del menú") as HTMLIFrameElement;
    const post = vi.spyOn(frame().contentWindow!, "postMessage");

    view.rerender(show({ primaryColor: "#00aa00", template: "minimal" }));
    const last = post.mock.calls.at(-1)![0] as { vars: Record<string, string> };
    expect(last.vars["--color-primary"]).toBe("#00aa00");
    expect(frame().getAttribute("srcdoc")).toContain('data-template="minimal"');
  });

  it("en celular la vista previa se colapsa y vuelve a abrirse", () => {
    render(show());
    const toggle = screen.getByRole("button", { name: /Vista previa/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
