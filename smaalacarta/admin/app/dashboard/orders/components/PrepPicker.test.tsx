import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PrepPicker from "./PrepPicker";

afterEach(cleanup);

function picker(props: Partial<React.ComponentProps<typeof PrepPicker>> = {}) {
  const handlers = { onConfirm: vi.fn(), onAcceptWithout: vi.fn(), onClose: vi.fn() };

  render(
    <PrepPicker
      orderNumber="7"
      mode="accept"
      suggested={null}
      defaultMinutes={20}
      busy={false}
      error={null}
      {...handlers}
      {...props}
    />,
  );

  return handlers;
}

const field = () => screen.getByLabelText(/otro valor/i) as HTMLInputElement;

describe("selector de tiempo al aceptar — ADMIN-PEDIDOS-31 y 32", () => {
  it("ofrece 10, 15, 20, 30 y 45 minutos", () => {
    picker();

    for (const minutes of [10, 15, 20, 30, 45]) {
      expect(screen.getByRole("button", { name: `${minutes} min` })).toBeTruthy();
    }
  });

  it("preselecciona la sugerencia y dice de dónde sale", () => {
    picker({ suggested: 22 });

    expect(screen.getByText("Sugerido: 22 min según tus últimos pedidos")).toBeTruthy();
    expect(field().value).toBe("22");
    expect(screen.getByRole("button", { name: "Aceptar con 22 min" })).toBeTruthy();
  });

  it("sin sugerencia preselecciona el tiempo por defecto y no dice 'Sugerido'", () => {
    picker({ defaultMinutes: 30 });

    expect(screen.queryByText(/Sugerido/)).toBeNull();
    expect(screen.getByRole("button", { name: "30 min", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aceptar con 30 min" })).toBeTruthy();
  });

  it("acepta de un solo toque con el valor preseleccionado", () => {
    const { onConfirm } = picker({ suggested: 22 });

    fireEvent.click(screen.getByRole("button", { name: "Aceptar con 22 min" }));

    expect(onConfirm).toHaveBeenCalledWith(22);
  });

  it("un botón rápido cambia el valor", () => {
    const { onConfirm } = picker();

    fireEvent.click(screen.getByRole("button", { name: "45 min" }));
    fireEvent.click(screen.getByRole("button", { name: "Aceptar con 45 min" }));

    expect(onConfirm).toHaveBeenCalledWith(45);
  });

  it("acepta otro valor escrito", () => {
    const { onConfirm } = picker();

    fireEvent.change(field(), { target: { value: "55" } });
    fireEvent.click(screen.getByRole("button", { name: "Aceptar con 55 min" }));

    expect(onConfirm).toHaveBeenCalledWith(55);
  });

  it("no acepta un valor fuera de 5 a 180 ni uno vacío", () => {
    const { onConfirm } = picker();

    for (const bad of ["3", "181", ""]) {
      fireEvent.change(field(), { target: { value: bad } });
      expect((screen.getByRole("button", { name: /^Aceptar con/ }) as HTMLButtonElement).disabled).toBe(true);
    }

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/de 5 a 180/)).toBeTruthy();
  });

  it("'Aceptar sin tiempo' confirma sin cargar nada", () => {
    const { onAcceptWithout, onConfirm } = picker();

    fireEvent.click(screen.getByRole("button", { name: "Aceptar sin tiempo" }));

    expect(onAcceptWithout).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("al cargar el tiempo de un pedido ya aceptado no ofrece aceptar sin tiempo", () => {
    picker({ mode: "set", defaultMinutes: 20 });

    expect(screen.queryByRole("button", { name: "Aceptar sin tiempo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar 20 min" })).toBeTruthy();
  });

  it("muestra el error y no se puede tocar mientras guarda", () => {
    picker({ error: "No pudimos guardar el cambio.", busy: true });

    expect(screen.getByRole("alert").textContent).toContain("No pudimos guardar");
    expect((screen.getByRole("button", { name: /Aceptando/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("se cierra con Cancelar y con Escape", () => {
    const { onClose } = picker();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("el segundo click de un doble click rápido no confirma lo que quedó debajo (ENVIO-171)", () => {
    const handlers = picker();

    fireEvent.click(screen.getByRole("button", { name: "Aceptar con 20 min" }), { detail: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Aceptar sin tiempo" }), { detail: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }), { detail: 2 });

    expect(handlers.onConfirm).not.toHaveBeenCalled();
    expect(handlers.onAcceptWithout).not.toHaveBeenCalled();
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it("un toque normal sí confirma (ENVIO-171)", () => {
    const handlers = picker();

    fireEvent.click(screen.getByRole("button", { name: "Aceptar con 20 min" }), { detail: 1 });

    expect(handlers.onConfirm).toHaveBeenCalledWith(20);
  });
});
