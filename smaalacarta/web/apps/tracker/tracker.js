// Página de seguimiento de un pedido (SEGUIMIENTO-8). Todo lo que viene de la base se
// muestra con textContent: nunca se arma HTML con datos del pedido ni del negocio.
import { LANGS, LOCALES, resolveLang, t } from "/apps/menu-app/lib/i18n.js";
import { createPayment, shouldVerify, trackerLayout, verifyPayment } from "/apps/menu-app/lib/mercadopago.js";
import { markHandoffSent, pendingHandoff } from "/apps/menu-app/lib/orders.js";
import { whatsappDigits } from "/apps/menu-app/lib/phone.js";
import { SUPABASE } from "/apps/menu-app/supabase-config.js";
import {
  fetchTracking,
  brandTheme,
  isFinalStatus,
  itemRow,
  langSearch,
  pageTitle,
  parseTrackingCode,
  preorderNotice,
  scheduledNotice,
  statusView,
  stepLabels,
  timeline,
} from "/apps/tracker/lib/tracker.js";

const REFRESH_MS = 15000;
// Con el pago por Mercado Pago pendiente se consulta más seguido (PUBLICO-37).
const VERIFY_MS = 5000;

const app = document.getElementById("app");
const code = parseTrackingCode(window.location.pathname, window.location.search);

// Mismo criterio que el menú (IDIOMA-7): ?lang=, después el idioma del navegador.
let lang = resolveLang({ search: window.location.search, navigatorLanguage: navigator.language });
let money;
let time;
let STEP_LABELS;

// Todo lo que depende del idioma se recalcula acá, también al cambiarlo (IDIOMA-14).
function applyLang() {
  document.documentElement.lang = lang;
  money = new Intl.NumberFormat(LOCALES[lang], { style: "currency", currency: "ARS" });
  time = new Intl.DateTimeFormat(LOCALES[lang], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  STEP_LABELS = stepLabels(lang);
}

applyLang();

// Lo último que se dibujó: al cambiar de idioma se vuelve a dibujar sin pedir nada de nuevo.
let current = { kind: "loading" };

function paint() {
  if (current.kind === "data") render(current.data, { stale: current.stale });
  else showMessage(current.key);
}

// Selector ES | EN | PT (IDIOMA-14): botones de al menos 44 px con aria-pressed.
const langBox = document.getElementById("selector-idioma");
const langBar = document.getElementById("lang-bar");

// El selector vive dentro del encabezado del negocio; sin encabezado (cargando, errores)
// vuelve a la barra de arriba. Es siempre el mismo elemento: conserva sus listeners y no
// se pierde cuando render() reemplaza el contenido cada 15 s.
function dockLangSelector(header) {
  if (!langBox) return;
  if (header) header.prepend(langBox);
  else if (langBox.parentElement !== langBar) langBar?.appendChild(langBox);
}

function syncLangSelector() {
  if (!langBox) return;
  langBox.setAttribute("aria-label", t("lang.label", lang));
  langBox.querySelectorAll("button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
  });
}

function setLang(next) {
  if (next === lang || !LANGS.includes(next)) return;
  lang = next;
  applyLang();
  syncLangSelector();

  const url = new URL(window.location.href);
  url.search = langSearch(url.search, lang);
  history.replaceState(null, "", url);

  paint();
}

for (const code of LANGS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = code.toUpperCase();
  button.dataset.lang = code;
  button.addEventListener("click", () => setLang(code));
  langBox?.appendChild(button);
}
syncLangSelector();

