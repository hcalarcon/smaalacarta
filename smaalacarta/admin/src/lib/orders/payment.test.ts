import { describe, expect, it } from "vitest";

import { isPaymentPending, paymentBadge, PAYMENT_BLOCK_REASON } from "./payment";

describe("estado de pago — ADMIN-PEDIDOS-17", () => {
  it("muestra una etiqueta solo en los pedidos con Mercado Pago", () => {
    expect(paymentBadge("awaiting")?.label).toBe("Esperando pago");
    expect(paymentBadge("paid")?.label).toBe("Pagado");
    expect(paymentBadge("failed")?.label).toBe("Pago fallido");
  });

  it.each(["not_required", "", undefined, null, "otra"])("%j no lleva etiqueta", (status) => {
    expect(paymentBadge(status)).toBeNull();
  });

  it("cada etiqueta lleva un tono para el color", () => {
    expect(paymentBadge("awaiting")?.tone).toBe("warning");
    expect(paymentBadge("paid")?.tone).toBe("success");
    expect(paymentBadge("failed")?.tone).toBe("danger");
  });

  it("el pago está pendiente en awaiting y failed, y en nada más", () => {
    expect(isPaymentPending("awaiting")).toBe(true);
    expect(isPaymentPending("failed")).toBe(true);
    expect(isPaymentPending("paid")).toBe(false);
    expect(isPaymentPending("not_required")).toBe(false);
    expect(isPaymentPending(undefined)).toBe(false);
  });

  it("explica por qué no se puede avanzar", () => {
    expect(PAYMENT_BLOCK_REASON).toMatch(/pago/i);
    expect(PAYMENT_BLOCK_REASON).toMatch(/cancelar/i);
  });
});
