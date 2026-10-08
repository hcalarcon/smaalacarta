"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import DefaultImageUploader from "./DefaultImageUploader";
import {
  deleteDefaultImageAction,
  probeDefaultImageAction,
  saveDefaultImageAction,
} from "../actions";

import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import type { DefaultImage, Match, Unmatched } from "@/lib/db/default-images";

type Draft = {
  id?: string;
  name: string;
  keywords: string;
  imageUrl: string;
  priority: string;
  active: boolean;
};

const EMPTY: Draft = { name: "", keywords: "", imageUrl: "", priority: "0", active: true };

const toDraft = (entry: DefaultImage): Draft => ({
  id: entry.id,
  name: entry.name,
  keywords: entry.keywords.join(", "),
  imageUrl: entry.image_url,
  priority: String(entry.priority),
  active: entry.active,
});

const card = "rounded-3xl border border-line bg-white p-6 shadow-sm";

function Probe() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<
    { state: "idle" } | { state: "loading" } | { state: "error" } | { state: "done"; match: Match | null }
  >({ state: "idle" });

  async function handleProbe(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setResult({ state: "loading" });
    const response = await probeDefaultImageAction(name, category);
    setResult(response.ok ? { state: "done", match: response.match } : { state: "error" });
  }

  return (
    <section className={card} aria-labelledby="probador">
      <h2 id="probador" className="text-lg font-semibold text-brand">
        Probador
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        Escribí el nombre de un producto y mirá qué imagen le tocaría. Usa la misma función que el menú.
      </p>

      <form onSubmit={handleProbe} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field
          label="Nombre del producto"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Milanesa napolitana con fritas"
        />
        <Field
          label="Categoría (opcional)"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          placeholder="Postres"
        />
        <button
          type="submit"
          disabled={result.state === "loading" || !name.trim()}
          className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
        >
          Probar
        </button>
      </form>

      <div aria-live="polite" className="mt-4">
        {result.state === "error" ? (
          <p className="text-sm text-red-600">No pudimos probar ese nombre. Probá de nuevo.</p>
        ) : null}
        {result.state === "done" && !result.match ? (
          <p className="text-sm text-amber-700">
            Sin coincidencia: ese producto mostraría el logo del negocio.
          </p>
        ) : null}
        {result.state === "done" && result.match ? (
          <div className="flex items-center gap-4 rounded-2xl bg-cream p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.match.imageUrl} alt="" className="h-16 w-16 object-contain" />
            <p className="text-sm text-stone-700">
              Coincide con <strong>{result.match.name}</strong> por la clave «{result.match.keyword}»
              {result.match.byCategory ? " (por la categoría)" : ""}.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EntryForm({
  draft,
  onChange,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const result = await saveDefaultImageAction({
        id: draft.id,
        name: draft.name,
        keywords: draft.keywords,
        imageUrl: draft.imageUrl,
        priority: draft.priority.trim() === "" ? Number.NaN : Number(draft.priority),
        active: draft.active,
      });

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      onSaved();
    } catch {
      setError("No pudimos guardar la imagen. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={`${card} space-y-5`}>
      <h2 className="text-lg font-semibold text-brand">{draft.id ? "Editar entrada" : "Nueva entrada"}</h2>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}

      <Field
        label="Nombre"
        value={draft.name}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
        error={fieldErrors.name}
        placeholder="Hamburguesa"
      />

      <div>
        <label htmlFor="claves" className="mb-1.5 block text-sm font-medium text-brand">
          Palabras clave (separadas por coma)
        </label>
        <textarea
          id="claves"
          rows={2}
          value={draft.keywords}
          onChange={(event) => onChange({ ...draft, keywords: event.target.value })}
          placeholder="hamburguesa, burger, cheeseburger, hamburguesa completa"
          className="w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <p className="mt-1 text-xs text-stone-500">
          Una clave coincide cuando todas sus palabras están en el nombre del producto; la más larga gana.
          Sin tildes ni plurales: se normalizan solas.
        </p>
        {fieldErrors.keywords ? <p className="mt-1.5 text-sm text-red-600">{fieldErrors.keywords}</p> : null}
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-brand">Imagen</span>
        <DefaultImageUploader value={draft.imageUrl} onChange={(imageUrl) => onChange({ ...draft, imageUrl })} />
        {fieldErrors.imageUrl ? <p className="mt-1.5 text-sm text-red-600">{fieldErrors.imageUrl}</p> : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Prioridad"
          type="number"
          inputMode="numeric"
          value={draft.priority}
          onChange={(event) => onChange({ ...draft, priority: event.target.value })}
          error={fieldErrors.priority}
          hint="Suma al puntaje: un plato principal le gana a un acompañamiento."
        />
        <label className="flex items-center gap-3 sm:self-end sm:pb-3">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => onChange({ ...draft, active: event.target.checked })}
            className="h-5 w-5"
          />
          <span className="font-medium text-stone-900">Activa</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-line-strong bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default function DefaultImagesClient({
  entries,
  unmatched,
}: {
  entries: DefaultImage[];
  unmatched: Unmatched[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState("");

  const visible = entries.filter((entry) => {
    const text = filter.trim().toLowerCase();
    return !text || `${entry.name} ${entry.keywords.join(" ")}`.toLowerCase().includes(text);
  });

  async function handleDelete(entry: DefaultImage) {
    if (!window.confirm(`¿Borrar «${entry.name}»?`)) return;
    await deleteDefaultImageAction(entry.id);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <Probe />

      {draft ? (
        <EntryForm
          draft={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            router.refresh();
          }}
        />
      ) : null}

      <section className={card} aria-labelledby="entradas">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="entradas" className="text-lg font-semibold text-brand">
            Entradas
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtrar…"
              aria-label="Filtrar entradas"
              className="rounded-xl border border-line-strong bg-white px-4 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setDraft({ ...EMPTY })}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
            >
              + Nueva entrada
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500">No hay entradas que coincidan.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {visible.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-4 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={entry.image_url} alt="" className="h-12 w-12 shrink-0 object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-stone-900">
                    {entry.name}
                    {!entry.active ? (
                      <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
                        Inactiva
                      </span>
                    ) : null}
                    <span className="ml-2 text-xs font-normal text-stone-400">prioridad {entry.priority}</span>
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {entry.keywords.map((keyword) => (
                      <li key={keyword} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs text-brand">
                        {keyword}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setDraft(toDraft(entry))}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand transition hover:bg-brand-soft"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(entry)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} aria-labelledby="sin-coincidencia">
        <h2 id="sin-coincidencia" className="text-lg font-semibold text-brand">
          Productos sin coincidencia
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Productos activos de negocios publicados que no tienen foto ni ilustración, de más a menos
          repetidos. Sirven para decidir qué palabras clave agregar.
        </p>

        {unmatched.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500">Todos los productos publicados tienen imagen.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-stone-400">
                <tr>
                  <th className="py-2 pr-4 font-medium">Nombre</th>
                  <th className="py-2 pr-4 font-medium">Negocios</th>
                  <th className="py-2 font-medium">Productos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {unmatched.map((item) => (
                  <tr key={item.normalizedName}>
                    <td className="py-2 pr-4">
                      {item.exampleName}
                      {item.exampleName.toLowerCase() !== item.normalizedName ? (
                        <span className="ml-2 text-xs text-stone-400">({item.normalizedName})</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">{item.businessCount}</td>
                    <td className="py-2">{item.productCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
