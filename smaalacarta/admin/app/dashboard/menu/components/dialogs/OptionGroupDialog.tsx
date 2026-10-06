"use client";

import { useState } from "react";

import { saveOptionGroupAction } from "../../actions/options";
import { SortableItem, SortableList } from "@/components/menu/Sortable";
import FormAlert from "@/components/ui/FormAlert";
import type { OptionGroup } from "@/lib/db/options";
import {
  describeGroupRule,
  MAX_OPTIONS_PER_GROUP,
  validateOptionGroup,
} from "@/lib/menu/options";

type OptionGroupDialogProps = {
  open: boolean;
  businessId: string;
  // Sin grupo, se crea uno nuevo.
  group?: OptionGroup;
  onClose: () => void;
  onSaved: () => void;
};

// Una opción en pantalla: `key` identifica la fila al arrastrar (las nuevas todavía no tienen `id`).
type Row = {
  key: string;
  id?: string;
  name: string;
  price: string;
  active: boolean;
  soldOut: boolean;
};

// Identifica cada fila mientras se arrastra; solo importa que no se repita.
let keyCounter = 0;
const newKey = () => `fila-${keyCounter++}`;

const inputClass =
  "w-full rounded-xl border border-line-strong bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function OptionGroupForm({ businessId, group, onClose, onSaved }: OptionGroupDialogProps) {
  const [name, setName] = useState(group?.name ?? "");
  const [minSelect, setMinSelect] = useState(String(group?.min_select ?? 0));
  const [maxSelect, setMaxSelect] = useState(String(group?.max_select ?? 1));
  const [allowRepeat, setAllowRepeat] = useState(group?.allow_repeat ?? false);
  const [active, setActive] = useState(group?.active ?? true);
  const [rows, setRows] = useState<Row[]>(() =>
    (group?.options ?? []).map((option) => ({
      key: newKey(),
      id: option.id,
      name: option.name,
      price: String(Number(option.price_delta)),
      active: option.active,
      soldOut: option.sold_out,
    })),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});

  const min = Number(minSelect);
  const max = Number(maxSelect);

  function updateRow(key: string, change: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { key: newKey(), name: "", price: "0", active: true, soldOut: false },
    ]);
  }

  function handleReorder(orderedKeys: string[]) {
    setRows((prev) =>
      orderedKeys
        .map((key) => prev.find((row) => row.key === key))
        .filter((row): row is Row => !!row),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const input = {
      id: group?.id ?? null,
      name,
      minSelect: min,
      maxSelect: max,
      allowRepeat,
      active,
      options: rows.map((row) => ({
        id: row.id,
        name: row.name,
        priceDelta: row.price.trim() === "" ? 0 : Number(row.price),
        active: row.active,
        soldOut: row.soldOut,
      })),
    };

    // La misma validación que hace el servidor, para marcar los campos sin esperar.
    const validation = validateOptionGroup(input);
    if (!validation.ok) {
      setError("Revisá los datos marcados.");
      setFieldErrors(validation.errors);
      return;
    }

    setSaving(true);

    try {
      const result = await saveOptionGroupAction(businessId, input);

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      onSaved();
    } catch {
      setError("No pudimos guardar el grupo. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const rulePreview =
    Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= 1 && max >= min
      ? describeGroupRule({ min_select: min, max_select: max, allow_repeat: allowRepeat })
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl supports-[height:1dvh]:max-h-[90dvh]"
      >
        <div className="shrink-0 p-5 pb-3">
          <h2 className="text-xl font-semibold text-brand">
            {group ? "Editar grupo de opciones" : "Nuevo grupo de opciones"}
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Por ejemplo &quot;Extras&quot;, &quot;Sabores&quot; o &quot;Toppings&quot;. Lo definís una vez y
            lo asociás a los productos que quieras.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-1">
            {error ? <FormAlert tone="error">{error}</FormAlert> : null}

            <div>
              <label htmlFor="grupo-nombre" className="mb-1 block text-sm font-medium">
                Nombre del grupo
              </label>
              <input
                id="grupo-nombre"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={inputClass}
                placeholder="Ej. Extras"
                aria-invalid={fieldErrors.name ? true : undefined}
              />
              {fieldErrors.name ? (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="grupo-min" className="mb-1 block text-sm font-medium">
                  Mínimo a elegir
                </label>
                <input
                  id="grupo-min"
                  type="number"
                  min="0"
                  step="1"
                  value={minSelect}
                  onChange={(event) => setMinSelect(event.target.value)}
                  className={inputClass}
                  aria-invalid={fieldErrors.minSelect ? true : undefined}
                />
                <p className="mt-1 text-xs text-stone-500">
                  0 = opcional. 1 o más = el cliente tiene que elegir.
                </p>
                {fieldErrors.minSelect ? (
                  <p className="mt-1 text-sm text-red-600">{fieldErrors.minSelect}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="grupo-max" className="mb-1 block text-sm font-medium">
                  Máximo a elegir
                </label>
                <input
                  id="grupo-max"
                  type="number"
                  min="1"
                  step="1"
                  value={maxSelect}
                  onChange={(event) => setMaxSelect(event.target.value)}
                  className={inputClass}
                  aria-invalid={fieldErrors.maxSelect ? true : undefined}
                />
                {fieldErrors.maxSelect ? (
                  <p className="mt-1 text-sm text-red-600">{fieldErrors.maxSelect}</p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowRepeat}
                  onChange={(event) => setAllowRepeat(event.target.checked)}
                />
                Se puede repetir una opción (ej. 3 bochas de frutilla)
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                />
                Grupo activo
              </label>
            </div>

            {rulePreview ? (
              <p className="rounded-xl bg-cream px-4 py-2.5 text-sm text-stone-600">
                Así lo ve el cliente: <strong className="text-brand">{rulePreview}</strong>
              </p>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-brand">
                  Opciones ({rows.length}/{MAX_OPTIONS_PER_GROUP})
                </h3>
                <p className="text-xs text-stone-500">Arrastrá el asa ⠿ para ordenar.</p>
              </div>

              {rows.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line-strong bg-cream/60 p-4 text-center text-sm text-stone-500">
                  Todavía no hay opciones.
                </p>
              ) : (
                <SortableList ids={rows.map((row) => row.key)} onReorder={handleReorder}>
                  <ul className="space-y-2">
                    {rows.map((row, index) => (
                      <li key={row.key}>
                        <SortableItem id={row.key}>
                          {(handle) => (
                            <div className="rounded-2xl border border-line bg-white p-2.5">
                              <div className="flex items-center gap-2">
                                {handle}
                                <input
                                  value={row.name}
                                  onChange={(event) => updateRow(row.key, { name: event.target.value })}
                                  aria-label={`Nombre de la opción ${index + 1}`}
                                  placeholder="Ej. Queso"
                                  className={inputClass}
                                />
                                <div className="flex w-32 shrink-0 items-center gap-1">
                                  <span className="text-sm text-stone-500">+$</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={row.price}
                                    onChange={(event) => updateRow(row.key, { price: event.target.value })}
                                    aria-label={`Precio extra de la opción ${index + 1}`}
                                    className={inputClass}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                                  aria-label={`Quitar la opción ${index + 1}`}
                                  className="rounded-lg px-2 py-1 text-sm text-red-600 transition hover:bg-red-50"
                                >
                                  ✕
                                </button>
                              </div>

                              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-10 text-xs">
                                <label className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={row.active}
                                    onChange={(event) => updateRow(row.key, { active: event.target.checked })}
                                  />
                                  Activa
                                </label>
                                <label className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={row.soldOut}
                                    onChange={(event) => updateRow(row.key, { soldOut: event.target.checked })}
                                  />
                                  Sin stock
                                </label>
                              </div>
                            </div>
                          )}
                        </SortableItem>
                      </li>
                    ))}
                  </ul>
                </SortableList>
              )}

              {fieldErrors.options ? (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors.options}</p>
              ) : null}

              <button
                type="button"
                onClick={addRow}
                disabled={rows.length >= MAX_OPTIONS_PER_GROUP}
                className="mt-3 w-full rounded-2xl border border-dashed border-line-strong py-2.5 text-sm font-medium text-stone-600 transition hover:border-stone-400 hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Agregar opción
              </button>
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-3 border-t border-line p-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-line-strong px-4 py-2"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-brand px-4 py-2 text-white disabled:opacity-50"
            >
              {saving ? "Guardando..." : group ? "Guardar cambios" : "Crear grupo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// El formulario se monta al abrir y se desmonta al cerrar: su estado arranca siempre desde `group`.
export default function OptionGroupDialog(props: OptionGroupDialogProps) {
  if (!props.open) return null;

  return <OptionGroupForm key={props.group?.id ?? "nuevo"} {...props} />;
}
