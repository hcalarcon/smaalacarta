// Cámara virtual del video demo: decide a dónde mira cada pantalla según los focos de pasos.json.
// Todo en píxeles de la grabación; nada acá toca disco ni el navegador, para poder probarlo.
export const FPS = 30;

export const redondear = (n, d = 3) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
export const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

/** Hacia abajo: la grabación nunca queda más corta que el tramo. */
export const aFrame = (segundos) => Math.floor(segundos * FPS + 1e-6) / FPS;

export function unirRects(rects) {
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Posición de la cámara dentro de un cuadro.
 * `frame`: ventana (fw x fh) sobre la grabación (sw x sh), todo en px de grabación.
 * `cam`: s = zoom (1 = la ventana entera), cx/cy = punto de la grabación que queda al centro.
 * La ventana nunca se sale de la grabación: no hay bordes vacíos.
 */
export function posicionCamara({ fw, fh, sw, sh }, { s, cx, cy }) {
  const vw = fw / s;
  const vh = fh / s;
  const ccx = limitar(cx, vw / 2, sw - vw / 2);
  const ccy = limitar(cy, vh / 2, sh - vh / 2);
  return { s: redondear(s, 4), x: redondear(fw / 2 - ccx * s, 2), y: redondear(fh / 2 - ccy * s, 2) };
}

/**
 * Zoom que deja el rectángulo ocupando `llenar` de la ventana, sin pasar de `escalaMax`
 * píxeles de pantalla por píxel de grabación (más que eso se ve borroso).
 * `k` = píxeles de pantalla por píxel de grabación con zoom 1.
 */
export function encuadrar({ fw, fh, k }, rect, { llenar = 0.8, escalaMax = 2.4, zoomMax = Infinity } = {}) {
  const porRect = Math.min((fw * llenar) / rect.w, (fh * llenar) / rect.h);
  const s = Math.max(1, Math.min(porRect, escalaMax / k, zoomMax));
  return { s, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 };
}

/**
 * Agrupa los focos que caen muy juntos (en tiempo de edición) para que la cámara no
 * rebote entre toques seguidos: cada grupo es una sola parada con el rectángulo unido.
 */
export function agruparFocos(focos, huecoMax) {
  const grupos = [];
  for (const f of [...focos].sort((a, b) => a.t - b.t)) {
    const ultimo = grupos.at(-1);
    if (ultimo && f.t - ultimo.fin < huecoMax) {
      ultimo.fin = f.t;
      ultimo.rects.push(f.rect);
    } else {
      grupos.push({ ini: f.t, fin: f.t, rects: [f.rect] });
    }
  }
  return grupos.map((g) => ({ ini: g.ini, fin: g.fin, rect: unirRects(g.rects) }));
}

/**
 * Movimientos de cámara de un tramo: [{ t, d, a }] con `a` = posición a la que llega.
 * Va al foco un poco antes del toque, lo sostiene y, si queda tiempo, se aleja a mostrar el contexto.
 * `focos`: [{ t (segundos desde el inicio del tramo), rect }].
 * `desde` (opcional): posición en la que ya está la cámara; sin él, arranca mostrando el contexto.
 * Devuelve también la posición inicial.
 */
export function planearCamara({ frame, k, focos, dur, mov = 0.5, adelanto = 0.35, sostener = 0.7, hueco = 1.3, vuelve = true, desde = null, llenar, escalaMax, zoomMax }) {
  const grupos = agruparFocos(focos, hueco);
  const encuadre = (rect) => posicionCamara(frame, encuadrar({ ...frame, k }, rect, { llenar, escalaMax, zoomMax }));
  const centroInicial = grupos.length
    ? { cx: grupos[0].rect.x + grupos[0].rect.w / 2, cy: grupos[0].rect.y + grupos[0].rect.h / 2 }
    : { cx: frame.sw / 2, cy: frame.sh * 0.4 };
  const contexto = (centro) => posicionCamara(frame, { s: 1, ...centro });
  const inicio = desde ?? contexto(centroInicial);
  const movimientos = [];
  let estado = inicio;
  let libre = 0;
  const mover = (desde, destino) => {
    const t = redondear(Math.max(libre, desde));
    const d = redondear(Math.min(mov, dur - t));
    if (d < 0.08 || (destino.s === estado.s && destino.x === estado.x && destino.y === estado.y)) return;
    movimientos.push({ t, d, de: estado, a: destino });
    estado = destino;
    libre = t + d;
  };

  grupos.forEach((g, i) => {
    const destino = encuadre(g.rect);
    mover(g.ini - adelanto - mov, destino);
    const salida = g.fin + sostener;
    const siguiente = grupos[i + 1];
    const hayHuecoLargo = !siguiente || siguiente.ini - adelanto - mov - salida > 1.2;
    if (vuelve && hayHuecoLargo && salida + mov * 0.8 < dur) {
      const centro = { cx: g.rect.x + g.rect.w / 2, cy: g.rect.y + g.rect.h / 2 };
      mover(salida, contexto(centro));
    }
  });
  return { inicio, movimientos };
}
