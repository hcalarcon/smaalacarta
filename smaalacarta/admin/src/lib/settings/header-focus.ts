// Punto de enfoque de la imagen de cabecera (ADMIN-CONFIG-25 a 27): dos enteros de 0 a 100,
// el `background-position` con el que el menú muestra la imagen. 50 y 50 es el centro.

export type Focus = { x: number; y: number };
export type Size = { w: number; h: number };

export const CENTER = 50;

export const isFocus = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;

// Entero de 0 a 100: redondea y acota; lo que no es un número vuelve al centro.
export function normalizeFocus(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return CENTER;
  return Math.min(100, Math.max(0, Math.round(value)));
}

// Mueve el punto al arrastrar la imagen `delta` píxeles dentro de la cabecera. La imagen cubre la
// cabecera (`cover`): sobra `overflow` píxeles en un eje y arrastrarla todo lo que sobra recorre
// los 100 puntos, al revés (la imagen va a la derecha, el punto a la izquierda). Un eje donde no
// sobra nada no se mueve.
export function dragFocus(start: Focus, delta: Focus, viewport: Size, image: Size): Focus {
  if (!(viewport.w > 0 && viewport.h > 0 && image.w > 0 && image.h > 0)) return start;

  const scale = Math.max(viewport.w / image.w, viewport.h / image.h);
  const overflowX = image.w * scale - viewport.w;
  const overflowY = image.h * scale - viewport.h;

  const move = (from: number, by: number, overflow: number) =>
    overflow > 0.5 ? normalizeFocus(from - (by / overflow) * 100) : from;

  return { x: move(start.x, delta.x, overflowX), y: move(start.y, delta.y, overflowY) };
}

const STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

// Flechas del teclado: 2 puntos, o 10 con Mayús. Null si la tecla no es una flecha.
export function nudgeFocus(focus: Focus, key: string, big: boolean): Focus | null {
  const step = STEPS[key];
  if (!step) return null;

  const size = big ? 10 : 2;
  return {
    x: normalizeFocus(focus.x + step[0] * size),
    y: normalizeFocus(focus.y + step[1] * size),
  };
}
