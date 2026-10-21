"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Si los datos nuevos no llegan (se cortó el refresco), se libera igual.
const HOLD_MS = 10_000;

// Un pedido con una acción que salió bien sigue "ocupado" hasta que el servidor manda datos nuevos (ADMIN-PEDIDOS-60).
// Sin esto, entre la respuesta de la acción y el refresco hay un par de segundos en que los botones se vuelven a
// habilitar y se pueden tocar de nuevo. `fresh` es lo que cambia con cada respuesta del servidor (la hora que trae la
// página): al cambiar, la retención se suelta sola, sin efectos que cambien estado.
export function useHoldUntilFresh(fresh: unknown) {
  const [held, setHeld] = useState<{ id: string; fresh: unknown } | null>(null);

  useEffect(() => {
    if (!held) return;

    const timer = setTimeout(() => setHeld(null), HOLD_MS);
    return () => clearTimeout(timer);
  }, [held]);

  // Lo último que mandó el servidor: una respuesta que llegó mientras la acción viajaba puede ser anterior al cambio,
  // así que se toma el valor al terminar la acción y solo una respuesta posterior la suelta.
  const latest = useRef(fresh);
  useEffect(() => {
    latest.current = fresh;
  });

  const hold = useCallback((id: string) => setHeld({ id, fresh: latest.current }), []);
  const release = useCallback(() => setHeld(null), []);
  const holding = (id: string | null | undefined) => held !== null && held.id === id && Object.is(held.fresh, fresh);

  return { hold, release, holding };
}
