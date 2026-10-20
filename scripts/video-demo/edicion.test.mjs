// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  argsFfmpeg,
  armarSegmentos,
  bitrateParaPeso,
  elementosTemporales,
  etiquetaVelocidad,
  filtroPantallaHorizontal,
  filtroTramo,
  rellenarPlantilla,
} from "./edicion.mjs";

const plan = JSON.parse(readFileSync(new URL("../../video-demo/edicion/plan.json", import.meta.url), "utf8"));

// Duraciones reales de una grabación completa; cada video arranca un poco distinto.
const DURACIONES = [
  ["paneles", 5.578], ["menu-abre", 14.848], ["menu-categorias", 7.965], ["producto-opciones", 8.001],
  ["producto-2", 4.817], ["producto-3", 4.846], ["carrito", 3.734], ["checkout", 21.112], ["confirma", 2.094],
  ["recibido", 3.916], ["local-recibe", 12.32], ["local-acepta", 16.624], ["repartidor-ve", 1.873],
  ["repartidor-toma", 12.915], ["local-prepara", 15.925], ["local-listo", 14.822], ["local-entrega", 15.2],
  ["repartidor-en-camino", 15.815], ["repartidor-entrega", 13.203], ["fin", 3.511],
];
const DESFASE = { cliente: 1.064, repartidor: 0.462, local: 0.243 };

function pasosDeEjemplo() {
  let reloj = 0;
  const pasos = DURACIONES.map(([id, dur], i) => {
    const inicio = reloj;
    reloj += dur;
    const videos = {};
    for (const [pantalla, base] of Object.entries(DESFASE)) videos[pantalla] = { inicio: base + inicio, fin: base + reloj };
    return { n: i + 1, id, texto: `Paso ${id}`, videos };
  });
  return { completo: true, pasos };
}
const TOTAL_ORIGEN = DURACIONES.reduce((suma, [, d]) => suma + d, 0) + DESFASE.cliente;

describe("armarSegmentos", () => {
  it("el horizontal entra en el límite y el vertical en su rango", () => {
    const h = armarSegmentos(plan, pasosDeEjemplo(), "h");
    const v = armarSegmentos(plan, pasosDeEjemplo(), "v");
    expect(h.duracion).toBeLessThanOrEqual(plan.limites.h);
    expect(v.duracion).toBeGreaterThanOrEqual(plan.limites.vMin);
    expect(v.duracion).toBeLessThanOrEqual(plan.limites.vMax);
  });

  it("los tramos van en orden, sin huecos, entre la intro y el cierre", () => {
    for (const formato of ["h", "v"]) {
      const t = armarSegmentos(plan, pasosDeEjemplo(), formato);
      let reloj = plan.intro.dur;
      for (const s of t.segmentos) {
        expect(s.inicio).toBeCloseTo(reloj, 2);
        reloj += s.dur;
      }
      expect(t.cierre.inicio).toBeCloseTo(reloj, 2);
      expect(t.cierre.dur).toBe(plan.cierre.dur);
    }
  });

  it("cada tramo mira un trozo válido de cada grabación", () => {
    const t = armarSegmentos(plan, pasosDeEjemplo(), "h");
    for (const s of t.segmentos) {
      for (const f of Object.values(s.fuentes)) {
        expect(f.desde).toBeGreaterThanOrEqual(0);
        expect(f.hasta).toBeGreaterThan(f.desde);
        expect(f.hasta).toBeLessThanOrEqual(TOTAL_ORIGEN + 1);
      }
      expect(s.fuentes.cliente.hasta - s.fuentes.cliente.desde).toBeCloseTo(s.dur * s.velocidad, 1);
    }
  });

  it("marca todo lo acelerado y no marca lo que va a velocidad real", () => {
    const t = armarSegmentos(plan, pasosDeEjemplo(), "h");
    for (const s of t.segmentos) {
      expect(Boolean(s.etiqueta)).toBe(s.velocidad >= 1.5);
    }
    expect(etiquetaVelocidad(1)).toBeNull();
    expect(etiquetaVelocidad(4)).toBe("×4");
    expect(etiquetaVelocidad(1.5)).toBe("×1,5");
  });

  it("la espera de la preparación y del viaje lleva su nota de tiempo", () => {
    const t = armarSegmentos(plan, pasosDeEjemplo(), "v");
    const conNota = t.segmentos.filter((s) => s.nota).map((s) => s.ids[0]);
    expect(conNota).toEqual(["local-prepara", "repartidor-en-camino"]);
  });

  it("el subtítulo es corto y siempre hay uno por tramo", () => {
    for (const formato of ["h", "v"]) {
      for (const s of armarSegmentos(plan, pasosDeEjemplo(), formato).segmentos) {
        expect(s.subtitulo.length).toBeGreaterThan(0);
        expect(s.subtitulo.length).toBeLessThanOrEqual(55);
      }
    }
  });

  it("en vertical, cuando actúa el local siempre hay recorte hacia la tarjeta", () => {
    const t = armarSegmentos(plan, pasosDeEjemplo(), "v");
    const locales = t.segmentos.filter((s) => s.actor === "local");
    expect(locales.length).toBeGreaterThan(0);
    for (const s of locales) expect(s.crop).toBeTruthy();
  });

  it("falla con un mensaje claro si el plan nombra un paso que no existe", () => {
    const pasos = pasosDeEjemplo();
    pasos.pasos = pasos.pasos.filter((p) => p.id !== "carrito");
    expect(() => armarSegmentos(plan, pasos, "h")).toThrow("«carrito»");
  });

  it("falla si la grabación trae un paso que el plan no cubre", () => {
    const pasos = pasosDeEjemplo();
    pasos.pasos.push({ n: 21, id: "paso-nuevo", texto: "x", videos: pasos.pasos[0].videos });
    expect(() => armarSegmentos(plan, pasos, "h")).toThrow("paso-nuevo");
  });
});

