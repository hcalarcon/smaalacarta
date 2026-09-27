"use client";

import { useState } from "react";

// Copia una dirección al portapapeles y lo avisa un momento (ADMIN-RESUMEN-2).
export default function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso para el portapapeles: la dirección sigue visible para copiarla a mano.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft"
    >
      {copied ? "¡Copiado!" : "Copiar link"}
    </button>
  );
}
