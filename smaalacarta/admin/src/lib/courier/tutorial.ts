import type { AvailableOrder, CourierPanelOrder } from "@/lib/courier/panel";

// Tutorial interactivo del repartidor (ENVIO-212 a 218). Reglas puras: qué pasos hay, qué dice cada uno, qué
// pedido de práctica se muestra en cada paso. El navegador solo pinta; nada de acá habla con el servidor.

export type TutorialMode = "fixed" | "offers";

export type TutorialStatus = {
  seen: boolean;
  mode: TutorialMode;
  // Precio de lista de una zona real, para que el pedido de práctica muestre un monto verosímil.
  zonePrice: number | null;
};

// Lo que dice `courier_tutorial_status()`. Ante datos raros dice que ya lo vio: no se abre un tutorial que la base
// no confirmó que falta.
export function statusFromRow(row: unknown): TutorialStatus {
  const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
  const price = r.zone_price == null ? Number.NaN : Number(r.zone_price);

  return {
    seen: r.seen !== false,
    mode: r.mode === "offers" ? "offers" : "fixed",
    zonePrice: Number.isFinite(price) && price >= 0 ? price : null,
  };
}

export type TutorialStepId =
  | "welcome"
  | "available"
  | "zones"
  | "practice"
  | "take"
  | "in_progress"
  | "on_the_way"
  | "delivered"
  | "settlements"
  | "done";

export type TutorialStep = {
  id: TutorialStepId;
  // Valor de `data-tour` del elemento que señala; sin él, la burbuja va al centro.
  target: string | null;
  // El elemento existe siempre (barra, interruptor). Si no está, el paso se saltea. Los del pedido de práctica
  // aparecen recién al llegar al paso, así que no se descartan de antemano.
  fixedTarget: boolean;
  text: string;
  // El paso espera que el repartidor toque el botón real del pedido de práctica; no tiene "Siguiente".
  waitsForTap: boolean;
  // Dónde prefiere la burbuja: la barra de abajo la manda arriba.
  side: "top" | "bottom";
  // Texto del botón principal en los pasos que no son "Siguiente".
  action?: string;
};

export const TUTORIAL_SKIP_LABEL = "Saltear";

const TAKE_TEXT: Record<TutorialMode, string> = {
  fixed: "Tocá Tomar para quedártelo.",
  offers: "Podés ofertar con el precio de lista u otro precio con un motivo. El cliente elige.",
};

export function tutorialSteps(mode: TutorialMode): TutorialStep[] {
  return [
    {
      id: "welcome",
      target: null,
      fixedTarget: false,
      text: "Te mostramos cómo funciona en 1 minuto. Vamos a usar un pedido de práctica, no es real.",
      waitsForTap: false,
      side: "bottom",
      action: "Empezar",
    },
    {
      id: "available",
      target: "available",
      fixedTarget: true,
      text: "Prendelo cuando estés para salir. Así te llegan los avisos de pedidos nuevos. Se apaga solo si pasan 4 horas sin actividad.",
      waitsForTap: false,
      side: "bottom",
    },
    {
      id: "zones",
      target: "zones",
      fixedTarget: true,
      text: "Acá elegís qué zonas cubrís. Solo ves pedidos de esas zonas.",
      waitsForTap: false,
      side: "top",
    },
    {
      id: "practice",
      target: "practice-available",
      fixedTarget: false,
      text: "Así te llega un pedido: local, zona, precio del envío y si se paga al retirar.",
      waitsForTap: false,
      side: "bottom",
    },
    {
      id: "take",
      target: "take",
      fixedTarget: false,
      text: TAKE_TEXT[mode],
      waitsForTap: true,
      side: "bottom",
    },
    {
      id: "in_progress",
      target: "practice-in-progress",
      fixedTarget: false,
      text: "Ya es tuyo. Acá ves la hora a la que está listo y la dirección.",
      waitsForTap: false,
      side: "bottom",
    },
    {
      id: "on_the_way",
      target: "advance",
      fixedTarget: false,
      text: "Cuando lo retirás del local, tocá En camino. El cliente te sigue en vivo.",
      waitsForTap: true,
      side: "top",
    },
    {
      id: "delivered",
      target: "advance",
      fixedTarget: false,
      text: "Al entregarlo, tocá Entregado.",
      waitsForTap: true,
      side: "top",
    },
    {
      id: "settlements",
      target: "settlements",
      fixedTarget: true,
      text: "Si cobraste en efectivo, acá ves lo que tenés que rendirle al local.",
      waitsForTap: false,
      side: "top",
    },
    {
      id: "done",
      target: null,
      fixedTarget: false,
      text: "¡Listo! Si te olvidás de algo, tocá ¿Cómo funciona? en tu perfil.",
      waitsForTap: false,
      side: "bottom",
      action: "Empezar",
    },
  ];
}