function el(tag, { className, text, href, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (href) node.href = href;
  for (const [name, value] of Object.entries(attrs ?? {})) node.setAttribute(name, value);
  children.forEach((child) => node.appendChild(child));
  return node;
}

// Un mensaje de la página, por su clave, para poder traducirlo si cambia el idioma.
function showMessage(key) {
  current = { kind: "message", key };
  dockLangSelector(null);
  const isLoading = key === "tracker.loading";
  app.replaceChildren(
    el("p", { className: isLoading ? "tracker-loading" : "tracker-message", text: t(key, lang) }),
  );
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

// El estado del pago con Mercado Pago (PUBLICO-37 y 38): esperando, fallido o confirmado. Con
// pago pendiente o fallido hay un botón para pagar o reintentar. Todo con textContent.
function paymentCard(data, pay) {
  const titles = { awaiting: "awaitingTitle", failed: "failedTitle", paid: "paidTitle" };
  const texts = { awaiting: "awaitingText", failed: "failedText", paid: "paidText" };

  const card = el("section", { className: `card pay pay-${pay.state}` }, [
    el("p", { className: "status-title", text: t(`tracker.pay.${titles[pay.state]}`, lang) }),
    el("p", { className: "status-text", text: t(`tracker.pay.${texts[pay.state]}`, lang) }),
  ]);

  // Pedido anticipado: lo único que dice el seguimiento, además del pago, es para qué día es.
  if (pay.preorder) {
    const day = preorderNotice(data.pedido.programado, lang);
    if (day) card.appendChild(el("p", { className: "status-scheduled", text: day }));
  }

  if (pay.state === "paid") return card;

  const error = el("p", { className: "pay-error", attrs: { role: "alert" } });
  const button = el("button", {
    className: "pay-btn",
    text: t(pay.state === "failed" ? "tracker.pay.retry" : "tracker.pay.button", lang),
    attrs: { type: "button" },
  });

  button.addEventListener("click", async () => {
    button.disabled = true;
    error.textContent = "";

    const result = await createPayment({ code });
    if (result.ok) {
      window.location.href = result.url;
      return;
    }

    button.disabled = false;
    error.textContent = t("tracker.pay.error", lang);
  });

  card.append(button, error);
  return card;
}

function render(data, { stale }) {
  current = { kind: "data", data, stale };
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
  if (theme.position) headerNode.style.backgroundPosition = theme.position;
  dockLangSelector(headerNode);
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

  // Pago con Mercado Pago. En un pedido anticipado es lo único que se muestra del estado: sin
  // pasos ni línea de tiempo (PUBLICO-38). Un pedido cancelado ya no se cobra.
  const layout = trackerLayout(data.pedido);
  if (layout.pay) nodes.push(paymentCard(data, layout.pay));

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
  // Pedido programado: se dice para qué hora es, para que no parezca una demora (SEGUIMIENTO-18).
  const scheduled = scheduledNotice(data.pedido.programado, lang);
  if (scheduled) {
    status.insertBefore(el("p", { className: "status-scheduled", text: scheduled }), status.firstChild);
  }
  if (layout.status) nodes.push(status);

  // Detalle.
  if (Array.isArray(data.items) && data.items.length > 0) {
    nodes.push(
      el("section", { className: "card" }, [
        el("h2", { text: t("tracker.yourOrder", lang) }),
        el(
          "ul",
          { className: "items" },
          // Cada línea con las opciones que se eligieron debajo (SEGUIMIENTO-23).
          data.items.map((item) => itemRow(document, item, money)),
        ),
        el("p", { className: "total" }, [
          el("span", { text: t("tracker.total", lang) }),
          el("span", { text: money.format(Number(data.pedido.total)) }),
        ]),
      ]),
    );
  }

  // Línea de tiempo.
  const events = layout.timeline ? timeline(data.eventos, lang) : [];
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
  const phone = whatsappDigits(data.negocio.telefono);
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
  document.title = pageTitle(data.pedido.numero, data.negocio.nombre, lang);
}

async function start() {
  showMessage("tracker.loading");

  if (!code) {
    showMessage("tracker.invalidLink");
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
      showMessage("tracker.notFound");
      return false;
    }

    if (last) {
      render(last, { stale: true });
      return true;
    }

    showMessage("tracker.loadError");
    return true;
  }

  let keepGoing = await refresh();

  // Mercado Pago: al cargar (el cliente vuelve de pagar y el aviso puede tardar) y cada pocos
  // segundos mientras el pago esté pendiente, se pide al servidor que lo confirme; si cambió, se
  // vuelve a leer el pedido (PUBLICO-37).
  let verifying = false;
  async function verifyNow() {
    if (verifying || !last || !shouldVerify(last.pedido)) return;

    verifying = true;
    try {
      const result = await verifyPayment({ code });
      if (result.ok && result.pago !== last.pedido.pago) await refresh();
    } finally {
      verifying = false;
    }
  }

  verifyNow();
  const payTimer = setInterval(() => {
    if (last && !shouldVerify(last.pedido)) {
      clearInterval(payTimer);
      return;
    }

    if (document.visibilityState === "visible") verifyNow();
  }, VERIFY_MS);

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
