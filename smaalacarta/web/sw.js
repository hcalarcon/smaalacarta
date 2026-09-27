// Service worker mínimo: hace que el navegador ofrezca instalar el menú (PWA-3).
// A propósito NO guarda nada en caché: el menú, los precios, el horario y el estado de
// los pedidos siempre vienen de la red, para no mostrar datos viejos.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Sin respondWith: el navegador resuelve el pedido por la red, como si no hubiera worker.
});
