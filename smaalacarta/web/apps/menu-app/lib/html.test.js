import { describe, expect, it } from "vitest";

import { cssUrl, escapeHtml, safeHttpUrl, safeHttpsUrl } from "./html.js";

describe("escapeHtml — PUBLICO-9", () => {
  it("escapa lo que permite inyectar HTML o cerrar un atributo", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(escapeHtml(`Tom & "Jerry" 'x'`)).toBe("Tom &amp; &quot;Jerry&quot; &#39;x&#39;");
  });

  it("no doble escapa lo que ya está escapado por el propio texto", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("deja el texto normal como está", () => {
    expect(escapeHtml("Café con leche ñandú 100%")).toBe("Café con leche ñandú 100%");
  });

  it.each([
    [null, ""],
    [undefined, ""],
    [0, "0"],
    [1500.5, "1500.5"],
    [false, "false"],
  ])("convierte %j a texto", (valor, esperado) => {
    expect(escapeHtml(valor)).toBe(esperado);
  });
});

describe("safeHttpUrl — PUBLICO-9", () => {
  it.each([
    ["https://ejemplo.com/a.jpg", "https://ejemplo.com/a.jpg"],
    ["http://ejemplo.com/a.jpg", "http://ejemplo.com/a.jpg"],
    ["  https://ejemplo.com/a.jpg  ", "https://ejemplo.com/a.jpg"],
  ])("acepta %j", (entrada, esperado) => {
    expect(safeHttpUrl(entrada)).toBe(esperado);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:x",
    "//ejemplo.com/a.jpg",
    "/local/a.jpg",
    "ejemplo.com/a.jpg",
    "",
    null,
    undefined,
    42,
  ])("rechaza %j", (entrada) => {
    expect(safeHttpUrl(entrada)).toBe("");
  });
});

describe("cssUrl — PUBLICO-9", () => {
  it("arma un url() válido", () => {
    expect(cssUrl("https://ejemplo.com/a.jpg")).toBe('url("https://ejemplo.com/a.jpg")');
  });

  it("no puede cerrar el url() ni la comilla", () => {
    const value = cssUrl('https://ejemplo.com/a.jpg");background:red;x:("');
    expect(value.startsWith('url("')).toBe(true);
    expect(value.endsWith('")')).toBe(true);
    expect(value.slice(5, -2)).not.toMatch(/["()\\]/);
  });

  it("una dirección con espacios no se aplica", () => {
    expect(cssUrl('https://ejemplo.com/a.jpg"); background: red')).toBe("none");
  });

  it("con una dirección no válida no aplica nada", () => {
    expect(cssUrl("javascript:alert(1)")).toBe("none");
    expect(cssUrl("")).toBe("none");
  });
});

describe("safeHttpsUrl — PWA-1", () => {
  it("acepta https y descarta http, javascript y rutas", () => {
    expect(safeHttpsUrl("https://x.com/a.png")).toBe("https://x.com/a.png");
    expect(safeHttpsUrl("http://x.com/a.png")).toBe("");
    expect(safeHttpsUrl("javascript:alert(1)")).toBe("");
    expect(safeHttpsUrl("/a.png")).toBe("");
    expect(safeHttpsUrl(null)).toBe("");
  });
});
