import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DeliverySection from "./DeliverySection";
import SettingsSaveProvider from "./SettingsSaveProvider";
import type { DeliveryOptions } from "@/lib/courier/preferences";

const { saveProfile, saveSettings, saveDelivery, refresh } = vi.hoisted(() => ({
  saveProfile: vi.fn(),
  saveSettings: vi.fn(),
  saveDelivery: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../actions", () => ({
  saveBusinessProfileAction: saveProfile,
  saveSettingsAction: saveSettings,
  saveDeliveryAction: saveDelivery,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const options: DeliveryOptions = {
  zones: [
    { id: "centro", name: "Centro", price: 4500, selected: true, covered: true },
    { id: "cantera", name: "Cantera", price: 5000, selected: false, covered: true },
    { id: "lolog", name: "Lolog", price: 25000, selected: false, covered: false },
  ],
  couriers: [
    { id: "toque", name: "Repartos al Toque", whatsapp: null, zone_ids: ["centro", "cantera"] },
    { id: "moto", name: "Moto Express", whatsapp: null, zone_ids: ["cantera"] },
  ],
  favorite_id: null,
  favorite_minutes: 5,
};

function renderSection(value: DeliveryOptions = options) {
  render(
    <SettingsSaveProvider initialName="Casa Resto" initialSlug="casa-resto">
      <DeliverySection options={value} />
    </SettingsSaveProvider>,
  );
}

const select = () => screen.getByLabelText("Repartidor favorito") as HTMLSelectElement;
const saveButton = () => screen.getByRole("button", { name: /Guardar cambios|Guardando/ });
const zone = (name: string) => screen.getByRole("checkbox", { name: new RegExp(name) }) as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  saveDelivery.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

describe("Configuración → Envíos — ENVIO-58", () => {
  it("lista las zonas con su precio y marca las que el local ya envía", () => {
    renderSection();

    expect(zone("Centro").checked).toBe(true);
    expect(zone("Cantera").checked).toBe(false);
    expect(screen.getByText(/\$\s?5\.000/)).toBeTruthy();
  });

  it("una zona que nadie cubre dice 'Sin repartidor por ahora'", () => {
    renderSection();

    expect(screen.getAllByText("Sin repartidor por ahora")).toHaveLength(1);
    expect(screen.getByText("Lolog").parentElement?.textContent).toContain("Sin repartidor por ahora");
  });

  it("el favorito solo ofrece a los repartidores que cubren alguna zona marcada", () => {
    renderSection();

    const names = within(select()).getAllByRole("option").map((option) => option.textContent);
    expect(names).toEqual(["Sin favorito (el pedido va a todos)", "Repartos al Toque"]);

    fireEvent.click(zone("Cantera"));

    const after = within(select()).getAllByRole("option").map((option) => option.textContent);
    expect(after).toEqual(["Sin favorito (el pedido va a todos)", "Repartos al Toque", "Moto Express"]);
  });

  it("los minutos solo se ven con un favorito elegido y arrancan en 5", () => {
    renderSection();
    expect(screen.queryByLabelText("Minutos para el favorito")).toBeNull();

    fireEvent.change(select(), { target: { value: "toque" } });

    expect((screen.getByLabelText("Minutos para el favorito") as HTMLInputElement).value).toBe("5");
  });

  it("al desmarcar la zona que cubría al favorito, vuelve a Sin favorito", () => {
    renderSection({ ...options, favorite_id: "toque" });
    expect(select().value).toBe("toque");

    fireEvent.click(zone("Centro"));

    expect(select().value).toBe("");
    expect(screen.queryByLabelText("Minutos para el favorito")).toBeNull();
  });

  it("no tiene botón propio: guarda con Guardar cambios, zonas y favorito juntos", async () => {
    renderSection();
    expect(saveButton()).toBeDisabled();

    fireEvent.click(zone("Cantera"));
    fireEvent.change(select(), { target: { value: "moto" } });
    fireEvent.change(screen.getByLabelText("Minutos para el favorito"), { target: { value: "12" } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(saveDelivery).toHaveBeenCalledWith({
        zoneIds: ["centro", "cantera"],
        favoriteId: "moto",
        minutes: "12",
      }),
    );
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("minutos fuera de 1 a 60: no guarda y lo dice en el campo", async () => {
    renderSection();
    fireEvent.change(select(), { target: { value: "toque" } });
    fireEvent.change(screen.getByLabelText("Minutos para el favorito"), { target: { value: "90" } });
    fireEvent.click(saveButton());

    expect(await screen.findByText(/de 1 a 60/)).toBeTruthy();
    expect(saveDelivery).not.toHaveBeenCalled();
  });
});