// Los pasos que quedan: se descartan los que señalan algo fijo que no está en pantalla (el interruptor con la
// disponibilidad apagada, por ejemplo). `exists` recibe el nombre del `data-tour`.
export function visibleSteps(steps: TutorialStep[], exists: (target: string) => boolean): TutorialStep[] {
  return steps.filter((step) => !step.fixedTarget || (step.target !== null && exists(step.target)));
}

// ---------------------------------------------------------------------------
// Pedido de práctica
// ---------------------------------------------------------------------------

export const PRACTICE_ID = "tutorial-practice-order";
export const PRACTICE_LABEL = "PRÁCTICA";

// Si la base no trae ningún precio de zona.
const FALLBACK_PRICE = 1500;

export type PracticePhase = "available" | "taken" | "on_the_way";

// Qué versión del pedido de práctica se ve en cada paso. Fuera de estos pasos no se muestra. Tocar el botón del
// pedido solo pasa al paso siguiente: el estado del tutorial es el único que manda.
const PHASE_BY_STEP: Partial<Record<TutorialStepId, PracticePhase>> = {
  practice: "available",
  take: "available",
  in_progress: "taken",
  on_the_way: "taken",
  delivered: "on_the_way",
};

export function practicePhase(step: TutorialStepId | null): PracticePhase | null {
  return (step && PHASE_BY_STEP[step]) || null;
}

const BUSINESS = "Local de práctica";

// Como lo ve el repartidor en Disponibles (ENVIO-153): la misma forma que `courier_available_orders()`.
export function practiceAvailable(mode: TutorialMode, zonePrice: number | null, now: Date): AvailableOrder {
  const price = zonePrice ?? FALLBACK_PRICE;
  const created = new Date(now.getTime() - 60_000).toISOString();

  return {
    id: PRACTICE_ID,
    numero: PRACTICE_LABEL,
    estado: "confirmed",
    creado: created,
    ofrecido_el: created,
    listo_a: new Date(now.getTime() + 25 * 60_000).toISOString(),
    demora_min: 25,
    programado: null,
    anticipado: false,
    negocio: { nombre: BUSINESS, direccion: "San Martín 123" },
    total: 8500,
    pago: "efectivo",
    pago_estado: "pending",
    envio: { zona: "Centro", precio_lista: price },
    modo: mode,
    ofertas: 0,
    mi_oferta: null,
    resultado: null,
    cerrado_el: null,
  };
}

// Ya tomado: lo que muestra "Mis envíos en curso". `handed_to_courier` ofrece En camino y `on_the_way`, Entregado,
// con las mismas reglas de un pedido real (`availableActions`).
export function practiceTaken(
  phase: Exclude<PracticePhase, "available">,
  zonePrice: number | null,
  now: Date,
): CourierPanelOrder {
  const price = zonePrice ?? FALLBACK_PRICE;

  return {
    id: PRACTICE_ID,
    numero: PRACTICE_LABEL,
    estado: phase === "taken" ? "handed_to_courier" : "on_the_way",
    creado: new Date(now.getTime() - 5 * 60_000).toISOString(),
    programado: null,
    anticipado: false,
    negocio: { nombre: BUSINESS, direccion: "San Martín 123", whatsapp: null },
    cliente: { nombre: "Cliente de práctica", telefono: null, direccion: "Calle Ejemplo 456" },
    total: 8500,
    pago: "efectivo",
    pago_estado: "pending",
    notas: null,
    items: [{ nombre: "Pizza de práctica", cantidad: 1, precio: 8500, opciones: null }],
    envio: {
      zona: "Centro",
      precio_lista: price,
      precio: price,
      motivo_cambio: null,
      cambiado_el: null,
      estado: "accepted",
      nota: null,
      consultado_el: null,
      respondido_el: null,
    },
    tiempos: {
      listo_a: new Date(now.getTime() + 20 * 60_000).toISOString(),
      demora_min: 25,
      listo_antes: null,
      llega_local_a: null,
      llega_cliente_a: null,
    },
    rendicion: { rendido_el: null, recibido_el: null },
  };
}
