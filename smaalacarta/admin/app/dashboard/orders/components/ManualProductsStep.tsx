"use client";

import { useMemo, useState } from "react";

import {
  chosenOptions,
  describeChosen,
  groupCount,
  searchMenu,
  selectionProblems,
  unitPriceWith,
  type ManualMenu,
  type ManualMenuItem,
  type ManualOptionGroup,
  type Selection,
} from "@/lib/orders/manual-menu";
import {
  addLine,
  LIMITS,
  orderTotal,
  setLineQuantity,
  type ManualOrderItem,
} from "@/lib/orders/manual-order";
import { formatMoney } from "@/lib/promotions/pricing";

const inputClass =
  "w-full rounded-xl border border-line-strong bg-white px-3 py-2.5 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:text-sm";

const PROBLEM_TEXT = {
  min: "Elegí al menos {n}.",
  max: "Elegí hasta {n}.",
  repeat: "Esta opción no se puede repetir.",
  soldOut: "Una de las opciones está agotada.",
} as const;

// "Cantidad" con − y +: botones grandes para tocar con el dedo.
function Stepper({
  value,
  onChange,
  min = 1,
  max = LIMITS.maxQuantity,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const button =
    "flex h-10 w-10 items-center justify-center rounded-xl border border-line-strong bg-white text-lg font-semibold text-brand transition hover:bg-brand-soft disabled:opacity-40";

  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={button} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Menos">
        −
      </button>
      <span className="w-8 text-center text-base font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className={button} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Más">
        +
      </button>
    </div>
  );
}

