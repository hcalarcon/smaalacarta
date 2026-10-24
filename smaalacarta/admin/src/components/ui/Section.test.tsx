import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Section from "./Section";

describe("Section plegable en Configuración — ADMIN-CONFIG-53", () => {
  it("mantiene el contenido disponible y lo expande al activar su encabezado", () => {
    render(
      <Section
        id="apariencia"
        title="Apariencia"
        description="Cómo ven tus clientes el menú."
        collapsible
      >
        <button type="button">Elegir plantilla</button>
      </Section>,
    );

    const section = screen.getByText("Apariencia").closest("details");
    expect(section).not.toHaveAttribute("open");
    expect(screen.queryByRole("button", { name: "Elegir plantilla" })).not.toBeVisible();

    fireEvent.click(screen.getByText("Apariencia"));
    expect(section).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Elegir plantilla" })).toBeVisible();
  });

  it("abre por defecto solo las secciones prioritarias indicadas", () => {
    render(
      <Section id="datos" title="Datos del negocio" collapsible defaultOpen>
        <p>Campos principales</p>
      </Section>,
    );

    expect(screen.getByText("Datos del negocio").closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Campos principales")).toBeVisible();
  });

  it("no cambia las secciones compartidas que no usan el modo plegable", () => {
    render(
      <Section id="otra-pantalla" title="Otra pantalla">
        <button type="button">Acción</button>
      </Section>,
    );

    expect(screen.getByRole("heading", { name: "Otra pantalla" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Acción" })).toBeVisible();
  });
});
