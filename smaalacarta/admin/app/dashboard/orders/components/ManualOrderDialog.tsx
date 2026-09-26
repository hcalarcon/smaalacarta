"use client";

import { useState } from "react";

import { createManualOrderAction } from "../actions";
import FormAlert from "@/components/ui/FormAlert";
import { orderTotal, type ManualOrderItem } from "@/lib/orders/manual-order";
import { formatMoney } from "@/lib/promotions/pricing";

type Row = { name: string; price: string; quantity: string };

const EMPTY_ROW: Row = { name: "", price: "", quantity: "1" };

const inputClass =
  "rounded-xl border border-line-strong bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function Form({
  products,
  onClose,
  onCreated,
}: {
  products: { name: string; price: number }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [delivery, setDelivery] = useState("");
  const [payment, setPayment] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});

  const items: ManualOrderItem[] = rows.map((row) => ({
    name: row.name,
    unitPrice: row.price.trim() === "" ? Number.NaN : Number(row.price),
    quantity: Number(row.quantity),
  }));

  function updateRow(index: number, change: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...change } : row)));
  }

  // Si el nombre coincide con un producto del menú, se completa su precio.
  function handleName(index: number, name: string) {
    const match = products.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    updateRow(index, match && !rows[index].price ? { name, price: String(match.price) } : { name });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const result = await createManualOrderAction({ customerName, delivery, payment, notes, items });

      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      onCreated();
    } catch {
      setError("No pudimos crear el pedido. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div>
          <h2 className="text-xl font-semibold text-brand">Pedido manual</h2>
          <p className="mt-1 text-sm text-stone-500">
            Para un pedido que llegó por fuera del menú. Se numera y se puede seguir como cualquier otro.
          </p>
        </div>

        {error ? <FormAlert tone="error">{error}</FormAlert> : null}

        <div>
          <label htmlFor="mo-name" className="mb-1.5 block text-sm font-medium text-brand">Cliente</label>
          <input
            id="mo-name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className={`${inputClass} w-full`}
            placeholder="Nombre y apellido"
            maxLength={90}
          />
          {fieldErrors.customerName ? <p className="mt-1 text-sm text-red-600">{fieldErrors.customerName}</p> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <input value={delivery} onChange={(e) => setDelivery(e.target.value)} className={inputClass} placeholder="Entrega (retiro, delivery…)" aria-label="Entrega" maxLength={35} />
          <input value={payment} onChange={(e) => setPayment(e.target.value)} className={inputClass} placeholder="Pago (efectivo, transferencia…)" aria-label="Pago" maxLength={35} />
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-brand">Productos</span>

          <datalist id="mo-products">
            {products.map((p) => (
              <option key={p.name} value={p.name} />
            ))}
          </datalist>

          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  list="mo-products"
                  value={row.name}
                  onChange={(e) => handleName(index, e.target.value)}
                  className={`${inputClass} min-w-0 flex-1`}
                  placeholder="Producto"
                  aria-label={`Producto ${index + 1}`}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.price}
                  onChange={(e) => updateRow(index, { price: e.target.value })}
                  className={`${inputClass} w-24`}
                  placeholder="Precio"
                  aria-label={`Precio ${index + 1}`}
                />
                <input
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  value={row.quantity}
                  onChange={(e) => updateRow(index, { quantity: e.target.value })}
                  className={`${inputClass} w-16`}
                  aria-label={`Cantidad ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))}
                  aria-label={`Quitar producto ${index + 1}`}
                  className="rounded-lg px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}
            className="mt-2 text-sm font-medium text-accent hover:text-accent-hover"
          >
            + Agregar producto
          </button>

          {fieldErrors.items ? <p className="mt-1 text-sm text-red-600">{fieldErrors.items}</p> : null}
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={`${inputClass} w-full`}
          placeholder="Notas (opcional)"
          aria-label="Notas"
        />
        {fieldErrors.notes ? <p className="text-sm text-red-600">{fieldErrors.notes}</p> : null}

        <p className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="font-medium text-stone-700">Total</span>
          <span className="text-xl font-bold text-brand">{formatMoney(orderTotal(items))}</span>
        </p>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-line-strong px-4 py-2 text-sm font-medium text-stone-700 hover:bg-brand-soft">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-60">
            {saving ? "Creando…" : "Crear pedido"}
          </button>
        </div>
      </form>
    </div>
  );
}

// El formulario se monta al abrir y se desmonta al cerrar: siempre arranca vacío.
export default function ManualOrderDialog({
  open,
  ...props
}: {
  open: boolean;
  products: { name: string; price: number }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  return open ? <Form {...props} /> : null;
}
