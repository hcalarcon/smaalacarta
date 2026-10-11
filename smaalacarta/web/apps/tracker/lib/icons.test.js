import { describe, expect, it } from "vitest";

import { ICON_KEYS, icon } from "./icons.js";

describe("icon — SEGUIMIENTO-25", () => {
  it("arma un SVG con elementos, sin HTML en texto", () => {
    const svg = icon(document, "onTheWay");

    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("class")).toBe("icon icon-onTheWay");
    expect(svg.querySelectorAll("circle").length).toBe(2);
    expect(svg.textContent).toBe("");
  });

  it("hay un ícono para cada paso y para el envío", () => {
    for (const key of [
      "received",
      "accepted",
      "ready",
      "readyPickup",
      "onTheWay",
      "delivered",
      "pickedUp",
      "cancelled",
      "searching",
      "choose",
      "self",
      "check",
    ]) {
      expect(ICON_KEYS).toContain(key);
      expect(icon(document, key).childNodes.length).toBeGreaterThan(0);
    }
  });

  it("una clave desconocida da un SVG vacío y no rompe", () => {
    const svg = icon(document, "x\"><script>");
    expect(svg.childNodes.length).toBe(0);
    expect(svg.querySelector("script")).toBeNull();
  });
});
