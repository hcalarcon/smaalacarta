"use client";

import { useEffect, useRef, useState } from "react";

import { notifySoundChange, sharedAudioContext, unlockSharedAudio } from "@/lib/orders/sound-pref";
import { primeSpeech } from "@/lib/orders/speech";

// Lo que habilita el audio y la voz: el primer toque en cualquier lugar del panel.
const UNLOCK_EVENTS = ["pointerup", "click", "keydown"] as const;

// El navegador no deja sonar hasta que la persona toca la pantalla (ADMIN-PWA-39, ENVIO-240). Con `enabled`, el primer
// toque en cualquier lugar habilita el audio y la voz, sin recuadro; si el sistema suspende el audio después
// (bloqueo de pantalla, una llamada), el próximo toque lo reanuda. Lo usan el panel del repartidor y el del local.
export function useAudioUnlock(enabled: boolean) {
  const [audioReady, setAudioReady] = useState(false);
  // Un toque dispara varios eventos (pointerup, click): uno solo desbloquea a la vez.
  const unlocking = useRef(false);

  async function unlock(): Promise<boolean> {
    if (unlocking.current) return sharedAudioContext()?.state === "running";
    unlocking.current = true;

    try {
      const ctx = await unlockSharedAudio();
      setAudioReady(ctx !== null);

      if (ctx) {
        primeSpeech();
        ctx.onstatechange = () => {
          setAudioReady(ctx.state === "running");
          notifySoundChange();
        };
      }

      return ctx !== null;
    } catch {
      // Sin audio el panel funciona igual, solo que sin aviso sonoro.
      return false;
    } finally {
      unlocking.current = false;
    }
  }

  useEffect(() => {
    if (!enabled) return;

    const onTouch = () => {
      if (sharedAudioContext()?.state !== "running") void unlock();
    };
    UNLOCK_EVENTS.forEach((name) => document.addEventListener(name, onTouch, { capture: true }));

    return () => UNLOCK_EVENTS.forEach((name) => document.removeEventListener(name, onTouch, { capture: true }));
  }, [enabled]);

  return { audioReady, unlock };
}
