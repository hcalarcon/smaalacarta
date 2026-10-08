import type { Metadata } from "next";

import DefaultImagesClient from "./components/DefaultImagesClient";

import { listDefaultImages, listUnmatched } from "@/lib/db/default-images";

export const metadata: Metadata = { title: "Imágenes predeterminadas" };

// El layout de /superadmin ya exige superadmin (ADMIN-SUPER-7); las consultas lo vuelven a exigir por RLS.
export default async function DefaultImagesPage() {
  const [entries, unmatched] = await Promise.all([listDefaultImages(), listUnmatched()]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-brand">Imágenes predeterminadas</h1>
        <p className="mt-2 text-stone-500">
          Ilustraciones que el menú muestra en los productos sin foto, elegidas por coincidencia con
          el nombre. {entries.length === 1 ? "1 entrada." : `${entries.length} entradas.`}
        </p>
      </section>

      <DefaultImagesClient entries={entries} unmatched={unmatched} />
    </div>
  );
}
