import { describe, expect, it, vi } from "vitest";
import { crearSonido } from "./sonido.js";

function audioFalso() {
  const creados = [];
  const contexto = {
    currentTime: 0,
    destination: {},
    resume: vi.fn(),
    createOscillator: () => {
      const osc = { frequency: {}, connect: (x) => x, start: vi.fn(), stop: vi.fn() };
      creados.push(osc);
      return osc;
    },
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (x) => x }),
  };
  return { contexto, creados };
}

describe("sonido (WEB-VITRINA-10)", () => {
  it("nace apagado: no crea audio ni suena nada", () => {
    const crearAudio = vi.fn();
    const sonido = crearSonido({ crearAudio });

    sonido.sonar([[440, 0, 0.1]]);

    expect(sonido.prendido).toBe(false);
    expect(crearAudio).not.toHaveBeenCalled();
  });

  it("al prenderlo crea el audio una sola vez y suena; al apagarlo, vuelve a callar", () => {
    const { contexto, creados } = audioFalso();
    const crearAudio = vi.fn(() => contexto);
    const sonido = crearSonido({ crearAudio });

    expect(sonido.alternar()).toBe(true);
    sonido.sonar([[440, 0, 0.1], [880, 0.1, 0.1]]);
    expect(creados).toHaveLength(2);

    expect(sonido.alternar()).toBe(false);
    sonido.sonar([[440, 0, 0.1]]);
    expect(creados).toHaveLength(2);

    sonido.alternar();
    expect(crearAudio).toHaveBeenCalledTimes(1);
  });

  it("si el navegador no tiene audio, queda apagado", () => {
    const sonido = crearSonido({
      crearAudio: () => {
        throw new Error("sin audio");
      },
    });

    expect(sonido.alternar()).toBe(false);
  });
});
