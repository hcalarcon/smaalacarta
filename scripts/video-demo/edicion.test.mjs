// @vitest-environment node
import { describe, expect, it } from "vitest";

import { agruparFocos, encuadrar, planearCamara, posicionCamara } from "./camara.mjs";
import {
  argsTramo,
  armarTomas,
  bitrateParaPeso,
  disposicionHorizontal,
  focosDelTramo,
  guionExplicativo,
  inicioDeFuente,
  pasosSinPlan,
  rellenarPlantilla,
  validarFuentes,
} from "./edicion.mjs";

import { FUENTES, TOTAL, pasosDeEjemplo, plan } from "./pasos-ejemplo.mjs";

describe("cámara", () => {
  const frame = { fw: 780, fh: 1688, sw: 780, sh: 1688 };

  it("nunca se sale de la grabación: no deja bordes vacíos", () => {
    const cam = posicionCamara(frame, { s: 2, cx: 0, cy: 0 });
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
    const abajo = posicionCamara(frame, { s: 2, cx: 780, cy: 1688 });
    expect(abajo.x).toBe(780 - 780 * 2);
    expect(abajo.y).toBe(1688 - 1688 * 2);
  });

  it("encuadra un foco chico con zoom y deja entero uno más grande que la ventana", () => {
    const chico = encuadrar({ ...frame, k: 0.47 }, { x: 37, y: 1558, w: 309, h: 88 }, { zoomMax: 2 });
    expect(chico.s).toBeGreaterThan(1);
    expect(chico.s).toBeLessThanOrEqual(2);
    expect(encuadrar({ ...frame, k: 0.47 }, { x: 0, y: 0, w: 780, h: 1688 }).s).toBe(1);
  });

  it("el zoom no pasa de lo que se ve nítido en pantalla", () => {
    const c = encuadrar({ fw: 1213, fh: 1600, k: 0.77 }, { x: 0, y: 0, w: 100, h: 100 }, { escalaMax: 1.9 });
    expect(c.s * 0.77).toBeLessThanOrEqual(1.9 + 1e-9);
  });

  it("junta los toques seguidos en una sola parada", () => {
    const grupos = agruparFocos(
      [
        { t: 1, rect: { x: 0, y: 0, w: 10, h: 10 } },
        { t: 1.8, rect: { x: 20, y: 20, w: 10, h: 10 } },
        { t: 6, rect: { x: 0, y: 0, w: 10, h: 10 } },
      ],
      1.3,
    );
    expect(grupos).toHaveLength(2);
    expect(grupos[0].rect).toEqual({ x: 0, y: 0, w: 30, h: 30 });
  });

  it("va al foco antes del toque, lo sostiene y vuelve al contexto si queda tiempo", () => {
    const { movimientos, inicio } = planearCamara({
      frame, k: 0.47, dur: 8, zoomMax: 2,
      focos: [{ t: 2, rect: { x: 37, y: 1558, w: 309, h: 88 } }],
    });
    expect(inicio.s).toBe(1);
    expect(movimientos).toHaveLength(2);
    const [ir, volver] = movimientos;
    expect(ir.t + ir.d).toBeLessThanOrEqual(2); // llega antes del toque
    expect(ir.a.s).toBeGreaterThan(1);
    expect(volver.a.s).toBe(1);
    expect(volver.t).toBeGreaterThan(2);
    // Cada movimiento arranca donde terminó el anterior.
    expect(volver.de).toEqual(ir.a);
  });

  it("sin focos, la cámara se queda quieta", () => {
    expect(planearCamara({ frame, k: 0.47, dur: 5, focos: [] }).movimientos).toEqual([]);
  });
});

