"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

// Si la respuesta no llega (se cortó el pedido), a los 10 segundos se deja pedir de nuevo.
const RELEASE_MS = 10_000;

// Un `router.refresh()` a la vez (ENVIO-210). El pulso de Realtime, la consulta periódica y los demás disparadores
// llaman a la función que devuelve; si ya hay un pedido en camino, dejan uno pendiente que sale apenas llegan los
// datos. Apilados, cada respuesta tarda más que el intervalo y Next los junta en una transición que no se muestra
// hasta que termina el último: el servidor ya devolvía el pedido y la pantalla no lo pintaba.
// `signal` es algo que cambia con cada respuesta (la hora del servidor que trae la página).
export function useSerialRefresh(signal: unknown): () => void {
  const router = useRouter();
  const inFlight = useRef(false);
  const queued = useRef(false);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    inFlight.current = true;
    queued.current = false;
    if (release.current) clearTimeout(release.current);
    release.current = setTimeout(() => {
      inFlight.current = false;
    }, RELEASE_MS);
    router.refresh();
  }, [router]);

  const refresh = useCallback(() => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    start();
  }, [start]);

  const first = useRef(true);
  useEffect(() => {
    // El primer render ya trae datos: no hay nada que soltar.
    if (first.current) {
      first.current = false;
      return;
    }
    if (release.current) clearTimeout(release.current);
    inFlight.current = false;
    if (queued.current) start();
  }, [signal, start]);

  useEffect(
    () => () => {
      if (release.current) clearTimeout(release.current);
    },
    [],
  );

  return refresh;
}
