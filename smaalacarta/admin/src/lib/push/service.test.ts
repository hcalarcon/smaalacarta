import { describe, expect, it, vi } from "vitest";

import { ORDER, insert, update } from "./fixtures";
import { handlePushWebhook, type PushDeps, type PushSubscriptionRow } from "./service";

// Quién recibe cada aviso y qué pasa con las suscripciones. Qué evento sale de cada payload está en
// `events.test.ts` y el texto en `messages.test.ts`.
const sub = (userId: string, n = 1): PushSubscriptionRow => ({
  endpoint: `https://push.example/${userId}/${n}`,
  p256dh: "p",
  auth: "a",
  user_id: userId,
});

function deps(extra: Partial<PushDeps> = {}): PushDeps & { sent: { endpoint: string; title: string; url: string }[] } {
  const sent: { endpoint: string; title: string; url: string }[] = [];
  const base: PushDeps = {
    businessName: vi.fn(async () => "Ana Resto"),
    coveringCourierIds: vi.fn(async () => ["c-toque", "c-moto"]),
    courierUserIds: vi.fn(async (ids: string[]) => ids.map((id) => `u-${id}`)),
    offererCourierIds: vi.fn(async () => ["c-toque", "c-moto"]),
    courierName: vi.fn(async () => "Moto Express"),
    businessUserIds: vi.fn(async () => ["u-ana", "u-socio"]),
    assignedByLocal: vi.fn(async () => false),
    subscriptions: vi.fn(async (userIds: string[]) => userIds.map((u) => sub(u))),
    send: vi.fn(async (s, message) => {
      sent.push({ endpoint: s.endpoint, title: message.title, url: message.url });
      return "ok" as const;
    }),
    removeSubscription: vi.fn(async () => undefined),
  };
  return Object.assign({ ...base, ...extra }, { sent });
}

const usersOf = (d: { sent: { endpoint: string }[] }) => d.sent.map((s) => s.endpoint.split("/")[3]).sort();

