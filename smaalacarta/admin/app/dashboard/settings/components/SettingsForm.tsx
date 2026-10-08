"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { saveSettingsAction } from "../actions";
import Field from "@/components/ui/Field";
import FormAlert from "@/components/ui/FormAlert";
import ImageUploader from "@/components/ui/ImageUploader";
import PdfUploader from "@/components/ui/PdfUploader";
import Section from "@/components/ui/Section";
import HeaderPreview from "./HeaderPreview";
import { DELIVERY_OPTIONS, PAYMENT_OPTIONS, hasTransfer } from "@/lib/settings/payment";
import type { PreorderCutoffs } from "@/lib/settings/preorders";
import {
  DAYS,
  parseRange,
  type DayKey,
  type Schedule,
} from "@/lib/settings/schedule";
import {
  TAGLINE_MAX,
  TEMPLATES,
  THEMES,
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

// El corte de cada día de venta como lo edita el formulario: `dia` vacío = sin pedidos
// anticipados para ese día.
type CutoffRow = { dia: DayKey | ""; hora: string };
type CutoffsState = Record<DayKey, CutoffRow>;

const DEFAULT_CUTOFF_TIME = "20:00";

function toCutoffsState(cutoffs: PreorderCutoffs): CutoffsState {
  return Object.fromEntries(
    DAYS.map(({ key }) => [
      key,
      cutoffs[key] ? { ...cutoffs[key] } : { dia: "", hora: DEFAULT_CUTOFF_TIME },
    ]),
  ) as CutoffsState;
}

function toCutoffs(state: CutoffsState): PreorderCutoffs {
  return Object.fromEntries(
    DAYS.flatMap(({ key }) => {
      const row = state[key];
      return row.dia ? [[key, { dia: row.dia, hora: row.hora }]] : [];
    }),
  ) as PreorderCutoffs;
}

const inputClass =
  "rounded-xl border border-line-strong bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

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
  businessName,
  initial,
  digitalMenu,
  pdfService,
}: {
  businessId: string;
  // Para la vista previa del menú.
  businessName: string;
  initial: SettingsInput;
  // Sin plan_web ni plan_completo (solo QR + PDF), no hay menú digital: se
  // esconde todo lo que no sea el PDF (ADMIN-PLAN-1).
  digitalMenu: boolean;
  // Sin plan_pdf no hay servicio de PDF: se esconde "Menú en PDF" (ADMIN-PLAN-4).
  pdfService: boolean;
}) {
  const router = useRouter();

  const [published, setPublished] = useState(initial.published);
  const [template, setTemplate] = useState(initial.template);
  const [theme, setTheme] = useState(initial.theme);
  const [tagline, setTagline] = useState(initial.tagline);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initial.secondaryColor);
  const [headerImageUrl, setHeaderImageUrl] = useState(initial.headerImageUrl);
  const [headerFocus, setHeaderFocus] = useState({ x: initial.headerImageX, y: initial.headerImageY });
  const [showDefaultImages, setShowDefaultImages] = useState(initial.showDefaultImages);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [menuPdfUrl, setMenuPdfUrl] = useState(initial.menuPdfUrl);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [address, setAddress] = useState(initial.address);
  const [instagram, setInstagram] = useState(initial.instagram);
  const [facebook, setFacebook] = useState(initial.facebook);
  const [temporarilyClosed, setTemporarilyClosed] = useState(initial.temporarilyClosed);
  const [closedMessage, setClosedMessage] = useState(initial.closedMessage);
  const [reopensOn, setReopensOn] = useState(initial.reopensOn);
  const [deliveryOptions, setDeliveryOptions] = useState(initial.deliveryOptions);
  const [paymentOptions, setPaymentOptions] = useState(initial.paymentOptions);
  const [transferAlias, setTransferAlias] = useState(initial.transferAlias);
  const [transferCbu, setTransferCbu] = useState(initial.transferCbu);
  const [allowScheduledOrders, setAllowScheduledOrders] = useState(initial.allowScheduledOrders);
  // Texto, para poder borrar y escribir; se convierte a número al guardar.
  const [leadMinutes, setLeadMinutes] = useState(String(initial.scheduledLeadMinutes));
  const [preordersEnabled, setPreordersEnabled] = useState(initial.preordersEnabled);
  const [cutoffs, setCutoffs] = useState<CutoffsState>(() => toCutoffsState(initial.preorderCutoffs));

  const hasInitialSchedule = Object.keys(initial.schedule).length > 0;
  const [scheduleEnabled, setScheduleEnabled] = useState(hasInitialSchedule);
  const [days, setDays] = useState<ScheduleState>(() =>
    toScheduleState(initial.schedule),
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});

  // El aviso de guardado es un toast: se va solo a los 3 segundos.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [saved]);

  function updateDay(key: DayKey, change: (day: DayState) => DayState) {
    setSaved(false);
    setDays((prev) => ({ ...prev, [key]: change(prev[key]) }));
  }

  function updateCutoff(key: DayKey, change: Partial<CutoffRow>) {
    setSaved(false);
    setCutoffs((prev) => ({ ...prev, [key]: { ...prev[key], ...change } }));
  }

  // Los días de venta: los que tienen al menos un rango cargado.
  const sellingDays = DAYS.filter(
    ({ key }) =>
      scheduleEnabled && !days[key].closed && days[key].ranges.some((row) => row.start && row.end),
  );

  // Tilda o destilda una opción de entrega o de pago.
  function toggleOption(
    set: React.Dispatch<React.SetStateAction<string[]>>,
    key: string,
    checked: boolean,
  ) {
    setSaved(false);
    set((prev) => (checked ? [...prev, key] : prev.filter((option) => option !== key)));
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
        theme,
        tagline,
        primaryColor,
        secondaryColor,
        headerImageUrl,
        headerImageX: headerFocus.x,
        headerImageY: headerFocus.y,
        showDefaultImages,
        logoUrl,
        menuPdfUrl,
        schedule: toSchedule(days, scheduleEnabled),
        whatsapp,
        address,
        instagram,
        facebook,
        temporarilyClosed,
        closedMessage,
        reopensOn,
        deliveryOptions,
        paymentOptions,
        transferAlias,
        transferCbu,
        allowScheduledOrders,
        scheduledLeadMinutes: leadMinutes.trim() === "" ? Number.NaN : Number(leadMinutes),
        preordersEnabled,
        // Solo los días que hoy son de venta: el corte de un día que se cerró no cuenta.
        preorderCutoffs: toCutoffs(
          Object.fromEntries(
            DAYS.map(({ key }) => [
              key,
              sellingDays.some((day) => day.key === key) ? cutoffs[key] : { dia: "", hora: "" },
            ]),
          ) as CutoffsState,
        ),
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

      {digitalMenu ? <>
      <Section
        id="publicacion"
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
          <span className="block font-medium text-stone-900">Menú público</span>
        </label>
      </Section>

      <Section id="apariencia" title="Apariencia" description="Cómo ven tus clientes el menú.">
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

        <div>
          <span className="mb-1.5 block text-sm font-medium text-brand">Tema por defecto</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {THEMES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setTheme(option.key)}
                aria-pressed={theme === option.key}
                className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                  theme === option.key
                    ? "border-brand bg-brand text-white"
                    : "border-line-strong bg-white text-stone-700 hover:bg-brand-soft"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-stone-500">
            Es el tema con el que se abre tu menú; tus clientes pueden cambiarlo con el botón del
            menú.
          </p>
          {fieldErrors.theme ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.theme}</p>
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
          onChange={setHeaderImageUrl}
        />

        <Field
          label="…o pegá la dirección de una imagen"
          value={headerImageUrl}
          onChange={(event) => setHeaderImageUrl(event.target.value)}
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

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={showDefaultImages}
            onChange={(event) => setShowDefaultImages(event.target.checked)}
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="block font-medium text-stone-900">
              Mostrar imágenes de muestra en productos sin foto
            </span>
            <span className="block text-sm text-stone-500">
              Los productos sin foto muestran una ilustración según su nombre, marcada como «Imagen
              ilustrativa». Apagado (o si no hay una que coincida), muestran tu logo. Una foto propia
              siempre tiene prioridad.
            </span>
          </span>
        </label>

        <HeaderPreview
          businessName={businessName}
          tagline={tagline}
          template={template}
          theme={theme}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          imageUrl={headerImageUrl}
          logoUrl={logoUrl}
          focus={headerFocus}
          onFocusChange={setHeaderFocus}
        />
        {fieldErrors.headerImageX || fieldErrors.headerImageY ? (
          <p className="-mt-3 text-sm text-red-600">
            {fieldErrors.headerImageX ?? fieldErrors.headerImageY}
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
      </> : null}

      {pdfService ? (
      <Section
        id="pdf"
        title="Menú en PDF"
        description="Para el plan QR + PDF: un archivo que se linkea aparte del menú digital, no hace falta publicar este último."
      >
        <PdfUploader
          businessId={businessId}
          label="Archivo del menú"
          value={menuPdfUrl}
          onChange={setMenuPdfUrl}
        />
        {fieldErrors.menuPdfUrl ? (
          <p className="text-sm text-red-600">{fieldErrors.menuPdfUrl}</p>
        ) : null}
      </Section>
      ) : null}

      {digitalMenu ? <>
      <Section
        id="horarios"
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
        id="anticipados"
        title="Pedidos anticipados"
        description="Si vendés solo ciertos días, tus clientes pueden dejar el pedido mientras estás cerrado, para tu próxima apertura, hasta un corte que elegís para cada día."
      >
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={preordersEnabled}
            onChange={(event) => {
              setSaved(false);
              setPreordersEnabled(event.target.checked);
            }}
            className="h-5 w-5"
          />
          <span className="text-sm font-medium text-stone-900">Aceptar pedidos anticipados</span>
        </label>

        {preordersEnabled ? (
          sellingDays.length === 0 ? (
            <p className="text-sm text-stone-500">
              Cargá tus horarios arriba: el corte se elige para cada día en que abrís.
            </p>
          ) : (
            <div className="space-y-3">
              {sellingDays.map(({ key, label }) => (
                <div key={key} className="flex flex-wrap items-center gap-3">
                  <span className="w-24 text-sm font-medium text-stone-900">{label}</span>
                  <select
                    value={cutoffs[key].dia}
                    onChange={(event) => updateCutoff(key, { dia: event.target.value as DayKey | "" })}
                    aria-label={`Día de corte para el ${label.toLowerCase()}`}
                    className={inputClass}
                  >
                    <option value="">Sin pedidos anticipados</option>
                    {DAYS.map((day) => (
                      <option key={day.key} value={day.key}>
                        Corte el {day.label.toLowerCase()}
                      </option>
                    ))}
                  </select>
                  {cutoffs[key].dia ? (
                    <input
                      type="time"
                      value={cutoffs[key].hora}
                      onChange={(event) => updateCutoff(key, { hora: event.target.value })}
                      aria-label={`Hora de corte para el ${label.toLowerCase()}`}
                      className={inputClass}
                    />
                  ) : null}
                </div>
              ))}
              <p className="text-sm text-stone-500">
                Hora de Argentina. El corte tiene que ser antes de que abras ese día. Después del corte
                y hasta que abras no se toma ningún pedido.
              </p>
            </div>
          )
        ) : null}
        {fieldErrors.preorderCutoffs ? (
          <p className="text-sm text-red-600">{fieldErrors.preorderCutoffs}</p>
        ) : null}
      </Section>

      <Section
        id="cierre"
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
        id="entrega-pago"
        title="Entrega y pago"
        description="Qué ofrecés en el checkout del menú. Si dejás una sola opción en un grupo, tus clientes no tienen que elegir."
      >
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-brand">Tipos de entrega</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {DELIVERY_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={deliveryOptions.includes(option.key)}
                  onChange={(event) =>
                    toggleOption(setDeliveryOptions, option.key, event.target.checked)
                  }
                  className="h-5 w-5"
                />
                <span className="text-sm font-medium text-stone-900">{option.label}</span>
              </label>
            ))}
          </div>
          {fieldErrors.deliveryOptions ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.deliveryOptions}</p>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-brand">Medios de pago</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {PAYMENT_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={paymentOptions.includes(option.key)}
                  onChange={(event) =>
                    toggleOption(setPaymentOptions, option.key, event.target.checked)
                  }
                  className="h-5 w-5"
                />
                <span className="text-sm font-medium text-stone-900">{option.label}</span>
              </label>
            ))}
          </div>
          {paymentOptions.includes("mercadopago") ? (
            <p className="mt-1.5 text-sm text-stone-500">
              Mercado Pago le aparece a tus clientes solo cuando el equipo de SMA a la Carta termina de
              conectar tu cuenta.
            </p>
          ) : null}
          {fieldErrors.paymentOptions ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.paymentOptions}</p>
          ) : null}
        </fieldset>

        {hasTransfer(paymentOptions) ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Alias (opcional)"
              value={transferAlias}
              onChange={(event) => setTransferAlias(event.target.value)}
              placeholder="mi.negocio"
              hint="Se le muestra al cliente al terminar el pedido, con un botón para copiarlo."
              error={fieldErrors.transferAlias}
              autoCapitalize="none"
              maxLength={40}
            />
            <Field
              label="CBU o CVU (opcional)"
              value={transferCbu}
              onChange={(event) => setTransferCbu(event.target.value)}
              inputMode="numeric"
              placeholder="22 números"
              hint="Los 22 números de tu cuenta; podés pegarlo con espacios."
              error={fieldErrors.transferCbu}
              maxLength={40}
            />
          </div>
        ) : null}
      </Section>

      <Section
        id="programados"
        title="Pedidos programados"
        description="Dejá que tus clientes elijan para qué hora de hoy es el pedido, dentro de tus horarios de atención."
      >
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={allowScheduledOrders}
            onChange={(event) => {
              setSaved(false);
              setAllowScheduledOrders(event.target.checked);
            }}
            className="h-5 w-5"
          />
          <span className="text-sm font-medium text-stone-900">Permitir programar pedido</span>
        </label>

        {allowScheduledOrders ? (
          <Field
            label="Minutos de anticipación"
            value={leadMinutes}
            onChange={(event) => {
              setSaved(false);
              setLeadMinutes(event.target.value);
            }}
            inputMode="numeric"
            placeholder="30"
            hint="El pedido tiene que ser para dentro de, como mínimo, este tiempo (de 15 a 240)."
            error={fieldErrors.scheduledLeadMinutes}
            maxLength={3}
          />
        ) : null}
      </Section>

      <Section
        id="contacto"
        title="Contacto"
        description="Los pedidos, el envío y el retiro se arreglan con tus clientes por WhatsApp."
      >
        <Field
          label="WhatsApp"
          value={whatsapp}
          onChange={(event) => setWhatsapp(event.target.value)}
          inputMode="tel"
          placeholder="3510000000"
          hint="Con código de área, sin 0 ni 15. Ejemplo: 3644277105."
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
      </> : null}

      {saved ? (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-20 -translate-x-1/2 sm:bottom-6 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          Cambios guardados
        </div>
      ) : null}

      {/* Flotante: fijo en la esquina de la pantalla, afuera de las tarjetas. El espacio de abajo
          es para que, al final del formulario, no tape el último campo en pantallas angostas. */}
      <div className="h-14 sm:hidden" aria-hidden />
      <div className="fixed bottom-6 right-6 z-10">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-hover disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
