// Avisos del seguimiento con la página abierta (SEGUIMIENTO-31 y 32): qué cambió entre una lectura y la
// siguiente y qué aviso le toca a cada cambio. Todo es lógica pura; el sonido, la vibración y la
// notificación del navegador están en tracker.js.

import { t } from "../../menu-app/lib/i18n.js";
import { WARN_BEFORE_MS } from "./offers.js";
import { prepView } from "./prep.js";

const KNOWN_STATUS = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "handed_to_courier",
  "on_the_way",
  "delivered",
  "cancelled",
];

// Lo que importa para avisar de una lectura del pedido (`pedido.estado` y el envío ya normalizado).
export function snapshotOf(pedido, envio) {
  return {
    status: typeof pedido?.estado === "string" ? pedido.estado : null,
    delivery: envio?.state ?? null,
    courier: envio?.courier ?? "",
    offers: Array.isArray(envio?.offers) ? envio.offers.length : 0,
    // La hora marcada por el local (SEGUIMIENTO-44): con ella se nota que la cambió.
    prep: pedido?.prep && typeof pedido.prep === "object" ? pedido.prep : null,
    pickup: pedido?.entrega === "retiro",
  };
}

// Los avisos de un cambio, en orden. `prev` es la lectura anterior (null en la primera: no hay nada que
// avisar). `warnedFor` es el cierre para el que ya se avisó el último minuto, para no repetirlo.
// Devuelve `{ notices: [{ kind, title, body }], warnedFor }`.
export function nextAlerts(prev, next, { lang, now, closesAt = null, warnedFor = null }) {
  const notices = [];

  if (prev && next) {
    if (prev.status !== next.status && KNOWN_STATUS.includes(next.status)) {
      notices.push({
        kind: "status",
        title: t(`status.${next.status}.title`, lang),
        body: t(`status.${next.status}.text`, lang),
      });
    }

    // El local cambió la demora (SEGUIMIENTO-44). Si cambió el estado, el aviso del estado ya dice lo que hay
    // que saber y la hora nueva se ve igual en la tarjeta.
    if (
      prev.status === next.status &&
      prev.prep?.desde &&
      next.prep?.desde &&
      prev.prep.desde !== next.prep.desde
    ) {
      const view = prepView(next.prep, { now: new Date(now), lang, pickup: next.pickup });

      notices.push({
        kind: "prep",
        title: t("tracker.prep.updated", lang),
        body: view ? view.text : "",
      });
    }

    if (prev.delivery !== next.delivery || prev.courier !== next.courier) {
      if (next.delivery === "accepted" && prev.delivery !== "accepted") {
        const repartidor = next.courier || t("tracker.delivery.courierWord", lang);
        notices.push({
          kind: "courier",
          title: t("tracker.delivery.accepted", lang, { repartidor }),
          body: t("tracker.alert.courierChosenBody", lang),
        });
      } else if (next.delivery === "self" && prev.delivery !== "self") {
        notices.push({
          kind: "courier",
          title: t("tracker.delivery.self", lang),
          body: t("tracker.alert.selfBody", lang),
        });
      } else if (next.delivery === "searching" && prev.delivery === "accepted") {
        notices.push({
          kind: "reopened",
          title: t("tracker.alert.reopened", lang),
          body: t("tracker.alert.reopenedBody", lang),
        });
      }
    }

    if (next.delivery === "searching" && prev.delivery === "searching" && next.offers > prev.offers) {
      notices.push({
        kind: "offer",
        title: t("tracker.alert.newOffer", lang),
        body: t("tracker.alert.newOfferBody", lang),
      });
    }
  }

  // Falta 1 minuto para que se elija sola: se avisa una sola vez por cierre.
  let warned = warnedFor;
  if (next?.delivery === "searching" && Number.isFinite(closesAt)) {
    const left = closesAt - now;

    if (left > 0 && left <= WARN_BEFORE_MS && warnedFor !== closesAt) {
      notices.push({
        kind: "minute",
        title: t("tracker.alert.oneMinute", lang),
        body: t("tracker.alert.oneMinuteBody", lang),
      });
      warned = closesAt;
    }
  }

  return { notices, warnedFor: warned };
}

export const POLL_MS = {
  // Con ofertas abiertas el cliente está decidiendo: se consulta seguido.
  offers: 5_000,
  normal: 15_000,
  // Con la pestaña oculta y los avisos activados, más espaciado.
  hidden: 30_000,
};

// Cada cuánto consultar: `null` es "no consultar" (pedido terminado, o pestaña oculta sin avisos).
export function pollInterval({ final, visible, alertsOn, offersOpen }) {
  if (final) return null;
  if (!visible) return alertsOn ? POLL_MS.hidden : null;
  return offersOpen ? POLL_MS.offers : POLL_MS.normal;
}
