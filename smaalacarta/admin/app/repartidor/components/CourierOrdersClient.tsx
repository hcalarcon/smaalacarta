"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useCourierOrderChanges } from "@/lib/realtime/useOrderChanges";
import { useHoldUntilFresh } from "@/lib/realtime/useHoldUntilFresh";
import { useSerialRefresh } from "@/lib/realtime/useSerialRefresh";
import AvailableOrderCard from "./AvailableOrderCard";
import CourierOrderCard from "./CourierOrderCard";
import { useNewOrderAlert } from "./useNewOrderAlert";
import { useTutorial } from "./tutorial-context";
import {
  advanceOrderAction,
  declineOrderAction,
  makeOfferAction,
  takeOrderAction,
  markSettledAction,
  returnOrderAction,
  setEtaAction,
  withdrawOfferAction,
} from "../actions";
import {
  chosenOrderIds,
  GROUP_TITLES,
  isToRespond,
  sortAvailable,
  splitOrders,
  type AvailableOrder,
  type CourierPanelOrder,
  type PanelGroup,
} from "@/lib/courier/panel";
import { changeText, courierChanges, snapshotOrders } from "@/lib/courier/changes";
import { courierTab, type CourierTab } from "@/lib/courier/nav";
import { courierOrderState, grandTotals, totalsByBusiness } from "@/lib/courier/settlements";
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { practiceAvailable, practiceTaken } from "@/lib/courier/tutorial";
import { formatMoney } from "@/lib/promotions/pricing";

// Respaldo por si Realtime se corta (ENVIO-209). Sin el canal conectado consulta cada 5 s; con él, el pulso lleva los
// cambios y el respaldo queda como red de seguridad lenta, para que no haya un refresco del respaldo en camino
// cuando llega el pulso y lo haga esperar (ENVIO-210).
const REFRESH_MS = 5_000;
const REFRESH_CONNECTED_MS = 30_000;
const HISTORY_SHOWN = 20;

// La zona que se dice en voz alta (ENVIO-235).
const zoneOfAvailable = (order: AvailableOrder) => order.envio.zona;

const EMPTY: Record<PanelGroup, string> = {
  disponibles: "No hay pedidos para ofertar ahora.",
  en_curso: "No hay envíos en curso.",
  historial: "Todavía no hay historial.",
};

