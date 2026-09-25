"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { savePromotionAction } from "../actions";
import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import { moveItem } from "@/lib/menu/ordering";
import { formatMoney, promotionPricing } from "@/lib/promotions/pricing";
import type { PromotionType } from "@/lib/promotions/validation";

export type ProductOption = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  categoryName: string;
};

export type PromotionInitial = {
  id: string;
  name: string;
  description: string;
  type: PromotionType;
  discountPercent: number;
  price: number | null;
  active: boolean;
  productIds: string[];
};

// Los productos del panel izquierdo se identifican así para no chocar con los ids
// de los productos ya elegidos.
const PALETTE = "palette:";
const ZONE = "zone";

function DragHandle(props: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label="Arrastrar"
      className="cursor-grab touch-none rounded-lg px-1.5 py-1 text-stone-400 hover:bg-brand-soft hover:text-brand active:cursor-grabbing"
      {...props}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <circle cx="9" cy="6" r="1.6" />
        <circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" />
        <circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" />
        <circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
  );
}

function PaletteItem({
  product,
  added,
  onAdd,
}: {
  product: ProductOption;
  added: boolean;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: PALETTE + product.id,
    disabled: added,
  });

  return (
    <li
      ref={setNodeRef}
      className={`flex items-center gap-2 rounded-xl border border-line bg-white px-2 py-2 ${
        added ? "opacity-50" : ""
      } ${isDragging ? "opacity-40" : ""}`}
    >
      {added ? <span className="w-8" /> : <DragHandle {...attributes} {...listeners} />}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-900">
          {product.name}
          {product.active ? null : (
            <span className="ml-2 text-xs text-stone-400">(oculto)</span>
          )}
        </p>
        <p className="text-xs text-stone-500">{formatMoney(product.price)}</p>
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={added}
        aria-label={`Agregar ${product.name}`}
        className="rounded-lg bg-brand-soft px-2.5 py-1 text-sm font-semibold text-brand transition hover:bg-line disabled:cursor-default disabled:opacity-40"
      >
        {added ? "✓" : "+"}
      </button>
    </li>
  );
}

function SelectedItem({
  product,
  onRemove,
}: {
  product: ProductOption;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: product.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="flex items-center gap-2 rounded-xl border border-line bg-white px-2 py-2"
    >
      <DragHandle {...attributes} {...listeners} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-900">{product.name}</p>
        <p className="text-xs text-stone-500">{formatMoney(product.price)}</p>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${product.name}`}
        className="rounded-lg px-2 py-1 text-sm text-red-600 transition hover:bg-red-50"
      >
        ✕
      </button>
    </li>
  );
}

function DropZone({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: ZONE });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-40 rounded-2xl border-2 border-dashed p-3 transition ${
        isOver ? "border-accent bg-accent-soft" : "border-line-strong bg-cream/60"
      }`}
    >
      {empty ? (
        <p className="py-8 text-center text-sm text-stone-500">
          Arrastrá productos desde la izquierda, o tocá <strong>+</strong>.
        </p>
      ) : (
        children
      )}
    </div>
  );
}

