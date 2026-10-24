"use client";

import { useEffect, useRef, useState } from "react";

import { useStoredSectionOrder } from "@/lib/settings/use-stored-section-order";
import type { SettingsSection } from "@/lib/settings/sections";

export default function SectionNav({
  sections,
  businessId = "default",
  open = true,
  onToggle,
}: {
  sections: SettingsSection[];
  businessId?: string;
  open?: boolean;
  onToggle?: () => void;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const [reordering, setReordering] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [orderedSections, saveOrder] = useStoredSectionOrder(sections, businessId);

  // Debajo del header fijo del panel, sea cual sea su alto.
  useEffect(() => {
    const header = document.querySelector("header");
    if (header) {
      navRef.current?.style.setProperty("--nav-top", `${header.getBoundingClientRect().height}px`);
    }
  }, []);

  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = orderedSections.find((section) => visible.has(section.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    for (const { id } of orderedSections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [orderedSections]);

  function jump(id: string) {
    const target = document.getElementById(id);
    if (!target) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    setActive(id);
  }

  function moveSection(id: string, direction: -1 | 1) {
    const currentIndex = orderedSections.findIndex((section) => section.id === id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedSections.length) return;

    const nextOrder = orderedSections.map(({ id: sectionId }) => sectionId);
    [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];
    saveOrder(nextOrder);
  }

  return (
    <nav
      ref={navRef}
      aria-label="Secciones"
      style={{ "--nav-top": "72px" } as React.CSSProperties}
      className="sticky top-[var(--nav-top)] z-20 -mx-4 max-h-[calc(100vh-var(--nav-top)-1rem)] overflow-y-auto border-b border-line bg-cream/95 px-4 py-2 shadow-sm backdrop-blur md:-mx-6 md:px-6 lg:top-24 lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:shadow-none lg:backdrop-blur-none"
    >
      <div className="flex items-center gap-2">
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? "Ocultar el índice de secciones" : "Mostrar el índice de secciones"}
            title={open ? "Ocultar el índice" : "Mostrar el índice"}
            className="hidden h-11 items-center rounded-xl px-2 text-sm font-medium text-stone-500 transition hover:bg-brand-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-accent lg:flex"
          >
            <span aria-hidden>{open ? "‹" : "›"}</span>
          </button>
        ) : null}
        <div className={`flex min-w-0 flex-1 flex-wrap items-center gap-2 ${open ? "" : "lg:hidden"}`}>
          <label className="sr-only" htmlFor="settings-section-nav">
            Ir a sección
          </label>
          <select
            id="settings-section-nav"
            aria-label="Ir a sección"
            value={active}
            onChange={(event) => jump(event.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-white px-3 py-2 text-sm font-medium text-brand focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {orderedSections.map(({ id, label }) => (
              <option key={id} value={id} aria-current={active === id ? "location" : undefined}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setReordering((value) => !value)}
            aria-expanded={reordering}
            className="min-h-11 whitespace-nowrap rounded-xl border border-line-strong bg-white px-3 text-sm font-medium text-brand transition hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-accent"
          >
            {reordering ? "Listo" : "Reordenar índice"}
          </button>
        </div>
      </div>

      {reordering && open ? (
        <div
          role="group"
          aria-label="Orden del índice"
          className="mt-2 space-y-1 rounded-2xl border border-line bg-white p-2 shadow-sm lg:max-h-[60vh] lg:overflow-y-auto"
        >
          <p className="px-2 pb-1 text-xs text-stone-500">
            Usá las flechas para cambiar el orden. Se guarda para este negocio en este navegador.
          </p>
          {orderedSections.map(({ id, label }, index) => (
            <div
              key={id}
              className="flex min-h-11 items-center justify-between gap-2 rounded-xl px-2 text-sm text-stone-700"
            >
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => moveSection(id, -1)}
                  disabled={index === 0}
                  aria-label={`Subir ${label}`}
                  className="h-9 w-9 rounded-lg border border-line text-brand hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span aria-hidden>↑</span>
                </button>
                <button
                  type="button"
                  onClick={() => moveSection(id, 1)}
                  disabled={index === orderedSections.length - 1}
                  aria-label={`Bajar ${label}`}
                  className="h-9 w-9 rounded-lg border border-line text-brand hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span aria-hidden>↓</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
