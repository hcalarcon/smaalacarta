"use client";

import { describeGroupRule, MAX_GROUPS_PER_PRODUCT } from "@/lib/menu/options";

export type PickerGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  allow_repeat: boolean;
};

type ProductOptionGroupsPickerProps = {
  groups: PickerGroup[];
  // Los grupos elegidos, en su orden.
  value: string[];
  onChange: (ids: string[]) => void;
  // El producto está en una promoción: no admite grupos obligatorios (ADMIN-OPCIONES-10).
  inPromotion: boolean;
};

// Selector múltiple "Opciones y extras" del producto, con el orden de los grupos (ADMIN-OPCIONES-13).
export default function ProductOptionGroupsPicker({
  groups,
  value,
  onChange,
  inPromotion,
}: ProductOptionGroupsPickerProps) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const selected = value
    .map((id) => byId.get(id))
    .filter((group): group is PickerGroup => !!group);
  const available = groups.filter((group) => !value.includes(group.id));
  const full = value.length >= MAX_GROUPS_PER_PRODUCT;

  function move(index: number, by: -1 | 1) {
    const next = [...value];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  }

  if (groups.length === 0) {
    return (
      <div>
        <h3 className="mb-1 text-sm font-medium">Opciones y extras</h3>
        <p className="text-sm text-stone-500">
          Todavía no creaste grupos. Los armás abajo, en &quot;Opciones y extras&quot;.
        </p>
      </div>
    );
  }

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">
        Opciones y extras ({value.length}/{MAX_GROUPS_PER_PRODUCT})
      </legend>

      {selected.length > 0 ? (
        <ol className="mb-2 space-y-1.5">
          {selected.map((group, index) => (
            <li
              key={group.id}
              className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-900">{group.name}</p>
                <p className="truncate text-xs text-stone-500">{describeGroupRule(group)}</p>
              </div>

              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Subir ${group.name}`}
                className="rounded-lg px-2 py-1 text-stone-500 hover:bg-brand-soft disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === selected.length - 1}
                aria-label={`Bajar ${group.name}`}
                className="rounded-lg px-2 py-1 text-stone-500 hover:bg-brand-soft disabled:opacity-30"
              >
                ▼
              </button>
              <button
                type="button"
                onClick={() => onChange(value.filter((id) => id !== group.id))}
                aria-label={`Quitar ${group.name}`}
                className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {available.length > 0 ? (
        <ul className="space-y-1.5">
          {available.map((group) => {
            const blocked = inPromotion && group.min_select >= 1;
            const disabled = full || blocked;

            return (
              <li key={group.id} className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => onChange([...value, group.id])}
                  disabled={disabled}
                  aria-label={`Agregar ${group.name}`}
                  className="rounded-lg bg-brand-soft px-2.5 py-1 font-semibold text-brand transition hover:bg-line disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +
                </button>
                <span className={disabled ? "text-stone-400" : "text-stone-800"}>
                  {group.name}{" "}
                  <span className="text-xs text-stone-500">· {describeGroupRule(group)}</span>
                </span>
                {blocked ? (
                  <span className="text-xs text-amber-700">
                    El producto está en una promoción: no admite grupos obligatorios.
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {full ? (
        <p className="mt-1.5 text-xs text-stone-500">
          Un producto puede tener hasta {MAX_GROUPS_PER_PRODUCT} grupos.
        </p>
      ) : null}
    </fieldset>
  );
}