describe("ffmpeg", () => {
  it("el crop deslizante se ancla al inicio del paso en la grabación del local", () => {
    const t = armarSegmentos(plan, pasosDeEjemplo(), "v");
    const s = t.segmentos.find((x) => x.ids[0] === "local-listo");
    const filtro = filtroTramo(s, "local", { w: 900, h: 1230 });
    const inicioPaso = DESFASE.local + DURACIONES.slice(0, 15).reduce((suma, [, d]) => suma + d, 0);
    expect(filtro).toContain(`clip((t-${(inicioPaso + 4.6).toFixed(3).replace(/0+$/, "")})/0.8,0,1)`);
    expect(filtro).toMatch(/^trim=.*,crop=.*,setpts=\(PTS-STARTPTS\)\/6,/);
  });

  it("el horizontal pega todos los tramos en un solo video por pantalla", () => {
    const t = armarSegmentos(plan, pasosDeEjemplo(), "h");
    const filtro = filtroPantallaHorizontal(t.segmentos, "cliente", { w: 340, h: 736 });
    expect(filtro).toContain(`concat=n=${t.segmentos.length}:v=1:a=0[salida]`);
    expect(argsFfmpeg("a.mp4", filtro, "b.mp4")).toContain("-an");
  });

  it("el bitrate deja el archivo debajo de 16 MB", () => {
    for (const dur of [55, 74, 90]) expect((bitrateParaPeso(dur) * dur) / 8).toBeLessThan(16_000_000);
  });
});

describe("plantilla", () => {
  it("escapa el texto del subtítulo", () => {
    const t = armarSegmentos(plan, pasosDeEjemplo(), "h");
    t.segmentos[0].subtitulo = '<b>"hola"</b>';
    expect(elementosTemporales(t).subtitulos).toContain("&lt;b&gt;&quot;hola&quot;&lt;/b&gt;");
  });

  it("falla si falta un valor en lugar de dejar el hueco", () => {
    expect(() => rellenarPlantilla("{{UNO}} {{DOS}}", { UNO: "1" })).toThrow("{{DOS}}");
  });
});
