// Página de seguimiento de un pedido (SEGUIMIENTO-8). Todo lo que viene de la base se
// muestra con textContent: nunca se arma HTML con datos del pedido ni del negocio.
import { LANGS, LOCALES, resolveLang, t } from "/apps/menu-app/lib/i18n.js";
import { createPayment, shouldVerify, trackerLayout, verifyPayment } from "/apps/menu-app/lib/mercadopago.js";
import { handoffUrl, markHandoffSent } from "/apps/menu-app/lib/orders.js";
import { whatsappDigits } from "/apps/menu-app/lib/phone.js";
import { SUPABASE } from "/apps/menu-app/supabase-config.js";
import { nextAlerts, pollInterval, snapshotOf } from "/apps/tracker/lib/alerts.js";
import { icon } from "/apps/tracker/lib/icons.js";
import { confirmText, countdown, countdownText, offerView, sortOffers } from "/apps/tracker/lib/offers.js";
import { etaView as buildEta } from "/apps/tracker/lib/prep.js";
import { cancelReason, deliveryMode, progressSteps } from "/apps/tracker/lib/steps.js";
import {
  fetchDelivery,
  fetchTracking,
  brandTheme,
  chooseCourier,
  arrivalLine,
  deliveryCard,
  isFinalStatus,
  itemRow,
  langSearch,
  pageTitle,
  parseTrackingCode,
  preorderNotice,
  scheduledNotice,
  statusView,
  timeline,
} from "/apps/tracker/lib/tracker.js";

// Con el pago por Mercado Pago pendiente se consulta más seguido (PUBLICO-37).
const VERIFY_MS = 5000;
// Preferencia de "Avisarme cuando cambie" (SEGUIMIENTO-31): vive en este navegador.
const ALERTS_KEY = "sma-tracker-alerts";

const app = document.getElementById("app");
const code = parseTrackingCode(window.location.pathname, window.location.search);

// Mismo criterio que el menú (IDIOMA-7): ?lang=, después el idioma del navegador.
let lang = resolveLang({ search: window.location.search, navigatorLanguage: navigator.language });
let money;
let time;

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
  // Con el selector dentro del encabezado la barra de arriba queda vacía: sin ocultarla deja una franja en blanco.
  if (langBar) langBar.hidden = Boolean(header);
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

// --- Avisos con la página abierta (SEGUIMIENTO-31): sonido, vibración y notificación del navegador. Solo
// funcionan con esta página abierta; nada de push con la página cerrada.
function readAlertsPref() {
  try {
    return window.localStorage.getItem(ALERTS_KEY) === "1";
  } catch {
    return false;
  }
}

function saveAlertsPref(on) {
  try {
    window.localStorage.setItem(ALERTS_KEY, on ? "1" : "0");
  } catch {
    // Modo privado: la preferencia no se recuerda, los avisos funcionan igual mientras la página siga abierta.
  }
}

let alertsOn = readAlertsPref();
let audioCtx = null;
// El navegador solo deja sonar después de un toque del cliente: hasta entonces el botón pide ese toque.
let audioReady = false;
let notifyDenied = false;

const TONES = [
  { hz: 880, start: 0, length: 0.25 },
  { hz: 660, start: 0.3, length: 0.3 },
];

function playBeep() {
  if (!audioCtx || audioCtx.state !== "running") return;

  const t0 = audioCtx.currentTime;
  for (const tone of TONES) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const start = t0 + tone.start;
    const end = start + tone.length;

    osc.type = "sine";
    osc.frequency.setValueAtTime(tone.hz, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(end);
  }
}

function fireNotice(notice) {
  playBeep();

  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate([200, 100, 200]);
  } catch {
    // Algunos navegadores lo bloquean: el sonido y la notificación alcanzan.
  }

  try {
    if (
      document.visibilityState !== "visible" &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      // La notificación lleva solo lo que el cliente ya ve en la página.
      new Notification(notice.title, { body: notice.body, tag: `sma-${code}` });
    }
  } catch {
    // Sin notificaciones del navegador, queda el sonido.
  }
}

async function enableAlerts() {
  alertsOn = true;
  saveAlertsPref(true);

  try {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (Ctor) {
      audioCtx ??= new Ctor();
      if (audioCtx.state !== "running") await audioCtx.resume();
      audioReady = audioCtx.state === "running";
    }
  } catch {
    audioReady = false;
  }

  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    notifyDenied = typeof Notification !== "undefined" && Notification.permission === "denied";
  } catch {
    notifyDenied = false;
  }

  // Un aviso corto confirma que anda.
  playBeep();
  paint();
}

