"use client";

import { availableCountText, orderZoneIsEmpty, type BusinessAvailability } from "@/lib/courier/availability";
import { useOrderChanges } from "@/lib/realtime/useOrderChanges";
import { useHoldUntilFresh } from "@/lib/realtime/useHoldUntilFresh";
import { useSerialRefresh } from "@/lib/realtime/useSerialRefresh";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import ManualOrderDialog from "./ManualOrderDialog";
import NewOrderAlert from "./NewOrderAlert";
import OrderCard from "./OrderCard";
import OrderDetailDialog from "./OrderDetailDialog";
import OrdersHistory from "./OrdersHistory";
import PrepPicker from "./PrepPicker";
import SettlementSummary from "./SettlementSummary";
import ConfirmDeleteDialog from "../../components/ConfirmDeleteDialog";
import {
  acceptOrderAction,
  assignCourierAction,
  confirmSettlementAction,
  adjustPrepAction,
  selfDeliveryAction,
  setNeedsCarAction,
  setOrderStatusAction,
  setPrepAction,
} from "../actions";
import type { Order } from "@/lib/db/orders";
import type { OrderCourier, OrderOffers } from "@/lib/orders/courier";
import type { ManualOrderSetup } from "@/lib/orders/manual-context";
import { newPendingIds, tabTitle } from "@/lib/orders/alerts";
import { clearAppBadgeSafe, restoreFavicon, setAppBadgeSafe, updateFavicon } from "@/lib/orders/badge";
import { ALARM_LOOP_MS, playAlarmSound, playNewOrderSound } from "@/lib/orders/sound";
import {
  SOUND_CHANGE_EVENT,
  isAudioReady,
  readSoundPref,
  saveSoundPref,
  sharedAudioContext,
  unlockSharedAudio,
} from "@/lib/orders/sound-pref";
import { cancelSpeech, speakNewOrder } from "@/lib/orders/speech";
import {
  MUTE_MS,
  VOICE_REPEAT_MS,
  alarmVolume,
  blinkTitle,
  isUnattended,
  oldestWaitingMs,
  shouldBlink,
  unattendedOrders,
} from "@/lib/orders/urgent-alert";
import { acceptsPrepTime } from "@/lib/orders/prep";
import { readLastPrep, saveLastPrep } from "@/lib/orders/prep-last";
import { boardColumn, type BoardColumn } from "@/lib/orders/status";
import { compareByUrgency, orderUrgency } from "@/lib/orders/urgency";
import { formatMoney } from "@/lib/promotions/pricing";

// "Terminados" (entregados o cancelados) no es una columna más del tablero:
// va aparte, en el historial de abajo.
const COLUMNS: { key: BoardColumn; title: string; hint: string }[] = [
  { key: "nuevos", title: "Nuevos", hint: "Esperando confirmación" },
  { key: "en_curso", title: "En curso", hint: "Confirmados y en preparación" },
  { key: "listos", title: "Listos", hint: "Para entregar, retirar o en camino" },
];

const REFRESH_MS = 20_000;
const BLINK_MS = 1_000;
const CLOSED_SHOWN = 10;

// `prefers-reduced-motion`: sin parpadeo del título. En el servidor y sin `matchMedia`, no.
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

function reducedMotionSnapshot() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false;
}

