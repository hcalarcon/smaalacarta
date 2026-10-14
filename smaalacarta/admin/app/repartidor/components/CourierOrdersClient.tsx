"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import AvailableOrderCard from "./AvailableOrderCard";
import CourierOrderCard from "./CourierOrderCard";
import { useNewOrderAlert } from "./useNewOrderAlert";
import {
  advanceOrderAction,
  declineOrderAction,
  makeOfferAction,
  markSettledAction,
  returnOrderAction,
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
import { courierTab, type CourierTab } from "@/lib/courier/nav";
import { courierOrderState, grandTotals, totalsByBusiness } from "@/lib/courier/settlements";
import { formatMoney } from "@/lib/promotions/pricing";

const REFRESH_MS = 15_000;
const HISTORY_SHOWN = 20;

const HINTS: Record<PanelGroup, string> = {
  disponibles: "Pedidos de tus zonas: ofertá con el precio de lista o con otro, y el cliente elige",
  en_curso: "Los que te eligieron: el local te los entrega y los llevás",
  historial: "Entregados, cancelados o que no pudiste llevar",
};

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
  const router = useRouter();

  // La hora arranca con la del servidor para que el primer render coincida en los dos lados.
  const [now, setNow] = useState(() => new Date(serverNow));
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const { soundOn, audioReady, toggleSound, soundOnRef, playChosen } = useNewOrderAlert({
    orders: available,
    isPending: isToRespond,
    label: "Pedido disponible",
  });

  // Los pedidos por los que ofertó: cuando uno aparece entre sus envíos en curso, lo eligieron y suena un
  // aviso distinto (ENVIO-116). Los que ya estaban en curso al abrir la pantalla no suenan.
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

  // Se actualiza solo (mismo mecanismo que el tablero del local). Con la pestaña oculta solo sigue
  // si el sonido está activado: quien lo activó espera el aviso aunque esté en otra pestaña.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" || soundOnRef.current) {
        setNow(new Date());
        router.refresh();
      }
    }, REFRESH_MS);

    return () => clearInterval(id);
  }, [router, soundOnRef]);

  async function run(orderId: string, call: () => ReturnType<typeof makeOfferAction>) {
    setError(null);
    setNotice(null);
    setBusyId(orderId);

    try {
      const result = await call();
      if (!result.ok && result.closed) setNotice("El pedido ya no recibe ofertas.");
      else if (!result.ok) setError({ id: orderId, message: result.error });
    } catch {
      setError({ id: orderId, message: "No pudimos guardar el cambio. Probá de nuevo." });
    } finally {
      setBusyId(null);
      router.refresh();
    }
  }

  const groups = splitOrders(orders);
  const disponibles = sortAvailable(available);
  // Los avisos de ofertas cerradas se ven un rato, pero no cuentan como pedidos para ofertar.
  const openCount = disponibles.filter((item) => !item.resultado).length;
  const settlements = totalsByBusiness(orders);
  const settlementTotals = grandTotals(settlements);
  const toSettleCount = orders.filter((item) => courierOrderState(item) === "to_settle").length;
  const order: PanelGroup[] = ["disponibles", "en_curso", "historial"];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand sm:text-3xl">Pedidos con envío</h1>
          <p className="mt-2 text-stone-500">Se actualiza solo cada pocos segundos.</p>
        </div>

        <div>
          <button
            type="button"
            onClick={toggleSound}
            className="min-h-11 rounded-xl border border-line-strong bg-white px-5 py-3 text-sm font-semibold text-brand transition hover:bg-cream"
          >
            {!soundOn
              ? "🔔 Activar sonido"
              : audioReady
                ? "🔔 Sonido activado"
                : "🔕 Tocá para activar el sonido"}
          </button>
          {soundOn ? (
            <p className="mt-1 text-xs text-stone-500">Mantené esta pantalla abierta para recibir avisos</p>
          ) : null}
        </div>
      </section>

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
        const total = group === "disponibles" ? openCount : groups[group].length;
        const list =
          group === "historial"
            ? groups[group].filter(
                (item, index) => index < HISTORY_SHOWN || courierOrderState(item) === "to_settle",
              )
            : group === "en_curso"
              ? groups[group]
              : [];

        return (
          <section key={group} aria-label={GROUP_TITLES[group]} className="space-y-3">
            <header>
              <h2 className="flex items-baseline gap-2 text-xl font-semibold text-brand">
                {GROUP_TITLES[group]}
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600">
                  {total}
                </span>
              </h2>
              <p className="text-xs text-stone-500">{HINTS[group]}</p>
            </header>

            {total === 0 && !(group === "disponibles" && disponibles.length > 0) ? (
              <p className="rounded-2xl border border-dashed border-line-strong bg-white p-4 text-center text-sm text-stone-400">
                {EMPTY[group]}
              </p>
            ) : group === "disponibles" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {disponibles.map((item) => (
                  <AvailableOrderCard
                    key={item.id}
                    order={item}
                    now={now}
                    busy={busyId === item.id}
                    error={error?.id === item.id ? error.message : null}
                    onOffer={(input) =>
                      run(item.id, () => makeOfferAction(item.id, input, Number(item.envio.precio_lista ?? 0)))
                    }
                    onWithdraw={() => run(item.id, () => withdrawOfferAction(item.id))}
                    onDecline={() => run(item.id, () => declineOrderAction(item.id))}
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {list.map((item) => (
                  <CourierOrderCard
                    key={item.id}
                    order={item}
                    now={now}
                    busy={busyId === item.id}
                    error={error?.id === item.id ? error.message : null}
                    onReturn={(reason) => run(item.id, () => returnOrderAction(item.id, reason))}
                    onAdvance={(status) => run(item.id, () => advanceOrderAction(item.id, status))}
                    onSettle={() => run(item.id, () => markSettledAction(item.id))}
                  />
                ))}
              </div>
            )}
          </section>
        );
      }) : null}
    </div>
  );
}
