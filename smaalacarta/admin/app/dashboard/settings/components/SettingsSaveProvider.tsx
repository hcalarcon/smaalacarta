"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { saveBusinessProfileAction, saveSettingsAction } from "../actions";
import { menuUrl } from "@/lib/menu-url";
import {
  prepareSettings,
  profileChanged,
  regenerateSuggestion,
  runSave,
} from "@/lib/settings/save-flow";
import { validateSettings, type SettingsInput } from "@/lib/settings/validation";
import { validateBusinessProfile } from "@/lib/superadmin/validation";

type ProfileErrors = Partial<Record<"name" | "slug", string>>;
type SettingsErrors = Partial<Record<string, string>>;

type SettingsSave = {
  name: string;
  slug: string;
  setName: (name: string) => void;
  setSlug: (slug: string) => void;
  profileErrors: ProfileErrors;
  settingsErrors: SettingsErrors;
  // SettingsForm avisa cómo está su formulario en cada cambio.
  reportSettings: (input: SettingsInput) => void;
  save: () => void;
};

const SettingsSaveContext = createContext<SettingsSave | null>(null);

export function useSettingsSave(): SettingsSave {
  const context = useContext(SettingsSaveContext);
  if (!context) throw new Error("useSettingsSave va dentro de SettingsSaveProvider");
  return context;
}

