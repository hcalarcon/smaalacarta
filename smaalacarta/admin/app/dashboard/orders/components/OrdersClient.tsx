"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import ManualOrderDialog from "./ManualOrderDialog";
import OrderCard from "./OrderCard";
import OrderDetailDialog from "./OrderDetailDialog";
import OrdersHistory from "./OrdersHistory";
import { setOrderStatusAction } from "../actions";
import type { Order } from "@/lib/db/orders";
import { newPendingIds, pendingCount, shouldRemind, tabTitle } from "@/lib/orders/alerts";
import { playNewOrderSound } from "@/lib/orders/sound";
import { compareForBoard } from "@/lib/orders/scheduled";
import { boardColumn, type BoardColumn } from "@/lib/orders/status";

// "Terminados" (entregados o cancelados) no es una columna más del tablero:
// va aparte, en el historial de abajo.
const COLUMNS: { key: BoardColumn; title: string; hint: string }[] = [
  { key: "nuevos", title: "Nuevos", hint: "Esperando confirmación" },
  { key: "en_curso", title: "En curso", hint: "Confirmados y en preparación" },
  { key: "listos", title: "Listos", hint: "Para entregar o retirar" },
];

const REFRESH_MS = 20_000;
const REMIND_MS = 30_000;
// Cada cuánto se mira si toca repetir el aviso (el intervalo real es REMIND_MS).
const REMIND_CHECK_MS = 5_000;
const CLOSED_SHOWN = 10;
const SOUND_PREF_KEY = "sma-orders-sound";

function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function saveSoundPref(on: boolean) {
  try {
    localStorage.setItem(SOUND_PREF_KEY, on ? "1" : "0");
  } catch {
    // Modo privado: la preferencia no se recuerda, el sonido sigue funcionando.
  }
}

