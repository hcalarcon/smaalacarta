import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleEnterKey, mountChoiceControls, trackTyping, viewportInsets } from "./checkout-controls.js";

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const APP_JS = read("../app.js");

// El checkout de index.html, reducido a lo que miran los controles.
function buildForm() {
  document.body.innerHTML = `
    <form id="form-pedido">
      <input name="nombre" />
      <input name="telefono" type="tel" />
      <select name="entrega" required>
        <option value="" disabled selected>-- Tipo de entrega --</option>
        <option value="delivery">Delivery</option>
        <option value="retiro">Retiro en el local</option>
      </select>
      <div id="envio-repartidor">
        <select name="barrio" required>
          <option value="" disabled selected>-- Barrio --</option>
          <option value="z1">Centro</option>
        </select>
        <input name="direccion" />
      </div>
      <div id="horario-programado">
        <select name="cuando">
          <option value="asap" selected>Lo antes posible</option>
          <option value="schedule">Programar para una hora</option>
        </select>
        <select name="hora" hidden>
          <option value="" disabled selected>-- Elegí la hora --</option>
          <option value="h1">20:00</option>
          <option value="h2">20:15</option>
        </select>
      </div>
      <select name="pago" required>
        <option value="" disabled selected>-- Tipo de pago --</option>
        <option value="efectivo">Efectivo</option>
        <option value="transferencia">Transferencia</option>
      </select>
      <textarea name="notas"></textarea>
      <button type="submit">Confirmar</button>
    </form>`;
  return document.querySelector("#form-pedido");
}

let form;
let onOpen;
let controls;
let described;

function mount() {
  controls = mountChoiceControls(form, {
    groups: [
      { name: "entrega" },
      {
        name: "barrio",
        kind: "picker",
        placeholder: () => "Elegí tu barrio",
        describe: () => described,
        onOpen: () => onOpen(),
      },
      { name: "cuando", label: () => "¿Para cuándo?" },
      { name: "hora" },
      { name: "pago" },
    ],
    errorText: () => "Elegí una opción",
  });
  return controls;
}

const select = (name) => form.querySelector(`select[name="${name}"]`);
const groupOf = (name) => select(name).closest(".opcion-grupo");
const radios = (name) => [...groupOf(name).querySelectorAll('[role="radio"]')];

beforeEach(() => {
  form = buildForm();
  onOpen = vi.fn();
  described = null;
});

