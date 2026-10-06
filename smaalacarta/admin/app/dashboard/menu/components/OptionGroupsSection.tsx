"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import OptionGroupDialog from "./dialogs/OptionGroupDialog";
import ConfirmDeleteDialog from "../../components/ConfirmDeleteDialog";
import {
  deleteOptionGroupAction,
  reorderOptionGroupsAction,
} from "../actions/options";
import { SortableItem, SortableList } from "@/components/menu/Sortable";
import DropdownMenu from "@/components/ui/DropdownMenu";
import type { OptionGroup } from "@/lib/db/options";
import { describeGroupRule } from "@/lib/menu/options";

type OptionGroupsSectionProps = {
  businessId: string;
  initialGroups: OptionGroup[];
  // Cuántos productos usa cada grupo, para avisar al borrarlo.
  usage: Record<string, number>;
};

// "Opciones y extras" (ADMIN-OPCIONES-12): los grupos reutilizables del negocio.
export default function OptionGroupsSection({
  businessId,
  initialGroups,
  usage,
}: OptionGroupsSectionProps) {
  const router = useRouter();

  const [groups, setGroups] = useState(initialGroups);

  // Igual que en MenuClient: cuando el servidor manda datos nuevos se reemplaza el estado local.
  const [syncedFrom, setSyncedFrom] = useState(initialGroups);
  if (syncedFrom !== initialGroups) {
    setSyncedFrom(initialGroups);
    setGroups(initialGroups);
  }

  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OptionGroup | undefined>(undefined);
  const [toDelete, setToDelete] = useState<OptionGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openDialog(group?: OptionGroup) {
    setEditing(group);
    setDialogOpen(true);
  }

  async function handleReorder(orderedIds: string[]) {
    setGroups((prev) =>
      orderedIds
        .map((id) => prev.find((group) => group.id === id))
        .filter((group): group is OptionGroup => !!group),
    );

    setError(null);

    try {
      await reorderOptionGroupsAction(businessId, orderedIds);
    } catch {
      setError("No pudimos guardar el orden. Volvimos a cargar los grupos.");
    }

    router.refresh();
  }

  async function confirmDelete() {
    if (!toDelete) return;

    try {
      setDeleting(true);
      await deleteOptionGroupAction(businessId, toDelete.id);
      setGroups((prev) => prev.filter((group) => group.id !== toDelete.id));
      setToDelete(null);
      router.refresh();
    } catch {
      setError("No pudimos borrar el grupo. Probá de nuevo.");
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const usedBy = toDelete ? (usage[toDelete.id] ?? 0) : 0;

  return (
    <section aria-labelledby="opciones-titulo" className="space-y-4 border-t border-line pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="opciones-titulo" className="text-xl font-bold text-brand">
            Opciones y extras
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Grupos como &quot;Extras&quot;, &quot;Sabores&quot; o &quot;Toppings&quot;, que asociás a los
            productos desde su formulario.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openDialog()}
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          + Nuevo grupo
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-white p-6 text-center text-sm text-stone-500">
          Todavía no creaste grupos de opciones.
        </p>
      ) : (
        <SortableList ids={groups.map((group) => group.id)} onReorder={handleReorder}>
          <ul className="space-y-2">
            {groups.map((group) => (
              <li key={group.id}>
                <SortableItem id={group.id}>
                  {(handle) => (
                    <article
                      className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 ${
                        group.active ? "border-line bg-white" : "border-line bg-cream opacity-70"
                      }`}
                    >
                      {handle}

                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold text-brand">
                          {group.name}
                          {group.active ? null : (
                            <span className="ml-2 text-xs font-normal text-stone-500">(inactivo)</span>
                          )}
                        </h3>
                        <p className="truncate text-xs text-stone-500">
                          {describeGroupRule(group)} · {group.options.length}{" "}
                          {group.options.length === 1 ? "opción" : "opciones"} ·{" "}
                          {usage[group.id] ?? 0}{" "}
                          {(usage[group.id] ?? 0) === 1 ? "producto" : "productos"}
                        </p>
                      </div>

                      <DropdownMenu label={`Opciones del grupo ${group.name}`}>
                        {(close) => (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                close();
                                openDialog(group);
                              }}
                              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-soft"
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                close();
                                setToDelete(group);
                              }}
                              className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </DropdownMenu>
                    </article>
                  )}
                </SortableItem>
              </li>
            ))}
          </ul>
        </SortableList>
      )}

      <OptionGroupDialog
        open={dialogOpen}
        businessId={businessId}
        group={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          router.refresh();
        }}
      />

      <ConfirmDeleteDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Eliminar grupo"
        description={
          usedBy > 0
            ? `¿Seguro que querés eliminar "${toDelete?.name}"? Se borran sus opciones y también sale de ${usedBy} ${usedBy === 1 ? "producto" : "productos"}.`
            : `¿Seguro que querés eliminar "${toDelete?.name}"? Se borran sus opciones.`
        }
      />
    </section>
  );
}
