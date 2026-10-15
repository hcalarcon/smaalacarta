// Service worker del panel (ADMIN-PWA-10). Vive en /admin/sw.js y solo hace dos cosas: mostrar los avisos
// push y abrir el panel al tocarlos. No intercepta pedidos ni guarda nada: los pedidos, los precios y las
// ofertas tienen que ser siempre los de ahora.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// El aviso llega como JSON: { title, body, tag, url, kind, urgent, number?, total? }. `tag` es `order-<id>-<evento>`: un mismo aviso se
// reemplaza en vez de repetirse. El navegador exige mostrar algo en cada push, aunque el cuerpo venga roto.
self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() || {} : {};
  } catch {
    data = {};
  }

  const scope = self.registration.scope;

  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    icon: new URL("icons/icon-192.png", scope).href,
    badge: new URL("icons/icon-192.png", scope).href,
    data: { url: data.url || scope },
  };

  // Pedido nuevo y su recordatorio (ADMIN-PWA-36): quedan en pantalla hasta que alguien los toque, vibran
  // y, con el mismo tag por pedido, vuelven a sonar al reemplazarse (`renotify`). `renotify` exige un tag.
  if (data.urgent === true) {
    options.tag = data.tag || "order-new";
    options.requireInteraction = true;
    options.renotify = true;
    options.silent = false;
    options.vibrate = [300, 150, 300, 150, 300];

    const head = [data.total ? String(data.total) : ""].filter(Boolean);
    const numberShown = data.number && String(data.title || "").includes("#" + data.number);
    if (data.number && !numberShown) head.unshift("#" + data.number);
    options.body = head.concat(data.body ? [data.body] : []).join(" · ");
  }

  // Lo que el local le cambia al repartidor (ENVIO-168): Listo, otra demora o cancelado. Cada uno es un tag
  // distinto, pero si el aviso anterior sigue en pantalla tiene que volver a sonar y vibrar.
  if (
    data.kind === "courier_order_ready" ||
    data.kind === "courier_prep_changed" ||
    data.kind === "order_cancelled"
  ) {
    options.renotify = true;
    options.silent = false;
    options.vibrate = [200, 100, 200];
    options.tag = data.tag || "order-change";
  }

  event.waitUntil(self.registration.showNotification(data.title || "SMA a la Carta", options));
});

// Si hay una ventana del panel abierta, se enfoca y va a la url; si no, se abre una.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const scope = self.registration.scope;
  const target = new URL((event.notification.data && event.notification.data.url) || scope, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const panel = windows.find((client) => client.url.startsWith(scope));

      if (panel) {
        try {
          const focused = await panel.focus();
          await (focused || panel).navigate(target);
          return;
        } catch {
          // Algunos navegadores no dejan navegar una ventana desde acá: se abre una nueva.
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});
