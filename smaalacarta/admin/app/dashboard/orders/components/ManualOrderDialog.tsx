"use client";

import { useState } from "react";

import ManualProductsStep from "./ManualProductsStep";
import { createManualOrderAction } from "../actions";
import FormAlert from "@/components/ui/FormAlert";
import { deliveryLabel, paymentLabel } from "@/lib/orders/labels";
import type { ManualOrderSetup } from "@/lib/orders/manual-context";
import { followupMessage, followupWhatsappUrl } from "@/lib/orders/manual-followup";
import {
  LIMITS,
  MANUAL_PAYMENTS,
  orderTotal,
  validateManualOrder,
  type ManualCourierMode,
  type ManualOrderInput,
  type ManualOrderItem,
} from "@/lib/orders/manual-order";
import { trackingUrl } from "@/lib/orders/format";
import { formatMoney } from "@/lib/promotions/pricing";

const inputClass =
  "w-full rounded-xl border border-line-strong bg-white px-3 py-2.5 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:text-sm";

const STEPS = ["Productos", "Entrega", "Cliente", "Pago"] as const;

// En qué paso se corrige cada campo con error.
const STEP_OF_FIELD: Record<string, number> = {
  items: 0,
  delivery: 1,
  zoneId: 1,
  courierMode: 1,
  customerName: 2,
  phone: 2,
  address: 2,
  scheduledFor: 2,
  notes: 2,
  payment: 3,
};

// El valor del select de barrios para "otro barrio": se escribe a mano y el costo se coordina (ENVIO-252).
const OTHER_ZONE = "__otro";

type Created = { code: string; number: number; total: number };

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-1 text-sm text-red-600">
      {message}
    </p>
  ) : null;
}

// Una opción para tocar (entrega, pago, modo del envío): tarjeta grande con título y ayuda.
function Choice({
  checked,
  onSelect,
  title,
  hint,
  name,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint?: string;
  name: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
        checked ? "border-accent bg-accent/5" : "border-line hover:bg-brand-soft"
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-1 h-5 w-5 accent-[var(--color-accent,#c2410c)]" />
      <span className="min-w-0">
        <span className="block text-base font-medium text-brand sm:text-sm">{title}</span>
        {hint ? <span className="block text-sm text-stone-500 sm:text-xs">{hint}</span> : null}
      </span>
    </label>
  );
}

function Confirmation({
  created,
  input,
  setup,
  onClose,
}: {
  created: Created;
  input: ManualOrderInput;
  setup: ManualOrderSetup;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const link = trackingUrl(setup.slug, created.code);
  const chooseCourier = input.delivery === "delivery" && setup.courier && input.courierMode === "offers";
  const message = followupMessage({
    customerName: input.customerName,
    businessName: setup.businessName,
    number: created.number,
    link,
    chooseCourier,
  });
  const whatsapp = followupWhatsappUrl(input.phone, message);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Sin permiso del navegador, el link queda a la vista para copiarlo a mano.
    }
  }

  const courierNote =
    input.delivery === "delivery" && setup.courier
      ? input.courierMode === "own"
        ? "El envío quedó asignado a tu repartidor propio."
        : input.courierMode === "favorite"
        ? "El envío quedó asignado a tu favorito."
        : input.courierMode === "offers"
          ? "Se está ofreciendo a los repartidores: el cliente elige desde el seguimiento."
          : "El envío lo llevás vos."
      : null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        <FormAlert tone="success">
          Pedido <strong>#{created.number}</strong> cargado y confirmado · {formatMoney(created.total)}
        </FormAlert>

        {courierNote ? <p className="text-sm text-stone-600">{courierNote}</p> : null}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-brand">Seguimiento para el cliente</h3>

          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl bg-emerald-600 px-4 py-3 text-center text-base font-semibold text-white transition hover:bg-emerald-700 sm:text-sm"
            >
              Mandar seguimiento por WhatsApp
            </a>
          ) : (
            <p className="text-sm text-stone-600">
              No cargaste un teléfono: copiá el link y mandáselo al cliente por donde hablen.
            </p>
          )}

          <div className="flex items-center gap-2">
            <input readOnly value={link} aria-label="Link de seguimiento" onFocus={(e) => e.currentTarget.select()} className={inputClass} />
            <button
              type="button"
              onClick={() => void copy()}
              className="shrink-0 rounded-xl border border-line-strong px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-brand-soft"
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>

          {chooseCourier ? (
            <p className="text-xs text-stone-500">
              El mensaje le dice al cliente que entre al link para elegir quién se lo lleva.
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-line px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-brand px-5 py-3 text-base font-semibold text-white transition hover:bg-brand-hover sm:text-sm"
        >
          Listo
        </button>
      </div>
    </div>
  );
}