function disableAlerts() {
  alertsOn = false;
  saveAlertsPref(false);
  paint();
}

// El botón "Avisarme cuando cambie" y, activado, su estado.
function alertsCard() {
  const active = alertsOn && (audioReady || !(window.AudioContext ?? window.webkitAudioContext));

  const button = el("button", {
    className: `alerts-btn ${active ? "on" : ""}`.trim(),
    text: t(active ? "tracker.alerts.disable" : "tracker.alerts.enable", lang),
    attrs: { type: "button", "aria-pressed": String(active) },
  });
  button.addEventListener("click", () => (active ? disableAlerts() : enableAlerts()));

  return el("section", { className: "card alerts" }, [
    ...(active ? [el("p", { className: "alerts-on", text: `🔔 ${t("tracker.alerts.enabled", lang)}` })] : []),
    button,
    el("p", {
      className: "alerts-hint",
      text: t(notifyDenied && active ? "tracker.alerts.denied" : "tracker.alerts.hint", lang),
    }),
  ]);
}

// --- La línea de pasos (SEGUIMIENTO-25 y 26).
// El último cambio de demora que vio esta página y el cliente todavía no cerró (SEGUIMIENTO-44).
let prepNotice = false;

// Lo que va grande debajo del estado (SEGUIMIENTO-45): con repartidor y su hora de llegada, "Llega aprox.";
// si no, la hora de listo del local. `line` junta la hora y lo que falta en una sola frase.
const ON_THE_WAY = ["handed_to_courier", "on_the_way"];

function etaView(data, mode, now) {
  return buildEta({ prep: data.pedido.prep, arrivesAt: ON_THE_WAY.includes(data.pedido.estado) ? (data.envio?.arrivesAt ?? null) : null }, { now, lang, pickup: mode === "pickup" });
}

function progressCard(data, mode, view) {
  const progress = progressSteps(data.pedido.estado, mode, lang);

  if (progress.cancelled) {
    const reason = cancelReason(data.eventos);
    return el("section", { className: "card status-cancelled" }, [
      el("div", { className: "status-icon" }, [icon(document, "cancelled")]),
      el("p", { className: "status-title", text: view.title }),
      el("p", { className: "status-text", text: view.text }),
      ...(reason
        ? [el("p", { className: "cancel-reason", text: t("tracker.cancelReason", lang, { motivo: reason }) })]
        : []),
    ]);
  }

  const card = el("section", { className: "card" }, [
    el("p", { className: "status-title", text: view.title }),
    el("p", { className: "status-text", text: view.text }),
  ]);

  // Pedido programado: se dice para qué hora es, para que no parezca una demora (SEGUIMIENTO-18).
  const scheduled = scheduledNotice(data.pedido.programado, lang);
  if (scheduled) card.insertBefore(el("p", { className: "status-scheduled", text: scheduled }), card.firstChild);

  // El tiempo estimado del local (SEGUIMIENTO-39 a 42): solo llega si el negocio lo activó. Con textContent.
  const prep = etaView(data, mode, new Date());
  if (prep) {
    card.appendChild(
      el("div", { className: `status-prep status-prep-${prep.kind}`, attrs: { "data-tick": "eta", "data-pickup": String(mode === "pickup") } }, [
        el("p", { className: "status-prep-text", text: prep.line }),
        ...(prep.reason ? [el("p", { className: "status-prep-reason", text: prep.reason })] : []),
      ]),
    );
  }

  if (prepNotice && prep) {
    const dismiss = el("button", {
      className: "status-prep-updated-close",
      text: "×",
      attrs: { type: "button", "aria-label": t("tracker.prep.dismiss", lang) },
    });
    dismiss.addEventListener("click", () => {
      prepNotice = false;
      paint();
    });

    card.appendChild(
      el("div", { className: "status-prep-updated", attrs: { role: "status" } }, [
        el("div", {}, [
          el("p", { className: "status-prep-updated-title", text: t("tracker.prep.updated", lang) }),
          el("p", { className: "status-prep-updated-body", text: prep.text }),
        ]),
        dismiss,
      ]),
    );
  }

  if (progress.steps.length > 0) {
    card.appendChild(
      el(
        "ol",
        {
          className: `progress progress-${progress.steps.length}`,
          attrs: { "aria-label": t("tracker.steps.label", lang) },
        },
        progress.steps.map((step) => {
          const bubble = el("span", { className: "step-icon" }, [icon(document, step.key)]);
          if (step.state === "done") {
            bubble.appendChild(el("span", { className: "step-check" }, [icon(document, "check")]));
          }

          return el(
            "li",
            {
              className: `step step-${step.state}`,
              attrs: step.state === "current" ? { "aria-current": "step" } : {},
            },
            [bubble, el("span", { className: "step-label", text: step.label })],
          );
        }),
      ),
    );
  }

  return card;
}