describe("grupos de botones — PUBLICO-112", () => {
  it("cada select pasa a ser un grupo con un botón por opción (sin el texto guía)", () => {
    mount();
    expect(groupOf("entrega").querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(radios("entrega").map((b) => b.textContent)).toEqual(["Delivery", "Retiro en el local"]);
    expect(radios("pago").map((b) => b.textContent)).toEqual(["Efectivo", "Transferencia"]);
  });

  it("el select queda en el formulario, fuera de la vista y del foco", () => {
    mount();
    expect(form.contains(select("entrega"))).toBe(true);
    expect(select("entrega").classList.contains("opcion-select")).toBe(true);
    expect(select("entrega").tabIndex).toBe(-1);
    expect(select("entrega").getAttribute("aria-hidden")).toBe("true");
  });

  it("el grupo tiene nombre accesible (del texto guía o el que se indique)", () => {
    mount();
    const nameOf = (name) => {
      const group = groupOf(name).querySelector('[role="radiogroup"]');
      return document.getElementById(group.getAttribute("aria-labelledby")).textContent;
    };
    expect(nameOf("entrega")).toBe("Tipo de entrega");
    expect(nameOf("cuando")).toBe("¿Para cuándo?");
  });

  it("tocar un botón escribe el valor en el select y dispara change", () => {
    mount();
    const changed = vi.fn();
    select("pago").addEventListener("change", changed);
    radios("pago")[1].click();
    expect(select("pago").value).toBe("transferencia");
    expect(changed).toHaveBeenCalledTimes(1);
    expect(radios("pago").map((b) => b.getAttribute("aria-checked"))).toEqual(["false", "true"]);
  });

  it("un solo botón de cada grupo entra con Tab, y las flechas eligen el siguiente", () => {
    mount();
    expect(radios("pago").map((b) => b.tabIndex)).toEqual([0, -1]);
    radios("pago")[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(select("pago").value).toBe("transferencia");
    expect(radios("pago").map((b) => b.tabIndex)).toEqual([-1, 0]);
  });

  it("un valor puesto desde el código se ve al refrescar", () => {
    mount();
    select("entrega").value = "retiro";
    controls.refresh();
    expect(radios("entrega")[1].getAttribute("aria-checked")).toBe("true");
  });

  it("una opción deshabilitada o quitada se refleja al refrescar", () => {
    mount();
    select("entrega").querySelector('option[value="delivery"]').disabled = true;
    select("pago").querySelector('option[value="efectivo"]').remove();
    controls.refresh();
    expect(radios("entrega")[0].disabled).toBe(true);
    expect(radios("pago").map((b) => b.textContent)).toEqual(["Transferencia"]);
  });

  it("el grupo no se ve si el select está oculto, y vuelve a verse con la hora al programar", () => {
    select("entrega").hidden = true;
    mount();
    expect(groupOf("entrega").hidden).toBe(true);
    expect(groupOf("hora").hidden).toBe(true);
    select("hora").hidden = false;
    controls.refresh();
    expect(groupOf("hora").hidden).toBe(false);
    expect(radios("hora").map((b) => b.textContent)).toEqual(["20:00", "20:15"]);
  });

  it("al elegir, los botones no se reconstruyen: el foco no se pierde", () => {
    mount();
    const first = radios("pago")[0];
    first.click();
    expect(radios("pago")[0]).toBe(first);
  });
});

describe("botón de barrio — PUBLICO-113", () => {
  const trigger = () => groupOf("barrio").querySelector("button.opcion-selector");

  it("muestra 'Elegí tu barrio' hasta que haya uno elegido", () => {
    mount();
    expect(trigger().textContent).toBe("Elegí tu barrio");
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("con un barrio elegido muestra su nombre y su precio", () => {
    mount();
    select("barrio").value = "z1";
    described = { name: "Centro", aside: "$4.500" };
    controls.refresh();
    expect(trigger().querySelector(".opcion-nombre").textContent).toBe("Centro");
    expect(trigger().querySelector(".opcion-aparte").textContent).toBe("$4.500");
  });

  it("al tocarlo abre la lista, sin escribir nada", () => {
    mount();
    trigger().click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(select("barrio").value).toBe("");
  });
});

describe("error de 'falta elegir' — PUBLICO-114", () => {
  it("el select inválido muestra el error en su grupo y se va al elegir", () => {
    mount();
    const error = groupOf("pago").querySelector(".opcion-error");
    expect(error.hidden).toBe(true);

    select("pago").dispatchEvent(new Event("invalid", { cancelable: true }));
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe("Elegí una opción");
    expect(error.getAttribute("role")).toBe("alert");
    expect(groupOf("pago").classList.contains("con-error")).toBe(true);

    radios("pago")[0].click();
    expect(error.hidden).toBe(true);
    expect(groupOf("pago").classList.contains("con-error")).toBe(false);
  });

  it("sigue validando con los select: sin elegir, el formulario es inválido", () => {
    mount();
    expect(form.checkValidity()).toBe(false);
    radios("entrega")[1].click();
    radios("pago")[0].click();
    select("barrio").required = false;
    expect(form.checkValidity()).toBe(true);
  });
});

describe("Enter pasa al campo siguiente — PUBLICO-115", () => {
  const press = (target, key = "Enter") => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    mount();
    form.addEventListener("keydown", (event) => handleEnterKey(event, form));
  });

  it("en un input no manda el pedido y enfoca el campo siguiente", () => {
    const nombre = form.querySelector('input[name="nombre"]');
    expect(press(nombre).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(form.querySelector('input[name="telefono"]'));
  });

  it("después de un campo de texto pasa al grupo de botones siguiente", () => {
    press(form.querySelector('input[name="telefono"]'));
    expect(document.activeElement).toBe(radios("entrega")[0]);
  });

  it("salta lo que está oculto o deshabilitado", () => {
    form.querySelector("#envio-repartidor").hidden = true;
    form.querySelector('input[name="direccion"]').disabled = true;
    press(form.querySelector('input[name="telefono"]'));
    expect(document.activeElement).toBe(radios("entrega")[0]);
  });

  it("el último campo suelta el teclado en vez de saltar al botón de enviar", () => {
    const direccion = form.querySelector('input[name="direccion"]');
    form.querySelector("textarea").hidden = true;
    form.querySelector("#horario-programado").hidden = true;
    groupOf("pago").hidden = true;
    direccion.focus();
    press(direccion);
    expect(document.activeElement).not.toBe(direccion);
    expect(document.activeElement?.type).not.toBe("submit");
  });

  it("un campo fuera de la lista no manda el foco al principio del formulario", () => {
    const nombre = form.querySelector('input[name="nombre"]');
    const oculto = form.querySelector('input[name="direccion"]');
    form.querySelector("#envio-repartidor").hidden = true;
    oculto.focus();
    press(oculto);
    expect(document.activeElement).not.toBe(nombre);
  });

  it("en notas (textarea) Enter sigue siendo salto de línea", () => {
    expect(press(form.querySelector("textarea")).defaultPrevented).toBe(false);
  });

  it("otras teclas no se tocan", () => {
    expect(press(form.querySelector('input[name="nombre"]'), "a").defaultPrevented).toBe(false);
  });
});

describe("área visible con el teclado abierto — PUBLICO-116", () => {
  it("sin teclado, no hay nada que restar", () => {
    expect(viewportInsets({ innerHeight: 800, visualViewport: { height: 800, offsetTop: 0 } })).toEqual({
      kb: 0,
      top: 0,
      height: 800,
    });
  });

  it("con el teclado, la hoja se acorta por abajo lo que tapa el teclado", () => {
    expect(viewportInsets({ innerHeight: 800, visualViewport: { height: 500, offsetTop: 0 } })).toEqual({
      kb: 300,
      top: 0,
      height: 500,
    });
  });

  it("si iPhone corrió la vista hacia abajo, la hoja la sigue", () => {
    expect(viewportInsets({ innerHeight: 800, visualViewport: { height: 500, offsetTop: 120 } })).toEqual({
      kb: 180,
      top: 120,
      height: 500,
    });
  });

  it("si el navegador ya achicó la página (Android), no resta dos veces", () => {
    expect(viewportInsets({ innerHeight: 500, visualViewport: { height: 500, offsetTop: 0 } }).kb).toBe(0);
  });

  it("sin visualViewport no hay datos", () => {
    expect(viewportInsets({ innerHeight: 800, visualViewport: null })).toBeNull();
  });
});

describe("index.html — PUBLICO-115", () => {
  const html = read("../index.html");

  it("el teclado muestra Siguiente en nombre, teléfono y dirección, y Listo en notas", () => {
    for (const name of ["nombre", "telefono", "direccion"]) {
      expect(html).toMatch(new RegExp(`<input[^>]*name="${name}"[^>]*enterkeyhint="next"`));
    }
    expect(html).toMatch(/<textarea[^>]*name="notas"[^>]*enterkeyhint="done"/);
  });
});

describe("campo con foco visible y pie fuera del camino — PUBLICO-116", () => {
  let sheet;
  let win;

  beforeEach(() => {
    vi.useFakeTimers();
    mount();
    sheet = document.createElement("div");
    win = {
      document,
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      matchMedia: () => ({ matches: true }),
      visualViewport: null,
    };
    trackTyping(form, sheet, { win, delay: 300 });
  });

  it("al escribir en un celular se oculta el pie y el campo se centra cuando el teclado ya subió", () => {
    const nombre = form.querySelector('input[name="nombre"]');
    nombre.scrollIntoView = vi.fn();
    nombre.focus();
    expect(sheet.classList.contains("escribiendo")).toBe(true);
    expect(nombre.scrollIntoView).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(nombre.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });

  it("pasar de un campo de texto a otro mantiene el pie oculto; salir a un botón lo devuelve", () => {
    form.querySelector('input[name="nombre"]').focus();
    form.querySelector('input[name="telefono"]').focus();
    vi.advanceTimersByTime(10);
    expect(sheet.classList.contains("escribiendo")).toBe(true);

    radios("pago")[0].focus();
    vi.advanceTimersByTime(10);
    expect(sheet.classList.contains("escribiendo")).toBe(false);
  });

  it("con mouse (sin teclado en pantalla) el pie no se toca", () => {
    const desktop = document.createElement("div");
    trackTyping(form, desktop, { win: { ...win, matchMedia: () => ({ matches: false }) } });
    form.querySelector('input[name="nombre"]').focus();
    expect(desktop.classList.contains("escribiendo")).toBe(false);
  });
});

describe("app.js — aviso de la zona y botón de barrio (PUBLICO-75, 111 y 113)", () => {
  it("elegir una zona ya no pasa por el paso confirmado: cierra y avisa", () => {
    expect(APP_JS).not.toContain("confirmed");
    expect(APP_JS).toContain("ZONE_STEP = ZONE.stepAfterChoice(choice)");
    expect(APP_JS).toContain("showZoneToast(ZONE.choiceToast(choice, COURIER_ZONES, PRICE.formatPrice))");
  });

  it("el barrio del checkout reutiliza la lista del selector de zona", () => {
    expect(APP_JS).toMatch(/function openZonePicker\(\)[\s\S]*renderZoneList\(list, "", pick\)/);
    expect(APP_JS).toContain("renderZoneList(list, search.value, pick)");
    expect(APP_JS).toContain("ZONE.filterZones(COURIER_ZONES.zones, query)");
  });
});
