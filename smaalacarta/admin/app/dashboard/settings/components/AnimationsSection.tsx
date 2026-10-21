"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import MenuPreviewFrame from "./MenuPreviewFrame";
import Section from "@/components/ui/Section";
import ImageUploader from "@/components/ui/ImageUploader";
import {
  CUSTOM_LOADER,
  LOADER_PRESETS,
  MENU_ANIMATIONS,
  type MenuLook,
  type MenuLookErrors,
} from "@/lib/settings/menu-look";
import {
  fetchMenuPreview,
  mergePreviewConfig,
  previewPayload,
  type MenuPreviewResult,
  type PreviewDraft,
} from "@/lib/settings/live-preview";
import {
  ANIMATION_ACCEPT,
  ANIMATION_BUCKET,
  animationPath,
  validateAnimationFile,
} from "@/lib/storage/animations";
import { CENTER } from "@/lib/settings/header-focus";
import { createClient } from "@/lib/supabase-browser";

const PREVIEW = { width: 390, height: 640 };

const card = (selected: boolean) =>
  `flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition focus-within:ring-2 focus-within:ring-accent/40 ${
    selected ? "border-brand bg-brand-soft" : "border-line-strong bg-white hover:bg-brand-soft"
  }`;

// Animaciones del menú (PUBLICO-102 a 110): cómo entra el menú, qué cargador se ve mientras abre y una imagen de
// fondo. Todo se guarda con "Guardar cambios", como el resto de Configuración. A la derecha, el menú real en un
// celular chico (el mismo de la vista previa de Apariencia) que reproduce la elección; "Ver de nuevo" la repite.
export default function AnimationsSection({
  businessId,
  look,
  onChange,
  errors,
  draft,
}: {
  businessId: string;
  look: MenuLook;
  onChange: (look: MenuLook) => void;
  errors: MenuLookErrors;
  // El borrador del formulario (sin las animaciones): la vista previa lo mezcla con `look`.
  draft: PreviewDraft;
}) {
  // Cada cambio de animación vuelve a cargar la vista previa para que se vea desde el principio.
  const [replay, setReplay] = useState(0);

  function update(change: Partial<MenuLook>, replayPreview = true) {
    onChange({ ...look, ...change });
    if (replayPreview) setReplay((n) => n + 1);
  }

  const customSelected = look.loaderAnimation === CUSTOM_LOADER;

  return (
    <Section
      id="animaciones"
      title="Animaciones"
      description="Cómo se mueve tu menú al abrir, qué ve tu cliente mientras carga y una imagen de fondo. Disponible en todos los planes."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-brand">Animación del menú</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {MENU_ANIMATIONS.map((option) => (
                <label key={option.key} className={card(look.menuAnimation === option.key)}>
                  <input
                    type="radio"
                    name="animacion-menu"
                    value={option.key}
                    checked={look.menuAnimation === option.key}
                    onChange={() => update({ menuAnimation: option.key })}
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span>
                    <span className="block font-medium text-stone-900">{option.label}</span>
                    <span className="block text-stone-500">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.menuAnimation ? <p className="mt-1.5 text-sm text-red-600">{errors.menuAnimation}</p> : null}
            <p className="mt-1.5 text-sm text-stone-500">
              Si el celular de tu cliente tiene activado «reducir movimiento», no ve animaciones aunque elijas una.
            </p>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-brand">Animación de carga</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {LOADER_PRESETS.map((option) => (
                <label key={option.key} className={card(look.loaderAnimation === option.key)}>
                  <input
                    type="radio"
                    name="animacion-carga"
                    value={option.key}
                    checked={look.loaderAnimation === option.key}
                    onChange={() => update({ loaderAnimation: option.key })}
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span className="font-medium text-stone-900">{option.label}</span>
                </label>
              ))}
              <label className={`${card(customSelected)} col-span-2 sm:col-span-4`}>
                <input
                  type="radio"
                  name="animacion-carga"
                  value={CUSTOM_LOADER}
                  checked={customSelected}
                  disabled={!look.loaderCustomUrl}
                  onChange={() => update({ loaderAnimation: CUSTOM_LOADER })}
                  className="mt-0.5 h-5 w-5 shrink-0"
                />
                <span>
                  <span className="block font-medium text-stone-900">La mía</span>
                  <span className="block text-stone-500">
                    {look.loaderCustomUrl ? "Tu animación subida." : "Subí un archivo abajo para usarla."}
                  </span>
                </span>
              </label>
            </div>
            {errors.loaderAnimation ? <p className="mt-1.5 text-sm text-red-600">{errors.loaderAnimation}</p> : null}

            <div className="mt-3">
              <ImageUploader
                businessId={businessId}
                label="Subir mi propia animación"
                value={look.loaderCustomUrl}
                onChange={(url) =>
                  update({
                    loaderCustomUrl: url,
                    // Al subirla se usa; al quitarla, vuelve a la de siempre.
                    loaderAnimation: url ? CUSTOM_LOADER : customSelected ? "hamburguesa" : look.loaderAnimation,
                  })
                }
                bucket={ANIMATION_BUCKET}
                validate={validateAnimationFile}
                makePath={animationPath}
                accept={ANIMATION_ACCEPT}
                hint="GIF, WebP o PNG animado, hasta 1 MB."
                fit="contain"
              />
              {errors.loaderCustomUrl ? <p className="mt-1.5 text-sm text-red-600">{errors.loaderCustomUrl}</p> : null}
            </div>
          </fieldset>

          <div>
            <ImageUploader
              businessId={businessId}
              label="Imagen de fondo del menú"
              value={look.backgroundImageUrl}
              onChange={(url) => update({ backgroundImageUrl: url }, false)}
              hint="JPG, PNG o WebP, hasta 2 MB. Sin imagen, el fondo es el de siempre."
              thumbClassName="h-20 w-32"
            />
            <p className="mt-1.5 text-sm text-stone-500">
              Va detrás de todo, con una capa del color de tu menú encima para que el texto se lea siempre, en tema
              claro y oscuro. Mejor una imagen apaisada y sin letras.
            </p>
            {errors.backgroundImageUrl ? <p className="mt-1.5 text-sm text-red-600">{errors.backgroundImageUrl}</p> : null}
          </div>
        </div>

        <LookPreview
          businessId={businessId}
          draft={{ ...draft, look }}
          replay={replay}
          onReplay={() => setReplay((n) => n + 1)}
          className="self-start lg:col-start-2 lg:row-start-1"
        />
      </div>
    </Section>
  );
}

