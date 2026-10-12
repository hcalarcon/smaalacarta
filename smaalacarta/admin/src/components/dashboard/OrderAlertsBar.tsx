"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { enablePush, start, usePwa } from "@/components/pwa/pwa-store";
import {
  SOUND_CHANGE_EVENT,
  isAudioReady,
  readSoundPref,
  saveSoundPref,
  unlockSharedAudio,
} from "@/lib/orders/sound-pref";
import { barState } from "@/lib/orders/urgent-alert";

// La barra roja fija de arriba del panel del negocio (ADMIN-PEDIDOS-30): mientras el local no vaya a oír
// los pedidos nuevos (sonido apagado o avisos sin activar), lo dice y da los botones para arreglarlo. Se
// monta una sola vez en el layout, solo para negocios con pedidos por menú. Solo pinta: qué mostrar lo
// decide `barState()` en `src/lib/orders/urgent-alert.ts`.

const ORDERS_PATH = "/dashboard/orders";

function subscribeSound(onChange: () => void) {
  window.addEventListener(SOUND_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(SOUND_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// El sonido cuenta como encendido si la preferencia está activada y el navegador ya dejó sonar (tras
// recargar hay que volver a tocar). En el servidor se asume encendido para no pintar la barra de más.
const soundSnapshot = () => readSoundPref() && isAudioReady();

export default function OrderAlertsBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { pushControl, busy, error } = usePwa();
  const soundOn = useSyncExternalStore(subscribeSound, soundSnapshot, () => true);

  useEffect(() => {
    start();
  }, []);

  const state = barState({ ordersEnabled: true, soundOn, push: pushControl });
  if (!state) return null;

  async function activateSound() {
    saveSoundPref(true);
    await unlockSharedAudio();

    // La alarma solo suena en Pedidos: ahí se queda la persona después de activarla.
    if (pathname !== ORDERS_PATH) router.push(ORDERS_PATH);
  }

  const buttonClass =
    "min-h-10 shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60";

  return (
    <div role="alert" className="bg-red-700 px-4 py-2.5 text-sm text-white md:px-6 lg:px-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold">
          No vas a oír los pedidos nuevos.{" "}
          <span className="font-normal">
            {state.sound && state.push
              ? "Activá el sonido y los avisos."
              : state.sound
                ? "Activá el sonido."
                : "Activá los avisos."}
          </span>
          {pushControl === "blocked" && state.push ? (
            <span className="block font-normal">
              Los avisos están bloqueados: habilitalos en los ajustes del navegador.
            </span>
          ) : null}
          {pushControl === "install-first" && state.push ? (
            <span className="block font-normal">Instalá la app para recibir avisos.</span>
          ) : null}
          {error ? <span className="block font-normal">{error}</span> : null}
        </p>

        <div className="flex flex-wrap gap-2">
          {state.sound ? (
            <button type="button" onClick={() => void activateSound()} className={buttonClass}>
              Activar el sonido
            </button>
          ) : null}
          {state.push && pushControl === "enable" ? (
            <button type="button" disabled={busy} onClick={() => void enablePush()} className={buttonClass}>
              {busy ? "Activando…" : "Activar los avisos"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
