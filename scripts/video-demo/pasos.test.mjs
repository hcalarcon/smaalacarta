// @vitest-environment node
import { describe, expect, it } from "vitest";

import { crearRegistro } from "./pasos.mjs";

describe("crearRegistro", () => {
  it("mide cada paso desde el inicio de cada video", async () => {
    let ahora = 10_000;
    const registro = crearRegistro({ cliente: 10_000, local: 10_500 }, () => ahora);

    await registro.paso("a", "Primero", async () => {
      ahora += 2_000;
    });

    expect(registro.pasos).toEqual([
      {
        n: 1,
        id: "a",
        texto: "Primero",
        focos: [],
        videos: { cliente: { inicio: 0, fin: 2 }, local: { inicio: -0.5, fin: 1.5 } },
      },
    ]);
  });

  it("guarda los focos del paso en píxeles del video, con su segundo", async () => {
    let ahora = 10_000;
    const registro = crearRegistro({ local: 9_000 }, () => ahora, { escala: 2, limites: { local: { w: 2560, h: 1600 } } });

    await registro.paso("a", "Toca", async () => {
      ahora += 1_500;
      registro.foco("local", "toque", { x: 100.4, y: 50, width: 80, height: 30.2 });
      registro.foco("local", "resultado", { x: 1200, y: 700, width: 200, height: 200 }, 12_250);
    });

    expect(registro.pasos[0].focos).toEqual([
      { pantalla: "local", tipo: "toque", t: 2.5, x: 201, y: 100, w: 160, h: 60 },
      { pantalla: "local", tipo: "resultado", t: 3.25, x: 2400, y: 1400, w: 160, h: 200 },
    ]);
  });

  it("no guarda focos fuera de un paso ni de una pantalla desconocida", async () => {
    const registro = crearRegistro({ local: 0 }, () => 0);
    registro.foco("local", "toque", { x: 1, y: 1, width: 5, height: 5 });
    await registro.paso("a", "x", async () => {
      registro.foco("otra", "toque", { x: 1, y: 1, width: 5, height: 5 });
    });
    expect(registro.pasos[0].focos).toEqual([]);
  });

  it("guarda desde qué segundo de cada video ya hay imagen", () => {
    let ahora = 5_000;
    const registro = crearRegistro({ cliente: 1_000, local: 2_500 }, () => ahora);
    registro.marcarInicio();
    expect(registro.inicioUtil).toEqual({ cliente: 4, local: 2.5 });
  });

  it("si falla, dice qué paso fue y lo deja registrado", async () => {
    const registro = crearRegistro({ cliente: 0 }, () => 0);

    await expect(
      registro.paso("x", "El cliente confirma", async () => {
        throw new Error("no aparece el botón\nmás detalle");
      }),
    ).rejects.toThrow("Falló el paso «El cliente confirma»: no aparece el botón");
    expect(registro.pasos).toHaveLength(1);
  });
});
