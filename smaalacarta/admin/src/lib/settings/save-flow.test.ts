import { describe, expect, it, vi } from "vitest";

import { profileChanged, prepareSettings, regenerateSuggestion, runSave } from "./save-flow";
import { DEFAULT_SETTINGS } from "./validation";

describe("profileChanged — ADMIN-CONFIG-37", () => {
  const saved = { name: "Casa Resto", slug: "casa-resto" };

  it("sin diferencias no hay nada pendiente (el espacio de los bordes no cuenta)", () => {
    expect(profileChanged(saved, { name: " Casa Resto ", slug: "casa-resto" })).toBe(false);
  });

  it("cambia si cambió el nombre o la URL", () => {
    expect(profileChanged(saved, { name: "Casa Nueva", slug: "casa-resto" })).toBe(true);
    expect(profileChanged(saved, { name: "Casa Resto", slug: "otra" })).toBe(true);
  });
});

describe("regenerateSuggestion — ADMIN-CONFIG-36", () => {
  const saved = { name: "Casa Resto", slug: "casa-resto" };

  it("si cambió el nombre y no la URL, sugiere la URL del nombre nuevo", () => {
    expect(regenerateSuggestion(saved, { name: "Lo de Ana", slug: "casa-resto" })).toBe("lo-de-ana");
  });

  it("no pregunta si la URL también se tocó, o si el nombre no cambió", () => {
    expect(regenerateSuggestion(saved, { name: "Lo de Ana", slug: "mi-url" })).toBeNull();
    expect(regenerateSuggestion(saved, saved)).toBeNull();
  });

  it("no pregunta si la sugerencia ya es la URL actual", () => {
    expect(regenerateSuggestion(saved, { name: "CASA resto", slug: "casa-resto" })).toBeNull();
  });
});

describe("runSave — ADMIN-CONFIG-35", () => {
  const ok = { ok: true } as const;
  const fail = { ok: false, error: "no" } as const;

  it("guarda primero el perfil y después la configuración", async () => {
    const calls: string[] = [];
    const result = await runSave({
      profileChanged: true,
      settingsChanged: true,
      saveProfile: async () => (calls.push("perfil"), ok),
      saveSettings: async () => (calls.push("config"), ok),
    });
    expect(calls).toEqual(["perfil", "config"]);
    expect(result).toEqual({ ok: true, profile: ok, settings: ok });
  });

  it("si el perfil falla, no guarda la configuración", async () => {
    const saveSettings = vi.fn(async () => ok);
    const result = await runSave({
      profileChanged: true,
      settingsChanged: true,
      saveProfile: async () => fail,
      saveSettings,
    });
    expect(saveSettings).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.profile).toEqual(fail);
    expect(result.settings).toBeNull();
  });

  it("solo guarda lo que cambió", async () => {
    const saveProfile = vi.fn(async () => ok);
    const saveSettings = vi.fn(async () => ok);
    await runSave({ profileChanged: false, settingsChanged: true, saveProfile, saveSettings });
    expect(saveProfile).not.toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalledOnce();
  });

  it("si la configuración falla, el perfil ya quedó guardado y el resultado no es ok", async () => {
    const result = await runSave({
      profileChanged: true,
      settingsChanged: true,
      saveProfile: async () => ok,
      saveSettings: async () => fail,
    });
    expect(result).toEqual({ ok: false, profile: ok, settings: fail });
  });
});

describe("prepareSettings — ADMIN-CONFIG-34", () => {
  it("recorta los textos antes de validar, como lo hace el servidor", () => {
    const prepared = prepareSettings({ ...DEFAULT_SETTINGS, tagline: "  Hola  ", whatsapp: " 3510000000 " });
    expect(prepared.tagline).toBe("Hola");
    expect(prepared.whatsapp).toBe("3510000000");
  });
});
