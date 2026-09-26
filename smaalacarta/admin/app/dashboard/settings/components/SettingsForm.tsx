"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveSettingsAction } from "../actions";
import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import ImageUploader from "@/components/ui/ImageUploader";
import {
  DAYS,
  parseRange,
  type DayKey,
  type Schedule,
} from "@/lib/settings/schedule";
import {
  TAGLINE_MAX,
  TEMPLATES,
  type SettingsInput,
} from "@/lib/settings/validation";

type RangeRow = { start: string; end: string };
type DayState = { closed: boolean; ranges: RangeRow[] };
type ScheduleState = Record<DayKey, DayState>;

const DEFAULT_RANGE: RangeRow = { start: "12:00", end: "15:00" };

function toRows(ranges: string[] | undefined): RangeRow[] {
  return (ranges ?? []).flatMap((value) => {
    if (!parseRange(value)) return [];
    const [start, end] = value.split("-");
    return [{ start, end }];
  });
}

// Del horario guardado a lo que edita el formulario. Un horario `{}` significa
// "sin horarios cargados"; con horarios, un día que falta se toma como cerrado.
function toScheduleState(schedule: Schedule): ScheduleState {
  return Object.fromEntries(
    DAYS.map(({ key }) => {
      const rows = toRows(schedule[key]);
      return [key, { closed: rows.length === 0, ranges: rows }];
    }),
  ) as ScheduleState;
}

function toSchedule(state: ScheduleState, enabled: boolean): Schedule {
  if (!enabled) return {};

  return Object.fromEntries(
    DAYS.map(({ key }) => {
      const day = state[key];
      const ranges = day.closed
        ? []
        : day.ranges
            .filter((row) => row.start && row.end)
            .map((row) => `${row.start}-${row.end}`);
      return [key, ranges];
    }),
  ) as Schedule;
}

