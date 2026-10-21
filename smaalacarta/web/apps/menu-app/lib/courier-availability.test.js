import { describe, expect, it, vi } from "vitest";

import { createZoneChecker, fetchZoneHasCouriers, showNoCouriersNotice } from "./courier-availability.js";
import { DICTIONARY } from "./i18n.js";

const ZONE = "11111111-1111-4111-8111-111111111111";
const cfg = { url: "https://x.supabase.co", key: "sb_publishable_abc", zoneId: ZONE };
const answer = (body, ok = true) => vi.fn().mockResolvedValue({ ok, json: async () => body });

describe("fetchZoneHasCouriers — ENVIO-197 y 198", () => {
  it("llama a public_zone_has_couriers con la zona y devuelve sí o no", async () => {
    const fetchImpl = answer(false);
    const r = await fetchZoneHasCouriers({ ...cfg, fetchImpl });

    expect(r).toEqual({ ok: true, has: false });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/public_zone_has_couriers");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("sb_publishable_abc");
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(init.body)).toEqual({ p_zone_id: ZONE });
  });

  it("manda Authorization solo con claves JWT", async () => {
    const fetchImpl = answer(true);
    await fetchZoneHasCouriers({ ...cfg, key: "eyJhbGciOi.payload.firma", fetchImpl });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer eyJhbGciOi.payload.firma");
  });

  it("ante cualquier problema, no hay respuesta y no se avisa nada", async () => {
    expect(await fetchZoneHasCouriers({ ...cfg, fetchImpl: answer(null, false) })).toEqual({ ok: false });
    expect(await fetchZoneHasCouriers({ ...cfg, fetchImpl: vi.fn().mockRejectedValue(new Error("red")) })).toEqual({
      ok: false,
    });
    // Algo que no es sí o no (un servidor viejo, una página de error).
    expect(await fetchZoneHasCouriers({ ...cfg, fetchImpl: answer({ cantidad: 3 }) })).toEqual({ ok: false });
    expect(await fetchZoneHasCouriers({ ...cfg, fetchImpl: answer(3) })).toEqual({ ok: false });
  });

  it("sin configuración o con una zona que no es un id, ni siquiera consulta", async () => {
    const fetchImpl = answer(true);

    expect(await fetchZoneHasCouriers({ url: "", key: "k", zoneId: ZONE, fetchImpl })).toEqual({ ok: false });
    expect(await fetchZoneHasCouriers({ ...cfg, zoneId: "no-es-un-id", fetchImpl })).toEqual({ ok: false });
    expect(await fetchZoneHasCouriers({ ...cfg, zoneId: "", fetchImpl })).toEqual({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("showNoCouriersNotice — ENVIO-198", () => {
  it("solo avisa cuando la base dijo que no hay nadie", () => {
    expect(showNoCouriersNotice({ ok: true, has: false })).toBe(true);
    expect(showNoCouriersNotice({ ok: true, has: true })).toBe(false);
    expect(showNoCouriersNotice({ ok: false })).toBe(false);
    expect(showNoCouriersNotice(null)).toBe(false);
  });
});

describe("createZoneChecker — ENVIO-198", () => {
  it("no repite la consulta de un barrio dentro del plazo, y sí después", async () => {
    let t = 0;
    const check = vi.fn(async () => ({ ok: true, has: false }));
    const checkZone = createZoneChecker(check, { now: () => t, ttl: 1000 });

    await checkZone(ZONE);
    t = 500;
    await checkZone(ZONE);
    expect(check).toHaveBeenCalledTimes(1);

    t = 1500;
    await checkZone(ZONE);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("un fallo no se recuerda", async () => {
    const check = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, has: true });
    const checkZone = createZoneChecker(check);

    expect(await checkZone(ZONE)).toEqual({ ok: false });
    expect(await checkZone(ZONE)).toEqual({ ok: true, has: true });
    expect(check).toHaveBeenCalledTimes(2);
  });
});

describe("textos — ENVIO-198", () => {
  it("el aviso del checkout está en español, inglés y portugués, y deja pedir igual", () => {
    for (const lang of ["es", "en", "pt"]) {
      expect(DICTIONARY[lang]["checkout.noCouriers"]).toBeTruthy();
    }
    expect(DICTIONARY.es["checkout.noCouriers"]).toBe(
      "Ahora puede que no haya repartidores disponibles para tu zona. Podés pedir igual o elegir retiro en el local.",
    );
  });
});
