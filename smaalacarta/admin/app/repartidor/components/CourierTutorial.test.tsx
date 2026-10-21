import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CourierOrdersClient from "./CourierOrdersClient";
import TutorialProvider from "./TutorialProvider";
import { useTutorial } from "./tutorial-context";
import type { AvailableOrder } from "@/lib/courier/panel";
import type { TutorialMode, TutorialStepId } from "@/lib/courier/tutorial";

const mocks = vi.hoisted(() => ({
  server: {
    offer: vi.fn(),
    withdraw: vi.fn(),
    decline: vi.fn(),
    take: vi.fn(),
    giveBack: vi.fn(),
    advance: vi.fn(),
    settle: vi.fn(),
    setEta: vi.fn(),
  },
  seen: vi.fn(),
  refresh: vi.fn(),
  highlight: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
  usePathname: () => "/repartidor",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../actions", () => ({
  makeOfferAction: mocks.server.offer,
  withdrawOfferAction: mocks.server.withdraw,
  declineOrderAction: mocks.server.decline,
  takeOrderAction: mocks.server.take,
  returnOrderAction: mocks.server.giveBack,
  advanceOrderAction: mocks.server.advance,
  markSettledAction: mocks.server.settle,
  setEtaAction: mocks.server.setEta,
  markTutorialSeenAction: mocks.seen,
}));
vi.mock("driver.js", () => ({ driver: () => ({ highlight: mocks.highlight, destroy: vi.fn() }) }));
vi.mock("driver.js/dist/driver.css", () => ({}));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.clearAllMocks();
  mocks.seen.mockResolvedValue({ ok: true });
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as never;
});

afterEach(cleanup);

const real: AvailableOrder = {
  id: "real-1",
  numero: "7",
  estado: "confirmed",
  creado: "2026-10-09T22:00:00Z",
  ofrecido_el: "2026-10-09T22:01:00Z",
  programado: null,
  anticipado: false,
  negocio: { nombre: "Ana Resto", direccion: "San Martín 100" },
  total: 8200,
  pago: "efectivo",
  pago_estado: "not_required",
  envio: { zona: "Cantera", precio_lista: 5000 },
  modo: "fixed",
  ofertas: 0,
  mi_oferta: null,
  resultado: null,
  cerrado_el: null,
};

function Skip() {
  const tutorial = useTutorial();
  return (
    <>
      <button type="button" onClick={tutorial?.skip}>
        saltear-prueba
      </button>
      <button type="button" onClick={tutorial?.next}>
        siguiente-prueba
      </button>
    </>
  );
}

function panel(mode: TutorialMode, step: TutorialStepId, available: AvailableOrder[] = []) {
  return render(
    <TutorialProvider mode={mode} zonePrice={1800} autoStart={false} initialStep={step}>
      <Skip />
      <CourierOrdersClient orders={[]} available={available} serverNow="2026-10-09T22:05:00Z" />
    </TutorialProvider>,
  );
}

const serverCalls = () => Object.values(mocks.server).reduce((total, fn) => total + fn.mock.calls.length, 0);

describe("el pedido de práctica no toca el servidor — ENVIO-216", () => {
  it("precio fijo: Tomar, En camino y Entregado recorren el pedido sin llamar a ninguna acción", async () => {
    panel("fixed", "take");

    // Mismo tipo de tarjeta que uno real, bien marcada como práctica, con el precio de lista de la zona.
    expect(screen.getByText("PRÁCTICA")).toBeTruthy();
    expect(screen.getAllByText("Local de práctica").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Centro/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Tomar.*1\.800/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Tomar/ }));
    // Tomado: pasa a Mis envíos en curso. "Ya es tuyo" se pasa con Siguiente; En camino espera el toque.
    expect(await screen.findByRole("button", { name: "En camino" })).toBeTruthy();
    fireEvent.click(screen.getByText("siguiente-prueba"));
    fireEvent.click(await screen.findByRole("button", { name: "En camino" }));
    fireEvent.click(await screen.findByRole("button", { name: "Entregado" }));

    // Entregado: el pedido de práctica ya no se ve.
    await act(async () => {});
    expect(screen.queryByText("PRÁCTICA")).toBeNull();
    expect(serverCalls()).toBe(0);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("ofertas: Ofertar con el precio de lista tampoco llama al servidor y el tour sigue", async () => {
    panel("offers", "take");

    fireEvent.click(screen.getByRole("button", { name: /^Ofertar/ }));

    expect(await screen.findByRole("button", { name: "En camino" })).toBeTruthy();
    expect(mocks.server.offer).not.toHaveBeenCalled();
    expect(serverCalls()).toBe(0);
  });

  it("un toque fuera de su paso no adelanta el tutorial", () => {
    panel("fixed", "practice");

    fireEvent.click(screen.getByRole("button", { name: /^Tomar/ }));

    // Sigue en Disponibles: el paso de la tarjeta no esperaba ese toque.
    expect(screen.getByRole("button", { name: /^Tomar/ })).toBeTruthy();
    expect(serverCalls()).toBe(0);
  });
});

describe("el pedido de práctica convive con los reales y se va al terminar — ENVIO-217", () => {
  it("un pedido real se ve normal, arriba del de práctica, y sus botones siguen llamando al servidor", () => {
    panel("fixed", "take", [real]);

    const titles = screen.getAllByRole("article").map((article) => article.textContent ?? "");
    expect(titles[0]).toContain("#7 · Ana Resto");
    expect(titles[1]).toContain("PRÁCTICA");

    fireEvent.click(screen.getAllByRole("button", { name: /^Tomar/ })[0]);
    expect(mocks.server.take).toHaveBeenCalledWith("real-1");
  });

  it("saltear lo marca visto y saca el pedido de práctica", async () => {
    panel("fixed", "take");
    expect(screen.getByText("PRÁCTICA")).toBeTruthy();

    fireEvent.click(screen.getByText("saltear-prueba"));
    await act(async () => {});

    expect(screen.queryByText("PRÁCTICA")).toBeNull();
    expect(mocks.seen).toHaveBeenCalledTimes(1);
  });
});

describe("cuándo arranca el tutorial — ENVIO-213", () => {
  const mountWith = (autoStart: boolean) =>
    render(
      <TutorialProvider mode="fixed" zonePrice={null} autoStart={autoStart}>
        <p>panel</p>
      </TutorialProvider>,
    );

  it("la primera vez arranca solo, con la bienvenida", async () => {
    mountWith(true);

    await vi.waitFor(() => expect(mocks.highlight).toHaveBeenCalled());
    expect(mocks.highlight.mock.calls[0][0].popover.description).toContain("1 minuto");
    expect(mocks.highlight.mock.calls[0][0].popover.progressText).toMatch(/^1 de \d+$/);
  });

  it("si ya lo vio, no arranca", async () => {
    mountWith(false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mocks.highlight).not.toHaveBeenCalled();
  });
});