export default function OrdersClient({
  slug,
  orders,
  products,
  serverNow,
}: {
  slug: string;
  orders: Order[];
  products: { name: string; price: number }[];
  serverNow: string;
}) {
  const router = useRouter();

  // La hora arranca con la del servidor para que el primer render coincida en los dos
  // lados; después se actualiza sola.
  const [now, setNow] = useState(() => new Date(serverNow));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // Sonido: la preferencia se lee en el navegador (no en el servidor) para que el primer
  // render coincida. `audioReady` dice si el navegador ya dejó sonar: tras recargar hay
  // que volver a tocar el botón aunque la preferencia siga activada.
  const [soundOn, setSoundOn] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(false);
  // Los pedidos que ya estaban al abrir no suenan.
  const seenIds = useRef<Set<string>>(new Set(orders.map((o) => o.id)));
  const lastBeepAt = useRef<number | null>(null);

  function beep(ctx: AudioContext) {
    lastBeepAt.current = Date.now();
    playNewOrderSound(ctx);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador
    setSoundOn(readSoundPref());
  }, []);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    const fresh = newPendingIds(seenIds.current, orders);
    orders.forEach((o) => seenIds.current.add(o.id));

    const ctx = audioRef.current;
    if (fresh.length > 0 && soundOnRef.current && ctx?.state === "running") {
      beep(ctx);
    }
  }, [orders]);

  async function unlockAudio(): Promise<boolean> {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;

      audioRef.current ??= new Ctor();
      if (audioRef.current.state !== "running") await audioRef.current.resume();

      const ready = audioRef.current.state === "running";
      setAudioReady(ready);
      if (ready) beep(audioRef.current);
      return ready;
    } catch {
      return false;
    }
  }

  async function toggleSound() {
    if (soundOn && audioReady) {
      setSoundOn(false);
      saveSoundPref(false);
      return;
    }

    setSoundOn(true);
    saveSoundPref(true);
    await unlockAudio();
  }

  // Actualiza el tablero cada 20 segundos. Con la pestaña oculta solo sigue si el
  // sonido está activado: quien lo activó espera el aviso aunque esté en otra pestaña.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" || soundOnRef.current) {
        setNow(new Date());
        router.refresh();
      }
    }, REFRESH_MS);

    return () => clearInterval(id);
  }, [router]);

  const pending = pendingCount(orders);

  // Repite el sonido mientras haya pendientes sin atender.
  useEffect(() => {
    if (!soundOn || !audioReady || pending === 0) return;

    const id = setInterval(() => {
      const ctx = audioRef.current;
      if (ctx?.state === "running" && shouldRemind(lastBeepAt.current, Date.now(), pending, REMIND_MS)) {
        beep(ctx);
      }
    }, REMIND_CHECK_MS);

    return () => clearInterval(id);
  }, [soundOn, audioReady, pending]);

  // Pantalla encendida mientras el sonido esté activado. El navegador suelta el bloqueo
  // al ocultarse la pestaña, así que se vuelve a pedir al volver a verla.
  useEffect(() => {
    if (!soundOn || !audioReady) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function request() {
      if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Sin permiso o sin batería suficiente: el aviso sigue, solo que la pantalla puede apagarse.
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) {
        void request();
      }
    }

    void request();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [soundOn, audioReady]);

  // Título de la pestaña: la cantidad de pendientes, sin parpadeo.
  const originalTitle = useRef<string | null>(null);
  useEffect(() => {
    originalTitle.current ??= document.title;
    document.title = tabTitle(originalTitle.current, pending);
  }, [pending]);
  useEffect(() => {
    return () => {
      if (originalTitle.current !== null) document.title = originalTitle.current;
    };
  }, []);

  async function changeStatus(orderId: string, status: string, note?: string) {
    setError(null);
    setBusyId(orderId);

    try {
      const result = await setOrderStatusAction(orderId, status, note);
      if (!result.ok) setError(result.error);
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    } finally {
      setBusyId(null);
      router.refresh();
    }
  }

  const selected = orders.find((order) => order.id === selectedId) ?? null;

  const byColumn = (key: BoardColumn) => {
    const list = orders.filter((order) => boardColumn(order.status) === key);
    // Los nuevos y en curso, del más viejo al más nuevo (el más urgente primero) y, en
    // los programados, por la hora para la que son; los terminados, los más recientes.
    return key === "cerrados"
      ? list.slice(0, CLOSED_SHOWN)
      : [...list].sort(compareForBoard);
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand">Pedidos</h1>
          <p className="mt-2 text-stone-500">
            Se actualiza solo cada pocos segundos.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
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
              <p className="mt-1 text-xs text-stone-500">
                Mantené esta pantalla abierta para recibir avisos
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="min-h-11 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover"
          >
            + Pedido manual
          </button>
        </div>
      </section>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {orders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong bg-white p-10 text-center text-stone-500">
          Todavía no hay pedidos. Cuando un cliente confirme uno desde tu menú, aparece acá.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-5 lg:grid-cols-3">
            {COLUMNS.map((column) => {
              const list = byColumn(column.key);
              const total = orders.filter((o) => boardColumn(o.status) === column.key).length;

              return (
                <section key={column.key} className="rounded-3xl bg-cream/70 p-4">
                  <header className="mb-3 flex items-baseline justify-between">
                    <h2 className="font-semibold text-brand">{column.title}</h2>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600">
                      {total}
                    </span>
                  </header>
                  <p className="mb-3 text-xs text-stone-500">{column.hint}</p>

                  <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
                    {list.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-line-strong p-4 text-center text-sm text-stone-400">
                        Sin pedidos
                      </p>
                    ) : (
                      list.map((order) => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          now={now}
                          busy={busyId === order.id}
                          onAdvance={(status) => changeStatus(order.id, status)}
                          onOpen={() => setSelectedId(order.id)}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          <OrdersHistory
            orders={byColumn("cerrados")}
            onOpen={(orderId) => setSelectedId(orderId)}
          />
        </div>
      )}

      <OrderDetailDialog
        order={selected}
        slug={slug}
        busy={busyId === selected?.id}
        onClose={() => setSelectedId(null)}
        onChangeStatus={(status, note) => selected && changeStatus(selected.id, status, note)}
      />

      <ManualOrderDialog
        open={manualOpen}
        products={products}
        onClose={() => setManualOpen(false)}
        onCreated={() => {
          setManualOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
