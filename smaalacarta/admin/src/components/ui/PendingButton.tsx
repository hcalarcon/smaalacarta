"use client";

import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

// El botón de una acción que espera a la base (ADMIN-PEDIDOS-51): al tocarlo queda gris, con spinner y su
// texto en gerundio hasta que vuelve la respuesta, y un segundo toque no hace nada. Lo usan el panel del local
// y el del repartidor. `onClick` puede devolver una promesa: el botón espera lo que ella tarde y, si falla,
// vuelve a estar activo (el error lo muestra quien lo llama). `busy` es otra acción en curso del mismo pedido:
// deshabilita, pero no cambia el texto.
export default function PendingButton({
  onClick,
  pendingLabel,
  busy = false,
  pending: external = false,
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
  children: ReactNode;
}) {
  const [own, setPending] = useState(false);
  const pending = own || external;
  // El estado se actualiza después del toque; el ref corta un segundo toque que llegue antes.
  const locked = useRef(false);

  async function handleClick() {
    if (locked.current) return;

    // Una acción que no espera nada (o que no hizo nada, p. ej. un formulario con errores) no pasa por la
    // espera: el botón no parpadea.
    const result = onClick();
    if (!result || typeof (result as PromiseLike<unknown>).then !== "function") return;

    locked.current = true;
    setPending(true);

    try {
      await result;
    } catch {
      // Quien llama muestra el error; acá solo se vuelve a habilitar.
    } finally {
      locked.current = false;
      setPending(false);
    }
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
