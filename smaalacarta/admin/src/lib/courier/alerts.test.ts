import { describe, expect, it } from "vitest";

import {
  alertPhrase,
  alertsAfter,
  freshAlerts,
  readyPhrase,
  shouldPlayAlert,
  soundHint,
  soundPrefValue,
  SOUND_HINT_TEXT,
} from "./alerts";

describe("la frase de pedido nuevo — ENVIO-235", () => {
  it("con una zona la nombra", () => {
    expect(alertPhrase([{ id: "a", zone: "Cantera" }])).toBe("Nuevo envío a zona Cantera");
  });

  it("sin zona no inventa una", () => {
    expect(alertPhrase([{ id: "a", zone: null }])).toBe("Nuevo envío");
    expect(alertPhrase([{ id: "a", zone: "  " }])).toBe("Nuevo envío");
  });

  it("con varios avisos junta la cuenta, sin leer cada zona", () => {
    expect(
      alertPhrase([
        { id: "a", zone: "Cantera" },
        { id: "b", zone: "Oasis" },
      ]),
    ).toBe("2 envíos nuevos");
  });

  it("sin avisos no dice nada", () => {
    expect(alertPhrase([])).toBe("");
  });
});

describe("la frase de pedido listo — ENVIO-238", () => {
  it("nombra el local", () => {
    expect(readyPhrase("Ana Resto")).toBe("Pedido listo en Ana Resto");
  });

  it("sin nombre dice solo que está listo", () => {
    expect(readyPhrase("")).toBe("Pedido listo");
  });
});

describe("qué avisos hay — ENVIO-234", () => {
  const order = (id: string, zone: string | null, pending = true) => ({ id, envio: { zona: zone }, pending });
  const isPending = (o: { pending: boolean }) => o.pending;
  const zoneOf = (o: { envio: { zona: string | null } }) => o.envio.zona;

  it("solo los pendientes que no se habían visto", () => {
    const seen = new Set(["old"]);
    const orders = [order("old", "Cantera"), order("new", "Oasis"), order("done", "Centro", false)];

    expect(freshAlerts(seen, orders, isPending, zoneOf)).toEqual([{ id: "new", zone: "Oasis" }]);
  });

  it("un pedido deja de avisar cuando ya no está pendiente (lo ofertó, lo tomó o se cerró)", () => {
    const alerts = [
      { id: "a", zone: "Cantera" },
      { id: "b", zone: "Oasis" },
    ];

    expect(alertsAfter(alerts, [order("a", "Cantera", false), order("b", "Oasis")], isPending)).toEqual([
      { id: "b", zone: "Oasis" },
    ]);
  });

  it("un pedido que desapareció de la lista también deja de avisar", () => {
    expect(alertsAfter([{ id: "a", zone: null }], [], isPending)).toEqual([]);
  });
});

describe("cuándo suena — ENVIO-234", () => {
  it("suena con avisos, sonido prendido y audio habilitado", () => {
    expect(shouldPlayAlert({ alerts: 1, soundOn: true, audioReady: true })).toBe(true);
  });

  it("calla sin avisos, con el sonido apagado o sin el toque que habilita el audio", () => {
    expect(shouldPlayAlert({ alerts: 0, soundOn: true, audioReady: true })).toBe(false);
    expect(shouldPlayAlert({ alerts: 1, soundOn: false, audioReady: true })).toBe(false);
    expect(shouldPlayAlert({ alerts: 1, soundOn: true, audioReady: false })).toBe(false);
  });
});

describe("el sonido sin recuadro — ENVIO-240", () => {
  it("antes del primer toque, un aviso chico", () => {
    expect(soundHint({ soundOn: true, audioReady: false })).toBe(SOUND_HINT_TEXT);
    expect(SOUND_HINT_TEXT).toBe("Tocá la pantalla para activar el sonido");
  });

  it("con el audio habilitado, o apagado a propósito, no dice nada", () => {
    expect(soundHint({ soundOn: true, audioReady: true })).toBeNull();
    expect(soundHint({ soundOn: false, audioReady: false })).toBeNull();
  });

  it("sin nada guardado el sonido está prendido; solo el apagado a propósito lo apaga", () => {
    expect(soundPrefValue(null)).toBe(true);
    expect(soundPrefValue("1")).toBe(true);
    expect(soundPrefValue("0")).toBe(false);
  });
});