function Form({
  setup,
  onClose,
  onCreated,
}: {
  setup: ManualOrderSetup;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<ManualOrderItem[]>([]);
  const [delivery, setDelivery] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [zoneText, setZoneText] = useState("");
  const [courierMode, setCourierMode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");
  const [payment, setPayment] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [created, setCreated] = useState<Created | null>(null);

  // Lo que el negocio tiene habilitado, más el consumo en el local y el QR, que son solo del pedido manual.
  const enabledDelivery = setup.menu.delivery.length > 0 ? setup.menu.delivery : ["retiro", "delivery"];
  const deliveries = [
    ...(enabledDelivery.includes("retiro") ? ["retiro"] : []),
    ...(enabledDelivery.includes("delivery") ? ["delivery"] : []),
    "local",
  ];

  const enabledPayments = setup.menu.payments.filter((p) => p !== "qr");
  const payments = [
    ...(enabledPayments.length > 0 ? enabledPayments : ["efectivo", "transferencia", "tarjeta"]).filter((p) =>
      (MANUAL_PAYMENTS as readonly string[]).includes(p),
    ),
    "qr",
  ];

  const withCourier = delivery === "delivery" && setup.courier;
  const zone = setup.delivery.zones.find((z) => z.id === zoneId) ?? null;
  const favoriteAvailable = !!zone?.favoriteCovers && !!setup.delivery.favorite;

  // Envío propio (ENVIO-250): va a su repartidor propio, sin ofertas ni favorito. Sin zonas con precio, o con "otro
  // barrio", el barrio se escribe y el costo se coordina (ENVIO-252).
  const ownKind = setup.delivery.kind === "own";
  const ownCourier = setup.delivery.ownCourier ?? null;
  const canCoordinate = setup.delivery.coordinate === true;
  const coordinating = canCoordinate && (zoneId === OTHER_ZONE || setup.delivery.zones.length === 0);
  // Cuando no hay nada para elegir, el modo queda fijo: lo lleva el local (o su repartidor propio, que se ofrece abajo).
  const forcedMode = withCourier && !ownKind && coordinating ? "self" : withCourier && ownKind && !ownCourier ? "self" : "";

  const input: ManualOrderInput = {
    customerName,
    delivery,
    payment,
    notes,
    items,
    scheduledFor,
    phone,
    zoneId: withCourier && !coordinating ? zoneId : "",
    zoneText: withCourier && coordinating ? zoneText : "",
    address,
    courierMode: withCourier ? forcedMode || courierMode : "",
  };

  const subtotal = orderTotal(items);
  const shipping = withCourier && !coordinating && zone ? zone.price : null;

  // Los errores de los campos del paso actual (o de todos, al guardar).
  function stepErrors(upTo: number) {
    const result = validateManualOrder(input, { courier: setup.courier });
    if (result.ok) return {};

    return Object.fromEntries(
      Object.entries(result.errors).filter(([field]) => (STEP_OF_FIELD[field] ?? 0) <= upTo),
    ) as Partial<Record<string, string>>;
  }

  function selectDelivery(value: string) {
    setDelivery(value);
    if (value !== "delivery") {
      setZoneId("");
      setZoneText("");
      setCourierMode("");
    }
  }

  function selectZone(value: string) {
    setZoneId(value);
    // El favorito puede no cubrir el barrio nuevo: no se deja elegido algo que la base rechazaría.
    const next = setup.delivery.zones.find((z) => z.id === value);
    if (courierMode === "favorite" && !next?.favoriteCovers) setCourierMode("");
  }

  function goNext() {
    const errors = stepErrors(step);
    const here = Object.fromEntries(Object.entries(errors).filter(([field]) => STEP_OF_FIELD[field] === step));

    if (Object.keys(here).length > 0) {
      setFieldErrors(here);
      return;
    }

    setFieldErrors({});
    setError(null);
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  }

  function goBack() {
    setFieldErrors({});
    setError(null);
    setStep((current) => Math.max(0, current - 1));
  }

  async function handleSubmit() {
    const errors = stepErrors(STEPS.length - 1);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Lleva al primer paso con algo para corregir.
      const first = Math.min(...Object.keys(errors).map((field) => STEP_OF_FIELD[field] ?? 0));
      setStep(first);
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const result = await createManualOrderAction(input);

      if (!result.ok) {
        setError(result.error);
        const fields = result.fieldErrors ?? {};
        setFieldErrors(fields);
        const steps = Object.keys(fields).map((field) => STEP_OF_FIELD[field] ?? 0);
        if (steps.length > 0) setStep(Math.min(...steps));
        return;
      }

      setCreated({ code: result.code, number: result.number, total: result.total });
      onCreated();
    } catch {
      setError("No pudimos crear el pedido. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4" onClick={created ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mo-title"
        onClick={(event) => event.stopPropagation()}
        className="relative flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:rounded-3xl"
      >
        <div className="border-b border-line px-4 py-3 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="mo-title" className="text-xl font-semibold text-brand">Pedido manual</h2>
              {!created ? (
                <p className="mt-0.5 text-sm text-stone-500">Para un pedido que llegó por fuera del menú. Nace confirmado.</p>
              ) : null}
            </div>
            {!created ? (
              <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-xl px-3 py-2 text-stone-500 hover:bg-brand-soft">
                ✕
              </button>
            ) : null}
          </div>

          {!created ? (
            <ol className="mt-3 flex gap-1" aria-label="Pasos">
              {STEPS.map((title, index) => (
                <li
                  key={title}
                  aria-current={index === step ? "step" : undefined}
                  className={`flex-1 rounded-lg px-1 py-1.5 text-center text-xs font-medium ${
                    index === step ? "bg-brand text-white" : index < step ? "bg-brand-soft text-brand" : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {index + 1}. {title}
                </li>
              ))}
            </ol>
          ) : null}
        </div>

        {created ? (
          <Confirmation created={created} input={input} setup={setup} onClose={onClose} />
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
              {error ? <FormAlert tone="error">{error}</FormAlert> : null}

              {step === 0 ? (
                <ManualProductsStep menu={setup.menu} items={items} onChange={setItems} error={fieldErrors.items} />
              ) : null}

              {step === 1 ? (
                <div className="space-y-4">
                  <fieldset className="space-y-2">
                    <legend className="mb-1 text-sm font-semibold text-brand">¿Cómo se entrega?</legend>
                    {deliveries.map((value) => (
                      <Choice
                        key={value}
                        name="mo-delivery"
                        checked={delivery === value}
                        onSelect={() => selectDelivery(value)}
                        title={value === "delivery" && setup.courier ? "Envío con repartidor" : deliveryLabel(value)}
                        hint={value === "local" ? "Lo consume en el local: no pasa por ningún envío." : undefined}
                      />
                    ))}
                    <FieldError message={fieldErrors.delivery} />
                  </fieldset>

                  {withCourier ? (
                    <>
                      <div>
                        <label htmlFor="mo-zone" className="mb-1.5 block text-sm font-semibold text-brand">Barrio</label>
                        {setup.delivery.zones.length > 0 || !canCoordinate ? (
                          <select id="mo-zone" value={zoneId} onChange={(e) => selectZone(e.target.value)} className={inputClass}>
                            <option value="">Elegí el barrio…</option>
                            {setup.delivery.zones.map((z) => (
                              <option key={z.id} value={z.id}>
                                {z.name} · {formatMoney(z.price)}
                              </option>
                            ))}
                            {canCoordinate ? <option value={OTHER_ZONE}>Otro barrio (costo a coordinar)</option> : null}
                          </select>
                        ) : null}
                        {coordinating ? (
                          <div className={setup.delivery.zones.length > 0 ? "mt-2" : ""}>
                            <input
                              id="mo-zone-text"
                              value={zoneText}
                              onChange={(e) => setZoneText(e.target.value)}
                              maxLength={80}
                              placeholder="Escribí el barrio"
                              aria-label="Barrio"
                              className={inputClass}
                            />
                            <p className="mt-1 text-xs text-stone-500">
                              El costo del envío se coordina con el cliente: lo cargás después desde el pedido.
                            </p>
                          </div>
                        ) : zone ? (
                          <p className="mt-1 text-xs text-stone-500">
                            {ownKind || setup.delivery.kind === undefined
                              ? `Envío: ${formatMoney(zone.price)}.`
                              : `Precio de referencia del envío: ${formatMoney(zone.price)}. El repartidor puede cambiarlo al ofertar.`}
                          </p>
                        ) : null}
                        <FieldError message={fieldErrors.zoneId} />
                        {setup.delivery.zones.length === 0 && !canCoordinate ? (
                          <p className="mt-1 text-sm text-red-600">
                            No hay barrios disponibles: revisá Configuración → Envíos.
                          </p>
                        ) : null}
                      </div>

                      <fieldset className="space-y-2">
                        <legend className="mb-1 text-sm font-semibold text-brand">¿Quién lo lleva?</legend>
                        {forcedMode ? (
                          <p className="text-sm text-stone-600">
                            {ownKind
                              ? "Todavía no tenés repartidor asignado: el envío lo llevás vos."
                              : "El envío queda a tu cargo, sin repartidor."}
                          </p>
                        ) : ownKind ? (
                          <>
                            <Choice
                              name="mo-mode"
                              checked={courierMode === "own"}
                              onSelect={() => setCourierMode("own" satisfies ManualCourierMode)}
                              title={`Asignar a ${ownCourier?.name ?? "tu repartidor"}`}
                              hint="Va directo a tu repartidor propio, sin ofertas."
                            />
                            <Choice
                              name="mo-mode"
                              checked={courierMode === "self"}
                              onSelect={() => setCourierMode("self" satisfies ManualCourierMode)}
                              title="Lo llevo yo"
                              hint="El envío queda a tu cargo, sin repartidor."
                            />
                          </>
                        ) : (
                          <>
                            {favoriteAvailable && setup.delivery.favorite ? (
                              <Choice
                                name="mo-mode"
                                checked={courierMode === "favorite"}
                                onSelect={() => setCourierMode("favorite" satisfies ManualCourierMode)}
                                title={`Asignar a ${setup.delivery.favorite.name}`}
                                hint="Va directo a tu favorito, sin ofertas."
                              />
                            ) : null}
                            <Choice
                              name="mo-mode"
                              checked={courierMode === "offers"}
                              onSelect={() => setCourierMode("offers" satisfies ManualCourierMode)}
                              title="Buscar repartidor"
                              hint="Les llega a los repartidores y el cliente elige desde el seguimiento; si no elige, se elige sola."
                            />
                            <Choice
                              name="mo-mode"
                              checked={courierMode === "self"}
                              onSelect={() => setCourierMode("self" satisfies ManualCourierMode)}
                              title="Lo llevo yo"
                              hint="El envío queda a tu cargo, sin repartidor."
                            />
                          </>
                        )}
                        <FieldError message={fieldErrors.courierMode} />
                      </fieldset>
                    </>
                  ) : null}
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="mo-name" className="mb-1.5 block text-sm font-semibold text-brand">Cliente</label>
                    <input
                      id="mo-name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className={inputClass}
                      placeholder="Nombre y apellido"
                      maxLength={LIMITS.customerName + 10}
                      autoComplete="off"
                    />
                    <FieldError message={fieldErrors.customerName} />
                  </div>

                  <div>
                    <label htmlFor="mo-phone" className="mb-1.5 block text-sm font-semibold text-brand">
                      Teléfono {delivery === "delivery" ? "" : "(opcional)"}
                    </label>
                    <input
                      id="mo-phone"
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={inputClass}
                      placeholder="351 555-1234"
                      autoComplete="off"
                    />
                    <p className="mt-1 text-xs text-stone-500">
                      {delivery === "delivery"
                        ? "Hace falta para el envío. Con él también le mandás el seguimiento por WhatsApp."
                        : "Con el teléfono le mandás el seguimiento por WhatsApp."}
                    </p>
                    <FieldError message={fieldErrors.phone} />
                  </div>

                  {delivery === "delivery" ? (
                    <div>
                      <label htmlFor="mo-address" className="mb-1.5 block text-sm font-semibold text-brand">Dirección</label>
                      <input
                        id="mo-address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className={inputClass}
                        placeholder="Calle, número, piso, referencias"
                        autoComplete="off"
                      />
                      <FieldError message={fieldErrors.address} />
                    </div>
                  ) : null}

                  <div>
                    <label htmlFor="mo-time" className="mb-1.5 block text-sm font-semibold text-brand">Para las (opcional)</label>
                    <input
                      id="mo-time"
                      type="time"
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                      className={inputClass}
                    />
                    <p className="mt-1 text-xs text-stone-500">Una hora de hoy. Vacío es lo antes posible.</p>
                    <FieldError message={fieldErrors.scheduledFor} />
                  </div>

                  <div>
                    <label htmlFor="mo-notes" className="mb-1.5 block text-sm font-semibold text-brand">Notas del pedido (opcional)</label>
                    <textarea
                      id="mo-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className={inputClass}
                    />
                    <FieldError message={fieldErrors.notes} />
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-4">
                  <fieldset className="space-y-2">
                    <legend className="mb-1 text-sm font-semibold text-brand">¿Cómo paga?</legend>
                    {payments.map((value) => (
                      <Choice
                        key={value}
                        name="mo-payment"
                        checked={payment === value}
                        onSelect={() => setPayment(value)}
                        title={paymentLabel(value)}
                        hint={value === "qr" ? "Solo registra cómo pagó: no genera ningún código." : undefined}
                      />
                    ))}
                    <FieldError message={fieldErrors.payment} />
                  </fieldset>

                  <div className="space-y-1 rounded-xl bg-brand-soft px-4 py-3 text-sm text-stone-700">
                    <p className="font-semibold text-brand">Resumen</p>
                    <p>
                      {items.length} {items.length === 1 ? "producto" : "productos"} · {deliveryLabel(delivery)}
                      {coordinating ? ` · ${zoneText.trim() || "barrio a coordinar"}` : zone ? ` · ${zone.name}` : ""}
                    </p>
                    <p>{customerName.trim() || "Sin nombre"}</p>
                    {shipping !== null ? (
                      <p className="text-xs text-stone-500">
                        {ownKind ? "Envío" : "Envío (precio de referencia)"}: {formatMoney(shipping)}, aparte del total.
                      </p>
                    ) : null}
                    {withCourier && coordinating ? (
                      <p className="text-xs text-stone-500">Envío: el costo se coordina con el cliente.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-line px-4 py-3 sm:px-6">
              <p className="mb-3 flex items-baseline justify-between">
                <span className="font-medium text-stone-700">Total</span>
                <span className="text-xl font-bold text-brand">{formatMoney(subtotal)}</span>
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={step === 0 ? onClose : goBack}
                  className="rounded-xl border border-line-strong px-4 py-3 text-base font-medium text-stone-700 hover:bg-brand-soft sm:text-sm"
                >
                  {step === 0 ? "Cancelar" : "Atrás"}
                </button>

                {last ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSubmit()}
                    className="flex-1 rounded-xl bg-brand px-5 py-3 text-base font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60 sm:text-sm"
                  >
                    {saving ? "Creando…" : "Crear pedido"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={goNext}
                    className="flex-1 rounded-xl bg-brand px-5 py-3 text-base font-semibold text-white transition hover:bg-brand-hover sm:text-sm"
                  >
                    Siguiente
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// El formulario se monta al abrir y se desmonta al cerrar: siempre arranca vacío.
export default function ManualOrderDialog({
  open,
  ...props
}: {
  open: boolean;
  setup: ManualOrderSetup;
  onClose: () => void;
  // El pedido ya se creó (el tablero se actualiza); el diálogo sigue abierto con el seguimiento.
  onCreated: () => void;
}) {
  return open ? <Form {...props} /> : null;
}
