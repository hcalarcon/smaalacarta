// El cielo del tema Natural (WEB-VITRINA-16): cuatro momentos del día (amanecer, día, atardecer, noche) y
// una posición de 0 a 3 que los recorre. Arranca en el momento real del día y, al bajar por la carta,
// avanza hasta la noche. Todo puro, para probarlo sin navegador.

export const FASES = [
  { nombre: "amanecer", cielo1: "#6b7fb8", cielo2: "#f6b8a0", lejos: "#8f9fc0", media: "#4f6f6a", cerca: "#2c4a40", astro: "#ffd9a0" },
  { nombre: "dia", cielo1: "#3f86d1", cielo2: "#bfe3f5", lejos: "#8fb3c9", media: "#4f8a6a", cerca: "#2f6045", astro: "#fff3b0" },
  { nombre: "atardecer", cielo1: "#3b3a7a", cielo2: "#f58a4b", lejos: "#7a6a90", media: "#3f5a55", cerca: "#22382f", astro: "#ff9a52" },
  { nombre: "noche", cielo1: "#070b24", cielo2: "#1b2a4a", lejos: "#2a3558", media: "#1b2c3f", cerca: "#0e1c22", astro: "#eef2ff" },
];

const NOCHE = FASES.length - 1;

// Índice de la fase para una hora (0 a 23.99): 5-8 amanecer, 8-17 día, 17-20 atardecer, el resto noche.
export function faseInicial(hora) {
  if (hora >= 5 && hora < 8) return 0;
  if (hora >= 8 && hora < 17) return 1;
  if (hora >= 17 && hora < 20) return 2;
  return NOCHE;
}

const limitar = (valor, minimo, maximo) => Math.max(minimo, Math.min(maximo, valor));

// Posición en el recorrido: la fase de arranque con el scroll en 0 y la noche con el scroll al final.
export function posicion(fase, progreso) {
  return fase + limitar(progreso, 0, 1) * (NOCHE - fase);
}

function canales(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mezclar(a, b, t) {
  const [ra, ga, ba] = canales(a);
  const [rb, gb, bb] = canales(b);
  const mezcla = (x, y) => Math.round(x + (y - x) * t);
  return `#${[mezcla(ra, rb), mezcla(ga, gb), mezcla(ba, bb)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// Colores y posición del sol o la luna para una posición del recorrido.
export function paleta(pos) {
  const p = limitar(pos, 0, NOCHE);
  const desde = Math.min(Math.floor(p), NOCHE - 1);
  const t = p - desde;
  const a = FASES[desde];
  const b = FASES[desde + 1];
  const color = (clave) => mezclar(a[clave], b[clave], t);
  return {
    cielo1: color("cielo1"),
    cielo2: color("cielo2"),
    lejos: color("lejos"),
    media: color("media"),
    cerca: color("cerca"),
    astro: color("astro"),
    // Las estrellas salen en el último tramo, cuando ya es de noche.
    estrellas: limitar(p - 2, 0, 1),
    // El sol cruza el cielo en un arco del amanecer al atardecer (y se esconde tras las montañas); la luna
    // sale después, ya de noche. El salto de uno a otro pasa tapado por la cordillera.
    astroX: p <= 2 ? 10 + 40 * p : 25 + 25 * (p - 2),
    astroY: p <= 2 ? 80 - 66 * Math.sin((Math.PI * p) / 2) : 90 - 65 * (p - 2),
    luna: p > 2,
    // Se desvanece al bajar del horizonte, para que el salto de sol a luna no se vea nunca.
    astroOpacidad: limitar((82 - (p <= 2 ? 80 - 66 * Math.sin((Math.PI * p) / 2) : 90 - 65 * (p - 2))) / 10, 0, 1),
  };
}
