import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SectionNav from "./SectionNav";

const sections = [
  { id: "datos", label: "Datos del negocio" },
  { id: "horarios", label: "Horarios" },
  { id: "contrasena", label: "Contraseña" },
];

let observed: (entries: Partial<IntersectionObserverEntry>[]) => void;

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observed = (entries) =>
          callback(entries as IntersectionObserverEntry[], this as never);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
  document.body.innerHTML = "";
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderNav() {
  const targets = sections.map(({ id }) => {
    const el = document.createElement("section");
    el.id = id;
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);
    return el;
  });
  render(<SectionNav sections={sections} businessId="business-1" />);
  return targets;
}

describe("SectionNav", () => {
  it("muestra un selector compacto con solo las secciones que recibe (ADMIN-CONFIG-22, 51)", () => {
    renderNav();
    expect(screen.getByRole("combobox", { name: "Ir a sección" })).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(
      sections.map((section) => section.label),
    );
    expect(screen.queryByText("Menú en PDF")).toBeNull();
  });

  it("resalta la sección visible con aria-current (ADMIN-CONFIG-23)", () => {
    const [, horarios] = renderNav();
    act(() =>
      observed([{ target: horarios, isIntersecting: true, intersectionRatio: 1 }]),
    );
    expect(screen.getByRole("combobox", { name: "Ir a sección" })).toHaveValue("horarios");
    expect(screen.getByRole("option", { name: "Horarios" })).toHaveAttribute("aria-current", "location");
  });

  it("al elegir una sección salta, pone el hash y da el foco (ADMIN-CONFIG-23, 51)", () => {
    const [, horarios] = renderNav();
    fireEvent.change(screen.getByRole("combobox", { name: "Ir a sección" }), {
      target: { value: "horarios" },
    });
    expect(horarios.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(window.location.hash).toBe("#horarios");
    expect(document.activeElement).toBe(horarios);
  });

  it("sin animación si el usuario prefiere menos movimiento", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    const [, horarios] = renderNav();
    fireEvent.change(screen.getByRole("combobox", { name: "Ir a sección" }), {
      target: { value: "horarios" },
    });
    expect(horarios.scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });
});

describe("SectionNav plegable — ADMIN-CONFIG-38", () => {
  it("el botón avisa con aria-expanded y pide ocultar o mostrar", () => {
    const onToggle = vi.fn();
    const view = render(<SectionNav sections={sections} open onToggle={onToggle} />);

    const hide = screen.getByRole("button", { name: "Ocultar el índice de secciones" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(hide);
    expect(onToggle).toHaveBeenCalledOnce();

    view.rerender(<SectionNav sections={sections} open={false} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "Mostrar el índice de secciones" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("oculto, el índice se esconde en escritorio pero el botón sigue ahí", () => {
    const onToggle = vi.fn();
    render(<SectionNav sections={sections} open={false} onToggle={onToggle} />);
    expect(screen.getByRole("combobox").parentElement?.className).toContain("lg:hidden");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar el índice de secciones" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("sin onToggle no hay control para ocultar el índice", () => {
    render(<SectionNav sections={sections} />);
    expect(screen.queryByRole("button", { name: /índice de secciones/ })).toBeNull();
  });
});

describe("SectionNav reordenable — ADMIN-CONFIG-51", () => {
  it("guarda el orden personalizado por negocio y conserva las opciones al navegar", () => {
    const [datos, horarios] = renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Reordenar índice" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir Horarios" }));

    expect(JSON.parse(localStorage.getItem("sma:settings-section-order:business-1")!)).toEqual([
      "horarios",
      "datos",
      "contrasena",
    ]);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Horarios",
      "Datos del negocio",
      "Contraseña",
    ]);

    fireEvent.change(screen.getByRole("combobox", { name: "Ir a sección" }), {
      target: { value: "horarios" },
    });
    expect(horarios.scrollIntoView).toHaveBeenCalled();
    expect(datos.scrollIntoView).not.toHaveBeenCalled();
  });

  it("recupera el orden guardado y agrega al final las secciones nuevas del plan", async () => {
    localStorage.setItem(
      "sma:settings-section-order:business-1",
      JSON.stringify(["horarios", "desaparecida", "horarios"]),
    );
    render(
      <SectionNav
        sections={[...sections, { id: "contacto", label: "Contacto" }]}
        businessId="business-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
        "Horarios",
        "Datos del negocio",
        "Contraseña",
        "Contacto",
      ]);
    });
  });

  it("mantiene las preferencias separadas por negocio", () => {
    const firstBusiness = render(
      <SectionNav sections={sections} businessId="business-1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reordenar índice" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir Horarios" }));
    firstBusiness.unmount();

    render(<SectionNav sections={sections} businessId="business-2" />);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Datos del negocio",
      "Horarios",
      "Contraseña",
    ]);
  });

  it("sigue permitiendo reordenar durante la sesión si el navegador bloquea localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    render(<SectionNav sections={sections} businessId="business-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Reordenar índice" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir Horarios" }));

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Horarios",
      "Datos del negocio",
      "Contraseña",
    ]);
  });
});