export default function PromotionEditor({
  products,
  initial,
}: {
  products: ProductOption[];
  initial?: PromotionInitial;
}) {
  const router = useRouter();

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState<PromotionType>(initial?.type ?? "percent");
  const [discount, setDiscount] = useState(String(initial?.discountPercent ?? 10));
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [selectedIds, setSelectedIds] = useState<string[]>(initial?.productIds ?? []);
  const [search, setSearch] = useState("");

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((p): p is ProductOption => !!p);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const result: { category: string; items: ProductOption[] }[] = [];

    for (const product of products) {
      if (term && !product.name.toLowerCase().includes(term)) continue;

      const last = result[result.length - 1];
      if (last && last.category === product.categoryName) {
        last.items.push(product);
      } else {
        result.push({ category: product.categoryName, items: [product] });
      }
    }

    return result;
  }, [products, search]);

  const numericDiscount = Number(discount);
  const numericPrice = price.trim() === "" ? null : Number(price);

  const pricing = promotionPricing(
    {
      type,
      discountPercent: Number.isFinite(numericDiscount) ? numericDiscount : 0,
      price: numericPrice != null && Number.isFinite(numericPrice) ? numericPrice : null,
    },
    selected.map((p) => p.price),
  );

  function addProduct(productId: string, index?: number) {
    setSelectedIds((prev) => {
      if (prev.includes(productId)) return prev;
      const next = [...prev];
      next.splice(index ?? next.length, 0, productId);
      return next;
    });
  }

  function handleDragStart({ active: a }: DragStartEvent) {
    setDraggingId(String(a.id));
  }

  function handleDragEnd({ active: a, over }: DragEndEvent) {
    setDraggingId(null);
    if (!over) return;

    const activeId = String(a.id);
    const overId = String(over.id);

    // Desde el panel de productos: se agrega en el lugar donde se suelta.
    if (activeId.startsWith(PALETTE)) {
      const overIndex = selectedIds.indexOf(overId);
      addProduct(activeId.slice(PALETTE.length), overIndex === -1 ? undefined : overIndex);
      return;
    }

    // Dentro de la promoción: se reordena.
    if (selectedIds.includes(activeId) && selectedIds.includes(overId)) {
      setSelectedIds(moveItem(selectedIds, activeId, overId));
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const result = await savePromotionAction({
        id: initial?.id ?? null,
        name,
        description,
        type,
        discountPercent: numericDiscount,
        price: numericPrice,
        active,
        productIds: selectedIds,
      });

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      router.push("/dashboard/promotions");
      router.refresh();
    } catch {
      setError("No pudimos guardar la promoción. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const dragged = draggingId?.startsWith(PALETTE)
    ? byId.get(draggingId.slice(PALETTE.length))
    : draggingId
      ? byId.get(draggingId)
      : undefined;

  return (
    <form onSubmit={handleSave} noValidate className="space-y-6">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Productos del menú */}
          <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-brand">Productos del menú</h2>
            <p className="mt-1 text-sm text-stone-500">
              Arrastrá el asa ⠿ hacia la promoción, o tocá +.
            </p>

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar producto…"
              aria-label="Buscar producto"
              className="mt-4 w-full rounded-xl border border-line-strong bg-white px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />

            <div className="mt-4 max-h-[32rem] space-y-4 overflow-y-auto pr-1">
              {products.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-500">
                  Todavía no cargaste productos en el menú.
                </p>
              ) : groups.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-500">
                  Ningún producto coincide con la búsqueda.
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.category}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                      {group.category}
                    </h3>
                    <ul className="space-y-2">
                      {group.items.map((product) => (
                        <PaletteItem
                          key={product.id}
                          product={product}
                          added={selectedIds.includes(product.id)}
                          onAdd={() => addProduct(product.id)}
                        />
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* La promoción */}
          <section className="space-y-5 rounded-3xl border border-line bg-white p-5 shadow-sm">
            <Field
              label="Nombre de la promoción"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={fieldErrors.name}
              placeholder="Combo desayuno"
            />

            <Field
              label="Descripción (opcional)"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Café + medialuna"
            />

            <div>
              <span className="mb-1.5 block text-sm font-medium text-brand">Tipo</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["percent", "Descuento %"],
                    ["combo", "Combo a precio fijo"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setType(value)}
                    aria-pressed={type === value}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                      type === value
                        ? "border-brand bg-brand text-white"
                        : "border-line-strong bg-white text-stone-700 hover:bg-brand-soft"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {type === "percent" ? (
              <Field
                label="Descuento (%)"
                type="number"
                min="1"
                max="100"
                step="1"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                error={fieldErrors.discountPercent}
              />
            ) : (
              <Field
                label="Precio del combo ($)"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                error={fieldErrors.price}
              />
            )}

            <div>
              <h2 className="mb-2 text-sm font-medium text-brand">
                Productos de la promoción ({selected.length})
              </h2>

              <SortableContext items={selectedIds} strategy={verticalListSortingStrategy}>
                <DropZone empty={selected.length === 0}>
                  <ul className="space-y-2">
                    {selected.map((product) => (
                      <SelectedItem
                        key={product.id}
                        product={product}
                        onRemove={() =>
                          setSelectedIds((prev) => prev.filter((id) => id !== product.id))
                        }
                      />
                    ))}
                  </ul>
                </DropZone>
              </SortableContext>

              {fieldErrors.products ? (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors.products}</p>
              ) : null}
            </div>

            <dl className="space-y-1 rounded-2xl bg-cream p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500">Precio normal</dt>
                <dd className="text-stone-700">{formatMoney(pricing.original)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-medium text-brand">Precio de la promoción</dt>
                <dd className="text-lg font-bold text-brand">{formatMoney(pricing.final)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500">Ahorro</dt>
                <dd className="font-medium text-emerald-700">{formatMoney(pricing.saving)}</dd>
              </div>
            </dl>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              Promoción activa
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard/promotions")}
                className="rounded-xl border border-line-strong px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-brand-soft"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
              >
                {saving ? "Guardando…" : initial ? "Guardar cambios" : "Crear promoción"}
              </button>
            </div>
          </section>
        </div>

        <DragOverlay>
          {dragged ? (
            <div className="rounded-xl border border-accent bg-white px-3 py-2 text-sm font-medium shadow-lg">
              {dragged.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </form>
  );
}
