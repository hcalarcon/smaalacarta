"use client";

import SectionNav from "@/components/ui/SectionNav";
import type { SettingsSection } from "@/lib/settings/sections";
import { useStoredFlag } from "@/lib/use-stored-flag";

// La grilla de Configuración: el índice de secciones al costado y el contenido. Con el índice oculto
// (la elección queda en este navegador, ADMIN-CONFIG-38), la columna se reduce al botón para volver
// a abrirlo y el contenido ocupa todo el ancho.
export default function SettingsLayout({
  sections,
  children,
}: {
  sections: SettingsSection[];
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useStoredFlag("sma:settings-nav-open", true);

  return (
    <div
      className={`items-start lg:grid lg:gap-4 ${
        navOpen ? "lg:grid-cols-[10rem_minmax(0,1fr)]" : "lg:grid-cols-[2.5rem_minmax(0,1fr)]"
      }`}
    >
      <SectionNav sections={sections} open={navOpen} onToggle={() => setNavOpen(!navOpen)} />
      <div className="mt-3 min-w-0 space-y-5 lg:mt-0">{children}</div>
    </div>
  );
}
