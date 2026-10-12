// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAppBadgeSafe, restoreFavicon, setAppBadgeSafe, updateFavicon } from "./badge";

// ADMIN-PEDIDOS-28: el globito no rompe nada cuando el navegador no tiene la API o el canvas.
describe("globito de pendientes — ADMIN-PEDIDOS-28", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "setAppBadge");
    Reflect.deleteProperty(navigator, "clearAppBadge");
    document.head.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("en la app instalada marca la cantidad y la borra", async () => {
    const set = vi.fn(async () => undefined);
    const clear = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "setAppBadge", { configurable: true, value: set });
    Object.defineProperty(navigator, "clearAppBadge", { configurable: true, value: clear });

    await setAppBadgeSafe(3);
    expect(set).toHaveBeenCalledWith(3);

    await setAppBadgeSafe(0);
    expect(clear).toHaveBeenCalled();

    await clearAppBadgeSafe();
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it("sin la API no hace nada ni lanza", async () => {
    await expect(setAppBadgeSafe(2)).resolves.toBeUndefined();
    await expect(clearAppBadgeSafe()).resolves.toBeUndefined();
  });

  it("si la API rechaza, tampoco lanza", async () => {
    Object.defineProperty(navigator, "setAppBadge", {
      configurable: true,
      value: vi.fn(async () => {
        throw new Error("sin permiso");
      }),
    });

    await expect(setAppBadgeSafe(1)).resolves.toBeUndefined();
  });

  describe("favicon", () => {
    beforeEach(() => {
      document.head.innerHTML = '<link rel="icon" href="/admin/favicon.ico">';
    });

    it("dibuja la cantidad en un canvas y restaura el ícono original al llegar a cero", () => {
      const drawn: string[] = [];
      const context = {
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn((text: string) => drawn.push(text)),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        set fillStyle(_value: string) {},
        set font(_value: string) {},
        set textAlign(_value: string) {},
        set textBaseline(_value: string) {},
      };
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
      vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA");

      updateFavicon(4);

      const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')!;
      expect(drawn).toContain("4");
      expect(link.href).toContain("data:image/png");

      updateFavicon(0);
      expect(link.getAttribute("href")).toBe("/admin/favicon.ico");
    });

    it("sin canvas deja el ícono como está y no lanza", () => {
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

      expect(() => updateFavicon(2)).not.toThrow();
      expect(document.querySelector<HTMLLinkElement>('link[rel~="icon"]')!.getAttribute("href")).toBe(
        "/admin/favicon.ico",
      );
    });

    it("sin ningún link de ícono no hace nada", () => {
      document.head.innerHTML = "";
      expect(() => updateFavicon(2)).not.toThrow();
      expect(() => restoreFavicon()).not.toThrow();
    });
  });
});
