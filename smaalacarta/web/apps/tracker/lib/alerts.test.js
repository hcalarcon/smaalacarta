import { describe, expect, it } from "vitest";

import { nextAlerts, pollInterval, POLL_MS, snapshotOf } from "./alerts.js";

const snap = (extra = {}) => ({ status: "pending", delivery: "searching", courier: "", offers: 0, ...extra });
const NOW = Date.parse("2026-10-09T22:00:00Z");
const ctx = (extra = {}) => ({ lang: "es", now: NOW, ...extra });

describe("snapshotOf — SEGUIMIENTO-31", () => {
  it("resume el pedido y el envío", () => {
    expect(
      snapshotOf({ estado: "ready" }, { state: "accepted", courier: "Damián", offers: [] }),
    ).toEqual({
      status: "ready",
      delivery: "accepted",
      courier: "Damián",
      offers: 0,
      prep: null,
      pickup: false,
    });
    expect(snapshotOf({ estado: "pending" }, null)).toEqual({
      status: "pending",
      delivery: null,
      courier: "",
      offers: 0,
      prep: null,
      pickup: false,
    });
  });
});

describe("nextAlerts — SEGUIMIENTO-31", () => {
  it("la primera lectura no avisa nada", () => {
    expect(nextAlerts(null, snap(), ctx()).notices).toEqual([]);
  });

  it("sin cambios no avisa", () => {
    expect(nextAlerts(snap(), snap(), ctx()).notices).toEqual([]);
  });

  it("un cambio de estado del pedido avisa con el título del nuevo estado", () => {
    const { notices } = nextAlerts(snap(), snap({ status: "confirmed" }), ctx());

    expect(notices).toEqual([
      { kind: "status", title: "Pedido confirmado", body: "El local confirmó tu pedido." },
    ]);
  });

  it("un estado desconocido no avisa", () => {
    expect(nextAlerts(snap(), snap({ status: "volando" }), ctx()).notices).toEqual([]);
  });

  it("cuando lo elige alguien, avisa quién lo lleva", () => {
    const { notices } = nextAlerts(snap(), snap({ delivery: "accepted", courier: "Damián" }), ctx());

    expect(notices).toEqual([{ kind: "courier", title: "Lo lleva Damián", body: "Ya tenés repartidor." }]);
  });

  it("cuando lo lleva el local, lo dice", () => {
    const { notices } = nextAlerts(snap(), snap({ delivery: "self" }), ctx());
    expect(notices[0]).toMatchObject({ kind: "courier", title: "Lo lleva el local" });
  });

  it("si el repartidor lo devuelve, avisa que hay que elegir otro", () => {
    const { notices } = nextAlerts(snap({ delivery: "accepted", courier: "Damián" }), snap(), ctx());
    expect(notices).toEqual([expect.objectContaining({ kind: "reopened", title: "Tu repartidor devolvió el pedido" })]);
  });

  it("una oferta nueva avisa; una oferta menos no", () => {
    expect(nextAlerts(snap({ offers: 1 }), snap({ offers: 2 }), ctx()).notices).toEqual([
      expect.objectContaining({ kind: "offer", title: "Nueva oferta de repartidor" }),
    ]);
    expect(nextAlerts(snap({ offers: 2 }), snap({ offers: 1 }), ctx()).notices).toEqual([]);
  });

  it("estado y envío a la vez dan los dos avisos, en ese orden", () => {
    const { notices } = nextAlerts(
      snap(),
      snap({ status: "preparing", delivery: "accepted", courier: "Damián" }),
      ctx(),
    );
    expect(notices.map((n) => n.kind)).toEqual(["status", "courier"]);
  });

  it("se traduce", () => {
    const { notices } = nextAlerts(snap(), snap({ status: "confirmed" }), ctx({ lang: "en" }));
    expect(notices[0].title).toBe("Order confirmed");
  });
});

