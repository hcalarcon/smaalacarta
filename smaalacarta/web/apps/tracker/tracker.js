// Página de seguimiento de un pedido (SEGUIMIENTO-8). Todo lo que viene de la base se
// muestra con textContent: nunca se arma HTML con datos del pedido ni del negocio.
import { SUPABASE } from "/apps/menu-app/supabase-config.js";
import {
  fetchTracking,
  isFinalStatus,
  parseTrackingCode,
  statusView,
  timeline,
} from "/apps/tracker/lib/tracker.js";

const REFRESH_MS = 15000;

const app = document.getElementById("app");
const code = parseTrackingCode(window.location.pathname, window.location.search);

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const time = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

const STEP_LABELS = ["Recibido", "Confirmado", "Preparando", "Listo", "Entregado"];

function el(tag, { className, text, href, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (href) node.href = href;
  for (const [name, value] of Object.entries(attrs ?? {})) node.setAttribute(name, value);
  children.forEach((child) => node.appendChild(child));
  return node;
}

function showMessage(text) {
  app.replaceChildren(el("p", { className: "tracker-message", text }));
}

function render(data, { stale }) {
  const view = statusView(data.pedido.estado);
  const nodes = [];

  if (stale) {
    nodes.push(el("p", { className: "notice", text: "No pudimos actualizar. Seguimos intentando…" }));
  }

  nodes.push(el("p", { className: "tracker-business", text: data.negocio.nombre }));
  nodes.push(el("p", { className: "tracker-number", text: `Pedido #${data.pedido.numero}` }));

  // Estado actual y camino recorrido.
  const status = el("section", { className: `card ${view.cancelled ? "status-cancelled" : ""}` }, [
    el("p", { className: "status-title", text: view.title }),
    el("p", { className: "status-text", text: view.text }),
  ]);

  if (!view.cancelled && view.step >= 0) {
    status.appendChild(
      el(
        "ol",
        { className: "steps" },
        STEP_LABELS.map((label, index) =>
          el("li", {
            className: `step ${index < view.step ? "done" : ""} ${index === view.step ? "current done" : ""}`.trim(),
            text: label,
          }),
        ),
      ),
    );
  }
  nodes.push(status);

  // Detalle.
  if (Array.isArray(data.items) && data.items.length > 0) {
    nodes.push(
      el("section", { className: "card" }, [
        el("h2", { text: "Tu pedido" }),
        el(
          "ul",
          { className: "items" },
          data.items.map((item) =>
            el("li", {}, [
              el("span", { text: `${item.cantidad} × ${item.nombre}` }),
              el("span", { text: money.format(Number(item.precio) * Number(item.cantidad)) }),
            ]),
          ),
        ),
        el("p", { className: "total" }, [
          el("span", { text: "Total" }),
          el("span", { text: money.format(Number(data.pedido.total)) }),
        ]),
      ]),
    );
  }

  // Línea de tiempo.
  const events = timeline(data.eventos);
  if (events.length > 0) {
    nodes.push(
      el("section", { className: "card" }, [
        el("h2", { text: "Historial" }),
        el(
          "ul",
          { className: "events" },
          events.map((event) =>
            el("li", {}, [
              el("span", { text: event.label }),
              el("time", { text: event.date ? time.format(new Date(event.date)) : "" }),
            ]),
          ),
        ),
      ]),
    );
  }

  // Contacto con el local.
  const phone = String(data.negocio.telefono ?? "").replace(/\D/g, "");
  if (phone) {
    const message = `Hola, consulto por mi pedido #${data.pedido.numero}`;
    nodes.push(
      el("a", {
        className: "contact",
        text: "Consultar al local por WhatsApp",
        href: `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`,
        attrs: { target: "_blank", rel: "noopener noreferrer" },
      }),
    );
  }

  nodes.push(
    el("p", {
      className: "footnote",
      text: view.final ? "Este pedido ya terminó." : "Esta página se actualiza sola.",
    }),
  );

  app.replaceChildren(...nodes);
  document.title = `Pedido #${data.pedido.numero} · ${data.negocio.nombre}`;
}

async function start() {
  if (!code) {
    showMessage("Este link no es válido. Revisá que esté completo.");
    return;
  }

  let last = null;

  async function refresh() {
    const result = await fetchTracking({ url: SUPABASE.url, key: SUPABASE.key, code });

    if (result.ok) {
      last = result.data;
      render(last, { stale: false });
      return !isFinalStatus(last.pedido.estado);
    }

    // Un código que no existe no se reintenta; un error de red sí, y se sigue
    // mostrando lo último que se vio.
    if (result.reason === "notfound") {
      showMessage("No encontramos este pedido. Revisá que el link esté completo.");
      return false;
    }

    if (last) {
      render(last, { stale: true });
      return true;
    }

    showMessage("No pudimos cargar tu pedido. Probá de nuevo en unos segundos.");
    return true;
  }

  let keepGoing = await refresh();

  const timer = setInterval(async () => {
    if (!keepGoing) {
      clearInterval(timer);
      return;
    }

    // Con la pestaña oculta no se consulta.
    if (document.visibilityState !== "visible") return;

    keepGoing = await refresh();
    if (!keepGoing) clearInterval(timer);
  }, REFRESH_MS);
}

start();
