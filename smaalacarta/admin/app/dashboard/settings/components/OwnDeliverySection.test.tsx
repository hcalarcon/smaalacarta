import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OwnDeliverySection from "./OwnDeliverySection";
import SettingsForm from "./SettingsForm";
import SettingsSaveProvider from "./SettingsSaveProvider";
import type { BusinessZone } from "@/lib/db/business-zones";
import type { OwnDelivery } from "@/lib/db/own-delivery";
import { DEFAULT_SETTINGS } from "@/lib/settings/validation";

const { createZone, updateZone, setActive, deleteZone, reorder, refresh } = vi.hoisted(() => ({
  createZone: vi.fn(),
  updateZone: vi.fn(),
  setActive: vi.fn(),
  deleteZone: vi.fn(),
  reorder: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../actions", () => ({
  saveBusinessProfileAction: vi.fn(),
  saveSettingsAction: vi.fn(),
  saveDeliveryAction: vi.fn(),
  createZoneAction: createZone,
  updateZoneAction: updateZone,
  setZoneActiveAction: setActive,
  deleteZoneAction: deleteZone,
  reorderZonesAction: reorder,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
// SettingsForm trae los cargadores de imágenes, que piden el cliente de Supabase del navegador.
vi.mock("@/lib/supabase-browser", () => ({ createClient: () => ({}) }));
// El arrastrar y soltar no se prueba acá: se renderiza la lista tal cual.
vi.mock("@/components/menu/Sortable", () => ({
  SortableList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SortableItem: ({ children }: { children: (handle: React.ReactNode) => React.ReactNode }) => <div>{children(null)}</div>,
}));

const zone = (extra: Partial<BusinessZone> & { name: string }): BusinessZone => ({
  id: extra.name,
  price: 1500,
  active: true,
  sort_order: 1,
  ...extra,
});

const delivery = (extra: Partial<OwnDelivery> = {}): OwnDelivery => ({
  delivery_type: "own",
  courier: { id: "c1", name: "Rita", active: true },
  zones_with_price: 1,
  zones_total: 1,
  ...extra,
});

function renderSection(value: OwnDelivery, zones: BusinessZone[]) {
  render(
    <SettingsSaveProvider initialName="Casa Resto" initialSlug="casa-resto">
      <OwnDeliverySection delivery={value} zones={zones} />
    </SettingsSaveProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  createZone.mockResolvedValue({ ok: true });
  updateZone.mockResolvedValue({ ok: true });
  setActive.mockResolvedValue({ ok: true });
  deleteZone.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

describe("Configuración → Envíos con envío propio — ENVIO-260", () => {
  it("sin zonas con precio avisa que las cargue", () => {
    renderSection(delivery({ zones_with_price: 0, zones_total: 0 }), []);

    expect(screen.getByText("Cargá tus zonas y precios para que tus clientes vean el costo del envío.")).toBeTruthy();
  });

  it("una zona sin precio o desactivada no cuenta: también avisa", () => {
    renderSection(delivery(), [zone({ name: "Sin precio", price: null }), zone({ name: "Apagada", active: false })]);

    expect(screen.getByText(/Cargá tus zonas y precios/)).toBeTruthy();
  });

  it("con una zona activa y con precio no avisa", () => {
    renderSection(delivery(), [zone({ name: "Norte" })]);

    expect(screen.queryByText(/Cargá tus zonas y precios/)).toBeNull();
  });

  it("sin repartidor propio avisa que los envíos los lleva el local; con uno, lo muestra en solo lectura", () => {
    renderSection(delivery({ courier: null }), [zone({ name: "Norte" })]);
    expect(screen.getByText("Todavía no tenés repartidor asignado: los envíos los llevás vos.")).toBeTruthy();
    cleanup();

    renderSection(delivery(), [zone({ name: "Norte" })]);
    expect(screen.queryByText(/Todavía no tenés repartidor asignado/)).toBeNull();
    expect(screen.getByText("Rita")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("un repartidor propio inactivo cuenta como sin repartidor", () => {
    renderSection(delivery({ courier: { id: "c1", name: "Rita", active: false } }), [zone({ name: "Norte" })]);

    expect(screen.getByText(/Todavía no tenés repartidor asignado/)).toBeTruthy();
  });

  it("tiene el interruptor para ofrecer o no el envío", () => {
    renderSection(delivery(), [zone({ name: "Norte" })]);

    const toggle = screen.getByRole("checkbox", { name: /Ofrecer envío/ }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it("agrega una zona con precio con coma decimal", async () => {
    renderSection(delivery({ zones_with_price: 0, zones_total: 0 }), []);

    fireEvent.change(screen.getByLabelText("Nombre de la zona"), { target: { value: "Barrio Norte" } });
    fireEvent.change(screen.getByLabelText("Precio"), { target: { value: "1500,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(createZone).toHaveBeenCalledWith({ name: "Barrio Norte", price: "1500,50" }));
  });

  it("no agrega una zona sin nombre ni con un precio inválido", async () => {
    renderSection(delivery({ zones_with_price: 0, zones_total: 0 }), []);

    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(await screen.findByText("El nombre de la zona es obligatorio.")).toBeTruthy();
    expect(createZone).not.toHaveBeenCalled();
  });

  it("activa y desactiva una zona", async () => {
    renderSection(delivery(), [zone({ id: "z1", name: "Norte" })]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Activa: Norte" }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith("z1", false));
  });

  it("una zona sin precio dice que no se ofrece", () => {
    renderSection(delivery(), [zone({ name: "Sin precio", price: null })]);

    expect(screen.getByText("Sin precio: no se ofrece")).toBeTruthy();
  });
});

describe("el interruptor 'Ofrecer envío' es el mismo 'Delivery' de Entrega y pago — ENVIO-260", () => {
  function renderBoth() {
    render(
      <SettingsSaveProvider initialName="Casa Resto" initialSlug="casa-resto">
        <SettingsForm
          businessId="b1"
          initial={{ ...DEFAULT_SETTINGS, deliveryOptions: ["delivery", "retiro"] }}
          digitalMenu
          pdfService={false}
          mercadoPagoReady={false}
        />
        <OwnDeliverySection delivery={delivery()} zones={[zone({ name: "Norte" })]} />
      </SettingsSaveProvider>,
    );
  }

  const offer = () => screen.getByRole("checkbox", { name: /Ofrecer envío/ }) as HTMLInputElement;
  const deliveryType = () => screen.getByRole("checkbox", { name: "Delivery" }) as HTMLInputElement;

  it("desactivar el envío destilda 'Delivery' y deja un cambio sin guardar", () => {
    renderBoth();
    expect(offer().checked).toBe(true);
    expect(deliveryType().checked).toBe(true);

    fireEvent.click(offer());

    expect(offer().checked).toBe(false);
    expect(deliveryType().checked).toBe(false);
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();
  });

  it("volver a activarlo lo tilda de nuevo, y el cambio se hace desde cualquiera de los dos", () => {
    renderBoth();

    fireEvent.click(deliveryType());
    expect(offer().checked).toBe(false);

    fireEvent.click(offer());
    expect(deliveryType().checked).toBe(true);
    expect(offer().checked).toBe(true);
  });
});
