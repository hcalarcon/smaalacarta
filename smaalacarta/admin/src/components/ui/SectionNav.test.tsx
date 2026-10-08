import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
});

function renderNav() {
  const targets = sections.map(({ id }) => {
    const el = document.createElement("section");
    el.id = id;
    document.body.appendChild(el);
    return el;
  });
  render(<SectionNav sections={sections} />);
  return targets;
}

describe("SectionNav", () => {
  it("muestra solo las secciones que recibe (ADMIN-CONFIG-22)", () => {
    renderNav();
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(
      sections.map((s) => s.label),
    );
    expect(screen.queryByText("Menú en PDF")).toBeNull();
  });

  it("resalta la sección visible con aria-current (ADMIN-CONFIG-23)", () => {
    const [, horarios] = renderNav();
    act(() =>
      observed([{ target: horarios, isIntersecting: true, intersectionRatio: 1 }]),
    );
    const current = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Horarios");
  });

  it("al tocar salta, pone el hash y da el foco (ADMIN-CONFIG-23)", () => {
    const [, horarios] = renderNav();
    fireEvent.click(screen.getAllByRole("link", { name: "Horarios" })[0]);
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
    fireEvent.click(screen.getAllByRole("link", { name: "Horarios" })[0]);
    expect(horarios.scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });
});
