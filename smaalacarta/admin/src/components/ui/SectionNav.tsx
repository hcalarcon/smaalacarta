"use client";

import { useEffect, useRef, useState } from "react";

import type { SettingsSection } from "@/lib/settings/sections";

// Índice de una pantalla larga (ADMIN-CONFIG-23). Escritorio: columna fija al costado.
// Celular: barra horizontal fija debajo del header, que centra la entrada activa.
export default function SectionNav({ sections }: { sections: SettingsSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const navRef = useRef<HTMLElement>(null);

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
        const first = sections.find((section) => visible.has(section.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    for (const { id } of sections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  // En la barra del celular, la entrada activa queda al centro.
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2;
  }, [active]);

  function jump(event: React.MouseEvent, id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    setActive(id);
  }

  return (
    <nav
      ref={navRef}
      aria-label="Secciones"
      style={{ "--nav-top": "72px" } as React.CSSProperties}
      className="sticky top-[var(--nav-top)] z-20 -mx-4 flex gap-2 overflow-x-auto bg-cream/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6 lg:top-24 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
    >
      {sections.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={(event) => jump(event, id)}
          aria-current={active === id ? "true" : undefined}
          className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition lg:rounded-xl ${
            active === id
              ? "bg-brand text-white lg:bg-brand-soft lg:text-brand"
              : "text-stone-600 hover:bg-brand-soft"
          }`}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