// El guardado único de Configuración (ADMIN-CONFIG-33 a 37). Es dueño del estado de Datos del negocio
// y de lo último que informó SettingsForm; el botón flotante guarda las dos cosas juntas. Las reglas
// (qué cambió, el orden, cuándo preguntar por la URL) están en `lib/settings/save-flow.ts`.
export default function SettingsSaveProvider({
  initialName,
  initialSlug,
  children,
}: {
  initialName: string;
  initialSlug: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [savedProfile, setSavedProfile] = useState({ name: initialName, slug: initialSlug });
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);

  // Si el nombre o la URL cambiaron desde afuera (p. ej. al regenerar desde "Compartir"), se
  // sincroniza al renderizar.
  const [syncedFrom, setSyncedFrom] = useState({ name: initialName, slug: initialSlug });
  if (syncedFrom.name !== initialName || syncedFrom.slug !== initialSlug) {
    setSyncedFrom({ name: initialName, slug: initialSlug });
    setSavedProfile({ name: initialName, slug: initialSlug });
    setName(initialName);
    setSlug(initialSlug);
  }

  // Lo último que informó SettingsForm, y cómo estaba cuando se guardó por última vez.
  const latestInput = useRef<SettingsInput | null>(null);
  const [serialized, setSerialized] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);

  function reportSettings(input: SettingsInput) {
    latestInput.current = input;
    const next = JSON.stringify(input);
    setSerialized((prev) => (prev === next ? prev : next));
    setBaseline((prev) => prev ?? next);
  }

  const settingsDirty = serialized !== null && serialized !== baseline;
  const profileDirty = profileChanged(savedProfile, { name, slug });
  const dirty = settingsDirty || profileDirty;

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [settingsErrors, setSettingsErrors] = useState<SettingsErrors>({});
  // El error general se esconde cuando la persona vuelve a editar algo.
  const editKey = `${name}|${slug}|${serialized}`;
  const [failure, setFailure] = useState<{ message: string; editKey: string } | null>(null);
  const error = failure && failure.editKey === editKey ? failure.message : null;

  const [confirmRegenerate, setConfirmRegenerate] = useState<{ suggestedSlug: string } | null>(null);

  // El aviso de guardado se va solo a los 3 segundos.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [saved]);

  async function doSave(finalSlug: string, input: SettingsInput | null) {
    const profile = { name: name.trim(), slug: finalSlug };
    const sent = serialized;

    setSaving(true);
    setSaved(false);
    setFailure(null);
    setProfileErrors({});
    setSettingsErrors({});

    let message: string | null = null;
    // Cómo queda el formulario tras guardar: si el perfil se guardó, con sus valores ya recortados.
    let after = { name, slug };
    try {
      const result = await runSave({
        profileChanged: profileChanged(savedProfile, profile),
        settingsChanged: settingsDirty && input !== null,
        saveProfile: () => saveBusinessProfileAction(profile),
        saveSettings: () => saveSettingsAction(input as SettingsInput),
      });

      if (result.profile?.ok) {
        setSavedProfile(profile);
        setName(profile.name);
        setSlug(finalSlug);
        after = profile;
      } else if (result.profile) {
        setProfileErrors(result.profile.fieldErrors ?? {});
        message = result.profile.error;
      }

      if (result.settings?.ok) {
        setBaseline(sent);
      } else if (result.settings) {
        setSettingsErrors(result.settings.fieldErrors ?? {});
        message = result.settings.error;
      }

      if (result.ok) setSaved(true);
      if (result.profile?.ok || result.settings?.ok) router.refresh();
    } catch {
      message = "No pudimos guardar los cambios. Probá de nuevo.";
    } finally {
      setSaving(false);
    }

    // Los cambios que quedaron sin guardar siguen marcados; el error se muestra hasta que se edite.
    if (message) setFailure({ message, editKey: `${after.name}|${after.slug}|${sent}` });
  }

  function save() {
    if (saving || !dirty) return;

    const profile = { name: name.trim(), slug: slug.trim().toLowerCase() };
    const input = latestInput.current;

    // Se valida lo que se va a enviar antes de mandar nada: con un error, no se guarda ninguna de las dos.
    const profileCheck = profileDirty ? validateBusinessProfile(profile) : { ok: true as const };
    const settingsCheck =
      settingsDirty && input ? validateSettings(prepareSettings(input)) : { ok: true as const };

    if (!profileCheck.ok || !settingsCheck.ok) {
      setSaved(false);
      setProfileErrors(profileCheck.ok ? {} : profileCheck.errors);
      setSettingsErrors(settingsCheck.ok ? {} : settingsCheck.errors);
      setFailure({ message: "Revisá los datos marcados.", editKey });
      return;
    }

    if (profileDirty) {
      const suggestedSlug = regenerateSuggestion(savedProfile, profile);
      if (suggestedSlug) {
        setConfirmRegenerate({ suggestedSlug });
        return;
      }
    }

    void doSave(profile.slug, input);
  }

  const value: SettingsSave = {
    name,
    slug,
    setName,
    setSlug,
    profileErrors,
    settingsErrors,
    reportSettings,
    save,
  };

  return (
    <SettingsSaveContext.Provider value={value}>
      {children}

      {saved ? (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-lg sm:bottom-6"
        >
          Cambios guardados
        </div>
      ) : null}

      {/* Espacio para que, al final de la pantalla, el botón flotante no tape el último campo en
          pantallas angostas. */}
      <div className="h-14 sm:hidden" aria-hidden />
      <div className="fixed bottom-6 right-6 z-10 flex max-w-[calc(100vw-3rem)] flex-col items-end gap-2">
        {error ? (
          <div role="alert" className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {error}
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          {dirty ? (
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow">
              Cambios sin guardar
            </span>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-hover disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>

      {confirmRegenerate ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmRegenerate(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="regenerar-titulo"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl supports-[height:1dvh]:max-h-[90dvh]"
          >
            <h2 id="regenerar-titulo" className="text-lg font-semibold text-brand">
              Cambiaste el nombre
            </h2>

            <p className="mt-2 text-sm text-stone-500">
              ¿Querés que la URL de tu menú pase a ser{" "}
              <code className="rounded bg-cream px-1.5">{menuUrl(confirmRegenerate.suggestedSlug)}</code>? El
              link y el código QR que ya compartiste dejarían de funcionar.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setConfirmRegenerate(null);
                  void doSave(slug.trim().toLowerCase(), latestInput.current);
                }}
                className="rounded-2xl border border-line-strong px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
              >
                Mantener la URL actual
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = confirmRegenerate.suggestedSlug;
                  setConfirmRegenerate(null);
                  void doSave(next, latestInput.current);
                }}
                className="rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Sí, regenerar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SettingsSaveContext.Provider>
  );
}
