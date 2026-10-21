"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

// El botón de una acción que espera a la base (ADMIN-PEDIDOS-51): al tocarlo queda gris, con spinner y su
// texto en gerundio hasta que vuelve la respuesta, y un segundo toque no hace nada. Lo usan el panel del local
// y el del repartidor. `onClick` puede devolver una promesa: el botón espera lo que ella tarde y, si falla,
// vuelve a estar activo (el error lo muestra quien lo llama). `busy` es otra acción en curso del mismo pedido:
// deshabilita, pero no cambia el texto.
//
// `settleKey` (ADMIN-PEDIDOS-59): lo que cambia cuando llega el estado nuevo (el estado del pedido). Con él, al
// responder el servidor el botón NO se libera: sigue gris y con spinner hasta que `settleKey` cambia, el botón se
// desmonta, la acción falla (devuelve `false` o lanza) o pasan 10 segundos sin cambio. Sin él, se libera al responder
// (un botón de Guardar). Es lo que evita tocar dos veces en los segundos entre la respuesta y el refresco.
const HOLD_MS = 10_000;

export default function PendingButton({
  onClick,
  pendingLabel,
  busy = false,
  pending: external = false,
  settleKey,
  disabled = false,
  className = "",
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "children"> & {
  onClick: () => unknown;
  pendingLabel: string;
  busy?: boolean;
  // La espera la lleva quien llama (p. ej. un `busyId` que ya existe): se pinta igual que la propia.
  pending?: boolean;
  settleKey?: unknown;
  children: ReactNode;
}) {
  const [own, setPending] = useState(false);
  // La clave que había al responder la acción; mientras siga igual, el botón sigue esperando el estado nuevo.
  const [held, setHeld] = useState<{ key: unknown } | null>(null);
  const holding = held !== null && Object.is(held.key, settleKey);
  const pending = own || external || holding;

  useEffect(() => {
    if (!held) return;

    const id = setTimeout(() => setHeld(null), HOLD_MS);
    return () => clearTimeout(id);
  }, [held]);
  // El estado se actualiza después del toque; el ref corta un segundo toque que llegue antes, incluso en el
  // mismo instante (ENVIO-168). Se cierra antes de llamar a la acción, no después.
  const locked = useRef(false);

  async function handleClick() {
    if (locked.current) return;

    locked.current = true;

    let result: unknown;
    try {
      result = onClick();
    } catch (error) {
      locked.current = false;
      throw error;
    }

    // Una acción que no espera nada (o que no hizo nada, p. ej. un formulario con errores) no pasa por la
    // espera: el botón no parpadea. Queda cerrado hasta que termina el toque, para cortar el segundo.
    if (!result || typeof (result as PromiseLike<unknown>).then !== "function") {
      queueMicrotask(() => {
        locked.current = false;
      });
      return;
    }

    setPending(true);

    let outcome: unknown;
    let failed = false;
    try {
      outcome = await result;
    } catch {
      // Quien llama muestra el error; acá solo se vuelve a habilitar.
      failed = true;
    } finally {
      locked.current = false;
      setPending(false);
    }

    // Respondió bien: sigue esperando el estado nuevo (si el botón lo pidió). `false` es "falló, ya se mostró el error".
    if (settleKey !== undefined && !failed && outcome !== false) setHeld({ key: settleKey });
  }

  return (
    <button
      {...rest}
      type="button"
      disabled={disabled || busy || pending}
      aria-busy={pending}
      onClick={() => void handleClick()}
      className={`${className} inline-flex items-center justify-center gap-2 disabled:cursor-wait ${
        pending ? "border-stone-300! bg-stone-300! text-stone-600! opacity-100!" : ""
      }`}
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-full border-2 border-stone-500 border-t-transparent motion-safe:animate-spin"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
