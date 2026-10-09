import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BusinessProfileForm from "./BusinessProfileForm";
import SettingsSaveProvider, { useSettingsSave } from "./SettingsSaveProvider";
import { DEFAULT_SETTINGS } from "@/lib/settings/validation";

const { saveProfile, saveSettings, refresh } = vi.hoisted(() => ({
  saveProfile: vi.fn(),
  saveSettings: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../actions", () => ({
  saveBusinessProfileAction: saveProfile,
  saveSettingsAction: saveSettings,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// Hace de SettingsForm: un campo que informa su estado a la pantalla.
function FakeSettings() {
  const { reportSettings, settingsErrors } = useSettingsSave();
  const [whatsapp, setWhatsapp] = useState("3510000000");
  useEffect(() => reportSettings({ ...DEFAULT_SETTINGS, whatsapp }));
  return (
    <>
      <input aria-label="WhatsApp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      {settingsErrors.whatsapp ? <p>{settingsErrors.whatsapp}</p> : null}
    </>
  );
}

function screenUnderTest() {
  render(
    <SettingsSaveProvider initialName="Casa Resto" initialSlug="casa-resto">
      <BusinessProfileForm />
      <FakeSettings />
    </SettingsSaveProvider>,
  );
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const saveButton = () => screen.getByRole("button", { name: /Guardar cambios|Guardando/ });

beforeEach(() => {
  vi.clearAllMocks();
  saveProfile.mockResolvedValue({ ok: true });
  saveSettings.mockResolvedValue({ ok: true });
});

describe("Configuración — un solo guardado (ADMIN-CONFIG-33 y 37)", () => {
  it("Datos del negocio no tiene botón propio, y el flotante está desactivado sin cambios", () => {
    screenUnderTest();
    expect(screen.getAllByRole("button", { name: /Guardar/ })).toHaveLength(1);
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText("Cambios sin guardar")).toBeNull();
  });

  it("marca los cambios sin guardar, sean del perfil o de la configuración", () => {
    screenUnderTest();
    type("WhatsApp", "3511111111");
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("guarda el perfil y la configuración con un clic y avisa una sola vez", async () => {
    screenUnderTest();
    type("URL de tu menú", "mi-casa");
    type("WhatsApp", "3511111111");
    fireEvent.click(saveButton());

    await screen.findByText("Cambios guardados");
    expect(saveProfile).toHaveBeenCalledWith({ name: "Casa Resto", slug: "mi-casa" });
    expect(saveSettings).toHaveBeenCalledOnce();
    expect(screen.getAllByText("Cambios guardados")).toHaveLength(1);
    expect(screen.queryByText("Cambios sin guardar")).toBeNull();
    expect(saveProfile.mock.invocationCallOrder[0]).toBeLessThan(saveSettings.mock.invocationCallOrder[0]);
  });
});

describe("Configuración — validar y abortar (ADMIN-CONFIG-34 y 35)", () => {
  it("con un dato inválido no se guarda nada y el error queda en su campo", () => {
    screenUnderTest();
    type("Nombre del negocio", "");
    type("WhatsApp", "abc");
    fireEvent.click(saveButton());

    expect(saveProfile).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(screen.getByText("Ingresá el nombre del negocio.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Revisá los datos marcados.");
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  });

  it("si el perfil falla no se guarda la configuración y todo sigue sin guardar", async () => {
    saveProfile.mockResolvedValue({
      ok: false,
      error: "Revisá los datos marcados.",
      fieldErrors: { slug: "Esa URL ya la usa otro negocio. Elegí otra." },
    });
    screenUnderTest();
    type("URL de tu menú", "ocupada");
    type("WhatsApp", "3511111111");
    fireEvent.click(saveButton());

    expect(await screen.findByText("Esa URL ya la usa otro negocio. Elegí otra.")).toBeInTheDocument();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(screen.queryByText("Cambios guardados")).toBeNull();
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  });

  it("si falla la configuración, el perfil ya guardado deja de estar pendiente", async () => {
    saveSettings.mockResolvedValue({ ok: false, error: "No pudimos guardar la configuración." });
    screenUnderTest();
    type("URL de tu menú", "mi-casa");
    type("WhatsApp", "3511111111");
    fireEvent.click(saveButton());

    await waitFor(() => expect(saveSettings).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos guardar la configuración.");
    expect(screen.queryByText("Cambios guardados")).toBeNull();

    // Un segundo intento ya no reenvía el perfil.
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(2));
    expect(saveProfile).toHaveBeenCalledTimes(1);
  });
});

describe("Configuración — ¿regenerar la URL? (ADMIN-CONFIG-36)", () => {
  it("al guardar con otro nombre y la misma URL pregunta, y guarda con la URL elegida", async () => {
    screenUnderTest();
    type("Nombre del negocio", "Lo de Ana");
    fireEvent.click(saveButton());

    expect(saveProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Cambiaste el nombre" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sí, regenerar" }));
    await screen.findByText("Cambios guardados");
    expect(saveProfile).toHaveBeenCalledWith({ name: "Lo de Ana", slug: "lo-de-ana" });
  });

  it("'Mantener la URL actual' guarda solo el nombre", async () => {
    screenUnderTest();
    type("Nombre del negocio", "Lo de Ana");
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole("button", { name: "Mantener la URL actual" }));

    await screen.findByText("Cambios guardados");
    expect(saveProfile).toHaveBeenCalledWith({ name: "Lo de Ana", slug: "casa-resto" });
  });
});
