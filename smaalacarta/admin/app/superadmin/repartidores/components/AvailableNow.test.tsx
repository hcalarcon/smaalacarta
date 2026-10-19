import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import AvailableNow from "./AvailableNow";

afterEach(cleanup);

describe("repartidores disponibles ahora — ENVIO-201", () => {
  it("lista cada uno con desde qué hora (hora argentina) y las zonas que cubre", () => {
    render(
      <AvailableNow
        couriers={[
          { id: "1", name: "Moto Express", since: "2026-10-19T15:30:00+00:00", zones: ["Cantera", "Centro"] },
          { id: "2", name: "Sin zonas", since: "2026-10-19T16:00:00+00:00", zones: [] },
        ]}
      />,
    );

    expect(screen.getByText("Moto Express")).toBeTruthy();
    expect(screen.getByText("Desde las 12:30")).toBeTruthy();
    expect(screen.getByText("Cantera, Centro")).toBeTruthy();
    expect(screen.getByText("Sin zonas cargadas")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Disponibles ahora/ }).textContent).toContain("2");
  });

  it("sin ninguno, lo dice", () => {
    render(<AvailableNow couriers={[]} />);

    expect(screen.getByText("Ningún repartidor disponible.")).toBeTruthy();
  });
});