describe("el último minuto antes de la elección automática — SEGUIMIENTO-31", () => {
  const searching = snap({ offers: 1 });

  it("avisa cuando falta un minuto, una sola vez por cierre", () => {
    const closesAt = NOW + 45_000;

    const first = nextAlerts(searching, searching, ctx({ closesAt, warnedFor: null }));
    expect(first.notices).toEqual([
      expect.objectContaining({ kind: "minute", title: "Falta 1 minuto para elegir repartidor" }),
    ]);
    expect(first.warnedFor).toBe(closesAt);

    const again = nextAlerts(searching, searching, ctx({ closesAt, warnedFor: first.warnedFor }));
    expect(again.notices).toEqual([]);
  });

  it("antes del último minuto o ya vencido no avisa", () => {
    expect(nextAlerts(searching, searching, ctx({ closesAt: NOW + 120_000 })).notices).toEqual([]);
    expect(nextAlerts(searching, searching, ctx({ closesAt: NOW - 1000 })).notices).toEqual([]);
  });

  it("un cierre nuevo (por una devolución) vuelve a avisar", () => {
    const first = NOW + 30_000;
    const second = NOW + 50_000;
    const r = nextAlerts(searching, searching, ctx({ closesAt: second, warnedFor: first }));
    expect(r.notices).toHaveLength(1);
    expect(r.warnedFor).toBe(second);
  });

  it("solo mientras busca", () => {
    const accepted = snap({ delivery: "accepted", courier: "Damián" });
    expect(nextAlerts(accepted, accepted, ctx({ closesAt: NOW + 30_000 })).notices).toEqual([]);
  });
});

describe("pollInterval — SEGUIMIENTO-32", () => {
  it("con ofertas abiertas, cada 5 segundos; si no, como siempre", () => {
    expect(pollInterval({ final: false, visible: true, alertsOn: false, offersOpen: true })).toBe(POLL_MS.offers);
    expect(pollInterval({ final: false, visible: true, alertsOn: false, offersOpen: false })).toBe(POLL_MS.normal);
    expect(POLL_MS.offers).toBe(5000);
  });

  it("oculta: solo con los avisos activados, y más espaciado", () => {
    expect(pollInterval({ final: false, visible: false, alertsOn: false, offersOpen: true })).toBeNull();
    const hidden = pollInterval({ final: false, visible: false, alertsOn: true, offersOpen: true });
    expect(hidden).toBe(POLL_MS.hidden);
    expect(hidden).toBeGreaterThan(POLL_MS.normal);
  });

  it("un pedido terminado no consulta más", () => {
    expect(pollInterval({ final: true, visible: true, alertsOn: true, offersOpen: false })).toBeNull();
  });
});

describe("cambio de demora — SEGUIMIENTO-44", () => {
  const prep = (desde, hasta) => ({ desde, hasta });
  const A = prep("2026-10-09T22:30:00Z", "2026-10-09T22:40:00Z");
  const B = prep("2026-10-09T22:45:00Z", "2026-10-09T22:55:00Z");

  it("avisa 'El local actualizó la demora' con la hora nueva (hora de Argentina)", () => {
    const { notices } = nextAlerts(
      snap({ status: "confirmed", prep: A }),
      snap({ status: "confirmed", prep: B }),
      ctx(),
    );

    expect(notices).toEqual([
      {
        kind: "prep",
        title: "El local actualizó la demora",
        body: "Listo aprox. a las 19:45",
      },
    ]);
  });

  it("también cuando baja", () => {
    const { notices } = nextAlerts(snap({ status: "confirmed", prep: B }), snap({ status: "confirmed", prep: A }), ctx());

    expect(notices.map((notice) => notice.kind)).toEqual(["prep"]);
  });

  it("no avisa si la hora es la misma, si es la primera vez que hay hora o si la página recién abre", () => {
    expect(nextAlerts(snap({ prep: A }), snap({ prep: A }), ctx()).notices).toEqual([]);
    expect(nextAlerts(snap({ prep: null }), snap({ prep: A }), ctx()).notices).toEqual([]);
    expect(nextAlerts(null, snap({ prep: A }), ctx()).notices).toEqual([]);
  });

  it("si a la vez cambió el estado, avisa solo el estado", () => {
    const { notices } = nextAlerts(
      snap({ status: "confirmed", prep: A }),
      snap({ status: "preparing", prep: B }),
      ctx(),
    );

    expect(notices.map((notice) => notice.kind)).toEqual(["status"]);
  });

  it("para retirar, la hora nueva dice desde cuándo pasar", () => {
    const { notices } = nextAlerts(
      snap({ status: "confirmed", prep: A, pickup: true }),
      snap({ status: "confirmed", prep: B, pickup: true }),
      ctx(),
    );

    expect(notices[0].body).toBe("Podés pasar a retirar desde las 19:45 (aprox.)");
  });
});
