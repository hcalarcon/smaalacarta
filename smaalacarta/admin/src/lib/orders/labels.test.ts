import { describe, expect, it } from "vitest";

import { deliveryLabel, paymentLabel } from "./labels";

describe("etiquetas de entrega y pago — ADMIN-PEDIDOS-43 y 44", () => {
  it("nombra cada entrega, incluido el consumo en el local", () => {
    expect(deliveryLabel("retiro")).toBe("Retiro en el local");
    expect(deliveryLabel("delivery")).toBe("Envío a domicilio");
    expect(deliveryLabel("local")).toBe("Consumo en el local");
  });

  it("nombra cada medio de pago, incluido el QR", () => {
    expect(paymentLabel("efectivo")).toBe("Efectivo");
    expect(paymentLabel("transferencia")).toBe("Transferencia");
    expect(paymentLabel("tarjeta")).toBe("Tarjeta");
    expect(paymentLabel("mercadopago")).toBe("Mercado Pago");
    expect(paymentLabel("qr")).toBe("QR / billetera virtual");
  });

  it("deja pasar tal cual el texto libre de un pedido manual anterior", () => {
    expect(deliveryLabel("mostrador")).toBe("mostrador");
    expect(paymentLabel("cheque")).toBe("cheque");
  });

  it("devuelve vacío si no hay valor", () => {
    expect(deliveryLabel(null)).toBe("");
    expect(paymentLabel(undefined)).toBe("");
    expect(paymentLabel("  ")).toBe("");
  });
});
