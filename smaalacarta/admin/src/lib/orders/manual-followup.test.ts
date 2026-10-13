import { describe, expect, it } from "vitest";

import { followupMessage, followupWhatsappUrl } from "./manual-followup";

const base = {
  customerName: "Lucía",
  businessName: "Ana Resto",
  number: 12,
  link: "https://ana.smaalacarta.com.ar/pedido/0123456789abcdef0123",
  chooseCourier: false,
};

describe("mensaje de seguimiento — ADMIN-PEDIDOS-48", () => {
  it("lleva el número del pedido, el negocio y el link", () => {
    const text = followupMessage(base);

    expect(text).toContain("Lucía");
    expect(text).toContain("#12");
    expect(text).toContain("Ana Resto");
    expect(text.endsWith(base.link)).toBe(true);
    expect(text).not.toContain("elegir");
  });

  it("con 'buscar repartidor' le dice al cliente que entre para elegir quién se lo lleva", () => {
    expect(followupMessage({ ...base, chooseCourier: true })).toContain("elegir quién te lo lleva");
  });

  it("saluda sin nombre si no lo hay", () => {
    expect(followupMessage({ ...base, customerName: "  " }).startsWith("Hola! ")).toBe(true);
  });
});

describe("link de WhatsApp — ADMIN-PEDIDOS-48", () => {
  it("arma el link del menú con el teléfono solo con dígitos y el texto codificado", () => {
    const url = followupWhatsappUrl("351 555-1234", "Hola, mirá esto");

    expect(url).toBe(
      `https://api.whatsapp.com/send?phone=5493515551234&text=${encodeURIComponent("Hola, mirá esto")}`,
    );
  });

  it("un número que ya trae código de país no se toca", () => {
    expect(followupWhatsappUrl("+54 9 351 555 1234", "x")).toContain("phone=5493515551234");
  });

  it("sin teléfono no hay link de WhatsApp", () => {
    expect(followupWhatsappUrl("", "x")).toBeNull();
    expect(followupWhatsappUrl(null, "x")).toBeNull();
  });
});
