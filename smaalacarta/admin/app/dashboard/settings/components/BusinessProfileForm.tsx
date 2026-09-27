"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveBusinessProfileAction } from "../actions";
import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import Section from "@/components/ui/Section";
import { menuUrl } from "@/lib/menu-url";
import { slugify } from "@/lib/superadmin/validation";

export default function BusinessProfileForm({
  initialName,
  initialSlug,
}: {
  initialName: string;
  initialSlug: string;
}) {
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);

  // Si el nombre o el slug cambiaron desde afuera (por ejemplo, al regenerar
  // desde "Compartir"), se sincroniza al renderizar.
  const [syncedFrom, setSyncedFrom] = useState({
    name: initialName,
    slug: initialSlug,
  });
  if (syncedFrom.name !== initialName || syncedFrom.slug !== initialSlug) {
    setSyncedFrom({ name: initialName, slug: initialSlug });
    setName(initialName);
    setSlug(initialSlug);
  }

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"name" | "slug", string>>
  >({});

  // Si el nombre cambió y la URL quedó como estaba, se pregunta antes de
  // guardar en vez de tocarla sola.
  const [confirmRegenerate, setConfirmRegenerate] = useState<{
    suggestedSlug: string;
  } | null>(null);

  async function save(finalSlug: string) {
    setSaving(true);
    setSaved(false);
    setError(null);
    setFieldErrors({});

    try {
      const result = await saveBusinessProfileAction({
        name: name.trim(),
        slug: finalSlug,
      });

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      setSlug(finalSlug);
      setSaved(true);
      router.refresh();
    } catch {
      setError("No pudimos guardar los cambios. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const nameChanged = name.trim() !== syncedFrom.name;
    const slugUntouched = slug === syncedFrom.slug;
    const suggestedSlug = slugify(name.trim());

    if (
      nameChanged &&
      slugUntouched &&
      suggestedSlug &&
      suggestedSlug !== slug
    ) {
      setConfirmRegenerate({ suggestedSlug });
      return;
    }

    void save(slug);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}

      <Section
        title="Datos del negocio"
        description="El nombre y la URL de tu menú público."
      >
        <Field
          label="Nombre del negocio"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
        />

        <div>
          <Field
            label="URL de tu menú"
            value={slug}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
            hint={`Tus clientes entran por ${menuUrl(slug || "tu-negocio")}`}
            error={fieldErrors.slug}
            autoCapitalize="none"
          />

          <p className="mt-1.5 text-sm text-amber-700">
            Si la cambiás, el link y el código QR que ya compartiste dejan de
            funcionar.
          </p>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-4">
        {saved ? (
          <span role="status" className="text-sm font-medium text-emerald-700">
            Cambios guardados
          </span>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>

      {confirmRegenerate ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmRegenerate(null)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl"
          >
            <h2 className="text-lg font-semibold text-brand">
              Cambiaste el nombre
            </h2>

            <p className="mt-2 text-sm text-stone-500">
              ¿Querés que la URL de tu menú pase a ser{" "}
              <code className="rounded bg-cream px-1.5">
                {menuUrl(confirmRegenerate.suggestedSlug)}
              </code>
              ? El link y el código QR que ya compartiste dejarían de
              funcionar.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setConfirmRegenerate(null);
                  void save(slug);
                }}
                className="rounded-2xl border border-line-strong px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
              >
                Mantener la URL actual
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextSlug = confirmRegenerate.suggestedSlug;
                  setConfirmRegenerate(null);
                  void save(nextSlug);
                }}
                className="rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Sí, regenerar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
