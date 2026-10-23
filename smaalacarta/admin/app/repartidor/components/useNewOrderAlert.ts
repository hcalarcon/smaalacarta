"use client";

import { useEffect, useRef, useState } from "react";

import {
  ALERT_VOICE_DELAY_MS,
  ALERT_VOICE_REPEAT_MS,
  alertPhrase,
  alertsAfter,
  COURIER_ALARM_VOLUME,
  freshAlerts,
  readyPhrase,
  shouldPlayAlert,
  soundHint,
  soundPrefValue,
  type CourierAlert,
} from "@/lib/courier/alerts";
import { pendingCount, tabTitle } from "@/lib/orders/alerts";
import { sharedAudioContext, unlockSharedAudio } from "@/lib/orders/sound-pref";
import { ALARM_LOOP_MS, playAlarmSound, playChosenSound } from "@/lib/orders/sound";
import { cancelSpeech, primeSpeech, speakText } from "@/lib/orders/speech";

const SOUND_PREF_KEY = "sma-courier-sound";
// Lo que habilita el audio y la voz: el primer toque en cualquier lugar del panel.
const UNLOCK_EVENTS = ["pointerup", "click", "keydown"] as const;

function readPref(): boolean {
  try {
    return soundPrefValue(localStorage.getItem(SOUND_PREF_KEY));
  } catch {
    return true;
  }
}

function savePref(on: boolean) {
  try {
    localStorage.setItem(SOUND_PREF_KEY, on ? "1" : "0");
  } catch {
    // Modo privado: la preferencia no se recuerda, el sonido sigue funcionando.
  }
}

// Aviso con sonido y voz de los pedidos que esperan respuesta (ENVIO-33 y 234 a 240). Cada pedido nuevo abre un
// aviso que suena con la alarma del tablero del local, al máximo, y se repite hasta que el repartidor lo ve, lo
// ofrece, lo toma o se cierra; después de cada sonido, la voz dice la zona. Los pedidos que ya estaban al abrir no
// avisan. El sonido está prendido salvo que se apague con la campana: el navegador pide un toque por cada
// apertura, así que el primero en cualquier lugar lo habilita sin cartel.
export function useNewOrderAlert<T extends { id: string }>({
  orders,
  isPending,
  zoneOf,
  label,
}: {
  orders: T[];
  isPending: (order: T) => boolean;
  zoneOf: (order: T) => string | null;
  label: string;
}) {
  const [soundOn, setSoundOn] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [alerts, setAlerts] = useState<CourierAlert[]>([]);
  const soundOnRef = useRef(true);
  const seenIds = useRef<Set<string>>(new Set(orders.map((o) => o.id)));

  const pending = pendingCount(orders, isPending);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador
    setSoundOn(readPref());
  }, []);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  // Pedidos nuevos abren su aviso; los que dejaron de esperar respuesta lo cierran.
  useEffect(() => {
    const fresh = freshAlerts(seenIds.current, orders, isPending, zoneOf);
    orders.forEach((o) => seenIds.current.add(o.id));

    setAlerts((current) => {
      const still = alertsAfter(current, orders, isPending);
      return fresh.length === 0 && still.length === current.length ? current : [...still, ...fresh];
    });
    // `isPending` y `zoneOf` son estables (funciones de módulo): solo importa cuándo cambian los pedidos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // El primer toque en cualquier lugar habilita el audio y la voz; el navegador no deja hacerlo antes.
  async function unlockAudio() {
    try {
      const ctx = await unlockSharedAudio();
      const ready = ctx !== null;
      setAudioReady(ready);

      if (ready) {
        primeSpeech();
        // Si el toque fue el de apagar la campana, la preferencia ya quedó apagada y no se pisa.
        if (readPref()) savePref(true);
      }
    } catch {
      // Sin audio el panel funciona igual, solo que sin aviso sonoro.
    }
  }

  useEffect(() => {
    if (!soundOn || audioReady) return;

    const unlock = () => void unlockAudio();
    UNLOCK_EVENTS.forEach((name) => document.addEventListener(name, unlock, { capture: true }));

    return () => UNLOCK_EVENTS.forEach((name) => document.removeEventListener(name, unlock, { capture: true }));
  }, [soundOn, audioReady]);

  const playing = shouldPlayAlert({ alerts: alerts.length, soundOn, audioReady });
  const phrase = alertPhrase(alerts);

  // La alarma, al máximo y en bucle mientras quede un aviso sin ver.
  useEffect(() => {
    if (!playing) return;

    function play() {
      const ctx = sharedAudioContext();
      if (ctx?.state === "running") playAlarmSound(ctx, COURIER_ALARM_VOLUME);
    }

    play();
    const id = setInterval(play, ALARM_LOOP_MS);
    return () => clearInterval(id);
  }, [playing]);

  // La voz, después del sonido y cada 30 s. Si el aviso cambia (otro pedido), la frase se actualiza.
  useEffect(() => {
    if (!playing || !phrase) return;

    const first = setTimeout(() => speakText(phrase), ALERT_VOICE_DELAY_MS);
    const again = setInterval(() => speakText(phrase), ALERT_VOICE_REPEAT_MS);

    return () => {
      clearTimeout(first);
      clearInterval(again);
      cancelSpeech();
    };
  }, [playing, phrase]);

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

  // Otro aviso, distinto del de pedido nuevo: lo eligieron (ENVIO-116).
  function playChosen() {
    const ctx = sharedAudioContext();
    if (soundOnRef.current && ctx?.state === "running") playChosenSound(ctx);
  }

  // El local marcó Listo (ENVIO-238): el aviso de siempre y, después, la voz con el nombre del local.
  function announceReady(business: string) {
    playChosen();

    const ctx = sharedAudioContext();
    if (soundOnRef.current && ctx?.state === "running") {
      setTimeout(() => speakText(readyPhrase(business)), ALERT_VOICE_DELAY_MS / 2);
    }
  }

  // "Visto": el aviso deja de sonar, pero el pedido sigue en la lista.
  function dismissAlerts() {
    setAlerts([]);
  }

  async function toggleSound() {
    if (soundOn) {
      setSoundOn(false);
      savePref(false);
      cancelSpeech();
      return;
    }

    setSoundOn(true);
    savePref(true);
    await unlockAudio();
  }

  return {
    soundOn,
    audioReady,
    toggleSound,
    pending,
    soundOnRef,
    playChosen,
    announceReady,
    alerts,
    alertText: phrase,
    dismissAlerts,
    hint: soundHint({ soundOn, audioReady }),
  };
}
