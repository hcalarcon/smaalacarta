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
        videos: { cliente: { inicio: 0, fin: 2 }, local: { inicio: -0.5, fin: 1.5 } },
      },
    ]);
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
