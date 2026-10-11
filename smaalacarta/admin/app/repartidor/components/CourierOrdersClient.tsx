"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AvailableOrderCard from "./AvailableOrderCard";
import CourierOrderCard from "./CourierOrderCard";
import { useNewOrderAlert } from "./useNewOrderAlert";
import {
  advanceOrderAction,
  declineOrderAction,
  markSettledAction,
  returnOrderAction,
  takeOrderAction,
} from "../actions";
import {
  GROUP_TITLES,
  isToRespond,
  sortAvailable,
  splitOrders,
  type AvailableOrder,
  type CourierPanelOrder,
  type PanelGroup,
} from "@/lib/courier/panel";
import { courierOrderState, grandTotals, totalsByBusiness } from "@/lib/courier/settlements";
import { formatMoney } from "@/lib/promotions/pricing";

const REFRESH_MS = 15_000;
const HISTORY_SHOWN = 20;

const HINTS: Record<PanelGroup, string> = {
  disponibles: "Pedidos de tus zonas que todavía no tomó nadie: el primero que toca Tomar se lo queda",
  en_curso: "Los que tomaste: el local te los entrega y los llevás",
  historial: "Entregados, cancelados o que no pudiste llevar",
};

const EMPTY: Record<PanelGroup, string> = {
  disponibles: "No hay pedidos disponibles ahora.",
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
  const [tab, setTab] = useState<"pedidos" | "rendiciones">("pedidos");
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  // Aviso general: "Lo tomó otro repartidor" (el pedido desaparece de la lista al refrescar).
  const [notice, setNotice] = useState<string | null>(null);

  const { soundOn, audioReady, toggleSound, soundOnRef } = useNewOrderAlert({
    orders: available,
    isPending: isToRespond,
    label: "Pedido disponible",
  });

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

  async function run(orderId: string, call: () => ReturnType<typeof takeOrderAction>) {
    setError(null);
    setNotice(null);
    setBusyId(orderId);

    try {
      const result = await call();
      if (!result.ok && result.taken) setNotice("Lo tomó otro repartidor.");
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
  const settlements = totalsByBusiness(orders);
  const settlementTotals = grandTotals(settlements);
  const toSettleCount = orders.filter((item) => courierOrderState(item) === "to_settle").length;
  const order: PanelGroup[] = ["disponibles", "en_curso", "historial"];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand">Pedidos con envío</h1>
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

      <div role="tablist" aria-label="Secciones" className="flex gap-2">
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
            onClick={() => setTab(key)}
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
            <div className="overflow-x-auto rounded-2xl border border-line bg-white">
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
          )}
        </section>
      ) : null}

      {tab === "pedidos" ? order.map((group) => {
        // Del historial se ven los últimos, pero nunca queda afuera un pedido sin rendir.
        const total = group === "disponibles" ? disponibles.length : groups[group].length;
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

            {total === 0 ? (
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
                    onTake={(input) =>
                      run(item.id, () => takeOrderAction(item.id, input, Number(item.envio.precio ?? 0)))
                    }
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