// --- La tarjeta del envío y las ofertas (SEGUIMIENTO-27 a 29).
// Estado de la elección: qué oferta se está por confirmar, si se está guardando y el último error.
let confirmingId = null;
let choosing = false;
let chooseMessage = "";
// El elemento de la cuenta regresiva: se actualiza cada segundo sin volver a dibujar la página.
let countdownEl = null;
// Vuelve a leer el pedido ya mismo; se completa en start().
let refreshNow = null;

function deliveryNode(data) {
  // Un pedido cancelado antes de aceptarse vuelve a `waiting`: no hay nada que esperar (ENVIO-165).
  if (data.pedido?.estado === "cancelled" && data.envio?.state === "waiting") return null;

  const card = deliveryCard(data.envio, lang, money);
  if (!card) return null;

  const node = el("section", { className: `card delivery delivery-${card.kind}` }, [
    el("div", { className: `delivery-head ${card.kind === "searching" ? "moving" : ""}`.trim() }, [
      el("span", { className: "delivery-icon" }, [icon(document, card.icon)]),
      el("div", {}, [
        el("h2", { className: "delivery-title", text: card.title }),
        ...card.lines
          .filter((line) => !(etaView(data, "other", new Date())?.line && line === arrivalLine(data.envio, lang)))
          .map((line) =>
          el("p", {
            className: "delivery-line",
            text: line,
            // La línea de llegada se repinta sola (SEGUIMIENTO-45).
            attrs: line === arrivalLine(data.envio, lang) ? { "data-tick": "arrival" } : {},
          }),
        ),
      ]),
    ]),
  ]);

  if (card.link) {
    node.appendChild(
      el("a", {
        className: "delivery-link",
        text: card.link.text,
        href: card.link.href,
        attrs: { target: "_blank", rel: "noopener" },
      }),
    );
  }

  if (data.envio.state === "searching" && data.envio.offers.length > 0) {
    node.appendChild(offersNode(data.envio));
  }

  return node;
}

function offersNode(delivery) {
  const wrap = el("div", { className: "offers" });

  countdownEl = el("p", { className: "countdown", attrs: { role: "timer" } });
  wrap.appendChild(countdownEl);

  const list = el("ul", { className: "offer-list" });

  for (const offer of sortOffers(delivery.offers)) {
    const view = offerView(offer, delivery.listPrice, lang, money);

    const item = el("li", { className: `offer ${view.recommended ? "recommended" : ""}`.trim() }, [
      ...(view.recommended
        ? [el("span", { className: "offer-badge", text: `⭐ ${t("tracker.delivery.recommended", lang)}` })]
        : []),
      el("div", { className: "offer-main" }, [
        el("span", { className: "offer-name", text: view.name }),
        el("span", { className: "offer-price", text: view.price }),
      ]),
      ...(view.reason
        ? [
            el("p", {
              className: "offer-reason",
              text: t("tracker.delivery.was", lang, { precio: view.list, motivo: view.reason }),
            }),
          ]
        : []),
    ]);

    if (confirmingId === offer.id) {
      const yes = el("button", {
        className: "offer-yes",
        text: t("tracker.delivery.confirmYes", lang),
        attrs: { type: "button" },
      });
      const no = el("button", {
        className: "offer-no",
        text: t("tracker.delivery.confirmNo", lang),
        attrs: { type: "button" },
      });
      yes.disabled = choosing;
      no.disabled = choosing;
      yes.addEventListener("click", () => choose(offer));
      no.addEventListener("click", () => {
        confirmingId = null;
        paint();
      });

      item.append(
        el("p", { className: "offer-confirm", text: confirmText(offer, lang, money) }),
        el("div", { className: "offer-actions" }, [yes, no]),
      );
    } else {
      const pick = el("button", {
        className: "offer-choose",
        text: t("tracker.delivery.choose", lang),
        attrs: { type: "button" },
      });
      pick.addEventListener("click", () => {
        confirmingId = offer.id;
        chooseMessage = "";
        paint();
      });
      item.appendChild(pick);
    }

    list.appendChild(item);
  }

  wrap.appendChild(list);

  if (chooseMessage) {
    wrap.appendChild(el("p", { className: "choose-error", text: chooseMessage, attrs: { role: "alert" } }));
  }

  return wrap;
}

