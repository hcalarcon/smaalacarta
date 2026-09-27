"use client";

import { useEffect, useRef, useState } from "react";

// Menú "⋮" que se cierra solo al clickear afuera o con Escape (a diferencia de
// un <details>, que solo se cierra si se vuelve a apretar el disparador).
export default function DropdownMenu({
  label,
  align = "right",
  children,
}: {
  label: string;
  align?: "left" | "right";
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-xl px-3 py-1.5 text-stone-500 transition hover:bg-line"
      >
        ⋮
      </button>

      {open ? (
        <div
          className={`absolute top-full z-10 mt-1 w-44 rounded-2xl border border-line bg-white p-2 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