describe("destinatarios — ADMIN-PWA-18 a 24", () => {
  it("un pedido sin zona común (envío propio) no busca repartidores en la red — ENVIO-251", async () => {
    const d = deps();
    await handlePushWebhook(d, insert({ delivery_zone_id: null }));

    expect(d.coveringCourierIds).not.toHaveBeenCalled();
    expect(d.sent.filter((s) => s.title === "Nuevo envío a Cantera")).toEqual([]);
  });

  it("pedido nuevo para ofertar: los repartidores que cubren la zona, y el local por el pedido nuevo", async () => {
    const d = deps();
    const result = await handlePushWebhook(d, insert());

    expect(d.coveringCourierIds).toHaveBeenCalledWith(ORDER.id, ORDER.delivery_zone_id);
    expect(d.sent.filter((s) => s.title === "Nuevo envío a Cantera").map((s) => s.endpoint.split("/")[3]).sort()).toEqual(
      ["u-c-moto", "u-c-toque"],
    );
    expect(d.sent.filter((s) => s.title === "Pedido nuevo #0042").map((s) => s.endpoint.split("/")[3]).sort()).toEqual([
      "u-ana",
      "u-socio",
    ]);
    expect(result.sent).toBe(4);
  });

  it("te eligieron: solo al elegido, y 'eligieron a otro' a los demás que ofertaron", async () => {
    const d = deps();
    await handlePushWebhook(
      d,
      update({ courier_status: "searching" }, { courier_status: "accepted", courier_id: "c-moto" }),
    );

    expect(d.sent.filter((s) => s.title === "¡Te eligieron!").map((s) => s.endpoint.split("/")[3])).toEqual(["u-c-moto"]);
    expect(d.sent.filter((s) => s.title === "Eligieron otro repartidor").map((s) => s.endpoint.split("/")[3])).toEqual([
      "u-c-toque",
    ]);
    expect(d.sent.filter((s) => s.title.includes("lo lleva Moto Express"))).toHaveLength(2);
  });

  it("si lo asignó el local, el elegido lo sabe y el local no recibe 'lo lleva' (ADMIN-PWA-23)", async () => {
    const d = deps({ assignedByLocal: vi.fn(async () => true) });
    await handlePushWebhook(
      d,
      update({ courier_status: "searching" }, { courier_status: "accepted", courier_id: "c-moto" }),
    );

    expect(d.sent.filter((s) => s.title.includes("lo lleva"))).toEqual([]);
    expect(d.sent.some((s) => s.title === "¡Te eligieron!")).toBe(true);
  });

  it("'lo llevo yo': les avisa a todos los que ofertaron que eligieron a otro (ADMIN-PWA-20)", async () => {
    const d = deps();
    await handlePushWebhook(d, update({ courier_status: "searching" }, { courier_status: "self" }));

    expect(usersOf(d)).toEqual(["u-c-moto", "u-c-toque"]);
    expect(new Set(d.sent.map((s) => s.title))).toEqual(new Set(["Eligieron otro repartidor"]));
  });

  it("cancelado: al elegido y a los que tenían oferta, sin repetir a nadie (ADMIN-PWA-21)", async () => {
    const d = deps({ offererCourierIds: vi.fn(async () => ["c-toque", "c-moto"]) });
    await handlePushWebhook(d, update({ status: "pending" }, { status: "cancelled", courier_id: "c-moto" }));

    expect(usersOf(d)).toEqual(["u-c-moto", "u-c-toque"]);
    expect(new Set(d.sent.map((s) => s.title))).toEqual(new Set(["Pedido cancelado"]));
  });

  it("nadie ofertó: a los miembros del negocio, hacia el tablero (ADMIN-PWA-24)", async () => {
    const d = deps();
    await handlePushWebhook(d, update({ no_offers_alerted_at: null }, { no_offers_alerted_at: "2026-10-11T18:00:00Z" }));

    expect(usersOf(d)).toEqual(["u-ana", "u-socio"]);
    expect(d.sent[0].url).toBe("/admin/dashboard/orders");
  });

  it("recordatorio de pedido nuevo: a los miembros del negocio, hacia el tablero (ADMIN-PWA-33)", async () => {
    const d = deps();
    await handlePushWebhook(d, update({ new_order_reminders: 1 }, { new_order_reminders: 2 }));

    expect(usersOf(d)).toEqual(["u-ana", "u-socio"]);
    expect(d.sent[0].title).toMatch(/^Pedido #0042 sin atender hace \d+ min$/);
    expect(d.sent[0].url).toBe("/admin/dashboard/orders");
  });

  it("sin destinatarios o sin suscripciones no manda nada y no falla", async () => {
    const d = deps({ coveringCourierIds: vi.fn(async () => []), subscriptions: vi.fn(async () => []) });
    const result = await handlePushWebhook(d, insert());

    expect(result.sent).toBe(0);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("una actualización sin nada para avisar no consulta nada (ADMIN-PWA-25)", async () => {
    const d = deps();
    const result = await handlePushWebhook(d, update({ status: "pending" }, { status: "confirmed" }));

    expect(result).toEqual({ events: 0, sent: 0, removed: 0, failed: 0 });
    expect(d.businessName).not.toHaveBeenCalled();
  });
});

describe("fallas — ADMIN-PWA-26", () => {
  it("borra la suscripción que responde 404 o 410", async () => {
    const d = deps({
      send: vi.fn(async (s) => (s.user_id === "u-c-moto" ? ("gone" as const) : ("ok" as const))),
    });
    const result = await handlePushWebhook(d, insert({ courier_status: "searching" }));

    expect(d.removeSubscription).toHaveBeenCalledWith("https://push.example/u-c-moto/1");
    expect(result.removed).toBe(1);
    expect(result.sent).toBe(3);
  });

  it("un aparato que falla no frena a los demás", async () => {
    const d = deps({
      send: vi.fn(async (s) => {
        if (s.user_id === "u-c-toque") throw new Error("se cayó la red");
        return "ok" as const;
      }),
    });
    const result = await handlePushWebhook(d, insert());

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(3);
  });

  it("si falla la consulta de un evento, los otros eventos igual salen", async () => {
    const d = deps({
      coveringCourierIds: vi.fn(async () => {
        throw new Error("base caída");
      }),
    });
    const result = await handlePushWebhook(d, insert());

    // El aviso al local (pedido nuevo) sale aunque el de los repartidores no.
    expect(result.failed).toBe(1);
    expect(d.sent.map((s) => s.title)).toEqual(["Pedido nuevo #0042", "Pedido nuevo #0042"]);
  });
});

describe("circuito de tiempos — ENVIO-158 a 160", () => {
  const taken = { courier_status: "accepted", courier_id: "c-moto", status: "confirmed" };

  it("el aviso previo, Listo y el cambio de demora van solo al repartidor del pedido", async () => {
    const d = deps();
    await handlePushWebhook(
      d,
      update({ ...taken, pickup_reminder_sent_at: null }, { ...taken, pickup_reminder_sent_at: "2026-10-12T15:20:00Z" }),
    );
    await handlePushWebhook(d, update({ ...taken, status: "preparing" }, { ...taken, status: "ready" }));
    await handlePushWebhook(
      d,
      update({ ...taken, prep_ready_at: "2026-10-12T15:30:00Z" }, { ...taken, prep_ready_at: "2026-10-12T16:00:00Z" }),
    );

    expect(d.sent).toHaveLength(3);
    expect(usersOf(d)).toEqual(["u-c-moto", "u-c-moto", "u-c-moto"]);
    expect(d.sent.every((s) => s.url === "/admin/repartidor")).toBe(true);
  });
});

describe("rapidez del aviso — ENVIO-172", () => {
  it("busca el nombre del local mientras resuelve a quién avisar, no después", async () => {
    let release: (ids: string[]) => void = () => undefined;
    const d = deps({
      courierUserIds: vi.fn(() => new Promise<string[]>((resolve) => (release = resolve))),
    });

    const run = handlePushWebhook(
      d,
      update(
        { status: "confirmed", courier_status: "accepted", courier_id: "c-moto" },
        { status: "ready", courier_status: "accepted", courier_id: "c-moto" },
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(d.businessName).toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();

    release(["u-c-moto"]);
    const result = await run;

    expect(result.sent).toBe(1);
  });

  it("un aviso sin destinatarios no deja una consulta fallida sin atender", async () => {
    const d = deps({
      courierUserIds: vi.fn(async () => []),
      businessName: vi.fn(async () => {
        throw new Error("caída");
      }),
    });

    const result = await handlePushWebhook(
      d,
      update(
        { status: "confirmed", courier_status: "accepted", courier_id: "c-moto" },
        { status: "ready", courier_status: "accepted", courier_id: "c-moto" },
      ),
    );

    expect(result.sent).toBe(0);
  });
});

describe("disponibilidad del repartidor — ENVIO-194 y 195", () => {
  const autoOff = (extra: Record<string, unknown> = {}) =>
    ({
      type: "INSERT",
      table: "courier_availability_events",
      record: { id: "e1", courier_id: "c-moto", available: false, reason: "auto_off", ...extra },
      old_record: null,
    }) as unknown as Parameters<typeof handlePushWebhook>[1];

  it("al apagarse solo, le avisa al repartidor con el texto acordado", async () => {
    const bodies: string[] = [];
    const d = deps({
      send: vi.fn(async (_s, message) => {
        bodies.push(message.body);
        return "ok" as const;
      }),
    });

    const result = await handlePushWebhook(d, autoOff());

    expect(d.courierUserIds).toHaveBeenCalledWith(["c-moto"]);
    expect(result).toMatchObject({ events: 1, sent: 1, failed: 0 });
    expect(bodies).toEqual(["Te pusimos como No disponible porque pasaron 4 horas sin actividad"]);
    // No es un aviso de pedido: no consulta ni al local ni a los repartidores de la zona.
    expect(d.businessUserIds).not.toHaveBeenCalled();
    expect(d.coveringCourierIds).not.toHaveBeenCalled();
  });

  it("si no tiene avisos activados no pasa nada", async () => {
    const d = deps({ subscriptions: vi.fn(async () => []) });

    const result = await handlePushWebhook(d, autoOff());

    expect(result).toMatchObject({ sent: 0, failed: 0 });
  });

  it("si apagó a mano, no le avisa", async () => {
    const d = deps();

    const result = await handlePushWebhook(d, autoOff({ reason: "manual" }));

    expect(result.events).toBe(0);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("una falla al avisar se cuenta pero no rompe", async () => {
    const d = deps({
      send: vi.fn(async () => {
        throw new Error("sin servicio push");
      }),
    });

    expect(await handlePushWebhook(d, autoOff())).toMatchObject({ sent: 0, failed: 1 });
  });

  it("los avisos de pedidos que ya son suyos le llegan siempre, sin mirar si está disponible", async () => {
    const d = deps();

    // Quedó listo el pedido de c-moto: va directo a él, sin pasar por la lista de los que cubren la zona.
    await handlePushWebhook(
      d,
      update(
        { status: "preparing", courier_status: "accepted", courier_id: "c-moto" },
        { status: "ready", courier_status: "accepted", courier_id: "c-moto" },
      ),
    );

    expect(d.coveringCourierIds).not.toHaveBeenCalled();
    expect(usersOf(d)).toContain("u-c-moto");
  });
});
