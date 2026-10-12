// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { cancelSpeech, speakNewOrder } from "./speech";

describe("voz de pedido nuevo — ADMIN-PEDIDOS-27", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dice 'Nuevo pedido' en es-AR", () => {
    const speak = vi.fn();
    class Utterance {
      lang = "";
      constructor(public text: string) {}
    }
    vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn() });
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);

    expect(speakNewOrder()).toBe(true);

    const utterance = speak.mock.calls[0][0] as Utterance;
    expect(utterance.text).toBe("Nuevo pedido");
    expect(utterance.lang).toBe("es-AR");
  });

  it("si el navegador no tiene voz no hace nada ni lanza", () => {
    expect(speakNewOrder()).toBe(false);
    expect(() => cancelSpeech()).not.toThrow();
  });

  it("si la voz lanza, devuelve falso", () => {
    vi.stubGlobal("speechSynthesis", {
      speak: () => {
        throw new Error("bloqueada");
      },
      cancel: vi.fn(),
    });
    vi.stubGlobal("SpeechSynthesisUtterance", class {});

    expect(speakNewOrder()).toBe(false);
  });
});
