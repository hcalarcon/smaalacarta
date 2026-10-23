// Controles del checkout para el celular (PUBLICO-112 a 117). Los <select> de siempre quedan en el formulario,
// fuera de la vista, como fuente del valor: los botones escriben ahí y disparan `change`, así la validación,
// el armado del pedido y todo lo que escucha a los select siguen igual. Todo el texto va con textContent.

let nextId = 0;

const TEXT_TYPES = ["text", "tel", "search", "email", "number", "url", "password"];

// El texto guía de un select ("-- Barrio --") sirve de nombre del grupo, sin los guiones.
const stripDashes = (text) => String(text ?? "").replace(/^[\s\-–—]+|[\s\-–—]+$/g, "");

const isPlaceholder = (option) => !option.hasAttribute("value") || option.value === "";

const isTextField = (node) =>
  node?.tagName === "TEXTAREA" || (node?.tagName === "INPUT" && TEXT_TYPES.includes(node.type));

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function writeValue(select, value) {
  if (select.value === value) return;
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function buildGroup(form, config, errorText) {
  const select = form.querySelector(`select[name="${config.name}"]`);
  if (!select) return null;

  const doc = form.ownerDocument;
  const id = `opcion-${++nextId}`;
  const picker = config.kind === "picker";

  const box = el(doc, "div", "opcion-grupo");
  box.dataset.campo = config.name;
  const label = el(doc, "span", "opcion-etiqueta");
  label.id = `${id}-etiqueta`;
  const error = el(doc, "p", "opcion-error");
  error.setAttribute("role", "alert");
  error.hidden = true;

  select.before(box);
  select.classList.add("opcion-select");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  let control;
  if (picker) {
    control = el(doc, "button", "opcion-boton opcion-selector");
    control.type = "button";
    control.id = `${id}-boton`;
    control.setAttribute("aria-haspopup", "dialog");
    control.setAttribute("aria-labelledby", `${label.id} ${control.id}`);
    control.addEventListener("click", () => config.onOpen?.());
  } else {
    control = el(doc, "div", `opcion-botones opcion-${config.name}`);
    control.setAttribute("role", "radiogroup");
    control.setAttribute("aria-labelledby", label.id);
  }
  box.append(label, control, error, select);

  const state = { select, box, label, control, error, signature: null, picker };

  state.labelText = () => {
    if (typeof config.label === "function") return config.label();
    if (typeof config.label === "string") return config.label;
    return stripDashes([...select.options].find(isPlaceholder)?.textContent);
  };

  const buttons = () => [...control.querySelectorAll('[role="radio"]')];

  function choose(value) {
    writeValue(select, value);
  }

  function refreshRadios() {
    const options = [...select.options].filter((option) => !isPlaceholder(option));
    const signature = options.map((o) => `${o.value}|${o.textContent}|${o.disabled}`).join("\n");

    if (signature !== state.signature) {
      state.signature = signature;
      control.replaceChildren(
        ...options.map((option) => {
          const button = el(doc, "button", "opcion-boton", option.textContent);
          button.type = "button";
          button.setAttribute("role", "radio");
          button.dataset.valor = option.value;
          button.disabled = option.disabled;
          button.addEventListener("click", () => choose(option.value));
          return button;
        }),
      );
    }

    const list = buttons();
    const checked = list.find((button) => button.dataset.valor === select.value && !button.disabled);
    const stop = checked ?? list.find((button) => !button.disabled);
    list.forEach((button) => {
      button.setAttribute("aria-checked", String(button === checked));
      button.tabIndex = button === stop ? 0 : -1;
    });
  }

  function refreshPicker() {
    const info = select.value ? config.describe?.(select.value) : null;
    control.replaceChildren();
    if (info) {
      control.append(el(doc, "span", "opcion-nombre", info.name));
      if (info.aside) control.append(el(doc, "span", "opcion-aparte", info.aside));
      control.classList.add("elegido");
    } else {
      control.append(el(doc, "span", "opcion-nombre", config.placeholder?.() ?? state.labelText()));
      control.classList.remove("elegido");
    }
  }

  state.refresh = () => {
    label.textContent = state.labelText();
    box.hidden = select.hidden;
    if (picker) refreshPicker();
    else refreshRadios();
  };

  state.clearError = () => {
    error.hidden = true;
    error.textContent = "";
    box.classList.remove("con-error");
  };

  // Flechas: eligen el botón de al lado, como en cualquier grupo de radios.
  if (!picker) {
    control.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      const enabled = buttons().filter((button) => !button.disabled);
      const at = enabled.indexOf(event.target);
      if (at === -1 || enabled.length === 0) return;
      event.preventDefault();
      const next = enabled[(at + step + enabled.length) % enabled.length];
      choose(next.dataset.valor);
      next.focus();
    });
  }

  select.addEventListener("change", () => {
    state.clearError();
    state.refresh();
  });

  // "Falta elegir": el error se ve en el grupo. Si es el primer campo con problema, se enfoca el botón y
  // no el select escondido (el aviso nativo saldría de un lugar donde no hay nada).
  select.addEventListener("invalid", (event) => {
    error.textContent = errorText();
    error.hidden = false;
    box.classList.add("con-error");
    let first = null;
    try {
      first = form.querySelector(":invalid");
    } catch {
      // Sin :invalid en el entorno: se deja el aviso nativo.
    }
    if (first !== select) return;
    event.preventDefault();
    const target = picker ? control : (control.querySelector('[tabindex="0"]') ?? control.querySelector("button"));
    target?.focus({ preventScroll: true });
    box.scrollIntoView?.({ block: "center", behavior: "smooth" });
  });

  // Si el navegador quiere enfocar el select (validación, etiqueta), el foco va al control visible.
  select.addEventListener("focus", () => {
    (picker ? control : (control.querySelector('[tabindex="0"]') ?? control.querySelector("button")))?.focus();
  });

  state.refresh();
  return state;
}

