import { describe, expect, it, vi } from "vitest";

import {
  discardPlaceholder,
  openPlaceholder,
  openWhatsApp,
  shouldUseNewWindow,
} from "./whatsapp-window.js";

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0";

const env = ({ fine = true, userAgent = DESKTOP_UA } = {}) => ({
  matchMedia: vi.fn(() => ({ matches: fine })),
  navigator: { userAgent },
});

describe("shouldUseNewWindow", () => {
  it("es true en escritorio: puntero fino con hover y navegador de PC", () => {
    const e = env();
    expect(shouldUseNewWindow(e)).toBe(true);
    expect(e.matchMedia).toHaveBeenCalledWith("(hover: hover) and (pointer: fine)");
  });

  it("es false si el puntero es táctil", () => {
    expect(shouldUseNewWindow(env({ fine: false }))).toBe(false);
  });

  it.each(["Android", "iPhone", "iPad", "Mobile"])(
    "es false si el navegador dice %s, aunque el puntero parezca fino",
    (marca) => {
      expect(shouldUseNewWindow(env({ userAgent: `Mozilla/5.0 (${marca}) Safari` }))).toBe(false);
    },
  );

  it("es false si no hay matchMedia", () => {
    expect(shouldUseNewWindow({ navigator: { userAgent: DESKTOP_UA } })).toBe(false);
  });
});

describe("openPlaceholder", () => {
  it("en escritorio abre una ventana en blanco y la devuelve", () => {
    const blank = { closed: false };
    const win = { ...env(), open: vi.fn(() => blank) };
    expect(openPlaceholder(win)).toBe(blank);
    expect(win.open).toHaveBeenCalledWith("about:blank", "_blank");
  });

  it("devuelve null si el navegador la bloqueó", () => {
    expect(openPlaceholder({ ...env(), open: vi.fn(() => null) })).toBeNull();
  });

  it("en celulares no abre nada", () => {
    const win = { ...env({ fine: false }), open: vi.fn() };
    expect(openPlaceholder(win)).toBeNull();
    expect(win.open).not.toHaveBeenCalled();
  });
});

describe("openWhatsApp", () => {
  it("con ventana en blanco la manda a WhatsApp, sin opener, y devuelve 'window'", () => {
    const placeholder = { closed: false, opener: {}, location: { href: "about:blank" } };
    const nav = { location: { href: "https://menu" } };
    expect(openWhatsApp(placeholder, "https://wa.me/1", nav)).toBe("window");
    expect(placeholder.location.href).toBe("https://wa.me/1");
    expect(placeholder.opener).toBeNull();
    expect(nav.location.href).toBe("https://menu");
  });

  it("sin ventana usa la misma pestaña y devuelve 'same-tab'", () => {
    const nav = { location: { href: "https://menu" } };
    expect(openWhatsApp(null, "https://wa.me/1", nav)).toBe("same-tab");
    expect(nav.location.href).toBe("https://wa.me/1");
  });

  it("si el cliente cerró la ventana en blanco, cae a la misma pestaña", () => {
    const placeholder = { closed: true, location: { href: "" } };
    const nav = { location: { href: "" } };
    expect(openWhatsApp(placeholder, "https://wa.me/1", nav)).toBe("same-tab");
    expect(nav.location.href).toBe("https://wa.me/1");
  });
});

describe("discardPlaceholder", () => {
  it("cierra la ventana en blanco", () => {
    const placeholder = { closed: false, close: vi.fn() };
    discardPlaceholder(placeholder);
    expect(placeholder.close).toHaveBeenCalled();
  });

  it("no hace nada sin ventana o si ya está cerrada, y no falla si close lanza", () => {
    expect(() => discardPlaceholder(null)).not.toThrow();
    const cerrada = { closed: true, close: vi.fn() };
    discardPlaceholder(cerrada);
    expect(cerrada.close).not.toHaveBeenCalled();
    expect(() =>
      discardPlaceholder({ closed: false, close: () => { throw new Error("x"); } }),
    ).not.toThrow();
  });
});
