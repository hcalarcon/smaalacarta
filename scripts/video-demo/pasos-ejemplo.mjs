// Datos de ejemplo para los tests de la edición: el plan real y los pasos de una grabación completa.
import { readFileSync } from "node:fs";

import { tamanosFuente } from "./edicion.mjs";

export const plan = JSON.parse(readFileSync(new URL("../../video-demo/edicion/plan.json", import.meta.url), "utf8"));

// Cada pantalla arranca un poco distinta, como en la real.
const DURACIONES = [
  ["paneles", 1.8], ["menu-abre", 11.3], ["menu-categorias", 7.3], ["producto-opciones", 8.4], ["producto-2", 4.7],
  ["producto-3", 4.8], ["carrito", 4], ["checkout", 22], ["confirma", 2.2], ["recibido", 4.5], ["local-recibe", 11.2],
  ["local-acepta", 35.1], ["repartidor-ve", 2.5], ["repartidor-toma", 11.2], ["local-prepara", 15.8], ["local-listo", 15.3],
  ["local-entrega", 15.4], ["repartidor-en-camino", 16.2], ["repartidor-entrega", 12.8], ["fin", 13],
];
export const DESFASE = { cliente: 10.975, repartidor: 10.862, local: 10.763 };

export function pasosDeEjemplo(focos = {}) {
  let reloj = 0;
  const pasos = DURACIONES.map(([id, dur], i) => {
    const inicio = reloj;
    reloj += dur;
    const videos = {};
    for (const [pantalla, base] of Object.entries(DESFASE)) videos[pantalla] = { inicio: base + inicio, fin: base + reloj };
    return { n: i + 1, id, texto: id, focos: focos[id] ?? [], videos };
  });
  return { completo: true, resolucion: { videos: { cliente: "780x1688", repartidor: "780x1688", local: "2560x1600" } }, pasos };
}

export const FUENTES = tamanosFuente(pasosDeEjemplo());
export const TOTAL = Object.fromEntries(Object.entries(DESFASE).map(([p, base]) => [p, base + DURACIONES.reduce((s, [, d]) => s + d, 0) + 3]));
