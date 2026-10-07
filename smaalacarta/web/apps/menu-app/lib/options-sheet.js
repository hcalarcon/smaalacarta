// Hoja inferior (bottom sheet) para elegir las opciones de un producto (PUBLICO-45). Arma el DOM
// con `textContent`: los nombres de grupos y opciones los escribe el negocio y nunca se interpolan
// en HTML (PUBLICO-9). La lógica de la elección vive en `options.js`; acá solo se pinta y se escucha.

import { chosenOptions, groupCount, unitPrice, validateSelection } from "./options.js";

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

/**
 * Abre la hoja sobre `doc.body`. `item` es el producto del menú (con `opciones`). `onAdd(chosen)` se
 * llama con la lista de `chosenOptions` cuando el cliente toca "Agregar" con una elección válida.
 * Devuelve `{ close }`.
 */
export function openOptionsSheet({ doc = document, item, t, formatPrice, onAdd, onClose }) {
  const groups = item.opciones ?? [];
  const selection = {};

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
  const totalEl = el(doc, "div", "opciones-total");
  const addBtn = el(doc, "button", "opciones-agregar", t("options.add"));
  addBtn.type = "button";
  footer.append(totalEl, addBtn);

  const refreshers = [];

  function refresh() {
    const chosen = chosenOptions(groups, selection);
    const { ok } = validateSelection(groups, selection);

    totalEl.textContent = `${t("options.total")} $${formatPrice(unitPrice(item.precio, chosen))}`;
    addBtn.disabled = !ok;
    refreshers.forEach((fn) => fn());
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
        input.name = `grupo-${groupIndex}`;
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

    body.appendChild(fieldset);
  });

  sheet.append(header, body, footer);
  overlay.appendChild(sheet);

  function close() {
    doc.removeEventListener("keydown", onKey);
    overlay.remove();
    doc.body.classList.remove("no-scroll-opciones");
    onClose?.();
  }

  function onKey(event) {
    if (event.key === "Escape") close();
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  addBtn.addEventListener("click", () => {
    if (addBtn.disabled) return;
    const chosen = chosenOptions(groups, selection);
    close();
    onAdd(chosen);
  });
  doc.addEventListener("keydown", onKey);

  doc.body.appendChild(overlay);
  doc.body.classList.add("no-scroll-opciones");
  refresh();
  sheet.focus();

  return { close };
}