// El panel del repartidor (ENVIO-76 a 78): los pedidos disponibles para tomar, los que ya tomó y el
// historial, con aviso sonoro de los disponibles nuevos y actualización automática.
export default function CourierOrdersClient({
  orders,
  available = [],
  serverNow,
}: {
  orders: CourierPanelOrder[];
  available?: AvailableOrder[];
  serverNow: string;
}) {
  // Un refresco a la vez (ENVIO-210): el pulso, la consulta de abajo y las acciones comparten el mismo.
  const refresh = useSerialRefresh(serverNow);
  // Un cambio en la base trae los datos nuevos al instante (ENVIO-172); la consulta de abajo queda de respaldo.
  const realtimeConnected = useCourierOrderChanges(refresh);

  // La hora arranca con la del servidor para que el primer render coincida en los dos lados.
  const [now, setNow] = useState(() => new Date(serverNow));
  const [busyId, setBusyId] = useState<string | null>(null);
  // Tras una acción que salió bien, el pedido sigue ocupado hasta que llegan datos nuevos (ADMIN-PEDIDOS-60).
  const held = useHoldUntilFresh(serverNow);
  const isBusy = (id: string) => busyId === id || held.holding(id);
  // La pestaña sale de la URL (ADMIN-MOVIL-8). Las pestañas de escritorio la cambian al toque y dejan la
  // URL al día; si la URL cambia por otro lado (la barra de abajo), manda la URL.
  const urlTab = courierTab(useSearchParams().get("tab"));
  const [picked, setPicked] = useState<{ from: CourierTab; tab: CourierTab } | null>(null);
  const tab = picked && picked.from === urlTab ? picked.tab : urlTab;
  const pickTab = (next: CourierTab) => {
    setPicked({ from: urlTab, tab: next });
    window.history.replaceState(null, "", next === "rendiciones" ? "?tab=rendiciones" : window.location.pathname);
  };
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  // Aviso general: "El pedido ya no recibe ofertas" (el pedido desaparece de la lista al refrescar).
  const [notice, setNotice] = useState<string | null>(null);

  const { soundOn, audioReady, toggleSound, soundOnRef, playChosen, announceReady, alerts, alertText, dismissAlerts, hint } =
    useNewOrderAlert({
      orders: available,
      isPending: isToRespond,
      zoneOf: zoneOfAvailable,
      label: "Pedido disponible",
    });

  // Los pedidos por los que ofertó: cuando uno aparece entre sus envíos en curso, lo eligieron y suena un
  // aviso distinto (ENVIO-116). Los que ya estaban en curso al abrir la pantalla no suenan.
  // Pedidos con una acción en vuelo: corta un segundo toque que llega antes de que cambie `busyId`.
  const [inFlight] = useState<Set<string>>(() => new Set());
  const offeredIds = useRef<Set<string>>(new Set());
  const announced = useRef<Set<string>>(new Set(orders.map((item) => item.id)));

  useEffect(() => {
    const fresh = chosenOrderIds(offeredIds.current, orders).filter((id) => !announced.current.has(id));
    orders.forEach((item) => announced.current.add(item.id));

    if (fresh.length > 0) playChosen();

    available.forEach((item) => {
      if (item.mi_oferta) offeredIds.current.add(item.id);
    });
    // `playChosen` cambia en cada render; lo que importa es cuándo llegan datos nuevos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, available]);

  // Lo que cambió el local en un pedido que ya tomó (ENVIO-168): Listo, otra demora o cancelado. Suena y
  // queda a la vista; los demás cambios de estado no avisan. Lo que ya estaba al abrir no cuenta.
  const seenOrders = useRef(snapshotOrders(orders));
  const [changes, setChanges] = useState<string[]>([]);

  useEffect(() => {
    const found = courierChanges(seenOrders.current, orders);
    seenOrders.current = snapshotOrders(orders);

    if (found.length > 0) {
      // Con Listo suena además la voz con el nombre del local (ENVIO-238).
      const ready = found.find((change) => change.kind === "ready");
      if (ready) announceReady(ready.negocio);
      else playChosen();
      setChanges((current) => [...found.map(changeText), ...current].slice(0, 3));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // Se actualiza solo (mismo mecanismo que el tablero del local). Con la pestaña oculta solo sigue
  // si el sonido está activado: quien lo activó espera el aviso aunque esté en otra pestaña.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" || soundOnRef.current) {
        setNow(new Date());
        refresh();
      }
    }, realtimeConnected ? REFRESH_CONNECTED_MS : REFRESH_MS);

    return () => clearInterval(id);
  }, [refresh, soundOnRef, realtimeConnected]);

  // Devuelve si salió bien: el botón que la llamó sigue esperando el estado nuevo solo si no falló (ADMIN-PEDIDOS-59).
  async function run(orderId: string, call: () => ReturnType<typeof makeOfferAction>): Promise<boolean> {
    // Un segundo toque sobre el mismo pedido, aunque llegue en el mismo instante, no lanza otra acción.
    if (inFlight.has(orderId)) return true;
    inFlight.add(orderId);

    setError(null);
    setNotice(null);
    setBusyId(orderId);

    try {
      const result = await call();
      if (!result.ok && result.closed) setNotice(result.error);
      else if (!result.ok) setError({ id: orderId, message: result.error });
      if (result.ok) held.hold(orderId);
      return result.ok;
    } catch {
      setError({ id: orderId, message: "No pudimos guardar el cambio. Probá de nuevo." });
      return false;
    } finally {
      inFlight.delete(orderId);
      setBusyId(null);
      refresh();
    }
  }

  // El pedido de práctica del tutorial (ENVIO-216): vive acá, en el estado del cliente, y sus botones no llaman a
  // ninguna acción del servidor. Va después de los pedidos reales, que se ven normales (ENVIO-217).
  const tutorial = useTutorial();
  const practicePhase = tutorial?.phase ?? null;
  const practiceOffer =
    tutorial && practicePhase === "available" ? practiceAvailable(tutorial.mode, tutorial.zonePrice, now) : null;
  const practiceMine =
    tutorial && (practicePhase === "taken" || practicePhase === "on_the_way")
      ? practiceTaken(practicePhase, tutorial.zonePrice, now)
      : null;

  const groups = splitOrders(orders);
  const disponibles = sortAvailable(available);
  // Los avisos de ofertas cerradas se ven un rato, pero no cuentan como pedidos para ofertar.
  const openCount = disponibles.filter((item) => !item.resultado).length + (practiceOffer ? 1 : 0);
  const settlements = totalsByBusiness(orders);
  const settlementTotals = grandTotals(settlements);
  const toSettleCount = orders.filter((item) => courierOrderState(item) === "to_settle").length;
  // Lo que hay que hacer ahora primero: los envíos en curso, después lo que se puede ofertar (ADMIN-REPARTIDOR-5).
  const order: PanelGroup[] = ["en_curso", "disponibles", "historial"];
  const soundLabel = !soundOn ? "Activar sonido" : audioReady ? "Sonido activado" : "Apagar el sonido";

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-brand sm:text-2xl">Pedidos con envío</h1>

        <button
          type="button"
          onClick={toggleSound}
          aria-label={soundLabel}
          title={soundLabel}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line-strong bg-white px-3 text-lg text-brand transition hover:bg-cream"
        >
          <span aria-hidden="true">{soundOn && audioReady ? "🔔" : "🔕"}</span>
        </button>
      </section>

      {hint ? (
        <p className="-mt-3 text-xs text-stone-500">
          {hint}
        </p>
      ) : null}

      {alerts.length > 0 ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border-2 border-accent bg-accent-soft px-4 py-3"
        >
          <p className="min-w-0 break-words text-base font-bold text-stone-900">🔔 {alertText}</p>
          <button
            type="button"
            onClick={dismissAlerts}
            className="min-h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            Visto
          </button>
        </div>
      ) : null}

      {/* En el celular las reemplaza la barra de abajo. */}
      <div role="tablist" aria-label="Secciones" className="hidden gap-2 lg:flex">
        {(
          [
            ["pedidos", "Pedidos"],
            ["rendiciones", toSettleCount > 0 ? `Rendiciones (${toSettleCount})` : "Rendiciones"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            data-tour={key === "rendiciones" ? "settlements" : undefined}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => pickTab(key)}
            className={`min-h-11 rounded-xl px-5 py-2 text-sm font-semibold transition ${
              tab === key
                ? "bg-brand text-white"
                : "border border-line-strong bg-white text-brand hover:bg-cream"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice ? (
        <p
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
        >
          {notice}
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Cerrar
          </button>
        </p>
      ) : null}

      {changes.length > 0 ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
        >
          <ul className="space-y-1">
            {changes.map((text, index) => (
              <li key={`${index}-${text}`}>{text}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setChanges([])}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Cerrar
          </button>
        </div>
      ) : null}

      {tab === "rendiciones" ? (
        <section aria-label="Rendiciones" className="space-y-3">
          <header>
            <h2 className="text-xl font-semibold text-brand">Rendiciones al local</h2>
            <p className="text-xs text-stone-500">
              Efectivo que cobraste en pedidos entregados y le rendís al local (sin el envío, que es
              tuyo). Marcá cada pedido como Rendido desde Pedidos.
            </p>
          </header>

          {settlements.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong bg-white p-4 text-center text-sm text-stone-400">
              No hay efectivo para rendir.
            </p>
          ) : (
            <>
              {/* Celular (ADMIN-MOVIL-9): una tarjeta por local y una de total, sin scroll horizontal. */}
              <ul aria-label="Rendiciones por local" className="space-y-3 sm:hidden">
                {settlements.map((row) => (
                  <li key={row.business} className="rounded-2xl border border-line bg-white p-4">
                    <p className="break-words font-semibold text-brand">{row.business}</p>
                    <p className="mt-2 text-xs font-medium uppercase tracking-wide text-stone-400">
                      Pendiente de rendir
                    </p>
                    <p className="text-2xl font-bold text-stone-900">{formatMoney(row.pending)}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-3 text-sm text-stone-700">
                      <div>
                        <dt className="text-xs text-stone-500">Rendido sin confirmar</dt>
                        <dd className="font-medium">{formatMoney(row.settled)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-stone-500">Recibido</dt>
                        <dd className="font-medium">{formatMoney(row.received)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
                <li className="rounded-2xl border border-line-strong bg-brand-soft p-4">
                  <p className="font-semibold text-stone-900">Total</p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-stone-500">Pendiente</dt>
                      <dd className="font-semibold">{formatMoney(settlementTotals.pending)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-500">Sin confirmar</dt>
                      <dd className="font-semibold">{formatMoney(settlementTotals.settled)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-500">Recibido</dt>
                      <dd className="font-semibold">{formatMoney(settlementTotals.received)}</dd>
                    </div>
                  </dl>
                </li>
              </ul>

            <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white sm:block">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-stone-400">
                    <th className="px-4 py-2 font-medium">Local</th>
                    <th className="px-4 py-2 text-right font-medium">Pendiente de rendir</th>
                    <th className="px-4 py-2 text-right font-medium">Rendido sin confirmar</th>
                    <th className="px-4 py-2 text-right font-medium">Recibido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {settlements.map((row) => (
                    <tr key={row.business} className="text-stone-700">
                      <td className="px-4 py-2.5 font-medium text-brand">{row.business}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{formatMoney(row.pending)}</td>
                      <td className="px-4 py-2.5 text-right">{formatMoney(row.settled)}</td>
                      <td className="px-4 py-2.5 text-right">{formatMoney(row.received)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line font-semibold text-stone-900">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-4 py-2.5 text-right">{formatMoney(settlementTotals.pending)}</td>
                    <td className="px-4 py-2.5 text-right">{formatMoney(settlementTotals.settled)}</td>
                    <td className="px-4 py-2.5 text-right">{formatMoney(settlementTotals.received)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            </>
          )}
        </section>
      ) : null}

      {tab === "pedidos" ? order.map((group) => {
        // Del historial se ven los últimos, pero nunca queda afuera un pedido sin rendir.
        const total =
          group === "disponibles" ? openCount : groups[group].length + (group === "en_curso" && practiceMine ? 1 : 0);
        const list =
          group === "historial"
            ? groups[group].filter(
                (item, index) => index < HISTORY_SHOWN || courierOrderState(item) === "to_settle",
              )
            : group === "en_curso"
              ? groups[group]
              : [];

        // Una caja vacía no aporta: solo "Disponibles" dice que no hay nada (ADMIN-REPARTIDOR-7).
        if (total === 0 && group !== "disponibles") return null;

        if (group === "historial") {
          // Lo que sigue pendiente de rendir va con su tarjeta (tiene el botón Rendido); el resto, una línea.
          const pending = list.filter((item) => courierOrderState(item) === "to_settle");
          const done = list.filter((item) => courierOrderState(item) !== "to_settle");

          return (
            <section key={group} aria-label={GROUP_TITLES[group]} className="space-y-3">
              {pending.length > 0 ? (
                <div className="grid gap-3 xl:grid-cols-2">
                  {pending.map((item) => (
                    <CourierOrderCard
                      key={item.id}
                      order={item}
                      now={now}
                      busy={isBusy(item.id)}
                      error={error?.id === item.id ? error.message : null}
                      onReturn={(kind, reason) => run(item.id, () => returnOrderAction(item.id, kind, reason ?? ""))}
                      onAdvance={(status, eta) => run(item.id, () => advanceOrderAction(item.id, status, eta, item.estado))}
                      onSetEta={(kind, minutes) => run(item.id, () => setEtaAction(item.id, kind, minutes))}
                      onSettle={() => run(item.id, () => markSettledAction(item.id))}
                    />
                  ))}
                </div>
              ) : null}

              {done.length > 0 ? (
                <details className="rounded-2xl border border-line bg-white">
                  <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-lg font-semibold text-brand">
                    {GROUP_TITLES[group]}
                    <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-medium text-stone-600">
                      {done.length}
                    </span>
                  </summary>
                  <ul className="divide-y divide-line px-4 pb-2">
                    {done.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 py-2 text-sm">
                        <span className="min-w-0 break-words font-medium text-stone-800">
                          #{item.numero} · {item.negocio.nombre}
                        </span>
                        <span className="text-xs text-stone-500">
                          {STATUS_LABELS[item.estado as OrderStatus] ?? item.estado}
                          {item.envio.precio != null ? ` · ${formatMoney(Number(item.envio.precio))}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          );
        }

        return (
          <section key={group} aria-label={GROUP_TITLES[group]} className="space-y-3">
            <h2 className="flex items-baseline gap-2 text-lg font-semibold text-brand">
              {GROUP_TITLES[group]}
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600">{total}</span>
            </h2>

            {group === "disponibles" && total === 0 && disponibles.length === 0 && !practiceOffer ? (
              <p className="rounded-2xl border border-dashed border-line-strong bg-white p-4 text-center text-sm text-stone-400">
                {EMPTY[group]}
              </p>
            ) : group === "disponibles" ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {disponibles.map((item) => (
                  <AvailableOrderCard
                    key={item.id}
                    order={item}
                    now={now}
                    busy={isBusy(item.id)}
                    error={error?.id === item.id ? error.message : null}
                    onOffer={(input) =>
                      run(item.id, () => makeOfferAction(item.id, input, Number(item.envio.precio_lista ?? 0)))
                    }
                    onTake={() => run(item.id, () => takeOrderAction(item.id))}
                    onWithdraw={() => run(item.id, () => withdrawOfferAction(item.id))}
                    onDecline={() => run(item.id, () => declineOrderAction(item.id))}
                  />
                ))}
                {practiceOffer ? (
                  <AvailableOrderCard
                    key={practiceOffer.id}
                    order={practiceOffer}
                    now={now}
                    busy={false}
                    error={null}
                    practice
                    onOffer={() => tutorial?.tap("take")}
                    onTake={() => tutorial?.tap("take")}
                    onWithdraw={() => {}}
                    onDecline={() => {}}
                  />
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {list.map((item) => (
                  <CourierOrderCard
                    key={item.id}
                    order={item}
                    now={now}
                    busy={isBusy(item.id)}
                    error={error?.id === item.id ? error.message : null}
                    onReturn={(kind, reason) => run(item.id, () => returnOrderAction(item.id, kind, reason ?? ""))}
                    onAdvance={(status, eta) => run(item.id, () => advanceOrderAction(item.id, status, eta, item.estado))}
                    onSetEta={(kind, minutes) => run(item.id, () => setEtaAction(item.id, kind, minutes))}
                    onSettle={() => run(item.id, () => markSettledAction(item.id))}
                  />
                ))}
                {group === "en_curso" && practiceMine ? (
                  <CourierOrderCard
                    key={practiceMine.id}
                    order={practiceMine}
                    now={now}
                    busy={false}
                    error={null}
                    practice
                    onReturn={() => {}}
                    onAdvance={(status) => tutorial?.tap(status)}
                    onSettle={() => {}}
                  />
                ) : null}
              </div>
            )}
          </section>
        );
      }) : null}
    </div>
  );
}
