// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ACTORES, DUR_PASE, marcoCamara, tiemposCartel } from "./dispositivos.mjs";
import { armarTomas, validarFuentes } from "./edicion.mjs";
import { ZONAS, dispositivosVertical, guionVertical, panelesHtml, pasesDe, textosVerticalHtml } from "./explicativo-v.mjs";
import { FUENTES, TOTAL, pasosDeEjemplo, plan } from "./pasos-ejemplo.mjs";
import { IDEA, ZONAS_REDES, armarRedes, disposicionRedes, escenasHtml, guionRedes, pasesRedes, textosRedesHtml } from "./redes.mjs";

// Segundo, en el reloj de la grabación del cliente, en que el seguimiento pasa a «Entregado» (medido cuadro a cuadro).
const ENTREGADO_EN = 225.65;
const FIN_INICIO = 217.402;

describe("explicativo vertical", () => {
  const tomas = () => armarTomas(plan, pasosDeEjemplo(), "v");
  const guion = () => guionVertical(plan, tomas(), FUENTES);

  it("el cliente y el repartidor van en un marco de celular y el local en uno de tableta, dentro de la zona de la app", () => {
    const disp = dispositivosVertical(FUENTES);
    expect(disp.cliente.geo.tipo).toBe("celular");
    expect(disp.repartidor.geo.tipo).toBe("celular");
    expect(disp.local.geo.tipo).toBe("tableta");
    for (const { geo, izq, arriba } of Object.values(disp)) {
      expect(izq).toBeGreaterThanOrEqual(0);
      expect(izq + geo.ancho).toBeLessThanOrEqual(1080);
      expect(arriba).toBeGreaterThanOrEqual(ZONAS.area.top);
      expect(arriba + geo.alto).toBeLessThanOrEqual(ZONAS.area.top + ZONAS.area.alto);
    }
  });

  it("la zona de títulos queda debajo de los dispositivos y de la nota", () => {
    for (const { geo, arriba } of Object.values(dispositivosVertical(FUENTES))) expect(arriba + geo.alto).toBeLessThan(ZONAS.nota.top);
    expect(ZONAS.nota.top).toBeLessThan(ZONAS.titulo.top);
    expect(ZONAS.titulo.top + ZONAS.titulo.alto).toBeLessThanOrEqual(1920);
  });

  it("la pastilla de quién habla tiene ícono, nombre y color propios por actor, y siempre el mismo lugar", () => {
    expect(ACTORES.cliente).toMatchObject({ icono: "📱", nombre: "Cliente", color: "#d97706" });
    expect(ACTORES.local).toMatchObject({ icono: "🏪", nombre: "Tu local", color: "#047857" });
    expect(ACTORES.repartidor.icono).toBe("🛵");
    expect(new Set(Object.values(ACTORES).map((a) => a.color)).size).toBe(3);
    const { pastillas } = textosVerticalHtml(plan, tomas(), FUENTES);
    const tops = [...pastillas.matchAll(/class="pastilla"[^>]*style="top:(\d+)px"/g)].map((m) => m[1]);
    expect(tops).toHaveLength(3);
    expect(new Set(tops).size).toBe(1);
  });

  it("cuando la acción pasa a otro actor hay un pase de 0,4 a 0,6 s: el que sale se va y el que llega entra", () => {
    const t = tomas();
    const pases = pasesDe(t.tomas);
    expect(pases.filter(Boolean).length).toBeGreaterThanOrEqual(5);
    expect(DUR_PASE).toBeGreaterThanOrEqual(0.4);
    expect(DUR_PASE).toBeLessThanOrEqual(0.6);
    const g = guion();
    t.tomas.forEach((toma, i) => {
      if (!pases[i]) return;
      const viaje = g.filter((x) => x.s === `#viaje-${i}` && x.d > 0.1);
      expect(viaje).toHaveLength(1);
      expect(viaje[0].d).toBeGreaterThanOrEqual(0.4);
      expect(viaje[0].d).toBeLessThanOrEqual(0.6);
      expect(g.some((x) => x.s === `#disp-${t.tomas[i - 1].actor}` && x.a.opacity === 0 && x.t < toma.inicio)).toBe(true);
      expect(g.some((x) => x.s === `#disp-${toma.actor}` && x.de?.opacity === 0 && x.a.opacity === 1 && x.t >= toma.inicio)).toBe(true);
    });
  });

  it("los títulos aparecen enteros, por palabra y en menos de 0,3 s", () => {
    for (let n = 1; n <= 14; n++) expect(tiemposCartel(n).total).toBeLessThan(0.3);
    const t = tomas();
    expect(textosVerticalHtml(plan, t, FUENTES).subtitulos).toContain('<span class="w">');
    const g = guion();
    t.tomas.forEach((toma, i) => {
      const anim = g.find((x) => x.s === `#sub-${i} .w` && x.d);
      expect(anim.d + (anim.escalonado ?? 0) * (toma.subtitulo.split(" ").length - 1)).toBeLessThan(0.3);
      expect(g.some((x) => x.s === `#sub-${i} .w` && x.t === 0 && x.a.opacity === 0 && !x.d)).toBe(true);
    });
  });

  it("el zoom del local deja el foco entero con 12 % de margen por lado, o se aleja si no entra", () => {
    const t = tomas();
    const g = guion();
    const marco = marcoCamara(dispositivosVertical(FUENTES).local.geo);
    const conFoco = t.tomas.filter((x) => x.actor === "local" && x.focos.local.length);
    expect(conFoco.length).toBeGreaterThan(3);
    for (const toma of conFoco) {
      const movimientos = g.filter((x) => x.s === "#cam-local" && x.t < toma.inicio + toma.dur);
      const { x, y, scale } = movimientos.at(-1).a;
      const izq = -x / scale;
      const arriba = -y / scale;
      const ancho = marco.fw / scale;
      const alto = marco.fh / scale;
      const { rect } = toma.focos.local[0];
      expect(rect.x).toBeGreaterThanOrEqual(izq - 1);
      expect(rect.y).toBeGreaterThanOrEqual(arriba - 1);
      expect(rect.x + rect.w).toBeLessThanOrEqual(izq + ancho + 1);
      expect(rect.y + rect.h).toBeLessThanOrEqual(arriba + alto + 1);
      if (scale > 1.001) {
        expect(rect.w / ancho).toBeLessThanOrEqual(0.761);
        expect(rect.h / alto).toBeLessThanOrEqual(0.761);
      }
    }
  });

  it("ningún foco del local queda cortado por la ventana de la tableta", () => {
    const { ventana } = dispositivosVertical(FUENTES).local.geo;
    const rects = [...plan.explicativo.v, ...plan.redes.ideas.flatMap((e) => e.paneles.flatMap((pn) => pn.cortes))].flatMap((x) => [x.rect, ...(x.focos?.local ?? []).map((f) => f.rect)]).filter(Boolean);
    expect(rects.length).toBeGreaterThan(5);
    for (const r of rects) expect(r.w).toBeLessThanOrEqual(ventana.fw);
    for (const t of tomas().tomas.filter((x) => x.actor === "local")) for (const f of t.focos.local) expect(f.rect.w).toBeLessThanOrEqual(ventana.fw);
  });

  it("«Se lo entregás al repartidor» encuadra la tarjeta del pedido, no el panel entero", () => {
    const toma = tomas().tomas.find((x) => x.id === "entrega");
    expect(toma.focos.local[0].rect.w).toBeLessThan(FUENTES.local.sw / 3);
    const { scale } = guion().filter((x) => x.s === "#cam-local" && x.t < toma.inicio + toma.dur).at(-1).a;
    expect(scale).toBeGreaterThan(1.3);
  });

  it("el final muestra el seguimiento real en «Entregado» y el festejo va por encima", () => {
    const t = tomas();
    const def = plan.explicativo.v.at(-1);
    const fin = t.tomas.at(-1);
    expect(fin.actor).toBe("cliente");
    // La grabación pasa a «Entregado» a los ENTREGADO_EN s: el festejo y la barra de estados lo siguen.
    expect(FIN_INICIO + def.desde + fin.celebra).toBeCloseTo(ENTREGADO_EN, 1);
    expect(fin.estado).toEqual({ idx: 5, en: fin.celebra });
    expect(def.desde + def.fuente).toBeGreaterThan(ENTREGADO_EN - FIN_INICIO);
    expect(textosVerticalHtml(plan, t, FUENTES).festejos).toContain('class="check"');
    expect(panelesHtml(t, FUENTES)).toContain(`id="v-cliente-${t.tomas.length - 1}"`);
  });

  it("todo movimiento arranca desde el valor donde terminó el anterior (el render no depende del orden)", () => {
    const ultimo = {};
    for (const x of guion()) {
      if (!/^#(cam|est)-/.test(x.s)) continue;
      if (!x.d) {
        for (const [prop, valor] of Object.entries(x.a)) ultimo[`${x.s}|${prop}`] = { fin: x.t, valor };
        continue;
      }
      for (const [prop, valor] of Object.entries(x.de)) {
        const clave = `${x.s}|${prop}`;
        if (clave in ultimo && x.t >= ultimo[clave].fin - 1e-6 && typeof valor === "number") expect(valor, `${clave} en ${x.t}`).toBeCloseTo(ultimo[clave].valor, 3);
      }
      for (const [prop, valor] of Object.entries(x.a)) ultimo[`${x.s}|${prop}`] = { fin: x.t + x.d, valor };
    }
  });

  it("las grabaciones alcanzan para todos los tramos del vertical", () => {
    validarFuentes(tomas().tomas.map((x) => ({ ...x, fuentes: { [x.actor]: x.fuentes[x.actor] } })), TOTAL);
  });
});

describe("redes", () => {
  const redes = () => armarRedes(plan, pasosDeEjemplo(), FUENTES);

  it("dura de 30 a 35 s y todos los cortes caen en la grilla de 0,5 s", () => {
    const t = redes();
    expect(plan.limites.redes).toEqual([30, 35]);
    expect(t.duracion).toBeGreaterThanOrEqual(30);
    expect(t.duracion).toBeLessThanOrEqual(35);
    for (const corte of t.cortes) expect(corte / 0.5).toBeCloseTo(Math.round(corte / 0.5), 6);
  });

  it("sigue el orden fijo: gancho, elige, confirma, te suena, aceptás, repartidor, listo, seguimiento y entregado", () => {
    expect(redes().ideas.map((e) => e.id)).toEqual(["gancho", "menu", "platos", "confirma", "suena", "acepta", "aparece", "toma", "listo", "camino", "vivo", "entregado"]);
  });

  it("cada idea dura de 1,5 a 2,5 s, una sola a la vez, y los cortes suman lo que ella dura", () => {
    const t = redes();
    let reloj = 0;
    for (const e of t.ideas) {
      expect(e.dur).toBeGreaterThanOrEqual(IDEA.min);
      expect(e.dur).toBeLessThanOrEqual(IDEA.max);
      expect(e.inicio).toBeCloseTo(reloj, 6);
      reloj += e.dur;
      for (const pn of e.paneles) expect(pn.cortes.reduce((suma, c) => suma + c.dur, 0)).toBeCloseTo(e.dur, 6);
    }
    expect(t.cierre.inicio).toBeCloseTo(reloj, 6);
  });

  it("frena si una idea se sale de 1,5 a 2,5 s", () => {
    const largo = structuredClone(plan);
    largo.redes.ideas[1].dur = 3;
    expect(() => armarRedes(largo, pasosDeEjemplo(), FUENTES)).toThrow(/1,5 a 2,5/);
  });

  it("el gancho abre con el aviso del local, entra de golpe con zoom y trae el texto pedido", () => {
    const t = redes();
    expect(t.ideas[0].paneles[0].pantalla).toBe("local");
    expect(t.ideas[0].titulo).toBe("Así le llega un pedido a tu local 👇");
    expect(guionRedes(plan, t).some((g) => g.s === "#esc-0" && g.de?.scale > 1)).toBe(true);
  });

  it("al sonarle al local es una pantalla partida: la tableta arriba y el celular abajo", () => {
    const e = redes().ideas.find((x) => x.split);
    expect(e.paneles.map((p) => p.pantalla).sort()).toEqual(["cliente", "local"]);
    const local = e.paneles.find((p) => p.pantalla === "local");
    const cliente = e.paneles.find((p) => p.pantalla === "cliente");
    expect(local.arriba + local.geo.alto).toBeLessThanOrEqual(cliente.arriba);
    expect(e.llegada).toBeGreaterThan(0);
    expect(e.clave).toBe("cliente+local");
  });

  it("hay cortes rápidos dentro de una idea y, entre ideas de distinto actor, el pase de 0,4 a 0,6 s", () => {
    const t = redes();
    expect(t.ideas.some((e) => e.paneles.some((pn) => pn.cortes.length > 1))).toBe(true);
    const pases = pasesRedes(t);
    expect(pases.filter(Boolean).length).toBeGreaterThanOrEqual(4);
    const g = guionRedes(plan, t);
    pases.forEach((pase, i) => {
      if (!pase) return;
      const viaje = g.filter((x) => x.s === `#viaje-${i}` && x.d > 0.1);
      expect(viaje).toHaveLength(1);
      expect(viaje[0].d).toBeGreaterThanOrEqual(0.4);
      expect(viaje[0].d).toBeLessThanOrEqual(0.6);
    });
  });

  it("los títulos viven en una zona fija sobre la app y aparecen enteros, por palabra, en menos de 0,3 s", () => {
    const t = redes();
    expect(ZONAS_REDES.pastilla.top).toBeLessThan(ZONAS_REDES.titulo.top);
    expect(ZONAS_REDES.titulo.top + ZONAS_REDES.titulo.alto).toBeLessThanOrEqual(ZONAS_REDES.area.top);
    for (const e of t.ideas) {
      for (const pn of disposicionRedes({ split: e.split, paneles: e.paneles }, FUENTES)) {
        expect(pn.arriba).toBeGreaterThanOrEqual(ZONAS_REDES.area.top);
        expect(pn.arriba + pn.geo.alto).toBeLessThanOrEqual(ZONAS_REDES.area.top + ZONAS_REDES.area.alto);
      }
    }
    const g = guionRedes(plan, t);
    t.ideas.forEach((e, i) => {
      const anim = g.find((x) => x.s === `#titulo-${i} .w` && x.d);
      expect(anim.d + (anim.escalonado ?? 0) * (e.titulo.split(" ").length - 1)).toBeLessThan(0.3);
      expect(g.some((x) => x.s === `#titulo-${i} .w` && x.t === 0 && x.a.opacity === 0 && !x.d)).toBe(true);
    });
    expect(textosRedesHtml(t).TITULOS).toContain('<span class="w">');
  });

  it("el final es el seguimiento real en «Entregado» con el festejo por encima", () => {
    const t = redes();
    const e = t.ideas.at(-1);
    const corte = plan.redes.ideas.at(-1).paneles[0].cortes[0];
    expect(e.paneles[0].pantalla).toBe("cliente");
    expect(FIN_INICIO + corte.desde + e.celebra).toBeCloseTo(ENTREGADO_EN, 1);
    expect(escenasHtml(t)).toContain('class="check"');
  });

  it("los videos de una idea con dos paneles no comparten pista", () => {
    const pistas = [...escenasHtml(redes()).matchAll(/id="v-(\d+)-(\d+)-\d+"[^>]*data-track-index="(\d+)"/g)];
    expect(pistas.length).toBeGreaterThan(10);
    for (const idea of new Set(pistas.map((m) => m[1]))) {
      const delaIdea = pistas.filter((m) => m[1] === idea);
      for (const panel of new Set(delaIdea.map((m) => m[2]))) {
        expect(new Set(delaIdea.filter((m) => m[2] === panel).map((m) => m[3])).size).toBe(1);
      }
      expect(new Set(delaIdea.map((m) => m[3])).size).toBe(new Set(delaIdea.map((m) => m[2])).size);
    }
  });

  it("frena con un mensaje claro si la pantalla partida o su llegada no tienen sentido", () => {
    const sinLocal = structuredClone(plan);
    sinLocal.redes.ideas.find((e) => e.split).paneles.pop();
    expect(() => armarRedes(sinLocal, pasosDeEjemplo(), FUENTES)).toThrow(/cliente y uno del local/);
    const pronto = structuredClone(plan);
    pronto.redes.ideas.find((e) => e.split).llegada = 0.2;
    expect(() => armarRedes(pronto, pasosDeEjemplo(), FUENTES)).toThrow(/llegada entre 0,5 s/);
    const suelta = structuredClone(plan);
    suelta.redes.ideas[1].llegada = 1;
    expect(() => armarRedes(suelta, pasosDeEjemplo(), FUENTES)).toThrow(/no es una pantalla partida/);
  });

  it("el festejo del vertical se apaga solo antes del cierre", () => {
    const t = armarTomas(plan, pasosDeEjemplo(), "v");
    const i = t.tomas.length - 1;
    const apaga = guionVertical(plan, t, FUENTES).find((x) => x.s === `#festejo-${i}` && x.a.opacity === 0 && x.d);
    expect(apaga.t + apaga.d).toBeLessThanOrEqual(t.cierre.inicio + 1e-6);
  });

  it("el guion no deja nada en blanco al arrancar y cierra con Primer mes gratis", () => {
    expect(guionRedes(plan, redes()).some((x) => x.s === "#esc-0" && x.t === 0 && x.a.opacity === 1)).toBe(true);
    expect(plan.redes.cierre.texto).toBe("Primer mes gratis");
  });

  it("las grabaciones alcanzan para todos los cortes", () => {
    validarFuentes(redes().ideas.flatMap((e) => e.paneles.flatMap((pn) => pn.cortes.map((c) => ({ id: e.id, fuentes: { [pn.pantalla]: c.fuente } })))), TOTAL);
  });
});
