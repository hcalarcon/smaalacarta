"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import ConfirmDeleteDialog from "../../../dashboard/components/ConfirmDeleteDialog";
import {
  createZoneAction,
  deleteZoneAction,
  reorderZonesAction,
  setZoneActiveAction,
  updateZoneAction,
  type CourierActionResult,
} from "../../actions";
import { SortableItem, SortableList } from "@/components/menu/Sortable";
import { ZONE_NAME_MAX, validateZone } from "@/lib/courier/zones";
import type { CourierZone } from "@/lib/db/courier";
import { formatMoney } from "@/lib/promotions/pricing";

type Errors = Partial<Record<"name" | "price", string>>;

// Barrios y precios del repartidor (ENVIO-36 y 37): alta, edición de nombre y precio, activar o
// desactivar, borrar con confirmación y ordenar arrastrando. Un precio nuevo vale para los pedidos
// nuevos; los que ya se hicieron guardan su precio de lista.
export default function ZonesClient({ zones }: { zones: CourierZone[] }) {
  const router = useRouter();

  const [items, setItems] = useState(zones);
  const [seen, setSeen] = useState(zones);
  if (seen !== zones) {
    setSeen(zones);
    setItems(zones);
  }

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newErrors, setNewErrors] = useState<Errors>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editErrors, setEditErrors] = useState<Errors>({});

  const [deleting, setDeleting] = useState<CourierZone | null>(null);

  async function run(call: () => Promise<CourierActionResult>): Promise<CourierActionResult | null> {
    setError(null);
    setBusy(true);

    try {
      const result = await call();
      if (!result.ok) setError(result.error);
      return result;
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
      return null;
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function add() {
    const validation = validateZone({ name: newName, price: newPrice }, items);
    if (!validation.ok) {
      setNewErrors(validation.errors);
      return;
    }

    setNewErrors({});
    const result = await run(() => createZoneAction({ name: newName, price: newPrice }));

    if (result?.ok) {
      setNewName("");
      setNewPrice("");
    } else if (result && !result.ok && result.fieldErrors) {
      setNewErrors(result.fieldErrors as Errors);
    }
  }

  function startEdit(zone: CourierZone) {
    setEditingId(zone.id);
    setEditName(zone.name);
    setEditPrice(String(zone.price));
    setEditErrors({});
  }

  async function saveEdit(zone: CourierZone) {
    const validation = validateZone({ name: editName, price: editPrice }, items, zone.id);
    if (!validation.ok) {
      setEditErrors(validation.errors);
      return;
    }

    const result = await run(() => updateZoneAction(zone.id, { name: editName, price: editPrice }));

    if (result?.ok) {
      setEditingId(null);
    } else if (result && !result.ok && result.fieldErrors) {
      setEditErrors(result.fieldErrors as Errors);
    }
  }

  function reorder(orderedIds: string[]) {
    // Se ve el orden nuevo enseguida; si falla, el refresco trae el de la base.
    setItems((current) => orderedIds.map((id) => current.find((zone) => zone.id === id)!));
    void run(() => reorderZonesAction(orderedIds));
  }

  async function confirmDelete() {
    if (!deleting) return;

    const result = await run(() => deleteZoneAction(deleting.id));
    if (result?.ok) setDeleting(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section>
        <h1 className="text-3xl font-bold text-brand">Barrios y precios</h1>
        <p className="mt-2 text-stone-500">
          Estos son los barrios que ofrecen los locales al pedir un envío. Un precio nuevo vale para los
          pedidos nuevos: los que ya se hicieron conservan el precio con el que se pidieron.
        </p>
      </section>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-brand">Agregar un barrio</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-start">
          <label className="block text-sm text-stone-700">
            Nombre
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={ZONE_NAME_MAX + 20}
              className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
            />
            {newErrors.name ? <span className="text-xs text-red-700">{newErrors.name}</span> : null}
          </label>

          <label className="block text-sm text-stone-700">
            Precio
            <input
              value={newPrice}
              onChange={(event) => setNewPrice(event.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
            />
            {newErrors.price ? <span className="text-xs text-red-700">{newErrors.price}</span> : null}
          </label>

          <button
            type="button"
            disabled={busy}
            onClick={add}
            className="min-h-11 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60 sm:mt-6"
          >
            Agregar
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-brand">
          Tus barrios <span className="text-sm font-normal text-stone-500">({items.length})</span>
        </h2>
        <p className="text-xs text-stone-500">Arrastrá para cambiar el orden en que los ve el cliente.</p>

        {items.length === 0 ? (
          <p className="mt-4 text-sm text-stone-400">Todavía no cargaste barrios.</p>
        ) : (
          <div className="mt-3 space-y-2">
            <SortableList ids={items.map((zone) => zone.id)} onReorder={reorder}>
              {items.map((zone) => (
                <SortableItem key={zone.id} id={zone.id}>
                  {(handle) => (
                    <div
                      className={`rounded-2xl border border-line p-3 ${zone.active ? "bg-white" : "bg-stone-50"}`}
                    >
                      {editingId === zone.id ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                            <label className="block text-sm text-stone-700">
                              Nombre
                              <input
                                value={editName}
                                onChange={(event) => setEditName(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
                              />
                              {editErrors.name ? (
                                <span className="text-xs text-red-700">{editErrors.name}</span>
                              ) : null}
                            </label>
                            <label className="block text-sm text-stone-700">
                              Precio
                              <input
                                value={editPrice}
                                onChange={(event) => setEditPrice(event.target.value)}
                                inputMode="decimal"
                                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm"
                              />
                              {editErrors.price ? (
                                <span className="text-xs text-red-700">{editErrors.price}</span>
                              ) : null}
                            </label>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-xl border border-line-strong px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => saveEdit(zone)}
                              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
                            >
                              Guardar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3">
                          {handle}
                          <div className="min-w-0 flex-1">
                            <p className={`truncate font-medium ${zone.active ? "text-stone-900" : "text-stone-400"}`}>
                              {zone.name}
                            </p>
                            <p className="text-sm text-stone-600">{formatMoney(zone.price)}</p>
                          </div>

                          <label className="flex items-center gap-2 text-sm text-stone-700">
                            <input
                              type="checkbox"
                              checked={zone.active}
                              disabled={busy}
                              onChange={(event) => void run(() => setZoneActiveAction(zone.id, event.target.checked))}
                              aria-label={`Activo: ${zone.name}`}
                            />
                            Activo
                          </label>

                          <button
                            type="button"
                            onClick={() => startEdit(zone)}
                            className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-brand transition hover:bg-brand-soft"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(zone)}
                            className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                          >
                            Borrar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </SortableItem>
              ))}
            </SortableList>
          </div>
        )}
      </section>

      <ConfirmDeleteDialog
        open={deleting !== null}
        title={`Borrar ${deleting?.name ?? "el barrio"}`}
        description="Los pedidos que ya se hicieron conservan el nombre y el precio. Si solo querés que no se ofrezca por ahora, desactivalo."
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
        loading={busy}
      />
    </div>
  );
}
