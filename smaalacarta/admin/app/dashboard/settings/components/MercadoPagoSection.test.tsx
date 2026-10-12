import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MercadoPagoSection from "./MercadoPagoSection";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// Configuración → Mercado Pago (MP-9, MP-14): el botón conecta, "Desconectar" pide confirmación y nada de la
// conexión (tokens, ids) se muestra.
const fetchMock = vi.fn();
const assign = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", { value: { assign }, writable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });

describe("sin conexión", () => {
  it("ofrece conectar y manda al usuario a la URL de Mercado Pago", async () => {
    fetchMock.mockReturnValue(reply(200, { url: "https://auth.mercadopago.com/authorization?x=1" }));
    render(<MercadoPagoSection status="none" isOwner result={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Conectar Mercado Pago" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://auth.mercadopago.com/authorization?x=1"));
    expect(fetchMock).toHaveBeenCalledWith("/admin/api/mp/oauth/start", { method: "POST" });
  });

  it("si no se puede iniciar, avisa y deja volver a intentar", async () => {
    fetchMock.mockReturnValue(reply(404, { error: "not_found" }));
    render(<MercadoPagoSection status="none" isOwner result={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Conectar Mercado Pago" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/No pudimos iniciar/);
    expect(assign).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Conectar Mercado Pago" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("un miembro staff no ve botones y se le dice por qué", () => {
    render(<MercadoPagoSection status="none" isOwner={false} result={null} />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Solo el dueño/)).toBeTruthy();
  });
});

describe("conectada", () => {
  it("muestra Conectado y desconecta recién al confirmar", async () => {
    fetchMock.mockReturnValue(reply(200, { ok: true }));
    render(<MercadoPagoSection status="connected" isOwner result={null} />);

    expect(screen.getByText("Conectado")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conectar Mercado Pago" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Desconectar Mercado Pago")).toBeTruthy();

    const buttons = screen.getAllByRole("button", { name: "Desconectar" });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/admin/api/mp/oauth/disconnect", { method: "POST" });
  });

  it("cancelar la confirmación no desconecta", () => {
    render(<MercadoPagoSection status="connected" isOwner result={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Desconectar Mercado Pago")).toBeNull();
  });
});

describe("el resultado del callback", () => {
  it("avisa que quedó conectada", () => {
    render(<MercadoPagoSection status="connected" isOwner result="connected" />);

    expect(screen.getByRole("status").textContent).toMatch(/quedó conectada/);
  });

  it("avisa del error sin detalles", () => {
    render(<MercadoPagoSection status="none" isOwner result="error" />);

    expect(screen.getByRole("alert").textContent).toMatch(/No pudimos conectar/);
  });
});
