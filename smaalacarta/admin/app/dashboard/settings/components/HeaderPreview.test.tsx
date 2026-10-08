import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import HeaderPreview from "./HeaderPreview";

type Props = Partial<React.ComponentProps<typeof HeaderPreview>>;

const show = (props: Props = {}) => (
  <HeaderPreview
    businessName="Casa Resto"
    tagline="Cocina casera"
    template="moderno"
    theme="claro"
    primaryColor="#111111"
    secondaryColor="#222222"
    imageUrl="https://x.test/ok.jpg"
    logoUrl=""
    focus={{ x: 50, y: 50 }}
    onFocusChange={() => {}}
    {...props}
  />
);

describe("HeaderPreview (ADMIN-CONFIG-24)", () => {
  it("pasar de una URL rota a una válida vuelve a mostrar la imagen", () => {
    const view = render(show({ imageUrl: "https://x.test/rota.jpg" }));
    fireEvent.error(document.querySelector("img")!);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/No pudimos cargar/)).toBeInTheDocument();

    view.rerender(show({ imageUrl: "https://x.test/ok.jpg" }));
    expect(document.querySelector("img")).toHaveAttribute("src", "https://x.test/ok.jpg");
    expect(screen.queryByText(/No pudimos cargar/)).toBeNull();
  });
});

describe("HeaderPreview — vista previa fiel (ADMIN-CONFIG-28 y 30)", () => {
  it("es un iframe aislado con el CSS real del menú", () => {
    render(show());
    const frame = screen.getByTitle("Vista previa del menú") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain("/apps/menu-app/base.css");
    expect(frame.getAttribute("srcdoc")).toContain('data-template="moderno"');
  });

  it("la plantilla y el tema se eligen en la vista previa sin tocar el formulario", () => {
    render(show());
    const frame = () => screen.getByTitle("Vista previa del menú").getAttribute("srcdoc");

    fireEvent.click(screen.getByRole("button", { name: "Clásico" }));
    fireEvent.click(screen.getByRole("button", { name: "Oscuro" }));
    expect(frame()).toContain('data-template="clasico"');
    expect(frame()).toContain('data-tema="oscuro"');
  });

  it("si el formulario cambia su plantilla, la vista previa la sigue", () => {
    const view = render(show());
    fireEvent.click(screen.getByRole("button", { name: "Clásico" }));

    view.rerender(show({ template: "minimal" }));
    expect(screen.getByTitle("Vista previa del menú").getAttribute("srcdoc")).toContain('data-template="minimal"');
  });

  it("se puede ver en celular y en escritorio", () => {
    render(show());
    const frame = screen.getByTitle("Vista previa del menú") as HTMLIFrameElement;
    expect(frame.style.width).toBe("390px");

    fireEvent.click(screen.getByRole("button", { name: "Escritorio" }));
    expect(frame.style.width).toBe("1120px");
  });
});

describe("HeaderPreview — punto de enfoque (ADMIN-CONFIG-27)", () => {
  it("las flechas mueven el punto 2 puntos, y 10 con Mayús", () => {
    const onFocusChange = vi.fn();
    render(show({ onFocusChange }));
    const region = screen.getByRole("group", { name: /Vista previa de la cabecera/ });

    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 52, y: 50 });
    fireEvent.keyDown(region, { key: "ArrowUp", shiftKey: true });
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 50, y: 40 });
  });

  it('"Centrar imagen" vuelve a 50 y 50, y está desactivado si ya está centrada', () => {
    const onFocusChange = vi.fn();
    const view = render(show({ focus: { x: 10, y: 90 }, onFocusChange }));

    fireEvent.click(screen.getByRole("button", { name: "Centrar imagen" }));
    expect(onFocusChange).toHaveBeenCalledWith({ x: 50, y: 50 });

    view.rerender(show({ focus: { x: 50, y: 50 }, onFocusChange }));
    expect(screen.getByRole("button", { name: "Centrar imagen" })).toBeDisabled();
  });

  it("arrastrar la cabecera del iframe mueve el punto; el doble clic lo centra", () => {
    const onFocusChange = vi.fn();
    render(show({ onFocusChange }));
    const frame = screen.getByTitle("Vista previa del menú") as HTMLIFrameElement;

    // La imagen mide 1200 × 200 y la cabecera 400 × 200: sobran 800 px en horizontal.
    const probe = document.querySelector("img")!;
    Object.defineProperty(probe, "naturalWidth", { value: 1200 });
    Object.defineProperty(probe, "naturalHeight", { value: 200 });
    fireEvent.load(probe);

    const send = (data: object) =>
      act(() => {
        window.dispatchEvent(new MessageEvent("message", { data, source: frame.contentWindow }));
      });

    send({ sma: "drag", phase: "start", dx: 0, dy: 0, w: 400, h: 200 });
    send({ sma: "drag", phase: "move", dx: 80, dy: 0, w: 400, h: 200 });
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 40, y: 50 });

    send({ sma: "center" });
    expect(onFocusChange).toHaveBeenLastCalledWith({ x: 50, y: 50 });
  });

  it("ignora mensajes que no vienen del iframe de la vista previa", () => {
    const onFocusChange = vi.fn();
    render(show({ onFocusChange }));

    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { sma: "center" }, source: window }));
    });
    expect(onFocusChange).not.toHaveBeenCalled();
  });
});
