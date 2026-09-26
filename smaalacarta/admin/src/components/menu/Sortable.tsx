"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId } from "react";

import { moveItem } from "@/lib/menu/ordering";

// Lista que se reordena arrastrando, con mouse, dedo o teclado (foco en el asa y
// barra espaciadora + flechas). Avisa el orden nuevo con `onReorder`.
export function SortableList({
  ids,
  onReorder,
  children,
}: {
  ids: string[];
  onReorder: (orderedIds: string[]) => void;
  children: React.ReactNode;
}) {
  // dnd-kit numera sus textos de ayuda con un contador que difiere entre el servidor y el
  // navegador (error de hidratación): un id estable lo evita.
  const dndId = useId();
  const sensors = useSensors(
    // Un mínimo de recorrido evita que un clic se confunda con un arrastre.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onReorder(moveItem(ids, String(active.id), String(over.id)));
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

// Un elemento de la lista. Recibe el asa ya armada para ponerla donde quiera.
export function SortableItem({
  id,
  children,
}: {
  id: string;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const handle = (
    <button
      type="button"
      aria-label="Arrastrar para reordenar"
      // Dentro de un <summary>, un clic abriría o cerraría el <details>.
      onClick={(event) => event.preventDefault()}
      className="cursor-grab touch-none rounded-lg px-1.5 py-1 text-stone-400 hover:bg-brand-soft hover:text-brand active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="currentColor"
      >
        <circle cx="9" cy="6" r="1.6" />
        <circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" />
        <circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" />
        <circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        position: "relative",
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      {children(handle)}
    </div>
  );
}