// Descuenta "faltan N min" cambiando solo el texto de esos nodos (SEGUIMIENTO-45): sin rehacer la página no se
// pierde el foco, el scroll ni lo que se esté tocando. Si cambió de fase (de "en unos minutos" a "unos minutos
// más"), se repinta una vez.
function tickTimes() {
  if (current.kind !== "data") return;

  const { data } = current;
  const now = new Date();

  const etaNode = document.querySelector('[data-tick="eta"]');
  if (etaNode) {
    const eta = etaView(data, etaNode.dataset.pickup === "true" ? "pickup" : "other", now);

    if (!eta || !etaNode.classList.contains(`status-prep-${eta.kind}`)) {
      paint();
      return;
    }

    const text = etaNode.querySelector(".status-prep-text");
    if (text && text.textContent !== eta.line) text.textContent = eta.line;
  }

  const arrivalNode = document.querySelector('[data-tick="arrival"]');
  if (arrivalNode) {
    const line = arrivalLine(data.envio, lang, now);
    if (line && arrivalNode.textContent !== line) arrivalNode.textContent = line;
  }
}

function tickCountdown() {
  if (!countdownEl || current.kind !== "data" || !current.data.envio) return;

  const timer = countdown(current.data.envio.closesAt, Date.now());
  countdownEl.textContent = countdownText(timer, lang);
  countdownEl.classList.toggle("warn", Boolean(timer?.warn));
}

async function choose(offer) {
  if (choosing) return;

  choosing = true;
  chooseMessage = "";
  paint();

  const result = await chooseCourier({
    url: SUPABASE.url,
    key: SUPABASE.key,
    code,
    offerId: offer.id,
    price: offer.price,
  });

  choosing = false;
  confirmingId = null;

  if (!result.ok) {
    chooseMessage = t(
      result.reason === "closed"
        ? "tracker.delivery.chooseClosed"
        : result.reason === "changed"
          ? "tracker.delivery.priceChanged"
          : "tracker.delivery.chooseError",
      lang,
    );
  }

  // Elegido o no, se vuelve a leer: se ve el repartidor, o las ofertas como quedaron.
  if (refreshNow) await refreshNow();
  else paint();
}

function render(data, { stale }) {
  current = { kind: "data", data, stale };
  const mode = deliveryMode(data.pedido, data.envio);
  const view = statusView(data.pedido.estado, lang, { courier: mode === "courier" });
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

  // Pago con Mercado Pago. En un pedido anticipado es lo único que se muestra del estado: sin
  // pasos ni línea de tiempo (PUBLICO-38). Un pedido cancelado ya no se cobra.
  const layout = trackerLayout(data.pedido);
  if (layout.pay) nodes.push(paymentCard(data, layout.pay));

  // Estado actual y camino recorrido.
  if (layout.status) nodes.push(progressCard(data, mode, view));

  // Envío con repartidor (SEGUIMIENTO-27 y 28): qué pasa con el envío y las ofertas. Un pedido cancelado
  // ya no lo muestra. Todo con textContent.
  countdownEl = null;
  if (layout.status && data.pedido.estado !== "cancelled") {
    const delivery = deliveryNode(data);
    if (delivery) nodes.push(delivery);
  }

  // El WhatsApp al local es opcional: el pedido ya está registrado (SEGUIMIENTO-30). El link sale de
  // su propio navegador y solo puede ser de WhatsApp.
  const handoff = handoffUrl(window.localStorage, code);
  if (handoff && !view.final) {
    const send = el("a", {
      className: "handoff-btn",
      text: t("tracker.whatsapp.button", lang),
      href: handoff,
      attrs: { target: "_blank", rel: "noopener noreferrer" },
    });
    send.addEventListener("click", () => markHandoffSent(window.localStorage, code));
    nodes.push(
      el("section", { className: "card handoff" }, [
        el("p", { className: "handoff-title", text: t("tracker.whatsapp.title", lang) }),
        el("p", { className: "handoff-text", text: t("tracker.whatsapp.text", lang) }),
        send,
      ]),
    );
  }

  // Avisos con la página abierta (SEGUIMIENTO-31): mientras el pedido siga abierto.
  if (!view.final) nodes.push(alertsCard());

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
  tickCountdown();
}

