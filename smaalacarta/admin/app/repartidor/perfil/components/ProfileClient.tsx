"use client";

import { useState } from "react";

import { savePreferencesAction, saveVehiclesAction } from "../../actions";
import PendingButton from "@/components/ui/PendingButton";
import VehicleIcons from "@/components/ui/VehicleIcon";
import { NOTE_MAX, type CourierPreferences } from "@/lib/courier/profile";
import { validateVehicles, type CourierVehicles } from "@/lib/courier/vehicle";

// Mi perfil (ADMIN-REPARTIDOR-1 a 3): lo que el cliente ve en su seguimiento cuando el pedido es mío.
// El vehículo (ENVIO-174) solo aparece con el interruptor de la plataforma prendido (ENVIO-175).
export default function ProfileClient({
  initial,
  vehicles,
  vehicleEnabled = false,
}: {
  initial: CourierPreferences;
  vehicles: CourierVehicles;
  vehicleEnabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [vehicle, setVehicle] = useState(vehicles);
  const [savedVehicle, setSavedVehicle] = useState(vehicles);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const prefsDirty =
    value.shopsOnTheWay !== saved.shopsOnTheWay || value.seeksOrders !== saved.seeksOrders || value.note.trim() !== saved.note;
  const vehicleDirty = vehicleEnabled && (vehicle.moto !== savedVehicle.moto || vehicle.auto !== savedVehicle.auto);
  const dirty = prefsDirty || vehicleDirty;

  function change(patch: Partial<CourierPreferences>) {
    setValue((current) => ({ ...current, ...patch }));
    setDone(false);
    setError(null);
  }

  function changeVehicle(patch: Partial<CourierVehicles>) {
    setVehicle((current) => ({ ...current, ...patch }));
    setDone(false);
    setError(null);
  }

  async function save() {
    setError(null);

    // Al menos un vehículo: la base lo exige igual, pero acá se avisa antes de ir a buscarla.
    if (vehicleDirty) {
      const check = validateVehicles(vehicle);

      if (!check.ok) {
        setError(check.error);
        return;
      }
    }

    try {
      if (prefsDirty) {
        const result = await savePreferencesAction(value);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setSaved({ ...value, note: value.note.trim() });
      }

      if (vehicleDirty) {
        const result = await saveVehiclesAction(vehicle);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setSavedVehicle(vehicle);
      }

      setDone(true);
    } catch {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
    }
  }

  const options: { key: "shopsOnTheWay" | "seeksOrders"; label: string; hint: string }[] = [
    { key: "shopsOnTheWay", label: "Compro cosas en el camino", hint: "El cliente puede pedirte que pases a comprarle algo." },
    { key: "seeksOrders", label: "Busco otros pedidos", hint: "El cliente puede pedirte que retires otro pedido de camino." },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-brand sm:text-3xl">Mi perfil</h1>
        <p className="mt-2 text-stone-500">
          Esto lo ve el cliente en el seguimiento, solo cuando el pedido es tuyo. Si no marcás nada, no aparece.
        </p>
      </section>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {vehicleEnabled ? (
        <section className="rounded-3xl border border-line bg-white p-5 shadow-sm" aria-labelledby="vehicle-title">
          <h2 id="vehicle-title" className="font-semibold text-stone-800">
            Mi vehículo
          </h2>
          <p className="text-sm text-stone-500">
            Marcá con qué hacés los envíos; podés marcar los dos. Si un pedido necesita auto, solo lo ven quienes lo
            tienen. No cambia tus precios.
          </p>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {(["moto", "auto"] as const).map((key) => (
              <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                <input
                  type="checkbox"
                  checked={vehicle[key]}
                  onChange={(event) => changeVehicle({ [key]: event.target.checked })}
                  className="h-5 w-5 shrink-0 accent-brand"
                />
                <span className="flex items-center gap-1.5 font-medium text-stone-800">
                  <VehicleIcons vehicles={[key]} />
                  {key === "moto" ? "Moto" : "Auto"}
                </span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4 rounded-3xl border border-line bg-white p-5 shadow-sm">
        <ul className="divide-y divide-line">
          {options.map((option) => (
            <li key={option.key}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3">
                <input
                  type="checkbox"
                  checked={value[option.key]}
                  onChange={(event) => change({ [option.key]: event.target.checked })}
                  className="mt-1 h-5 w-5 shrink-0 accent-brand"
                />
                <span>
                  <span className="block font-medium text-stone-800">{option.label}</span>
                  <span className="block text-sm text-stone-500">{option.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div>
          <label htmlFor="courier-note" className="block text-sm font-medium text-stone-700">
            Algo más para el cliente <span className="font-normal text-stone-400">(opcional)</span>
          </label>
          <textarea
            id="courier-note"
            rows={2}
            maxLength={NOTE_MAX}
            value={value.note}
            onChange={(event) => change({ note: event.target.value })}
            placeholder="Ej.: Hago mandados hasta las 22"
            className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-base"
          />
          <p className="mt-1 text-right text-xs text-stone-400">
            {value.note.length}/{NOTE_MAX}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <PendingButton
            onClick={save}
            pendingLabel="Guardando…"
            disabled={!dirty}
            className="min-h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Guardar
          </PendingButton>
          {done && !dirty ? (
            <span role="status" className="text-sm text-emerald-700">
              Guardado
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
