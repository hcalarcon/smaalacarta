"use client";

import { useEffect, useRef, useState } from "react";

import { newPendingIds, pendingCount, shouldRemind, tabTitle } from "@/lib/orders/alerts";
import { playNewOrderSound } from "@/lib/orders/sound";

const REMIND_MS = 30_000;
// Cada cuánto se mira si toca repetir el aviso (el intervalo real es REMIND_MS).
const REMIND_CHECK_MS = 5_000;
const SOUND_PREF_KEY = "sma-courier-sound";

function readPref(): boolean {
  try {
    return localStorage.getItem(SOUND_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function savePref(on: boolean) {
  try {
    localStorage.setItem(SOUND_PREF_KEY, on ? "1" : "0");
  } catch {
    // Modo privado: la preferencia no se recuerda, el sonido sigue funcionando.
  }
}

// Aviso con sonido de los pedidos que esperan respuesta (ENVIO-33): el mismo que usa el tablero del
// local (`alerts.ts` y `sound.ts`), con el criterio de "pendiente" que le pasa el panel. Suena una
// vez por cada pedido nuevo (los que ya estaban al abrir no suenan), se repite cada 30 segundos
// mientras quede alguno sin atender y la pestaña muestra cuántos hay.
export function useNewOrderAlert<T extends { id: string }>({
  orders,
  isPending,
  label,
}: {
  orders: T[];
  isPending: (order: T) => boolean;
  label: string;
}) {
  const [soundOn, setSoundOn] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(false);
  const seenIds = useRef<Set<string>>(new Set(orders.map((o) => o.id)));
  const lastBeepAt = useRef<number | null>(null);

  const pending = pendingCount(orders, isPending);

  function beep(ctx: AudioContext) {
    lastBeepAt.current = Date.now();
    playNewOrderSound(ctx);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador
    setSoundOn(readPref());
  }, []);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  // Aviso por cada pedido nuevo.
  useEffect(() => {
    const fresh = newPendingIds(seenIds.current, orders, isPending);
    orders.forEach((o) => seenIds.current.add(o.id));

    const ctx = audioRef.current;
    if (fresh.length > 0 && soundOnRef.current && ctx?.state === "running") beep(ctx);
    // `isPending` es estable (función de módulo): solo importa cuándo cambian los pedidos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // Repite el sonido mientras haya pedidos sin responder.
  useEffect(() => {
    if (!soundOn || !audioReady || pending === 0) return;

    const id = setInterval(() => {
      const ctx = audioRef.current;
      if (ctx?.state === "running" && shouldRemind(lastBeepAt.current, Date.now(), pending, REMIND_MS)) {
        beep(ctx);
      }
    }, REMIND_CHECK_MS);

    return () => clearInterval(id);
  }, [soundOn, audioReady, pending]);

  // Título de la pestaña: la cantidad de pedidos por responder.
  const originalTitle = useRef<string | null>(null);
  useEffect(() => {
    originalTitle.current ??= document.title;
    document.title = tabTitle(originalTitle.current, pending, label);
  }, [pending, label]);
  useEffect(() => {
    return () => {
      if (originalTitle.current !== null) document.title = originalTitle.current;
    };
  }, []);

  async function unlockAudio() {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;

      audioRef.current ??= new Ctor();
      if (audioRef.current.state !== "running") await audioRef.current.resume();

      const ready = audioRef.current.state === "running";
      setAudioReady(ready);
      if (ready) beep(audioRef.current);
    } catch {
      // Sin audio el panel funciona igual, solo que sin aviso sonoro.
    }
  }

  async function toggleSound() {
    if (soundOn && audioReady) {
      setSoundOn(false);
      savePref(false);
      return;
    }

    setSoundOn(true);
    savePref(true);
    await unlockAudio();
  }

  return { soundOn, audioReady, toggleSound, pending, soundOnRef };
}