// La hoja de un producto del menú: opciones, nota y cantidad (la misma idea que la hoja del menú).
function ProductSheet({
  item,
  onAdd,
  onClose,
}: {
  item: ManualMenuItem;
  onAdd: (line: ManualOrderItem) => void;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState<Selection>({});
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [tried, setTried] = useState(false);

  const problems = selectionProblems(item.groups, selection);
  const chosen = chosenOptions(item.groups, selection);
  const unit = unitPriceWith(item.price, chosen);

  function toggle(group: ManualOptionGroup, optionId: string) {
    setSelection((prev) => {
      const next = { ...prev };
      const current = next[optionId] ?? 0;

      if (current > 0) {
        delete next[optionId];
        return next;
      }

      // Grupo de una sola opción (radio): elegir una saca la anterior.
      if (group.max === 1) {
        for (const option of group.options) delete next[option.id];
      }

      next[optionId] = 1;
      return next;
    });
  }

  function change(optionId: string, value: number) {
    setSelection((prev) => {
      const next = { ...prev };
      if (value <= 0) delete next[optionId];
      else next[optionId] = value;
      return next;
    });
  }

  function handleAdd() {
    if (Object.keys(problems).length > 0) {
      setTried(true);
      return;
    }

    onAdd({
      kind: item.kind,
      id: item.id,
      name: item.name,
      unitPrice: unit,
      quantity,
      note: note.trim() || undefined,
      options: chosen.map((option) => ({
        id: option.id,
        name: option.name,
        quantity: option.quantity,
        price: option.price,
      })),
    });
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white" role="dialog" aria-label={item.name}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-brand">{item.name}</h3>
          <p className="text-sm text-stone-500">{formatMoney(item.price)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-medium text-stone-600 hover:bg-brand-soft">
          Cancelar
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
        {item.groups.map((group) => {
          const problem = problems[group.id];
          const count = groupCount(group, selection);
          const single = group.max === 1;

          return (
            <fieldset key={group.id} className="space-y-2">
              <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-semibold text-brand">
                <span>{group.name}</span>
                <span className="text-xs font-normal text-stone-500">
                  {group.min >= 1 ? "Obligatorio" : "Opcional"} · {count}/{group.max}
                </span>
              </legend>

              {group.options.map((option) => {
                const quantityChosen = selection[option.id] ?? 0;

                return (
                  <div
                    key={option.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                      quantityChosen > 0 ? "border-accent bg-accent/5" : "border-line"
                    } ${option.soldOut ? "opacity-50" : ""}`}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1">
                      <input
                        type={single ? "radio" : "checkbox"}
                        name={`group-${group.id}`}
                        checked={quantityChosen > 0}
                        disabled={option.soldOut}
                        onChange={() => toggle(group, option.id)}
                        className="h-5 w-5 accent-[var(--color-accent,#c2410c)]"
                      />
                      <span className="min-w-0 truncate text-base sm:text-sm">
                        {option.name}
                        {option.soldOut ? <span className="ml-2 text-xs text-red-600">Agotado</span> : null}
                      </span>
                    </label>

                    <div className="flex items-center gap-3">
                      {option.price !== 0 ? (
                        <span className="text-sm text-stone-600">+{formatMoney(option.price)}</span>
                      ) : null}
                      {group.repeat && quantityChosen > 0 ? (
                        <Stepper
                          value={quantityChosen}
                          min={0}
                          max={group.max}
                          label={`Cantidad de ${option.name}`}
                          onChange={(value) => change(option.id, value)}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {tried && problem ? (
                <p role="alert" className="text-sm text-red-600">
                  {PROBLEM_TEXT[problem].replace("{n}", String(problem === "min" ? group.min : group.max))}
                </p>
              ) : null}
            </fieldset>
          );
        })}

        <div>
          <label htmlFor="mo-item-note" className="mb-1.5 block text-sm font-medium text-brand">
            Nota para este producto (opcional)
          </label>
          <textarea
            id="mo-item-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={LIMITS.itemNote}
            placeholder="Sin cebolla, bien cocido…"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-6">
        <Stepper value={quantity} onChange={setQuantity} label="Cantidad" />
        <button
          type="button"
          onClick={handleAdd}
          className="flex-1 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-hover sm:text-sm"
        >
          Agregar {formatMoney(unit * quantity)}
        </button>
      </div>
    </div>
  );
}

// La hoja del producto libre: nombre y precio a mano, para los casos raros.
function FreeSheet({ onAdd, onClose }: { onAdd: (line: ManualOrderItem) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const trimmed = name.trim();
    const unitPrice = price.trim() === "" ? Number.NaN : Number(price.replace(",", "."));

    if (trimmed.length < 1 || trimmed.length > LIMITS.itemName) {
      setError(`Ingresá el nombre (hasta ${LIMITS.itemName} caracteres).`);
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > LIMITS.maxPrice) {
      setError("Ingresá el precio (de 0 en adelante).");
      return;
    }

    onAdd({ kind: "free", name: trimmed, unitPrice, quantity, note: note.trim() || undefined });
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white" role="dialog" aria-label="Producto libre">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div>
          <h3 className="text-lg font-semibold text-brand">Producto libre</h3>
          <p className="text-sm text-stone-500">Para algo que no está en el menú. Queda marcado como libre en el pedido.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-medium text-stone-600 hover:bg-brand-soft">
          Cancelar
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div>
          <label htmlFor="mo-free-name" className="mb-1.5 block text-sm font-medium text-brand">Nombre</label>
          <input id="mo-free-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.itemName} className={inputClass} />
        </div>

        <div>
          <label htmlFor="mo-free-price" className="mb-1.5 block text-sm font-medium text-brand">Precio de una unidad</label>
          <input
            id="mo-free-price"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="mo-free-note" className="mb-1.5 block text-sm font-medium text-brand">Nota (opcional)</label>
          <textarea
            id="mo-free-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={LIMITS.itemNote}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-6">
        <Stepper value={quantity} onChange={setQuantity} label="Cantidad" />
        <button
          type="button"
          onClick={handleAdd}
          className="flex-1 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-hover sm:text-sm"
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

// Paso 1 del pedido manual: elegir productos del menú (buscador, hoja con opciones y nota) o uno libre.
export default function ManualProductsStep({
  menu,
  items,
  onChange,
  error,
}: {
  menu: ManualMenu;
  items: ManualOrderItem[];
  onChange: (items: ManualOrderItem[]) => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<{ type: "menu"; item: ManualMenuItem } | { type: "free" } | null>(null);

  const results = useMemo(() => searchMenu(menu.items, query), [menu.items, query]);

  function add(line: ManualOrderItem) {
    onChange(addLine(items, line));
    setSheet(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="mo-search" className="sr-only">Buscar en el menú</label>
        <input
          id="mo-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en el menú…"
          className={inputClass}
        />
      </div>

      {menu.items.length === 0 ? (
        <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-stone-600">
          Todavía no hay productos activos en el menú. Podés cargar un producto libre.
        </p>
      ) : results.length === 0 ? (
        <p className="text-sm text-stone-500">No encontramos productos con “{query}”.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line" aria-label="Productos del menú">
          {results.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                disabled={item.soldOut}
                onClick={() => setSheet({ type: "menu", item })}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-base font-medium text-brand sm:text-sm">{item.name}</span>
                  <span className="block truncate text-xs text-stone-500">
                    {item.category}
                    {item.groups.length > 0 ? " · con opciones" : ""}
                    {item.soldOut ? " · agotado" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-stone-700">{formatMoney(item.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setSheet({ type: "free" })}
        className="text-sm font-medium text-accent hover:text-accent-hover"
      >
        + Producto libre (nombre y precio a mano)
      </button>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand">En el pedido</h3>

        {items.length === 0 ? (
          <p className="text-sm text-stone-500">Todavía no agregaste nada.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => {
              const detail =
                item.kind === "free"
                  ? "Producto libre"
                  : describeChosen(
                      (item.options ?? []).map((option) => ({
                        id: option.id,
                        group: "",
                        name: option.name,
                        quantity: option.quantity,
                        price: option.price,
                      })),
                    );

              return (
                <li key={index} className="rounded-xl border border-line px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-brand sm:text-sm">{item.name}</p>
                      {detail ? <p className="text-xs text-stone-500">{detail}</p> : null}
                      {item.note ? <p className="text-xs italic text-stone-600">“{item.note}”</p> : null}
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-stone-700">
                      {formatMoney(Math.round(item.unitPrice * 100) * item.quantity / 100)}
                    </p>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <Stepper
                      value={item.quantity}
                      label={`Cantidad de ${item.name}`}
                      onChange={(value) => onChange(setLineQuantity(items, index, value))}
                    />
                    <button
                      type="button"
                      onClick={() => onChange(items.filter((_, i) => i !== index))}
                      className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {items.length > 0 ? (
          <p className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-medium text-stone-700">Subtotal</span>
            <span className="text-lg font-bold text-brand">{formatMoney(orderTotal(items))}</span>
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      {sheet?.type === "menu" ? (
        <ProductSheet item={sheet.item} onAdd={add} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.type === "free" ? <FreeSheet onAdd={add} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}
