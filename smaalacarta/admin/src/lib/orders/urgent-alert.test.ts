import { describe, expect, it } from "vitest";

import {
  ALARM_LOUD_AFTER_MS,
  MUTE_MS,
  VOICE_REPEAT_MS,
  alarmVolume,
  badgeLabel,
  barState,
  blinkTitle,
  isMuted,
  isUnattended,
  oldestWaitingMs,
  shouldBlink,
  unattendedOrders,
} from "./urgent-alert";

const NOW = Date.parse("2026-10-12T15:10:00.000Z");
const order = (extra: Record<string, unknown> = {}) => ({
  id: "1",
  status: "pending",
  source: "web",
  payment_status: "not_required",
  created_at: "2026-10-12T15:09:30.000Z",
  ...extra,
});

describe("qué pedidos están sin atender — ADMIN-PEDIDOS-24", () => {
  it("cuenta el pedido por menú pendiente, con o sin pago online resuelto", () => {
    expect(isUnattended(order())).toBe(true);
    expect(isUnattended(order({ payment_status: "paid" }))).toBe(true);
  });

  it("no cuenta lo que ya atendió o canceló el local", () => {
    for (const status of ["confirmed", "preparing", "ready", "delivered", "cancelled"]) {
      expect(isUnattended(order({ status }))).toBe(false);
    }
  });

  it("no cuenta el pedido que cargó el propio local ni el de Mercado Pago sin pagar o fallido", () => {
    expect(isUnattended(order({ source: "manual" }))).toBe(false);
    expect(isUnattended(order({ payment_status: "awaiting" }))).toBe(false);
    expect(isUnattended(order({ payment_status: "failed" }))).toBe(false);
  });

  it("filtra una lista y respeta los datos que todavía no vienen", () => {
    const list = [order({ id: "a" }), order({ id: "b", status: "confirmed" }), { id: "c", status: "pending" }];
    expect(unattendedOrders(list).map((o) => o.id)).toEqual(["a", "c"]);
  });
});

describe("silenciar — ADMIN-PEDIDOS-25", () => {
  it("silencia 5 minutos", () => {
    expect(MUTE_MS).toBe(5 * 60_000);
    expect(isMuted(NOW + MUTE_MS, NOW)).toBe(true);
    expect(isMuted(NOW + MUTE_MS, NOW + MUTE_MS - 1)).toBe(true);
    expect(isMuted(NOW + MUTE_MS, NOW + MUTE_MS)).toBe(false);
  });

  it("sin silenciar no está silenciado", () => {
    expect(isMuted(null, NOW)).toBe(false);
  });

  it("la voz se repite cada 30 s", () => {
    expect(VOICE_REPEAT_MS).toBe(30_000);
  });
});

describe("volumen por antigüedad — ADMIN-PEDIDOS-26", () => {
  it("la espera es la del pedido más viejo sin atender", () => {
    const list = [order({ id: "a", created_at: "2026-10-12T15:09:00.000Z" }), order({ id: "b" })];
    expect(oldestWaitingMs(list, NOW)).toBe(60_000);
  });

  it("sin pedidos sin atender o sin fecha es cero", () => {
    expect(oldestWaitingMs([], NOW)).toBe(0);
    expect(oldestWaitingMs([{ id: "x", status: "pending" }], NOW)).toBe(0);
  });

  it("un reloj atrasado no da una espera negativa", () => {
    expect(oldestWaitingMs([order({ created_at: "2026-10-12T16:00:00.000Z" })], NOW)).toBe(0);
  });

  it("suena bajo al principio y sube pasados los 60 s, sin pasar de 1", () => {
    const quiet = alarmVolume(0);
    const loud = alarmVolume(ALARM_LOUD_AFTER_MS);

    expect(ALARM_LOUD_AFTER_MS).toBe(60_000);
    expect(alarmVolume(ALARM_LOUD_AFTER_MS - 1)).toBe(quiet);
    expect(loud).toBeGreaterThan(quiet);
    expect(alarmVolume(10 * 60_000)).toBe(loud);
    expect(loud).toBeLessThanOrEqual(1);
    expect(quiet).toBeGreaterThan(0);
  });
});

describe("título parpadeando — ADMIN-PEDIDOS-27", () => {
  it("alterna entre '(n) NUEVO PEDIDO' y el título normal", () => {
    expect(blinkTitle("Pedidos", 3, true)).toBe("(3) NUEVO PEDIDO");
    expect(blinkTitle("Pedidos", 3, false)).toBe("Pedidos");
  });

  it("sin pendientes es siempre el título normal", () => {
    expect(blinkTitle("Pedidos", 0, true)).toBe("Pedidos");
  });

  it("parpadea solo con pendientes y sin pedir menos movimiento", () => {
    expect(shouldBlink(2, false)).toBe(true);
    expect(shouldBlink(0, false)).toBe(false);
    expect(shouldBlink(2, true)).toBe(false);
  });
});

describe("globito — ADMIN-PEDIDOS-28", () => {
  it("muestra la cantidad y 9+ desde diez", () => {
    expect(badgeLabel(0)).toBe("");
    expect(badgeLabel(3)).toBe("3");
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
  });
});

describe("barra de avisos — ADMIN-PEDIDOS-30", () => {
  it("no aparece si el negocio no tiene pedidos por menú", () => {
    expect(barState({ ordersEnabled: false, soundOn: false, push: "enable" })).toBeNull();
  });

  it("no aparece con el sonido y los avisos activados", () => {
    expect(barState({ ordersEnabled: true, soundOn: true, push: "enabled" })).toBeNull();
  });

  it("pide el sonido, los avisos o los dos según falte", () => {
    expect(barState({ ordersEnabled: true, soundOn: false, push: "enabled" })).toEqual({ sound: true, push: false });
    expect(barState({ ordersEnabled: true, soundOn: true, push: "enable" })).toEqual({ sound: false, push: true });
    expect(barState({ ordersEnabled: true, soundOn: false, push: "enable" })).toEqual({ sound: true, push: true });
  });

  it("con los avisos bloqueados o por instalar también avisa, pero no ofrece activarlos desde ahí", () => {
    for (const push of ["blocked", "install-first"] as const) {
      expect(barState({ ordersEnabled: true, soundOn: true, push })).toEqual({ sound: false, push: true });
    }
  });

  it("un navegador sin avisos posibles no pide algo imposible", () => {
    expect(barState({ ordersEnabled: true, soundOn: true, push: "hidden" })).toBeNull();
    expect(barState({ ordersEnabled: true, soundOn: false, push: "hidden" })).toEqual({ sound: true, push: false });
  });
});
