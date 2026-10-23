// El relieve del tema Natural (WEB-VITRINA-16): en vez de un dibujo fijo, las montañas, la nieve y los pinos
// se generan con ruido, así las crestas son irregulares como las de verdad. Todo puro y con semilla (el mismo
// número da siempre el mismo paisaje), para probarlo sin navegador.

export const ANCHO = 400;
export const ALTO_MONTANAS = 320;
export const ALTO_PINOS = 170;

// Generador de números al azar con semilla (mulberry32).
export function azar(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ruido de valores en una dimensión: x de 0 a 1, devuelve de 0 a 1.
function ruido(semilla, frecuencia) {
  const sorteo = azar(semilla);
  const valores = Array.from({ length: frecuencia + 2 }, () => sorteo());
  return (x) => {
    const p = x * frecuencia;
    const i = Math.floor(p);
    const f = p - i;
    const suave = f * f * (3 - 2 * f);
    return valores[i] * (1 - suave) + valores[i + 1] * suave;
  };
}

// Suma de ruidos de distinta escala. Con `afilada` cada capa se pliega y las cimas quedan en punta.
function fbm(semilla, octavas, afilada) {
  const capas = Array.from({ length: octavas }, (_, o) => ({ f: ruido(semilla + o * 101, 2 ** (o + 1)), peso: 0.5 ** o }));
  const total = capas.reduce((suma, c) => suma + c.peso, 0);
  return (x) =>
    capas.reduce((suma, c) => {
      const n = c.f(x);
      return suma + c.peso * (afilada ? 1 - Math.abs(2 * n - 1) : n);
    }, 0) / total;
}

const redondear = (n) => Number(n.toFixed(1));
const unir = (puntos) => puntos.map(([x, y]) => `${redondear(x)} ${redondear(y)}`).join("L");

// Puntos de una cresta de izquierda a derecha. `piso` y `techo` son la altura mínima y máxima (de 0 a 1 del alto).
export function cresta({ semilla, ancho = ANCHO, alto = ALTO_MONTANAS, piso = 0.3, techo = 0.9, octavas = 5, paso = 5, afilada = false }) {
  const altura = fbm(semilla, octavas, afilada);
  const puntos = [];
  for (let x = 0; x <= ancho; x += paso) {
    const h = piso + altura(x / ancho) * (techo - piso);
    puntos.push([x, alto * (1 - h)]);
  }
  if (puntos[puntos.length - 1][0] < ancho) puntos.push([ancho, puntos[puntos.length - 1][1]]);
  return puntos;
}

// La montaña llena, cerrada contra el borde de abajo.
export function caminoMontana(puntos, ancho = ANCHO, alto = ALTO_MONTANAS) {
  return `M0 ${alto}L${unir(puntos)}L${ancho} ${alto}Z`;
}

// La zona de arriba de la línea de nieve: se usa como recorte, así solo las cimas altas quedan blancas.
export function recorteNieve({ semilla, ancho = ANCHO, alto = ALTO_MONTANAS, nivel = 0.62, variacion = 0.12, paso = 6 }) {
  const ruidoLinea = fbm(semilla, 4, false);
  const linea = [];
  for (let x = 0; x <= ancho; x += paso) linea.push([x, alto * (1 - (nivel + (ruidoLinea(x / ancho) - 0.5) * variacion))]);
  return `M0 0L${ancho} 0L${unir(linea.reverse())}Z`;
}

// Un bosque de pinos con alturas y anchos distintos, parado sobre un suelo ondulado.
export function caminoPinos({ semilla, ancho = ANCHO, alto = ALTO_PINOS, cantidad = 46, minAlto = 38, maxAlto = 112 }) {
  const sorteo = azar(semilla);
  const suelo = sueloOndulado(semilla + 7, ancho, alto);
  const arboles = Array.from({ length: cantidad }, () => ({ x: sorteo() * ancho, h: minAlto + sorteo() ** 1.6 * (maxAlto - minAlto), d: 0.9 + sorteo() * 0.3 }));
  arboles.sort((a, b) => a.h - b.h);

  const piezas = arboles.map(({ x, h, d }) => {
    const base = alto - 6;
    const medio = h * 0.2 * d;
    const niveles = 4;
    const lado = [];
    for (let k = 1; k <= niveles; k += 1) {
      const y = base - h + (h * k) / niveles;
      const ancha = (medio * k) / niveles;
      lado.push([ancha, y - (h / niveles) * 0.15], [ancha * 0.55, y - (h / niveles) * 0.15]);
    }
    const derecha = lado.map(([a, y]) => [x + a, y]);
    const izquierda = [...lado].reverse().map(([a, y]) => [x - a, y]);
    return `M${redondear(x)} ${redondear(base - h)}L${unir(derecha)}L${redondear(x)} ${redondear(base)}L${unir(izquierda)}Z`;
  });
  return `${piezas.join("")}${caminoMontana(suelo, ancho, alto)}`;
}

function sueloOndulado(semilla, ancho, alto) {
  return cresta({ semilla, ancho, alto, piso: 0.08, techo: 0.2, octavas: 3, paso: 10 });
}

// Las tres capas del paisaje, listas para meter en un <svg viewBox="0 0 400 320"> (las dos primeras) y en uno
// de 400×170 (los pinos). Los colores salen de variables CSS, que el cielo va cambiando.
export function capasDelPaisaje(semilla = 2026) {
  const lejos = cresta({ semilla, piso: 0.36, techo: 0.98, octavas: 5, afilada: true });
  const media = cresta({ semilla: semilla + 11, piso: 0.18, techo: 0.58, octavas: 4 });
  const haze = (variable, mezcla) => `color-mix(in srgb, var(${variable}) ${mezcla}%, var(--c2))`;
  const gradiente = (id, arriba, abajo) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${arriba}"/><stop offset="1" style="stop-color:${abajo}"/></linearGradient>`;

  return {
    lejos: `<defs>${gradiente("g-lejos", "color-mix(in srgb, var(--lejos) 78%, #fff)", haze("--lejos", 60))}<clipPath id="c-nieve"><path d="${recorteNieve({ semilla: semilla + 3 })}"/></clipPath></defs>
      <path d="${caminoMontana(lejos)}" fill="url(#g-lejos)"/>
      <path d="${caminoMontana(lejos)}" clip-path="url(#c-nieve)" style="fill:color-mix(in srgb, #fff 72%, var(--lejos))"/>`,
    media: `<defs>${gradiente("g-media", "var(--media)", haze("--media", 62))}</defs><path d="${caminoMontana(media)}" fill="url(#g-media)"/>`,
    cerca: `<path d="${caminoPinos({ semilla: semilla + 29 })}" fill="var(--cerca)"/>`,
  };
}