// Arma los grupos. `groups`: [{ name, kind: "radio" | "picker", label?, placeholder?, describe?, onOpen? }].
// `refresh()` vuelve a leer los select: se llama después de cambiar un valor, las opciones o `hidden` desde el código.
export function mountChoiceControls(form, { groups, errorText }) {
  const mounted = groups.map((config) => buildGroup(form, config, errorText)).filter(Boolean);
  return {
    refresh: () => mounted.forEach((group) => group.refresh()),
  };
}

// Enter en un campo de texto pasa al siguiente y nunca manda el pedido (PUBLICO-115). En el último suelta el
// teclado. En notas (textarea) Enter es un salto de línea, como siempre.
export function handleEnterKey(event, form) {
  const target = event.target;
  if (event.key !== "Enter" || event.isComposing || target?.tagName !== "INPUT") return;
  if (!isTextField(target) && target.type !== "time") return;

  event.preventDefault();

  const fields = [...form.querySelectorAll("input, textarea, .opcion-boton")].filter((node) => {
    if (node.disabled || node.closest("[hidden]")) return false;
    if (node.classList.contains("opcion-boton")) return node.tabIndex === 0;
    return isTextField(node) || node.type === "time";
  });

  const at = fields.indexOf(target);
  const next = at === -1 ? null : fields[at + 1];
  if (next) next.focus();
  else target.blur();
}

// Qué parte de la pantalla ve de verdad el cliente con el teclado abierto (PUBLICO-116). `kb` es lo que tapa el
// teclado por abajo; `top`, cuánto corrió iPhone la vista hacia abajo; `height`, el alto visible. Si el navegador
// ya achicó la página (Android con `resizes-content`), `innerHeight` coincide con el alto visible y no hay nada que restar.
export function viewportInsets({ innerHeight, visualViewport }) {
  if (!visualViewport) return null;
  const top = Math.round(visualViewport.offsetTop);
  const height = Math.round(visualViewport.height);
  return { kb: Math.max(0, Math.round(innerHeight - visualViewport.height - visualViewport.offsetTop)), top, height };
}

// Publica el área visible como variables CSS en <html> (`--kb`, `--vv-top`, `--vv-h`) para que la hoja del checkout
// y los diálogos de zona se achiquen por arriba del teclado. Devuelve la función que lo apaga.
export function watchKeyboard(win = window) {
  const viewport = win.visualViewport;
  if (!viewport) return () => {};

  const root = win.document.documentElement;
  const update = () => {
    const insets = viewportInsets({ innerHeight: win.innerHeight, visualViewport: viewport });
    if (!insets) return;
    root.style.setProperty("--kb", `${insets.kb}px`);
    root.style.setProperty("--vv-top", `${insets.top}px`);
    root.style.setProperty("--vv-h", `${insets.height}px`);
  };

  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  update();
  return () => {
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
  };
}

// Mientras se escribe en un campo de texto en un celular, la hoja lleva la clase `escribiendo` (el pie con el
// total se oculta para dejar lugar) y el campo con foco se centra en pantalla (PUBLICO-116).
export function trackTyping(form, sheet, { win = window, delay = 300 } = {}) {
  const coarse = () => Boolean(win.matchMedia?.("(pointer: coarse)").matches);
  const center = (node) => {
    if (node?.isConnected && node === win.document.activeElement) {
      node.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
  };

  form.addEventListener("focusin", (event) => {
    if (!isTextField(event.target) || !coarse()) return;
    sheet.classList.add("escribiendo");
    // El teclado tarda en subir: se espera a que la hoja ya tenga su alto nuevo.
    win.setTimeout(() => center(event.target), delay);
  });

  form.addEventListener("focusout", (event) => {
    if (!isTextField(event.target)) return;
    win.setTimeout(() => {
      if (!isTextField(win.document.activeElement) || !form.contains(win.document.activeElement)) {
        sheet.classList.remove("escribiendo");
      }
    }, 0);
  });

  win.visualViewport?.addEventListener("resize", () => center(win.document.activeElement));
}
