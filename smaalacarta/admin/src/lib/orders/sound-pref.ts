// La preferencia de sonido del tablero y el contexto de audio compartido (ADMIN-PEDIDOS-9 y 30). Los
// comparten el tablero de Pedidos y la barra de avisos del panel: activar el sonido desde la barra deja el
// audio ya habilitado cuando se abre Pedidos, sin tener que tocar dos veces.

import { soundPrefValue } from "@/lib/courier/alerts";

export const SOUND_PREF_KEY = "sma-orders-sound";
// Se dispara en `window` cuando cambia la preferencia o el audio queda habilitado.
export const SOUND_CHANGE_EVENT = "sma-orders-sound-change";

// Sin nada guardado el sonido está prendido (ADMIN-PWA-39); solo apagarlo a propósito lo deja apagado.
export function readSoundPref(): boolean {
  try {
    return soundPrefValue(localStorage.getItem(SOUND_PREF_KEY));
  } catch {
    return true;
  }
}

export function saveSoundPref(on: boolean): void {
  try {
    localStorage.setItem(SOUND_PREF_KEY, on ? "1" : "0");
  } catch {
    // Modo privado: la preferencia no se recuerda, el sonido sigue funcionando.
  }

  notifySoundChange();
}

export function notifySoundChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SOUND_CHANGE_EVENT));
}

let shared: AudioContext | null = null;

export function sharedAudioContext(): AudioContext | null {
  return shared;
}

// Crea (una vez) y reanuda el contexto de audio. Solo funciona dentro de un toque de la persona: es la
// política de autoplay del navegador.
export async function unlockSharedAudio(): Promise<AudioContext | null> {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    shared ??= new Ctor();
    if (shared.state !== "running") await shared.resume();

    notifySoundChange();
    return shared.state === "running" ? shared : null;
  } catch {
    return null;
  }
}

export function isAudioReady(): boolean {
  return shared?.state === "running";
}
