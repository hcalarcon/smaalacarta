import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsTutorial from "./SettingsTutorial";
import type { SettingsSection } from "@/lib/settings/sections";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  drive: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("driver.js", () => ({ driver: mocks.create }));
vi.mock("driver.js/dist/driver.css", () => ({}));

const sections: SettingsSection[] = [
  { id: "datos", label: "Datos del negocio" },
  { id: "envios", label: "Envíos" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockReturnValue({ drive: mocks.drive, destroy: mocks.destroy });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
});

describe("SettingsTutorial — ADMIN-CONFIG-52", () => {
  it("inicia una guía voluntaria con una explicación por cada sección disponible", () => {
    render(<SettingsTutorial sections={sections} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver guía de Configuración" }));

    expect(mocks.create).toHaveBeenCalledOnce();
    const options = mocks.create.mock.calls[0][0];
    expect(options.steps.map((step: { element: string }) => step.element)).toEqual([
      "#datos",
      "#envios",
    ]);
    expect(options.steps.every((step: { popover: { description: string } }) =>
      step.popover.description.length > 0,
    )).toBe(true);
    const expandableSection = document.createElement("details");
    options.steps[0].onHighlightStarted(expandableSection);
    expect(expandableSection.open).toBe(true);
    options.steps[0].onDeselected(expandableSection);
    expect(expandableSection.open).toBe(false);
    expect(mocks.drive).toHaveBeenCalledOnce();
  });

  it("respeta la preferencia de movimiento reducido", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    render(<SettingsTutorial sections={sections} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver guía de Configuración" }));

    expect(mocks.create.mock.calls[0][0].animate).toBe(false);
    expect(mocks.create.mock.calls[0][0].smoothScroll).toBe(false);
  });
});
