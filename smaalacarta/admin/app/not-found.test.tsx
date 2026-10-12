import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotFound from "./not-found";

// ADMIN-PWA-32: una dirección inventada bajo /admin muestra una 404 del panel, con la marca.
describe("404 del panel — ADMIN-PWA-32", () => {
  it("dice que no encontró la página y ofrece volver al panel", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: "No encontramos esta página" })).toBeTruthy();
    const volver = screen.getByRole("link", { name: "Volver al panel" });
    expect(volver.getAttribute("href")).toBe("/");
  });
});
