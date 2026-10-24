// Hoja inferior (bottom sheet) para elegir las opciones de un producto (PUBLICO-45). Arma el DOM
// con `textContent`: los nombres de grupos y opciones los escribe el negocio y nunca se interpolan
// en HTML (PUBLICO-9). La lógica de la elección vive en `options.js`; acá solo se pinta y se escucha.

import { NOTE_MAX, cleanNote, noteCounter } from "./item-notes.js";
import {
  MAX_QUANTITY,
  chosenComponents,
  chosenOptions,
  clampQuantity,
  groupCount,
  promoHasChoices,
  promoPrice,
  promoUnits,
  selectionFromChosen,
  selectionsFromComponents,
  unitPrice,
  validateSelection,
} from "./options.js";

// "Obligatorio" u "Opcional, hasta N" (con el rango si el grupo pide más de una opción).
export function ruleText(group, t) {
  if (group.min < 1) return t("options.optionalUpTo", { max: group.max });
  if (group.max === 1) return t("options.required");
  if (group.min === group.max) return t("options.requiredN", { n: group.min });
  return t("options.requiredRange", { min: group.min, max: group.max });
}

// Radio con un solo lugar, casillas con varios, y contador +/− si el grupo permite repetir.
export function controlKind(group) {
  if (group.max === 1) return "radio";
  return group.repetir ? "counter" : "checkbox";
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const FOCUSABLE = 'button, input, textarea, select, [href], [tabindex]:not([tabindex="-1"])';

/**
 * Abre la hoja sobre `doc.body`. `item` es el producto del menú (con `opciones`, que puede no tener).
 * `onAdd(chosen, note, quantity)` se llama con la lista de `chosenOptions`, la nota ya limpia (o "") y la
 * cantidad cuando el cliente toca el botón con una elección válida.
 *
 * Una promoción con opciones (PUBLICO-3) abre la hoja con un bloque por unidad ("Empanada clásica 1 de 3"…): el
 * cliente elige lo de cada una. En ese caso `onAdd` recibe `[]` como opciones y, de cuarto argumento, la lista de
 * componentes elegidos (`chosenComponents`); `initial.components` la precarga al editar la línea.
 *
 * Con `notesEnabled` (config.notasPorItem) es la hoja de producto completa (PUBLICO-65): foto, cantidad,
 * campo de nota y el botón con el total en vivo. Sin él, es la hoja de opciones de siempre (PUBLICO-45).
 * `image` es `{ src, kind }` (la foto o ilustración del producto). `initial` (`{ chosen, quantity, note }`)
 * precarga la hoja para editar una línea del carrito, y `confirmKey` cambia el texto del botón. El foco
 * queda atrapado en la hoja y vuelve a `returnFocus` (por defecto, quien lo tenía al abrir) al cerrar.
 * Devuelve `{ close }`.
 */
export function openOptionsSheet({
  doc = document,
  item,
  t,
  formatPrice,
  onAdd,
  onClose,
  notesEnabled = false,
  image = null,
  initial = null,
  confirmKey = "options.add",
  returnFocus = null,
}) {
  const perUnit = promoHasChoices(item);
  // Un producto suelto es una sola "unidad"; una promoción con opciones tiene una por cada unidad de cada producto.
  const units = perUnit
    ? promoUnits(item)
    : [{ id: item.id, nombre: item.nombre, indice: 1, de: 1, opciones: item.opciones ?? [] }];
  const selections = units.map(() => ({}));
  const opener = returnFocus ?? doc.activeElement;

  // Lo precargado se limita a opciones que el producto todavía tiene (puede haber cambiado el menú).
  const preloaded = perUnit
    ? selectionsFromComponents(units, initial?.components)
    : [selectionFromChosen(initial?.chosen)];

  units.forEach((unit, index) => {
    const known = new Set(unit.opciones.flatMap((group) => (group.opciones ?? []).map((option) => option.id)));
    for (const [id, count] of Object.entries(preloaded[index] ?? {})) {
      if (known.has(id)) selections[index][id] = count;
    }
  });

  let quantity = clampQuantity(initial?.quantity);

  const overlay = el(doc, "div", "opciones-overlay");
  const sheet = el(doc, "div", "opciones-hoja");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", item.nombre);
  sheet.tabIndex = -1;

  const header = el(doc, "div", "opciones-cabecera");
  header.appendChild(el(doc, "h3", "opciones-titulo", item.nombre));
  const closeBtn = el(doc, "button", "opciones-cerrar", "×");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", t("options.close"));
  header.appendChild(closeBtn);

  const body = el(doc, "div", "opciones-grupos");
  const footer = el(doc, "div", "opciones-pie");
  const addBtn = el(doc, "button", "opciones-agregar", t(confirmKey));
  addBtn.type = "button";

  // La foto del producto, arriba de todo; se asigna por propiedad (nunca como HTML).
  if (notesEnabled && image?.src) {
    const photo = el(doc, "img", `opciones-foto${image.kind === "photo" ? "" : " ilustrativa"}`);
    photo.src = image.src;
    photo.alt = "";
    body.appendChild(photo);
  }

  // La hoja completa lleva en el pie la cantidad y el botón "Agregar $total"; la de siempre, el total
  // y "Agregar".
  let totalEl = null;
  let qtyValue = null;
  let qtyLess = null;
  let qtyMore = null;

  if (notesEnabled) {
    const units = el(doc, "div", "opciones-unidades");
    units.setAttribute("role", "group");
    units.setAttribute("aria-label", t("options.quantity"));
    qtyLess = el(doc, "button", "opciones-unidades-menos", "−");
    qtyMore = el(doc, "button", "opciones-unidades-mas", "+");
    qtyLess.type = qtyMore.type = "button";
    qtyLess.setAttribute("aria-label", t("options.quantityLess"));
    qtyMore.setAttribute("aria-label", t("options.quantityMore"));
    qtyValue = el(doc, "span", "opciones-unidades-valor", String(quantity));
    qtyValue.setAttribute("aria-live", "polite");

    qtyLess.addEventListener("click", () => {
      quantity = clampQuantity(quantity - 1);
      refresh();
    });
    qtyMore.addEventListener("click", () => {
      quantity = clampQuantity(quantity + 1);
      refresh();
    });

    units.append(qtyLess, qtyValue, qtyMore);
    footer.append(units, addBtn);
  } else {
    totalEl = el(doc, "div", "opciones-total");
    footer.append(totalEl, addBtn);
  }

  const refreshers = [];

  // Lo elegido y el precio de una unidad (el del producto o la promoción más los extras de todo lo elegido).
  function current() {
    if (perUnit) {
      const components = chosenComponents(units, selections);
      return { chosen: [], components, price: promoPrice(item.precio, components) };
    }

    const chosen = chosenOptions(units[0].opciones, selections[0]);
    return { chosen, components: [], price: unitPrice(item.precio, chosen) };
  }

  function refresh() {
    const { price } = current();
    const ok = units.every((unit, index) => validateSelection(unit.opciones, selections[index]).ok);

    if (notesEnabled) {
      addBtn.textContent = `${t(confirmKey)} $${formatPrice(price * clampQuantity(quantity))}`;
      qtyValue.textContent = String(quantity);
      qtyLess.disabled = quantity <= 1;
      qtyMore.disabled = quantity >= MAX_QUANTITY;
    } else {
      totalEl.textContent = `${t("options.total")} $${formatPrice(price)}`;
    }

    addBtn.disabled = !ok;
    refreshers.forEach((fn) => fn());
  }

  units.forEach((unit, unitIndex) => {
    const groups = unit.opciones;
    const selection = selections[unitIndex];

    // En una promoción cada unidad va en su bloque, con su título; un producto suelto, directo en el cuerpo.
    let container = body;
    if (perUnit) {
      if (groups.length === 0) return;

      container = el(doc, "section", "opciones-unidad");
      container.dataset.unidad = String(unitIndex);
      container.appendChild(
        el(doc, "h4", "opciones-unidad-titulo", unit.de > 1 ? t("options.unit", { name: unit.nombre, n: unit.indice, total: unit.de }) : unit.nombre),
      );
      body.appendChild(container);
    }

    groups.forEach((group, groupIndex) => {
      const kind = controlKind(group);
      const fieldset = el(doc, "fieldset", "opciones-grupo");
      fieldset.dataset.grupo = group.id;

      const legend = el(doc, "legend", "opciones-grupo-cabecera");
      legend.append(
        el(doc, "span", "opciones-grupo-titulo", group.nombre),
        el(doc, "span", `opciones-regla${group.min >= 1 ? " obligatoria" : ""}`, ruleText(group, t)),
      );
      fieldset.appendChild(legend);

      for (const option of group.opciones ?? []) {
        const soldOut = option.agotado === true;
        const row = el(doc, "label", `opciones-opcion${soldOut ? " agotada" : ""}`);
        row.dataset.opcion = option.id;

        const name = el(doc, "span", "opcion-nombre", option.nombre);
        const price = el(doc, "span", "opcion-precio", option.precio > 0 ? `+$${formatPrice(option.precio)}` : "");

        if (kind === "counter") {
          const controls = el(doc, "span", "opcion-contador");
          const less = el(doc, "button", "opcion-menos", "−");
          const count = el(doc, "span", "opcion-cantidad", "0");
          const more = el(doc, "button", "opcion-mas", "+");
          less.type = more.type = "button";
          less.setAttribute("aria-label", t("options.less", { name: option.nombre }));
          more.setAttribute("aria-label", t("options.more", { name: option.nombre }));

          less.addEventListener("click", (event) => {
            event.preventDefault();
            if (selection[option.id] > 0) selection[option.id] -= 1;
            if (selection[option.id] === 0) delete selection[option.id];
            refresh();
          });
          more.addEventListener("click", (event) => {
            event.preventDefault();
            if (soldOut || groupCount(group, selection) >= group.max) return;
            selection[option.id] = (selection[option.id] || 0) + 1;
            refresh();
          });

          refreshers.push(() => {
            const qty = selection[option.id] || 0;
            count.textContent = String(qty);
            less.disabled = qty === 0;
            more.disabled = soldOut || groupCount(group, selection) >= group.max;
          });

          controls.append(less, count, more);
          row.append(name, price, controls);
        } else {
          const input = doc.createElement("input");
          input.type = kind;
          input.name = `grupo-${unitIndex}-${groupIndex}`;
          input.disabled = soldOut;
          input.value = option.id;

          input.addEventListener("click", () => {
            if (kind === "radio") {
              // Un grupo opcional de un solo lugar se puede dejar vacío tocando de nuevo la elegida.
              if (selection[option.id] && group.min < 1) {
                delete selection[option.id];
                input.checked = false;
              } else {
                for (const other of group.opciones) delete selection[other.id];
                selection[option.id] = 1;
              }
            } else if (input.checked) {
              selection[option.id] = 1;
            } else {
              delete selection[option.id];
            }
            refresh();
          });

          refreshers.push(() => {
            input.checked = (selection[option.id] || 0) > 0;
            // En casillas, con el grupo lleno las que faltan se apagan (no se puede pasar del máximo).
            if (kind === "checkbox") {
              input.disabled = soldOut || (!input.checked && groupCount(group, selection) >= group.max);
            }
          });

          row.append(input, name, price);
        }

        if (soldOut) row.appendChild(el(doc, "span", "opcion-agotada", t("item.soldOut")));

        fieldset.appendChild(row);
      }

      container.appendChild(fieldset);
    });
  });

  // La nota del cliente para este producto: texto libre de hasta 140 (el salto de línea no se escribe: la
  // limpieza lo vuelve espacio). Todo con textContent y `value`: lo que escribe el cliente nunca es HTML.
  let noteInput = null;

  if (notesEnabled) {
    const wrap = el(doc, "div", "opciones-nota");
    const label = el(doc, "label", "opciones-nota-etiqueta", t("note.label"));
    noteInput = doc.createElement("textarea");
    noteInput.rows = 2;
    noteInput.className = "opciones-nota-campo";
    noteInput.maxLength = NOTE_MAX;
    noteInput.placeholder = t("note.placeholder");
    noteInput.autocomplete = "off";
    noteInput.id = "opciones-nota-campo";
    noteInput.value = cleanNote(initial?.note);
    label.htmlFor = noteInput.id;

    const counter = el(doc, "span", "opciones-nota-contador", noteCounter(noteInput.value));
    noteInput.addEventListener("input", () => {
      counter.textContent = noteCounter(noteInput.value);
    });
    noteInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
    });

    const hint = el(doc, "p", "opciones-nota-aviso", t("note.hint"));
    wrap.append(label, noteInput, counter, hint);
    body.appendChild(wrap);
  }

  sheet.append(header, body, footer);
  overlay.appendChild(sheet);

  function close() {
    doc.removeEventListener("keydown", onKey);
    overlay.remove();
    doc.body.classList.remove("no-scroll-opciones");
    if (opener?.isConnected) opener.focus?.();
    onClose?.();
  }

  function onKey(event) {
    if (event.key === "Escape") {
      close();
      return;
    }

    // Foco atrapado: Tab y Mayús+Tab dan la vuelta dentro de la hoja.
    if (event.key !== "Tab") return;

    const nodes = [...sheet.querySelectorAll(FOCUSABLE)].filter((node) => !node.disabled);
    if (nodes.length === 0) {
      event.preventDefault();
      sheet.focus();
      return;
    }

    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = doc.activeElement;

    if (!sheet.contains(active) || active === sheet) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  addBtn.addEventListener("click", () => {
    if (addBtn.disabled) return;
    const { chosen, components } = current();
    const note = noteInput ? cleanNote(noteInput.value) : "";
    const count = notesEnabled ? quantity : 1;
    close();
    if (perUnit) onAdd(chosen, note, count, components);
    else onAdd(chosen, note, count);
  });
  doc.addEventListener("keydown", onKey);

  doc.body.appendChild(overlay);
  doc.body.classList.add("no-scroll-opciones");
  refresh();
  sheet.focus();

  return { close };
}
