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
const buttonsFrame = () => screen.getByTitle("Botones del menú") as HTMLIFrameElement;

describe("AppearancePreview compacta — colores y tema (ADMIN-CONFIG-41)", () => {
  it("muestra el nombre y la descripción en la cabecera", () => {
    render(show());
    expect(within(header()).getByText("Casa Resto")).toBeInTheDocument();
    expect(within(header()).getByText("Cocina casera")).toBeInTheDocument();
  });

  it("la cabecera sigue los colores elegidos, y el texto se lee sobre ellos", () => {
    const view = render(show());
    expect(header().style.getPropertyValue("--color-primary")).toBe("#ff0000");
    expect(header().style.getPropertyValue("--color-secondary")).toBe("#0000ff");

    // Sobre un amarillo claro el texto pasa a oscuro (lib/colors.js de web/).
    view.rerender(show({ primaryColor: "#ffee00", secondaryColor: "#ffff66" }));
    expect(header().style.getPropertyValue("--color-primary")).toBe("#ffee00");
    expect(header().style.getPropertyValue("--on-header")).toBe("#111111");
  });

  it("la fila de botones es un iframe con el CSS real, la plantilla y el tema elegidos", () => {
    const view = render(show());
    expect(buttonsFrame().getAttribute("sandbox")).toBe("allow-scripts");
    expect(buttonsFrame().getAttribute("srcdoc")).toContain("/apps/menu-app/base.css");
    expect(buttonsFrame().getAttribute("srcdoc")).toContain('data-tema="claro"');

    view.rerender(show({ theme: "oscuro", template: "clasico" }));
    expect(buttonsFrame().getAttribute("srcdoc")).toContain('data-tema="oscuro"');
    expect(buttonsFrame().getAttribute("srcdoc")).toContain('data-template="clasico"');
  });

  it("le manda los colores al iframe de botones cada vez que cambian", () => {
    const view = render(show());
    const post = vi.spyOn(buttonsFrame().contentWindow!, "postMessage");

    view.rerender(show({ primaryColor: "#00aa00" }));
    const last = post.mock.calls.at(-1)![0] as { vars: Record<string, string> };
    expect(last.vars["--color-primary"]).toBe("#00aa00");
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

  it("arrastrar la cabecera mueve el punto; el doble clic lo centra", () => {
    const onFocusChange = vi.fn();
    render(show({ onFocusChange }));

    // La imagen mide 1200 × 200 y la cabecera 400 × 200: sobran 800 px en horizontal.
    const probe = document.querySelector("img")!;
    Object.defineProperty(probe, "naturalWidth", { value: 1200 });
    Object.defineProperty(probe, "naturalHeight", { value: 200 });
    fireEvent.load(probe);
    Object.defineProperty(header(), "clientWidth", { value: 400 });
    Object.defineProperty(header(), "clientHeight", { value: 200 });

    act(() => {
      fireEvent.pointerDown(header(), { clientX: 200, clientY: 100, button: 0 });
      fireEvent.pointerMove(header(), { clientX: 280, clientY: 100 });
    });
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 40, y: 50 });

    fireEvent.doubleClick(header());
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