async function start() {
  showMessage("tracker.loading");

  if (!code) {
    showMessage("tracker.invalidLink");
    return;
  }

  let last = null;
  // El envío se pide aparte; si esa consulta falla se sigue mostrando el último que se vio.
  let lastDelivery = null;
  // Lo último que se avisó, para avisar solo lo que cambió (SEGUIMIENTO-31).
  let previous = null;
  let warnedFor = null;
  let finished = false;
  let timer = null;

  function alertsFor(next) {
    const snapshot = snapshotOf(next.pedido, next.envio);
    // El aviso de demora se va con el próximo cambio de estado (SEGUIMIENTO-44).
    if (previous && previous.status !== snapshot.status) prepNotice = false;
    const { notices, warnedFor: warned } = nextAlerts(previous, snapshot, {
      lang,
      now: Date.now(),
      closesAt: next.envio?.closesAt ?? null,
      warnedFor,
    });

    warnedFor = warned;
    previous = snapshot;

    // El aviso en la tarjeta no depende de los avisos del navegador; el sonido y la vibración, sí.
    if (notices.some((notice) => notice.kind === "prep")) prepNotice = true;

    if (alertsOn) notices.forEach(fireNotice);
  }

  async function refresh() {
    const [result, delivery] = await Promise.all([
      fetchTracking({ url: SUPABASE.url, key: SUPABASE.key, code }),
      fetchDelivery({ url: SUPABASE.url, key: SUPABASE.key, code }),
    ]);

    if (delivery.ok) lastDelivery = delivery.data;

    if (result.ok) {
      last = { ...result.data, envio: lastDelivery };
      alertsFor(last);
      render(last, { stale: false });
      finished = isFinalStatus(last.pedido.estado);
      return;
    }

    // Un código que no existe no se reintenta; un error de red sí, y se sigue
    // mostrando lo último que se vio.
    if (result.reason === "notfound") {
      showMessage("tracker.notFound");
      finished = true;
      return;
    }

    if (last) {
      render(last, { stale: true });
      return;
    }

    showMessage("tracker.loadError");
  }

  // Cada cuánto consultar depende de si hay ofertas abiertas, de si la pestaña se ve y de si el cliente
  // activó los avisos (SEGUIMIENTO-32). Sin Supabase Realtime.
  function schedule() {
    clearTimeout(timer);

    const wait = pollInterval({
      final: finished,
      visible: document.visibilityState === "visible",
      alertsOn,
      offersOpen: Boolean(last?.envio?.state === "searching" && last.envio.offers.length > 0),
    });
    if (wait === null) return;

    timer = setTimeout(async () => {
      await refresh();
      schedule();
    }, wait);
  }

  refreshNow = async () => {
    clearTimeout(timer);
    await refresh();
    schedule();
  };

  await refresh();
  schedule();

  // "faltan 12 min" se descuenta con la hora aunque no llegue una lectura nueva (SEGUIMIENTO-45).
  const timesTimer = setInterval(() => {
    // Con el pedido entregado o cancelado ya no hay nada que descontar.
    if (finished) {
      clearInterval(timesTimer);
      return;
    }
    if (document.visibilityState === "visible") tickTimes();
  }, 30_000);

  // Al volver a la pestaña se lee de inmediato, sin esperar al próximo turno.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !finished) refreshNow();
    else schedule();
  });

  // La cuenta regresiva avanza sola cada segundo, y al llegar a cero se vuelve a leer para ver al
  // repartidor elegido. También es quien avisa el último minuto, aunque no llegue una lectura nueva.
  let overFor = null;
  setInterval(() => {
    tickCountdown();

    const closesAt = last?.envio?.state === "searching" ? last.envio.closesAt : null;
    if (!Number.isFinite(closesAt) || finished) return;

    if (alertsOn && previous) {
      const { notices, warnedFor: warned } = nextAlerts(previous, previous, {
        lang,
        now: Date.now(),
        closesAt,
        warnedFor,
      });
      warnedFor = warned;
      notices.forEach(fireNotice);
    }

    if (Date.now() >= closesAt && overFor !== closesAt) {
      overFor = closesAt;
      refreshNow();
    }
  }, 1000);

  // Mercado Pago: al cargar (el cliente vuelve de pagar y el aviso puede tardar) y cada pocos
  // segundos mientras el pago esté pendiente, se pide al servidor que lo confirme; si cambió, se
  // vuelve a leer el pedido (PUBLICO-37).
  let verifying = false;
  async function verifyNow() {
    if (verifying || !last || !shouldVerify(last.pedido)) return;

    verifying = true;
    try {
      const result = await verifyPayment({ code });
      if (result.ok && result.pago !== last.pedido.pago) await refreshNow();
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
}

start();