export default function OrdersClient({
  slug,
  orders,
  manualSetup,
  serverNow,
  couriers = [],
  offers = [],
  suggestedPrepMinutes = null,
  defaultPrepMinutes = 20,
  vehicleEnabled = false,
  canAskForCar = true,
  availability = { enabled: false, total: 0, emptyZoneIds: [] },
}: {
  slug: string;
  orders: Order[];
  // Lo que el diálogo del pedido manual necesita: el menú con sus opciones, el envío y el negocio (ADMIN-PEDIDOS-47).
  manualSetup: ManualOrderSetup;
  serverNow: string;
  // Solo con envío con repartidor habilitado (ENVIO-2): los repartidores activos que cubren zonas del
  // local y su favorito.
  couriers?: OrderCourier[];
  // Las ofertas abiertas de los pedidos que buscan repartidor (ENVIO-111).
  offers?: OrderOffers[];
  // El tiempo estimado (ADMIN-PEDIDOS-32): la sugerencia de la base según los últimos pedidos y el tiempo por
  // defecto del negocio, para preseleccionar el selector.
  suggestedPrepMinutes?: number | null;
  defaultPrepMinutes?: number;
  // El interruptor del vehículo del repartidor (ENVIO-175): apagado, no se ve nada de moto/auto.
  vehicleEnabled?: boolean;
  // "Necesita auto" solo tiene sentido si el negocio trabaja con moto y con auto (ENVIO-205).
  canAskForCar?: boolean;
  // Cuántos repartidores disponibles cubren las zonas del local y cuáles zonas están en 0 (ENVIO-200).
  availability?: BusinessAvailability;
}) {
  // Un cambio en la base trae los datos nuevos al instante (ENVIO-172); la consulta de abajo queda de respaldo.
  // Un refresco a la vez (ENVIO-210).
  const refresh = useSerialRefresh(serverNow);
  useOrderChanges(refresh);

  // La hora arranca con la del servidor para que el primer render coincida en los dos
  // lados; después se actualiza sola.
  const [now, setNow] = useState(() => new Date(serverNow));
  const [busyId, setBusyId] = useState<string | null>(null);
  // Tras una acción que salió bien, el pedido sigue ocupado hasta que llegan datos nuevos (ADMIN-PEDIDOS-60).
  const held = useHoldUntilFresh(serverNow);
  const isBusy = (id: string | null | undefined) => (id ? busyId === id || held.holding(id) : false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  // En el celular las tres columnas son pestañas; desde `lg` se ven las tres juntas (ADMIN-PEDIDOS-54).
  const [tab, setTab] = useState<BoardColumn>("nuevos");
  // Pedido cuya rendición se está por confirmar como recibida (ENVIO-43).
  const [receivingId, setReceivingId] = useState<string | null>(null);
  // El selector del tiempo estimado (ADMIN-PEDIDOS-31): al aceptar, o para cargarlo después.
  const [prepPicker, setPrepPicker] = useState<{ orderId: string; mode: "accept" | "set"; last: number | null } | null>(
    null,
  );
  // Un cambio a la vez: un segundo toque que llegue antes de que vuelva la respuesta no hace nada
  // (ADMIN-PEDIDOS-51). El servidor es idempotente igual; esto evita ni siquiera pedirlo.
  // "Necesita auto" del diálogo de aceptar (ENVIO-176): arranca apagado en cada pedido.
  const [acceptNeedsCar, setAcceptNeedsCar] = useState(false);
  const inFlight = useRef(false);

  // Sonido: la preferencia se lee en el navegador (no en el servidor) para que el primer
  // render coincida. `audioReady` dice si el navegador ya dejó sonar: tras recargar hay
  // que volver a tocar el botón aunque la preferencia siga activada. El contexto de audio es el
  // compartido con la barra de avisos del panel (`sound-pref.ts`).
  const [soundOn, setSoundOn] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const soundOnRef = useRef(false);
  // Los pedidos que ya estaban al abrir no suenan de golpe: la alarma arranca al activar el sonido.
  const seenIds = useRef<Set<string>>(new Set(orders.map((o) => o.id)));
  // Hasta cuándo está silenciada la alarma (ADMIN-PEDIDOS-25).
  const [mutedUntil, setMutedUntil] = useState<number | null>(null);
  // Pedidos cuya tarjeta se cerró con "Ver pedidos": no vuelve a aparecer por ellos.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  // Pedidos que se acaban de aceptar y el servidor todavía no confirmó: dejan de contar como sin atender en
  // el momento (actualización optimista). Si la acción falla, vuelven.
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(() => new Set());
  const [blinkPhase, setBlinkPhase] = useState(true);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);

  useEffect(() => {
    function sync() {
      setSoundOn(readSoundPref());
      setAudioReady(isAudioReady());
    }

    sync();
    window.addEventListener(SOUND_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SOUND_CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  const unattended = unattendedOrders(orders).filter((order) => !acceptedIds.has(order.id));
  const count = unattended.length;
  const ordersRef = useRef(orders);
  const alarmActive = soundOn && audioReady && count > 0 && mutedUntil === null;
  // Si la alarma ya estaba sonando en el render anterior (se actualiza al final de los efectos).
  const alarmWasActive = useRef(false);

  // Un pedido nuevo mientras la alarma ya suena: se oye enseguida, sin esperar la próxima vuelta.
  useEffect(() => {
    ordersRef.current = orders;

    const fresh = newPendingIds(seenIds.current, orders, isUnattended);
    orders.forEach((o) => seenIds.current.add(o.id));

    const ctx = sharedAudioContext();
    if (fresh.length > 0 && alarmWasActive.current && ctx?.state === "running") {
      playAlarmSound(ctx, alarmVolume(oldestWaitingMs(orders, Date.now())));
    }
  }, [orders]);

  useEffect(() => {
    alarmWasActive.current = alarmActive;
  }, [alarmActive]);

  async function unlockAudio(): Promise<boolean> {
    const ctx = await unlockSharedAudio();
    setAudioReady(ctx !== null);
    if (ctx) playNewOrderSound(ctx);
    return ctx !== null;
  }

  // Silenciar: la alarma y la voz callan 5 minutos y vuelven solas.
  function silence() {
    setMutedUntil(Date.now() + MUTE_MS);
  }

  useEffect(() => {
    if (mutedUntil === null) return;

    const wait = mutedUntil - Date.now();
    const id = setTimeout(() => setMutedUntil(null), Math.max(0, wait));
    return () => clearTimeout(id);
  }, [mutedUntil]);

  // La alarma en bucle mientras haya pedidos sin atender, más fuerte pasados los 60 s (ADMIN-PEDIDOS-26).
  useEffect(() => {
    if (!alarmActive) return;

    function play() {
      const ctx = sharedAudioContext();
      if (ctx?.state !== "running") return;
      playAlarmSound(ctx, alarmVolume(oldestWaitingMs(ordersRef.current, Date.now())));
    }

    play();
    const id = setInterval(play, ALARM_LOOP_MS);
    return () => clearInterval(id);
  }, [alarmActive]);

  // La voz, mientras suena la alarma: "Nuevo pedido" ahora y cada 30 s (ADMIN-PEDIDOS-27).
  useEffect(() => {
    if (!alarmActive) return;

    speakNewOrder();
    const id = setInterval(speakNewOrder, VOICE_REPEAT_MS);

    return () => {
      clearInterval(id);
      cancelSpeech();
    };
  }, [alarmActive]);

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
        refresh();
      }
    }, REFRESH_MS);

    return () => clearInterval(id);
  }, [refresh]);

  // Con ofertas abiertas la cuenta regresiva ("se elige sola en m:ss") avanza cada segundo, y al vencer
  // se vuelve a pedir el tablero para ver el repartidor elegido (ENVIO-117).
  const offersByOrder = new Map(offers.map((item) => [item.order_id, item]));
  const deadlines = offers.flatMap((item) => (item.cierra_en ? [new Date(item.cierra_en).getTime()] : []));
  const nextDeadline = deadlines.length > 0 ? Math.min(...deadlines) : null;

  useEffect(() => {
    if (nextDeadline === null) return;

    const id = setInterval(() => {
      const current = new Date();
      setNow(current);

      if (current.getTime() >= nextDeadline) {
        clearInterval(id);
        refresh();
      }
    }, 1000);

    return () => clearInterval(id);
  }, [nextDeadline, refresh]);

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

  // Título de la pestaña: con pedidos sin atender parpadea entre "(n) NUEVO PEDIDO" y el título normal
  // (ADMIN-PEDIDOS-12 y 27). Con `prefers-reduced-motion` queda fijo con la cantidad.
  const originalTitle = useRef<string | null>(null);
  const blinking = shouldBlink(count, reducedMotion);

  useEffect(() => {
    if (!blinking) return;

    const id = setInterval(() => setBlinkPhase((phase) => !phase), BLINK_MS);
    return () => clearInterval(id);
  }, [blinking]);

  useEffect(() => {
    originalTitle.current ??= document.title;
    document.title = blinking
      ? blinkTitle(originalTitle.current, count, blinkPhase)
      : tabTitle(originalTitle.current, count);
  }, [count, blinking, blinkPhase]);

  useEffect(() => {
    return () => {
      if (originalTitle.current !== null) document.title = originalTitle.current;
    };
  }, []);

  // El globito con la cantidad, en el favicon y en el ícono de la app instalada (ADMIN-PEDIDOS-28).
  useEffect(() => {
    updateFavicon(count);
    void setAppBadgeSafe(count);
  }, [count]);

  useEffect(() => {
    return () => {
      restoreFavicon();
      void clearAppBadgeSafe();
    };
  }, []);

  // La tarjeta: el pedido sin atender más viejo que no se cerró con "Ver pedidos".
  const byAge = [...unattended].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const alertOrder = byAge.find((order) => !dismissedIds.has(order.id)) ?? null;

  function markAccepted(orderId: string, accepted: boolean) {
    setAcceptedIds((current) => {
      const next = new Set(current);
      if (accepted) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }

  function viewOrders() {
    setDismissedIds((current) => new Set([...current, ...unattended.map((order) => order.id)]));
  }

  // Aceptar un pedido pendiente (con hora de entrega ya marcada o no) pasa por el selector del tiempo; lo
  // programado y anticipado ya tiene su hora y se confirma directo (ADMIN-PEDIDOS-31).
  // Devuelve la promesa de la acción para que el botón que la llamó espere (ENVIO-168).
  function requestStatus(order: Order, status: string, note?: string): Promise<boolean> | undefined {
    if (status === "confirmed" && order.status === "pending" && acceptsPrepTime(order)) {
      setError(null);
      setAcceptNeedsCar(false);
      // `last`: el último tiempo que usó el local en este navegador (ADMIN-PEDIDOS-52), leído al abrir.
      setPrepPicker({ orderId: order.id, mode: "accept", last: readLastPrep(slug) });
      return;
    }

    return changeStatus(order.id, status, note, order.status, order.status === "pending" && status === "confirmed");
  }

  async function submitPrep(minutes: number | null) {
    if (!prepPicker || inFlight.current) return;

    const { orderId, mode } = prepPicker;
    inFlight.current = true;
    setError(null);
    setBusyId(orderId);
    if (mode === "accept") markAccepted(orderId, true);

    try {
      const result =
        mode === "accept" ? await acceptOrderAction(orderId, minutes, vehicleEnabled && canAskForCar && acceptNeedsCar) : await setPrepAction(orderId, minutes ?? 0, null);

      if (result.ok) {
        setPrepPicker(null);
        held.hold(orderId);
        if (minutes !== null) saveLastPrep(slug, minutes);
      } else {
        setError(result.error);
        if (mode === "accept") markAccepted(orderId, false);
      }
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
      if (mode === "accept") markAccepted(orderId, false);
    } finally {
      inFlight.current = false;
      setBusyId(null);
      refresh();
    }
  }

  // `from`: el estado que el usuario veía al tocar; la base solo aplica el cambio si el pedido sigue ahí, así un
  // doble click o dos pestañas nunca avanzan dos pasos.
  async function changeStatus(orderId: string, status: string, note?: string, from?: string, accepting = false): Promise<boolean> {
    if (inFlight.current) return true;

    inFlight.current = true;
    setError(null);
    setBusyId(orderId);
    if (accepting) markAccepted(orderId, true);

    try {
      const result = await setOrderStatusAction(orderId, status, note, from);
      if (result.ok) held.hold(orderId);
      if (!result.ok) {
        setError(result.error);
        if (accepting) markAccepted(orderId, false);
      }
      return result.ok;
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
      if (accepting) markAccepted(orderId, false);
      return false;
    } finally {
      inFlight.current = false;
      setBusyId(null);
      refresh();
    }
  }

  // Resolver el envío de un pedido que nadie tomó: asignarlo a mano o llevarlo el local (ENVIO-81).
  async function resolveDelivery(
    orderId: string,
    run: () => ReturnType<typeof selfDeliveryAction>,
  ) {
    if (inFlight.current) return;

    inFlight.current = true;
    setError(null);
    setBusyId(orderId);

    try {
      const result = await run();
      if (result.ok) held.hold(orderId);
      else setError(result.error);
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    } finally {
      inFlight.current = false;
      setBusyId(null);
      refresh();
    }
  }

  async function confirmReceived() {
    if (!receivingId) return;

    setError(null);
    setBusyId(receivingId);

    try {
      const result = await confirmSettlementAction(receivingId);
      if (result.ok) held.hold(receivingId);
      else setError(result.error);
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    } finally {
      setBusyId(null);
      setReceivingId(null);
      refresh();
    }
  }

  const selected = orders.find((order) => order.id === selectedId) ?? null;
  // El selector solo sigue abierto mientras tenga sentido: aceptar exige que el pedido siga pendiente (si ya se
  // confirmó, el aviso del error queda en el tablero y no se vuelve a pedir).
  const prepOrder = prepPicker ? orders.find((order) => order.id === prepPicker.orderId) ?? null : null;
  const activePicker =
    prepPicker && prepOrder && (prepPicker.mode === "set" || prepOrder.status === "pending") ? prepPicker : null;
  const receiving = orders.find((order) => order.id === receivingId) ?? null;

  const byColumn = (key: BoardColumn) => {
    const list = orders.filter((order) => boardColumn(order.status) === key);
    // Lo que pide atención primero (atrasado, sin repartidor, sin atender) y, a igual urgencia, del más
    // viejo al más nuevo y los programados por su hora; los terminados, los más recientes.
    return key === "cerrados"
      ? list.slice(0, CLOSED_SHOWN)
      : [...list].sort((a, b) =>
          compareByUrgency(a, b, now, (order) => offersByOrder.get(order.id)?.ofertas.length ?? 0),
        );
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand sm:text-3xl">Pedidos</h1>
          <p className="mt-2 text-stone-500">
            Se actualiza solo cada pocos segundos.
          </p>
          {availability.enabled ? (
            <p
              role="status"
              className={`mt-2 inline-flex min-h-8 items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
                availability.total === 0 ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-900"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${availability.total === 0 ? "bg-amber-500" : "bg-emerald-500"}`}
              />
              {availableCountText(availability.total)}
            </p>
          ) : null}
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

          {alarmActive && alertOrder === null ? (
            <button
              type="button"
              onClick={silence}
              className="min-h-11 rounded-xl border border-line-strong bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-cream"
            >
              🔕 Silenciar 5 min
            </button>
          ) : null}

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
          <div role="tablist" aria-label="Columnas del tablero" className="flex gap-1.5 rounded-2xl bg-cream/70 p-1.5 lg:hidden">
            {COLUMNS.map((column) => {
              const total = orders.filter((o) => boardColumn(o.status) === column.key).length;
              const selectedTab = tab === column.key;

              return (
                <button
                  key={column.key}
                  type="button"
                  role="tab"
                  aria-selected={selectedTab}
                  onClick={() => setTab(column.key)}
                  className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition ${
                    selectedTab ? "bg-brand text-white shadow-sm" : "text-brand hover:bg-white"
                  }`}
                >
                  {column.title}
                  <span
                    className={`rounded-full px-1.5 text-xs font-medium ${
                      selectedTab ? "bg-white/20 text-white" : "bg-white text-stone-600"
                    }`}
                  >
                    {total}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {COLUMNS.map((column) => {
              const list = byColumn(column.key);
              const total = orders.filter((o) => boardColumn(o.status) === column.key).length;
              const urgent = list.filter(
                (o) => orderUrgency(o, now, offersByOrder.get(o.id)?.ofertas.length ?? 0) > 0,
              ).length;

              return (
                <section
                  key={column.key}
                  className={`rounded-3xl bg-cream/70 p-4 lg:block ${tab === column.key ? "" : "hidden"}`}
                >
                  <header className="mb-3 flex items-baseline justify-between gap-2">
                    <h2 className="font-semibold text-brand">{column.title}</h2>
                    <span className="flex items-center gap-1.5">
                      {urgent > 0 ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          {urgent} urgente{urgent === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600">
                        {total}
                      </span>
                    </span>
                  </header>
                  <p className="mb-3 text-xs text-stone-500">{column.hint}</p>

                  <div className="space-y-3 lg:max-h-[65vh] lg:overflow-y-auto lg:pr-1">
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
                          busy={isBusy(order.id)}
                          onAdvance={(status) => requestStatus(order, status)}
                          onSetPrep={() => {
                            setError(null);
                            setPrepPicker({ orderId: order.id, mode: "set", last: readLastPrep(slug) });
                          }}
                          onAdjust={(delta, reason) =>
                            resolveDelivery(order.id, () => adjustPrepAction(order.id, delta, reason))
                          }
                          noCouriers={orderZoneIsEmpty(order, availability)}
                          onOpen={() => setSelectedId(order.id)}
                          onConfirmSettlement={() => setReceivingId(order.id)}
                          couriers={couriers}
                          offers={offersByOrder.get(order.id)}
                          vehicleEnabled={vehicleEnabled}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          <SettlementSummary orders={orders} couriers={couriers} />

          <OrdersHistory
            orders={byColumn("cerrados")}
            onOpen={(orderId) => setSelectedId(orderId)}
            onConfirmSettlement={(orderId) => setReceivingId(orderId)}
          />
        </div>
      )}

      <OrderDetailDialog
        order={selected}
        slug={slug}
        busy={isBusy(selected?.id)}
        onClose={() => setSelectedId(null)}
        onChangeStatus={(status, note) => selected && requestStatus(selected, status, note)}
        couriers={couriers}
        offers={selected ? offersByOrder.get(selected.id) : undefined}
        now={now}
        error={error}
        onAssignCourier={(courierId, note) =>
          selected && resolveDelivery(selected.id, () => assignCourierAction(selected.id, courierId, note))
        }
        onSelfDelivery={() => selected && resolveDelivery(selected.id, () => selfDeliveryAction(selected.id))}
        vehicleEnabled={vehicleEnabled}
        onNeedsCar={
          canAskForCar
            ? (needsCar) => selected && resolveDelivery(selected.id, () => setNeedsCarAction(selected.id, needsCar))
            : undefined
        }
        onConfirmSettlement={() => selected && setReceivingId(selected.id)}
      />

      <ConfirmDeleteDialog
        open={receiving !== null}
        title="Confirmar que recibiste la rendición"
        description={
          receiving
            ? `¿Recibiste del repartidor lo del pedido #${receiving.order_number} (${formatMoney(Number(receiving.total))})? La confirmación no se puede deshacer.`
            : undefined
        }
        confirmLabel="Sí, lo recibí"
        loadingLabel="Guardando..."
        onConfirm={confirmReceived}
        onClose={() => setReceivingId(null)}
        loading={busyId === receivingId && receivingId !== null}
      />

      {/* Con el selector abierto la tarjeta no queda debajo: un solo diálogo (ENVIO-168). */}
      {alertOrder && !activePicker ? (
        <NewOrderAlert
          order={alertOrder}
          moreCount={count - 1}
          busy={isBusy(alertOrder.id)}
          canSilence={soundOn && audioReady}
          silenced={mutedUntil !== null}
          onAccept={() => requestStatus(alertOrder, "confirmed")}
          onView={viewOrders}
          onSilence={silence}
        />
      ) : null}

      {activePicker && prepOrder ? (
        <PrepPicker
          key={activePicker.orderId + activePicker.mode}
          orderNumber={prepOrder.order_number}
          mode={activePicker.mode}
          suggested={suggestedPrepMinutes}
          defaultMinutes={defaultPrepMinutes}
          lastUsed={activePicker.last}
          busy={isBusy(activePicker.orderId)}
          error={error}
          onConfirm={(minutes) => submitPrep(minutes)}
          onAcceptWithout={() => submitPrep(null)}
          onClose={() => setPrepPicker(null)}
          needsCar={acceptNeedsCar}
          onNeedsCarChange={
            vehicleEnabled && canAskForCar && prepOrder.courier_status ? (value) => setAcceptNeedsCar(value) : undefined
          }
        />
      ) : null}

      <ManualOrderDialog
        open={manualOpen}
        setup={manualSetup}
        onClose={() => setManualOpen(false)}
        onCreated={() => refresh()}
      />
    </div>
  );
}