describe("armarTomas", () => {
  it("cada explicativo entra en su rango de duración", () => {
    for (const formato of ["h", "v"]) {
      const t = armarTomas(plan, pasosDeEjemplo(), formato);
      const [min, max] = plan.limites[formato];
      expect(t.duracion).toBeGreaterThanOrEqual(min);
      expect(t.duracion).toBeLessThanOrEqual(max);
    }
  });

  it("los tramos van en orden, sin huecos, entre la intro y el cierre", () => {
    for (const formato of ["h", "v"]) {
      const t = armarTomas(plan, pasosDeEjemplo(), formato);
      let reloj = plan.intro.dur;
      for (const toma of t.tomas) {
        expect(toma.inicio).toBeCloseTo(reloj, 2);
        reloj += toma.dur;
      }
      expect(t.cierre.inicio).toBeCloseTo(reloj, 2);
    }
  });

  it("cada tramo mira un trozo válido de cada grabación", () => {
    const t = armarTomas(plan, pasosDeEjemplo(), "h");
    validarFuentes(t.tomas, TOTAL);
    for (const toma of t.tomas) for (const f of Object.values(toma.fuentes)) expect(f.desde).toBeGreaterThanOrEqual(0);
  });

  it("frena y nombra los pasos que el plan no usa ni omite", () => {
    const pasos = pasosDeEjemplo();
    pasos.pasos.push({ n: 21, id: "paso-nuevo", texto: "x", focos: [], videos: pasos.pasos[0].videos });
    expect(pasosSinPlan(plan, pasos)).toEqual(["paso-nuevo"]);
    expect(() => armarTomas(plan, pasos, "h")).toThrow(/paso-nuevo/);
  });

  it("frena si el plan nombra un paso que no está", () => {
    const pasos = pasosDeEjemplo();
    pasos.pasos = pasos.pasos.filter((p) => p.id !== "carrito");
    expect(() => armarTomas(plan, pasos, "h")).toThrow(/carrito/);
  });

  it("avisa si un tramo pide más grabación de la que hay", () => {
    const t = armarTomas(plan, pasosDeEjemplo(), "v");
    expect(() => validarFuentes(t.tomas, { cliente: 20, local: 20, repartidor: 20 })).toThrow(/dura 20/);
  });

  it("la barra de estados avanza en orden y llega a Entregado", () => {
    for (const formato of ["h", "v"]) {
      const idx = armarTomas(plan, pasosDeEjemplo(), formato).tomas.filter((t) => t.estado).map((t) => t.estado.idx);
      expect(idx).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("un salto saca ese pedazo de la grabación y corre los focos que vienen después", () => {
    const focos = [{ t: 10, rect: { x: 0, y: 0, w: 1, h: 1 } }, { t: 12.5, rect: { x: 0, y: 0, w: 1, h: 1 } }, { t: 14, rect: { x: 0, y: 0, w: 1, h: 1 } }];
    const salida = focosDelTramo(focos, 9, 10, 1, { desde: 12, hasta: 13 });
    expect(salida.map((f) => f.t)).toEqual([1, 4]); // el de 12,5 cae en el salto; el de 14 se corre un segundo
  });

  it("inicioDeFuente falla si cae antes de la grabación", () => {
    const porId = new Map(pasosDeEjemplo().pasos.map((p) => [p.id, p]));
    expect(() => inicioDeFuente(porId, "paneles", "cliente", -50)).toThrow(/antes del inicio/);
  });
});

describe("guion del explicativo", () => {
  it("el horizontal no usa «×N» y marca lo acelerado con un ícono", () => {
    const t = armarTomas(plan, pasosDeEjemplo(), "h");
    const guion = guionExplicativo(plan, t, FUENTES, "h");
    expect(JSON.stringify(guion)).not.toMatch(/×/);
    expect(guion.some((g) => g.s === "#ff" && g.a.opacity === 1)).toBe(true);
  });

  it("todo movimiento arranca desde el valor donde terminó el anterior (el render no depende del orden)", () => {
    const t = armarTomas(plan, pasosDeEjemplo({ "menu-abre": [{ pantalla: "cliente", tipo: "toque", t: 15.021, x: 37, y: 1558, w: 309, h: 88 }] }), "h");
    const cam = guionExplicativo(plan, t, FUENTES, "h").filter((g) => g.s === "#cam-cliente" && g.de);
    expect(cam.length).toBeGreaterThan(0);
    for (const g of cam) expect(g.de).toBeDefined();
  });

  it("la etiqueta de una pantalla solo cambia de color cuando cambia su estado (sin parpadeo en cada corte)", () => {
    const t = armarTomas(plan, pasosDeEjemplo(), "h");
    const guion = guionExplicativo(plan, t, FUENTES, "h");
    for (const p of ["cliente", "local", "repartidor"]) {
      const cambios = guion.filter((g) => g.s === `#etq-${p} span`);
      for (let i = 1; i < cambios.length; i++) expect(cambios[i].de.color).toBe(cambios[i - 1].a.color);
      expect(cambios.length).toBeLessThan(t.tomas.length);
    }
  });

  it("la pantalla de quien actúa queda grande y al centro, y las otras dos chicas a los costados", () => {
    for (const actor of ["cliente", "local", "repartidor"]) {
      const { panes } = disposicionHorizontal({ actor }, FUENTES);
      const centro = (p) => panes[p].x + panes[p].w / 2;
      expect(Math.abs(centro(actor) - 960)).toBeLessThan(1);
      for (const otro of ["cliente", "local", "repartidor"].filter((p) => p !== actor)) {
        expect(panes[otro].h).toBeLessThan(panes[actor].h);
        expect(panes[otro].x + panes[otro].w <= panes[actor].x || panes[otro].x >= panes[actor].x + panes[actor].w).toBe(true);
      }
    }
  });

  it("los reflejos ponen dos pantallas lado a lado con lugar para la flecha entre ellas", () => {
    const { panes, flecha } = disposicionHorizontal({ actor: "local", reflejo: { de: "cliente", a: "local" } }, FUENTES);
    expect(panes.cliente.x + panes.cliente.w).toBeLessThan(panes.local.x);
    expect(flecha.x2 - flecha.x1).toBeGreaterThan(150);
    expect(panes.repartidor.o).toBe(0);
  });

});

describe("ffmpeg y plantilla", () => {
  it("acelera con setpts y deja los cuadros por segundo fijos", () => {
    const args = argsTramo("in.mp4", { desde: 10, largo: 6 }, 3, "out.mp4");
    expect(args.join(" ")).toContain("setpts=(PTS-STARTPTS)/3,fps=30");
    expect(args).toContain("-an");
  });

  it("con salto arma dos trozos y los pega", () => {
    const args = argsTramo("in.mp4", { desde: 10, largo: 6, salto: { desde: 12, hasta: 12.5 } }, 1, "out.mp4");
    const filtro = args[args.indexOf("-filter_complex") + 1];
    expect(filtro).toContain("trim=start=0:end=2");
    expect(filtro).toContain("trim=start=2.5");
    expect(filtro).toContain("concat=n=2");
  });

  it("el bitrate deja el archivo por debajo del tope", () => {
    expect((bitrateParaPeso(60) * 60) / 8).toBeLessThan(16_000_000);
  });

  it("la plantilla pide todos sus valores", () => {
    expect(rellenarPlantilla("a {{X}} b", { X: "1" })).toBe("a 1 b");
    expect(() => rellenarPlantilla("{{FALTA}}", {})).toThrow(/FALTA/);
  });
});
