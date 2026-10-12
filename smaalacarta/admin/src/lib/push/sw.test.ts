// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ADMIN-PWA-10: el service worker corre en el navegador, así que se prueba cargando `public/sw.js` contra un
// `self` falso que anota los listeners.
const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const SCOPE = "https://smaalacarta.com.ar/admin/";

type Listener = (event: Record<string, unknown>) => void;

function load() {
  const listeners: Record<string, Listener> = {};
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => undefined);
  const matchAll = vi.fn(async () => [] as unknown[]);
  const caches = { open: vi.fn(), match: vi.fn() };

  const fakeSelf = {
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener;
    },
    registration: { scope: SCOPE, showNotification },
    location: { origin: "https://smaalacarta.com.ar" },
    clients: { matchAll, openWindow, claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(),
  };

  new Function("self", "caches", source)(fakeSelf, caches);

  // Corre un evento y espera lo que pidió con `waitUntil`.
  async function dispatch(type: string, event: Record<string, unknown>) {
    const waits: Promise<unknown>[] = [];
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  return { fakeSelf, showNotification, openWindow, matchAll, caches, dispatch, listeners };
}

const push = (data: unknown) => ({ data: { json: () => data } });
const click = (url?: string) => ({ notification: { close: vi.fn(), data: url ? { url } : {} } });

let sw: ReturnType<typeof load>;

beforeEach(() => {
  sw = load();
});

describe("service worker del panel — ADMIN-PWA-10", () => {
  it("muestra el aviso con título, texto y tag, y guarda la url", async () => {
    await sw.dispatch(
      "push",
      push({ title: "¡Te eligieron!", body: "Ana Resto · #0042 · Cantera", tag: "order-1-courier_chosen", url: "/admin/repartidor" }),
    );

    expect(sw.showNotification).toHaveBeenCalledWith(
      "¡Te eligieron!",
      expect.objectContaining({
        body: "Ana Resto · #0042 · Cantera",
        tag: "order-1-courier_chosen",
        data: { url: "/admin/repartidor" },
        icon: `${SCOPE}icons/icon-192.png`,
      }),
    );
  });

  it("muestra algo aunque el aviso venga vacío o roto: el navegador exige mostrar cada push", async () => {
    await sw.dispatch("push", { data: null });
    await sw.dispatch("push", { data: { json: () => { throw new Error("no es JSON"); } } });

    expect(sw.showNotification).toHaveBeenCalledTimes(2);
    expect(sw.showNotification.mock.calls[0][0]).toBe("SMA a la Carta");
  });

  it("el pedido nuevo y su recordatorio no se pueden ignorar: quedan, vibran y vuelven a sonar (ADMIN-PWA-36)", async () => {
    for (const kind of ["local_new_order", "local_new_order_reminder"]) {
      sw.showNotification.mockClear();

      await sw.dispatch(
        "push",
        push({
          title: "Pedido nuevo #0042",
          body: "Lucía · Retiro en el local",
          tag: "order-1-local_new_order",
          url: "/admin/dashboard/orders",
          kind,
          urgent: true,
          number: "0042",
          total: "$12.500",
        }),
      );

      expect(sw.showNotification).toHaveBeenCalledWith(
        "Pedido nuevo #0042",
        expect.objectContaining({
          requireInteraction: true,
          renotify: true,
          silent: false,
          vibrate: [300, 150, 300, 150, 300],
          tag: "order-1-local_new_order",
          body: "$12.500 · Lucía · Retiro en el local",
        }),
      );
    }
  });

  it("un urgente sin tag igual lleva uno, porque renotify lo exige (ADMIN-PWA-36)", async () => {
    await sw.dispatch("push", push({ title: "Pedido nuevo #7", body: "", urgent: true, kind: "local_new_order" }));

    const options = sw.showNotification.mock.calls[0][1] as Record<string, unknown>;
    expect(options.renotify).toBe(true);
    expect(typeof options.tag).toBe("string");
    expect(options.tag).toBeTruthy();
  });

  it("los demás avisos se muestran como siempre, sin insistir (ADMIN-PWA-36)", async () => {
    await sw.dispatch(
      "push",
      push({ title: "¡Te eligieron!", body: "Ana Resto", tag: "order-1-courier_chosen", kind: "courier_chosen", urgent: false }),
    );

    const options = sw.showNotification.mock.calls[0][1] as Record<string, unknown>;
    expect(options).not.toHaveProperty("requireInteraction");
    expect(options).not.toHaveProperty("renotify");
    expect(options).not.toHaveProperty("vibrate");
  });

  it("al tocarlo enfoca una ventana abierta del panel y navega a la url", async () => {
    const focused = { navigate: vi.fn(async () => undefined) };
    const open = { url: `${SCOPE}dashboard`, focus: vi.fn(async () => focused) };
    const otra = { url: "https://otra.example/", focus: vi.fn() };
    sw.matchAll.mockResolvedValue([otra, open]);

    const event = click("/admin/repartidor");
    await sw.dispatch("notificationclick", event);

    expect(event.notification.close).toHaveBeenCalled();
    expect(open.focus).toHaveBeenCalled();
    expect(otra.focus).not.toHaveBeenCalled();
    expect(focused.navigate).toHaveBeenCalledWith("https://smaalacarta.com.ar/admin/repartidor");
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("sin ventana abierta del panel abre una", async () => {
    sw.matchAll.mockResolvedValue([{ url: "https://otra.example/", focus: vi.fn() }]);

    await sw.dispatch("notificationclick", click("/admin/dashboard/orders"));

    expect(sw.openWindow).toHaveBeenCalledWith("https://smaalacarta.com.ar/admin/dashboard/orders");
  });

  it("si la ventana no puede navegar abre una nueva", async () => {
    const focused = { navigate: vi.fn(async () => { throw new Error("no soportado"); }) };
    sw.matchAll.mockResolvedValue([{ url: `${SCOPE}`, focus: vi.fn(async () => focused) }]);

    await sw.dispatch("notificationclick", click("/admin/repartidor"));

    expect(sw.openWindow).toHaveBeenCalledWith("https://smaalacarta.com.ar/admin/repartidor");
  });

  it("no guarda nada en caché ni intercepta pedidos", async () => {
    expect(sw.listeners.fetch).toBeUndefined();
    expect(sw.caches.open).not.toHaveBeenCalled();
    expect(source).not.toMatch(/caches\.|cache\.addAll|\.put\(/);
  });
});
