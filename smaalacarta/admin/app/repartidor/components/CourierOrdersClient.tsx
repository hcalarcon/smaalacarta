"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import CourierOrderCard from "./CourierOrderCard";
import { useNewOrderAlert } from "./useNewOrderAlert";
import { advanceOrderAction, respondOrderAction } from "../actions";
import { GROUP_TITLES, isToRespond, splitOrders, type CourierPanelOrder, type PanelGroup } from "@/lib/courier/panel";
import type { CourierResponseInput } from "@/lib/orders/courier";

const REFRESH_MS = 15_000;
const HISTORY_SHOWN = 20;

const HINTS: Record<PanelGroup, string> = {
  por_responder: "Pedidos que esperan que aceptes o digas que no podés",
  en_curso: "Aceptados: el local te los entrega y los llevás",
  historial: "Entregados, cancelados o que no pudiste llevar",
};

const EMPTY: Record<PanelGroup, string> = {
  por_responder: "No hay pedidos esperando respuesta.",
  en_curso: "No hay envíos en curso.",
  historial: "Todavía no hay historial.",
};

// El panel del repartidor (ENVIO-31 a 33): sus pedidos en tres grupos, con aviso sonoro de los
// nuevos y actualización automática.
export default function CourierOrdersClient({
  orders,
  serverNow,
}: {
  orders: CourierPanelOrder[];
  serverNow: string;
}) {
  const router = useRouter();

  // La hora arranca con la del servidor para que el primer render coincida en los dos lados.
  const [now, setNow] = useState(() => new Date(serverNow));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  const { soundOn, audioReady, toggleSound, soundOnRef } = useNewOrderAlert({
    orders,
    isPending: isToRespond,
    label: "Envío por responder",
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

  async function run(orderId: string, call: () => ReturnType<typeof respondOrderAction>) {
    setError(null);
    setBusyId(orderId);

    try {
      const result = await call();
      if (!result.ok) setError({ id: orderId, message: result.error });
    } catch {
      setError({ id: orderId, message: "No pudimos guardar el cambio. Probá de nuevo." });
    } finally {
      setBusyId(null);
      router.refresh();
    }
  }

  const groups = splitOrders(orders);
  const order: PanelGroup[] = ["por_responder", "en_curso", "historial"];

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

      {order.map((group) => {
        const list = group === "historial" ? groups[group].slice(0, HISTORY_SHOWN) : groups[group];

        return (
          <section key={group} aria-label={GROUP_TITLES[group]} className="space-y-3">
            <header>
              <h2 className="flex items-baseline gap-2 text-xl font-semibold text-brand">
                {GROUP_TITLES[group]}
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600">
                  {groups[group].length}
                </span>
              </h2>
              <p className="text-xs text-stone-500">{HINTS[group]}</p>
            </header>

            {list.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line-strong bg-white p-4 text-center text-sm text-stone-400">
                {EMPTY[group]}
              </p>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {list.map((item) => (
                  <CourierOrderCard
                    key={item.id}
                    order={item}
                    now={now}
                    busy={busyId === item.id}
                    error={error?.id === item.id ? error.message : null}
                    onRespond={(action, input: CourierResponseInput) =>
                      run(item.id, () =>
                        respondOrderAction(item.id, action, input, Number(item.envio.precio ?? 0)),
                      )
                    }
                    onAdvance={(status) => run(item.id, () => advanceOrderAction(item.id, status))}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
