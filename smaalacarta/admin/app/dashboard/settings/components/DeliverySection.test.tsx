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
    expect(names).toEqual(["Sin elegir", "Repartos al Toque"]);

    fireEvent.click(zone("Cantera"));

    const after = within(select()).getAllByRole("option").map((option) => option.textContent);
    expect(after).toEqual(["Sin elegir", "Repartos al Toque", "Moto Express"]);
  });

  it("sin favorito elegido dice a quién se recomienda; el nombre sale del dato — ENVIO-134", () => {
    renderSection({ ...options, default_courier: { id: "toque", name: "Repartos al Toque" } });
    expect(within(select()).getAllByRole("option")[0].textContent).toBe(
      "Sin elegir: se recomienda Repartos al Toque",
    );

    cleanup();
    renderSection({ ...options, default_courier: { id: "moto", name: "Moto Express" } });
    expect(within(select()).getAllByRole("option")[0].textContent).toBe("Sin elegir: se recomienda Moto Express");
  });

  it("avisa si el local no tiene ninguna zona tildada y deja de avisar al tildar una — ENVIO-135", () => {
    const sinZonas = { ...options, zones: options.zones.map((z) => ({ ...z, selected: false })) };
    renderSection(sinZonas);

    expect(
      screen.getByText("Todavía no elegiste a qué zonas enviás: tus clientes no ven el envío."),
    ).toBeTruthy();

    fireEvent.click(zone("Cantera"));
    expect(screen.queryByText(/Todavía no elegiste a qué zonas enviás/)).toBeNull();
  });

  it("con zonas tildadas no muestra el aviso — ENVIO-135", () => {
    renderSection();
    expect(screen.queryByText(/Todavía no elegiste a qué zonas enviás/)).toBeNull();
  });

  it("ya no hay minutos para el favorito: dice que su oferta le aparece primero al cliente", () => {
    renderSection();
    fireEvent.change(select(), { target: { value: "toque" } });

    expect(screen.queryByLabelText("Minutos para el favorito")).toBeNull();
    expect(screen.getByText(/Recomendado por el local/)).toBeTruthy();
  });

  it("al desmarcar la zona que cubría al favorito, vuelve a Sin elegir", () => {
    renderSection({ ...options, favorite_id: "toque" });
    expect(select().value).toBe("toque");

    fireEvent.click(zone("Centro"));

    expect(select().value).toBe("");
  });

  it("no tiene botón propio: guarda con Guardar cambios, zonas y favorito juntos", async () => {
    renderSection();
    expect(saveButton()).toBeDisabled();

    fireEvent.click(zone("Cantera"));
    fireEvent.change(select(), { target: { value: "moto" } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(saveDelivery).toHaveBeenCalledWith({
        zoneIds: ["centro", "cantera"],
        favoriteId: "moto",
      }),
    );
    expect(saveSettings).not.toHaveBeenCalled();
  });
});

describe("Configuración → Vehículos con los que trabajo — ENVIO-203", () => {
  const withVehicles: DeliveryOptions = { ...options, vehicles: { moto: true, auto: true }, vehicle_enabled: true };

  it("sin el interruptor del superadmin no se ve", () => {
    renderSection({ ...options, vehicles: { moto: true, auto: true }, vehicle_enabled: false });

    expect(screen.queryByText("Vehículos con los que trabajo")).toBeNull();
  });

  it("con el interruptor prendido muestra Moto y Auto marcados", () => {
    renderSection(withVehicles);

    expect((screen.getByRole("checkbox", { name: "Moto" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Auto" }) as HTMLInputElement).checked).toBe(true);
  });

  it("guarda la elección con las zonas", async () => {
    renderSection(withVehicles);

    fireEvent.click(screen.getByRole("checkbox", { name: "Auto" }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(saveDelivery).toHaveBeenCalled());
    expect(saveDelivery.mock.calls[0][0]).toMatchObject({ vehicles: { moto: true, auto: false } });
  });

  it("no deja guardar sin ningún vehículo", () => {
    renderSection(withVehicles);

    fireEvent.click(screen.getByRole("checkbox", { name: "Auto" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Moto" }));
    fireEvent.click(saveButton());

    expect(screen.getByText("Elegí al menos un vehículo: moto o auto.")).toBeTruthy();
    expect(saveDelivery).not.toHaveBeenCalled();
  });
});
