import { describe, expect, it } from "vitest";

import { hasDigitalMenu, hasOrders, hasPdf } from "./plan-access";

describe("hasDigitalMenu", () => {
  it("con plan_web o plan_completo, tiene menú digital", () => {
    expect(hasDigitalMenu({ planPdf: false, planWeb: true, planCompleto: false })).toBe(true);
    expect(hasDigitalMenu({ planPdf: false, planWeb: false, planCompleto: true })).toBe(true);
    expect(hasDigitalMenu({ planPdf: true, planWeb: true, planCompleto: true })).toBe(true);
  });

  it("solo con plan_pdf (o sin plan), no tiene menú digital", () => {
    expect(hasDigitalMenu({ planPdf: true, planWeb: false, planCompleto: false })).toBe(false);
    expect(hasDigitalMenu({ planPdf: false, planWeb: false, planCompleto: false })).toBe(false);
  });
});

describe("hasOrders", () => {
  it("solo plan_completo habilita pedidos", () => {
    expect(hasOrders({ planPdf: false, planWeb: false, planCompleto: true })).toBe(true);
    expect(hasOrders({ planPdf: true, planWeb: true, planCompleto: false })).toBe(false);
  });
});

describe("hasPdf — ADMIN-PLAN-4", () => {
  it("solo plan_pdf habilita el PDF: plan_completo solo no", () => {
    expect(hasPdf({ planPdf: true, planWeb: false, planCompleto: false })).toBe(true);
    expect(hasPdf({ planPdf: true, planWeb: true, planCompleto: true })).toBe(true);
    expect(hasPdf({ planPdf: false, planWeb: true, planCompleto: true })).toBe(false);
    expect(hasPdf({ planPdf: false, planWeb: false, planCompleto: false })).toBe(false);
  });
});