// El menú real en un celular chico, con la elección sin guardar. Pide el menú guardado una vez (como la vista
// previa de Apariencia) y le manda encima las animaciones y el fondo de la pantalla.
function LookPreview({
  businessId,
  draft,
  replay,
  onReplay,
  className = "",
}: {
  businessId: string;
  draft: PreviewDraft;
  replay: number;
  onReplay: () => void;
  className?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [fetched, setFetched] = useState<{ attempt: number; result: MenuPreviewResult } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMenuPreview(createClient(), businessId).then((result) => {
      if (!cancelled) setFetched({ attempt, result });
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, attempt]);

  const result = fetched?.attempt === attempt ? fetched.result : null;
  const saved = result?.ok ? result : null;

  const adminOrigin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => undefined,
  );

  return (
    <aside aria-label="Vista previa de las animaciones" className={`rounded-2xl border border-line-strong bg-white p-2.5 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="px-1.5 text-sm font-medium text-brand">Vista previa</span>
        <button
          type="button"
          onClick={onReplay}
          disabled={!saved}
          className="min-h-9 rounded-lg border border-line-strong bg-white px-3 py-1 text-xs font-medium text-stone-700 transition hover:bg-brand-soft disabled:opacity-50"
        >
          Ver de nuevo
        </button>
      </div>

      {saved ? (
        <MenuPreviewFrame
          title="Vista previa de las animaciones del menú"
          payload={previewPayload(mergePreviewConfig(saved.config, draft), saved.menu)}
          imageUrl=""
          focus={{ x: CENTER, y: CENTER }}
          onFocusChange={() => {}}
          width={PREVIEW.width}
          height={PREVIEW.height}
          cropHeight={460}
          adminOrigin={adminOrigin}
          reloadKey={replay}
          loaderPreview
        />
      ) : result ? (
        <div role="alert" className="space-y-2 rounded-xl bg-stone-100 p-3 text-sm text-stone-600">
          <p>No pudimos cargar tu menú para la vista previa.</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded-lg border border-line-strong bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-brand-soft"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <p role="status" className="rounded-xl bg-stone-100 p-3 text-sm text-stone-600">
          Cargando vista previa…
        </p>
      )}

      <p className="mt-2 text-xs text-stone-500">
        Primero se ve la animación de carga y después entra el menú, con lo que elegiste aunque no lo hayas
        guardado.
      </p>
    </aside>
  );
}
