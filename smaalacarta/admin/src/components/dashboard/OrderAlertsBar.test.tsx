import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/dashboard",
  pwa: { pushControl: "enable", busy: false, error: null as string | null },
  enablePush: vi.fn(async () => undefined),
  start: vi.fn(),
  unlock: vi.fn(),
  ready: false,
  primeSpeech: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/components/pwa/pwa-store", () => ({
  usePwa: () => mocks.pwa,
  enablePush: mocks.enablePush,
  start: mocks.start,
}));
vi.mock("@/lib/orders/sound-pref", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders/sound-pref")>()),
  isAudioReady: () => mocks.ready,
  unlockSharedAudio: mocks.unlock,
}));

vi.mock("@/lib/orders/speech", () => ({
  primeSpeech: () => mocks.primeSpeech(),
  cancelSpeech: vi.fn(),
  speakText: vi.fn(),
}));

import OrderAlertsBar from "./OrderAlertsBar";

const PREF_KEY = "sma-orders-sound";

beforeEach(() => {
  localStorage.clear();
  mocks.push.mockClear();
  mocks.unlock.mockClear();
  mocks.enablePush.mockClear();
  mocks.pathname = "/dashboard";
  mocks.pwa = { pushControl: "enable", busy: false, error: null };
  mocks.ready = false;
  mocks.unlock.mockImplementation(async () => {
    mocks.ready = true;
    window.dispatchEvent(new Event("sma-orders-sound-change"));
    return {};
  });
});

afterEach(cleanup);

// ADMIN-PEDIDOS-30: la barra roja de arriba, en cualquier pantalla del panel del negocio.
describe("barra de avisos — ADMIN-PEDIDOS-30", () => {
  it("sin sonido ni avisos dice que no va a oír los pedidos y ofrece las dos cosas", () => {
    localStorage.setItem(PREF_KEY, "0");
    render(<OrderAlertsBar />);

    expect(screen.getByRole("alert").textContent).toContain("No vas a oír los pedidos nuevos");
    expect(screen.getByRole("button", { name: "Activar el sonido" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Activar los avisos" })).toBeTruthy();
  });

  it("con el sonido listo y los avisos activados no se ve", () => {
    localStorage.setItem(PREF_KEY, "1");
    mocks.ready = true;
    mocks.pwa = { pushControl: "enabled", busy: false, error: null };

    render(<OrderAlertsBar />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("si solo falta el sonido, solo ofrece el sonido", () => {
    localStorage.setItem(PREF_KEY, "0");
    mocks.pwa = { pushControl: "enabled", busy: false, error: null };
    render(<OrderAlertsBar />);

    expect(screen.getByRole("button", { name: "Activar el sonido" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Activar los avisos" })).toBeNull();
  });

  it("si solo faltan los avisos, solo ofrece los avisos", () => {
    localStorage.setItem(PREF_KEY, "1");
    mocks.ready = true;
    render(<OrderAlertsBar />);

    expect(screen.queryByRole("button", { name: "Activar el sonido" })).toBeNull();
    expect(screen.getByRole("button", { name: "Activar los avisos" })).toBeTruthy();
  });

  it("'Activar los avisos' pide el permiso con un toque", async () => {
    render(<OrderAlertsBar />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Activar los avisos" })));
    expect(mocks.enablePush).toHaveBeenCalledTimes(1);
  });

  it("'Activar el sonido' lo guarda, habilita el audio y lleva a Pedidos, donde suena", async () => {
    localStorage.setItem(PREF_KEY, "0");
    render(<OrderAlertsBar />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Activar el sonido" })));

    expect(localStorage.getItem(PREF_KEY)).toBe("1");
    expect(mocks.unlock).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/orders");
    expect(screen.queryByRole("button", { name: "Activar el sonido" })).toBeNull();
  });

  it("en Pedidos activar el sonido no navega", async () => {
    mocks.pathname = "/dashboard/orders";
    localStorage.setItem(PREF_KEY, "0");
    render(<OrderAlertsBar />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Activar el sonido" })));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("con el permiso bloqueado lo dice, sin botón para activar", () => {
    localStorage.setItem(PREF_KEY, "1");
    mocks.ready = true;
    mocks.pwa = { pushControl: "blocked", busy: false, error: null };
    render(<OrderAlertsBar />);

    expect(screen.getByRole("alert").textContent).toContain("bloqueados");
    expect(screen.queryByRole("button", { name: "Activar los avisos" })).toBeNull();
  });

  it("en iPhone sin instalar pide instalar la app", () => {
    localStorage.setItem(PREF_KEY, "1");
    mocks.ready = true;
    mocks.pwa = { pushControl: "install-first", busy: false, error: null };
    render(<OrderAlertsBar />);

    expect(screen.getByRole("alert").textContent).toContain("Instalá la app");
  });

  it("sin tocar, el sonido prendido por defecto no tapa con el recuadro: solo un aviso chico (ADMIN-PWA-39)", () => {
    mocks.pwa = { pushControl: "enabled", busy: false, error: null };
    render(<OrderAlertsBar />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Activar el sonido" })).toBeNull();
    expect(screen.getByText("Tocá la pantalla para activar el sonido")).toBeTruthy();
  });

  it("el primer toque en cualquier lugar habilita el sonido y saca el aviso (ADMIN-PWA-39)", async () => {
    mocks.pwa = { pushControl: "enabled", busy: false, error: null };
    render(<OrderAlertsBar />);

    await act(async () => {
      fireEvent.pointerUp(document.body);
    });

    expect(mocks.unlock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Tocá la pantalla para activar el sonido")).toBeNull();
  });

  it("un toque que dispara pointerup y click habilita una sola vez (ADMIN-PWA-39)", async () => {
    mocks.pwa = { pushControl: "enabled", busy: false, error: null };
    render(<OrderAlertsBar />);

    await act(async () => {
      fireEvent.pointerUp(document.body);
      fireEvent.click(document.body);
    });

    expect(mocks.unlock).toHaveBeenCalledTimes(1);
  });

  it("si lo apagó a propósito, tocar la pantalla no lo prende (ADMIN-PWA-39)", async () => {
    localStorage.setItem(PREF_KEY, "0");
    mocks.pwa = { pushControl: "enabled", busy: false, error: null };
    render(<OrderAlertsBar />);

    await act(async () => {
      fireEvent.pointerUp(document.body);
    });

    expect(mocks.unlock).not.toHaveBeenCalled();
    expect(screen.queryByText("Tocá la pantalla para activar el sonido")).toBeNull();
  });

  it("muestra el error de activar los avisos", () => {
    mocks.pwa = { pushControl: "enable", busy: false, error: "No diste el permiso" };
    render(<OrderAlertsBar />);

    expect(screen.getByRole("alert").textContent).toContain("No diste el permiso");
  });
});
