// Página de seguimiento de un pedido (SEGUIMIENTO-8). Todo lo que viene de la base se
// muestra con textContent: nunca se arma HTML con datos del pedido ni del negocio.
import { LOCALES, resolveLang, t } from "/apps/menu-app/lib/i18n.js";
import { markHandoffSent, pendingHandoff } from "/apps/menu-app/lib/orders.js";
import { SUPABASE } from "/apps/menu-app/supabase-config.js";
import {
  fetchTracking,
  brandTheme,
  isFinalStatus,
  parseTrackingCode,
  statusView,
  stepLabels,
  timeline,
} from "/apps/tracker/lib/tracker.js";

const REFRESH_MS = 15000;

const app = document.getElementById("app");
const code = parseTrackingCode(window.location.pathname, window.location.search);

// Mismo criterio que el menú (IDIOMA-7): ?lang=, después el idioma del navegador.
const lang = resolveLang({ search: window.location.search, navigatorLanguage: navigator.language });
document.documentElement.lang = lang;

const money = new Intl.NumberFormat(LOCALES[lang], { style: "currency", currency: "ARS" });
const time = new Intl.DateTimeFormat(LOCALES[lang], {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

const STEP_LABELS = stepLabels(lang);

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

// Los colores y la cabecera del negocio (SEGUIMIENTO-11). Los valores ya vienen validados.
function applyTheme(negocio) {
  const theme = brandTheme(negocio);
  const root = document.documentElement;

  root.style.setProperty("--brand", theme.brand);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--color-primary", theme.brand);
  root.style.setProperty("--color-secondary", theme.accent);

  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.brand);
  return theme;
}

function render(data, { stale }) {
  const view = statusView(data.pedido.estado, lang);
  const theme = applyTheme(data.negocio);
  const nodes = [];

  if (stale) {
    nodes.push(el("p", { className: "notice", text: t("tracker.stale", lang) }));
  }

  const headerNode = el("header", { className: `tracker-header ${theme.plain ? "plain" : ""}`.trim() }, [
    el("p", { className: "tracker-business", text: data.negocio.nombre }),
    el("p", { className: "tracker-number", text: t("tracker.order", lang, { n: data.pedido.numero }) }),
  ]);
  if (theme.header) headerNode.style.backgroundImage = theme.header;
  nodes.push(headerNode);

  // Si el cliente vino acá sin haber enviado el pedido por WhatsApp, se lo ofrecemos
  // (SEGUIMIENTO-10). El link sale de su propio navegador y solo puede ser de WhatsApp.
  const handoff = pendingHandoff(window.localStorage, code);
  if (handoff) {
    const send = el("a", {
      className: "handoff-btn",
      text: t("checkout.submit", lang),
      href: handoff.url,
      attrs: { target: "_blank", rel: "noopener noreferrer" },
    });
    send.addEventListener("click", () => {
      markHandoffSent(window.localStorage, code);
      send.closest(".handoff")?.remove();
    });
    nodes.push(
      el("section", { className: "card handoff" }, [
        el("p", { className: "handoff-title", text: t("tracker.handoffTitle", lang) }),
        el("p", { className: "handoff-text", text: t("tracker.handoffText", lang) }),
        send,
      ]),
    );
  }

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
        el("h2", { text: t("tracker.yourOrder", lang) }),
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
          el("span", { text: t("tracker.total", lang) }),
          el("span", { text: money.format(Number(data.pedido.total)) }),
        ]),
      ]),
    );
  }

  // Línea de tiempo.
  const events = timeline(data.eventos, lang);
  if (events.length > 0) {
    nodes.push(
      el("section", { className: "card" }, [
        el("h2", { text: t("tracker.history", lang) }),
        el(
          "ul",
          { className: "events" },
          events.map((event) =>
            el("li", {}, [
              el("div", { className: "event-row" }, [
                el("span", { text: event.label }),
                el("time", { text: event.date ? time.format(new Date(event.date)) : "" }),
              ]),
              ...(event.note ? [el("p", { className: "event-note", text: event.note })] : []),
            ]),
          ),
        ),
      ]),
    );
  }

  // Contacto con el local.
  const phone = String(data.negocio.telefono ?? "").replace(/\D/g, "");
  if (phone) {
    // El mensaje lo lee el negocio: queda siempre en español (IDIOMA-5).
    const message = `Hola, consulto por mi pedido #${data.pedido.numero}`;
    nodes.push(
      el("a", {
        className: "contact",
        text: t("tracker.contact", lang),
        href: `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`,
        attrs: { target: "_blank", rel: "noopener noreferrer" },
      }),
    );
  }

  nodes.push(
    el("p", {
      className: "footnote",
      text: t(view.final ? "tracker.final" : "tracker.autoRefresh", lang),
    }),
  );

  app.replaceChildren(...nodes);
  document.title = `Pedido #${data.pedido.numero} · ${data.negocio.nombre}`;
}

async function start() {
  if (!code) {
    showMessage(t("tracker.invalidLink", lang));
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
      showMessage(t("tracker.notFound", lang));
      return false;
    }

    if (last) {
      render(last, { stale: true });
      return true;
    }

    showMessage(t("tracker.loadError", lang));
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