const inputClass =
  "rounded-xl border border-line-strong bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-brand">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-stone-500">{description}</p>
      ) : null}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function ColorField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-brand">{label}</span>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} (selector)`}
          className="h-11 w-14 cursor-pointer rounded-xl border border-line-strong bg-white p-1"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className={`${inputClass} w-32 font-mono`}
          maxLength={7}
        />
      </div>
      {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export default function SettingsForm({
  businessId,
  slug,
  initial,
}: {
  businessId: string;
  slug: string;
  initial: SettingsInput;
}) {
  const router = useRouter();

  const [published, setPublished] = useState(initial.published);
  const [template, setTemplate] = useState(initial.template);
  const [tagline, setTagline] = useState(initial.tagline);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initial.secondaryColor);
  const [headerImageUrl, setHeaderImageUrl] = useState(initial.headerImageUrl);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [address, setAddress] = useState(initial.address);
  const [instagram, setInstagram] = useState(initial.instagram);
  const [facebook, setFacebook] = useState(initial.facebook);
  const [temporarilyClosed, setTemporarilyClosed] = useState(initial.temporarilyClosed);
  const [closedMessage, setClosedMessage] = useState(initial.closedMessage);
  const [reopensOn, setReopensOn] = useState(initial.reopensOn);

  const hasInitialSchedule = Object.keys(initial.schedule).length > 0;
  const [scheduleEnabled, setScheduleEnabled] = useState(hasInitialSchedule);
  const [days, setDays] = useState<ScheduleState>(() =>
    toScheduleState(initial.schedule),
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [imageBroken, setImageBroken] = useState(false);

  function updateDay(key: DayKey, change: (day: DayState) => DayState) {
    setSaved(false);
    setDays((prev) => ({ ...prev, [key]: change(prev[key]) }));
  }

  function copyMondayToAll() {
    setSaved(false);
    setDays((prev) =>
      Object.fromEntries(
        DAYS.map(({ key }) => [
          key,
          { closed: prev.lunes.closed, ranges: prev.lunes.ranges.map((r) => ({ ...r })) },
        ]),
      ) as ScheduleState,
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    setFieldErrors({});

    try {
      const result = await saveSettingsAction({
        published,
        template,
        tagline,
        primaryColor,
        secondaryColor,
        headerImageUrl,
        logoUrl,
        schedule: toSchedule(days, scheduleEnabled),
        whatsapp,
        address,
        instagram,
        facebook,
        temporarilyClosed,
        closedMessage,
        reopensOn,
      });

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError("No pudimos guardar la configuración. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}

      <Section
        title="Publicación"
        description="Mientras esté apagado, tu menú no se muestra al público."
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={published}
            onChange={(event) => setPublished(event.target.checked)}
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="block font-medium text-stone-900">Menú público</span>
            <span className="block text-sm text-stone-500">
              Tu identificador es <code className="rounded bg-cream px-1.5">{slug}</code>.
            </span>
          </span>
        </label>
      </Section>

      <Section title="Apariencia" description="Cómo ven tus clientes el menú.">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-brand">Plantilla</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {TEMPLATES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setTemplate(option.key)}
                aria-pressed={template === option.key}
                className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                  template === option.key
                    ? "border-brand bg-brand text-white"
                    : "border-line-strong bg-white text-stone-700 hover:bg-brand-soft"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {fieldErrors.template ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.template}</p>
          ) : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <ColorField
            label="Color principal"
            value={primaryColor}
            onChange={(value) => setPrimaryColor(value)}
            error={fieldErrors.primaryColor}
          />
          <ColorField
            label="Color secundario"
            value={secondaryColor}
            onChange={(value) => setSecondaryColor(value)}
            error={fieldErrors.secondaryColor}
          />
        </div>

        <ImageUploader
          businessId={businessId}
          label="Imagen de cabecera (opcional)"
          value={headerImageUrl}
          onChange={(url) => {
            setHeaderImageUrl(url);
            setImageBroken(false);
          }}
        />

        <Field
          label="…o pegá la dirección de una imagen"
          value={headerImageUrl}
          onChange={(event) => {
            setHeaderImageUrl(event.target.value);
            setImageBroken(false);
          }}
          placeholder="https://…/cabecera.jpg"
          hint="Dirección de una imagen (https)."
          error={fieldErrors.headerImageUrl}
          inputMode="url"
          autoCapitalize="none"
        />

        <ImageUploader
          businessId={businessId}
          label="Logo (opcional)"
          value={logoUrl}
          onChange={setLogoUrl}
        />
        <p className="-mt-3 text-sm text-stone-500">
          Cuadrado, de al menos 512 × 512 px. Es el ícono cuando tus clientes instalan
          el menú en el celular; sin logo se usa el de SMA a la Carta.
        </p>

        {/* Vista previa de la cabecera: colores de marca y, si carga, la imagen. */}
        <div
          className="relative h-32 overflow-hidden rounded-2xl"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
          }}
        >
          {headerImageUrl.trim() && !imageBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headerImageUrl.trim()}
              alt=""
              onError={() => setImageBroken(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/50 to-transparent p-4">
            <span className="text-lg font-semibold text-white">Vista previa</span>
          </div>
        </div>
        {imageBroken ? (
          <p className="-mt-3 text-sm text-amber-700">
            No pudimos cargar esa imagen. Revisá la dirección.
          </p>
        ) : null}

        <div>
          <label
            htmlFor="tagline"
            className="mb-1.5 block text-sm font-medium text-brand"
          >
            Descripción (opcional)
          </label>
          <textarea
            id="tagline"
            value={tagline}
            onChange={(event) => setTagline(event.target.value)}
            rows={2}
            maxLength={TAGLINE_MAX + 20}
            placeholder="Cocina casera desde 1990"
            className="w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <p
            className={`mt-1 text-right text-xs ${
              tagline.length > TAGLINE_MAX ? "text-red-600" : "text-stone-400"
            }`}
          >
            {tagline.length}/{TAGLINE_MAX}
          </p>
          {fieldErrors.tagline ? (
            <p className="text-sm text-red-600">{fieldErrors.tagline}</p>
          ) : null}
        </div>
      </Section>

      <Section
        title="Horarios"
        description="Con horarios cargados, el menú muestra si estás abierto o cerrado. Un horario puede pasar la medianoche (20:00 a 02:00)."
      >
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={scheduleEnabled}
            onChange={(event) => {
              setScheduleEnabled(event.target.checked);
              setSaved(false);
            }}
            className="h-5 w-5"
          />
          <span className="text-sm font-medium text-stone-900">
            Mostrar mis horarios de atención
          </span>
        </label>

        {scheduleEnabled ? (
          <div className="space-y-3">
            {DAYS.map(({ key, label }) => {
              const day = days[key];

              return (
                <div
                  key={key}
                  className="flex flex-col gap-3 rounded-2xl border border-line p-4 sm:flex-row sm:items-start"
                >
                  <div className="flex items-center justify-between gap-4 sm:w-44">
                    <span className="font-medium text-stone-900">{label}</span>
                    <label className="flex items-center gap-2 text-sm text-stone-600">
                      <input
                        type="checkbox"
                        checked={day.closed}
                        onChange={(event) =>
                          updateDay(key, (d) => ({
                            closed: event.target.checked,
                            ranges:
                              !event.target.checked && d.ranges.length === 0
                                ? [{ ...DEFAULT_RANGE }]
                                : d.ranges,
                          }))
                        }
                      />
                      Cerrado
                    </label>
                  </div>

                  <div className="flex-1 space-y-2">
                    {day.closed ? (
                      <p className="py-2 text-sm text-stone-400">No abre este día.</p>
                    ) : (
                      <>
                        {day.ranges.map((row, index) => (
                          <div key={index} className="flex flex-wrap items-center gap-2">
                            <input
                              type="time"
                              value={row.start}
                              aria-label={`${label}: abre`}
                              onChange={(event) =>
                                updateDay(key, (d) => ({
                                  ...d,
                                  ranges: d.ranges.map((r, i) =>
                                    i === index ? { ...r, start: event.target.value } : r,
                                  ),
                                }))
                              }
                              className={inputClass}
                            />
                            <span className="text-stone-400">a</span>
                            <input
                              type="time"
                              value={row.end}
                              aria-label={`${label}: cierra`}
                              onChange={(event) =>
                                updateDay(key, (d) => ({
                                  ...d,
                                  ranges: d.ranges.map((r, i) =>
                                    i === index ? { ...r, end: event.target.value } : r,
                                  ),
                                }))
                              }
                              className={inputClass}
                            />
                            <button
                              type="button"
                              aria-label={`Quitar horario del ${label}`}
                              onClick={() =>
                                updateDay(key, (d) => ({
                                  ...d,
                                  ranges: d.ranges.filter((_, i) => i !== index),
                                }))
                              }
                              className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                            >
                              ✕
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() =>
                            updateDay(key, (d) => ({
                              ...d,
                              ranges: [...d.ranges, { ...DEFAULT_RANGE }],
                            }))
                          }
                          className="text-sm font-medium text-accent hover:text-accent-hover"
                        >
                          + Agregar horario
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={copyMondayToAll}
              className="text-sm font-medium text-accent hover:text-accent-hover"
            >
              Copiar el horario del lunes a todos los días
            </button>

            {fieldErrors.schedule ? (
              <p className="text-sm text-red-600">{fieldErrors.schedule}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            Sin horarios, tu menú se muestra siempre como abierto.
          </p>
        )}
      </Section>

      <Section
        title="Cierre temporal"
        description="Para vacaciones u otros cierres: el menú muestra que estás cerrado y no deja enviar pedidos."
      >
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={temporarilyClosed}
            onChange={(event) => setTemporarilyClosed(event.target.checked)}
            className="h-5 w-5"
          />
          <span className="text-sm font-medium text-stone-900">
            Cerrado temporalmente
          </span>
        </label>

        {temporarilyClosed ? (
          <div className="space-y-5">
            <Field
              label="Mensaje (opcional)"
              value={closedMessage}
              onChange={(event) => setClosedMessage(event.target.value)}
              placeholder="Estamos de vacaciones, ¡volvemos pronto!"
              error={fieldErrors.closedMessage}
              maxLength={220}
            />

            <div>
              <label
                htmlFor="reopens-on"
                className="mb-1.5 block text-sm font-medium text-brand"
              >
                Reabrimos el (opcional)
              </label>
              <input
                id="reopens-on"
                type="date"
                value={reopensOn}
                onChange={(event) => setReopensOn(event.target.value)}
                className={inputClass}
              />
              <p className="mt-1.5 text-sm text-stone-500">
                Con fecha, el cierre termina solo ese día. Sin fecha, seguís cerrado
                hasta que lo apagues.
              </p>
              {fieldErrors.reopensOn ? (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors.reopensOn}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Contacto"
        description="Los pedidos, el envío y el retiro se arreglan con tus clientes por WhatsApp."
      >
        <Field
          label="WhatsApp"
          value={whatsapp}
          onChange={(event) => setWhatsapp(event.target.value)}
          inputMode="tel"
          placeholder="5493510000000"
          hint="Con código de país, sin +, espacios ni guiones."
          error={fieldErrors.whatsapp}
        />

        <Field
          label="Dirección (opcional)"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="San Martín 100, Córdoba"
          error={fieldErrors.address}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Instagram (opcional)"
            value={instagram}
            onChange={(event) => setInstagram(event.target.value)}
            placeholder="@tunegocio"
            hint="Tu usuario o la dirección de tu perfil."
            error={fieldErrors.instagram}
            autoCapitalize="none"
          />
          <Field
            label="Facebook (opcional)"
            value={facebook}
            onChange={(event) => setFacebook(event.target.value)}
            placeholder="tunegocio"
            hint="El nombre o la dirección de tu página."
            error={fieldErrors.facebook}
            autoCapitalize="none"
          />
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
    </form>
  );
}
