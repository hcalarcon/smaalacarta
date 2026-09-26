"use client";

import { useState } from "react";

import type { Credentials } from "@/lib/superadmin/accounts";

// Datos de acceso recién generados. Se muestran una sola vez: la contraseña no se
// guarda en ningún lado, así que hay que copiarla ahora.
export default function CredentialsCard({
  credentials,
}: {
  credentials: Credentials;
}) {
  const [copied, setCopied] = useState(false);

  const text = `Email: ${credentials.email}\nContraseña temporal: ${credentials.password}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Sin permiso para el portapapeles: se puede seleccionar y copiar a mano.
    }
  }

  return (
    <div className="rounded-2xl border border-accent/40 bg-accent-soft p-5">
      <dl className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-stone-500">Email:</dt>
          <dd className="font-medium text-stone-900">{credentials.email}</dd>
        </div>
        <div className="flex flex-wrap items-center gap-x-2">
          <dt className="text-stone-500">Contraseña temporal:</dt>
          <dd>
            <code className="select-all rounded-lg bg-white px-2 py-1 font-mono text-base font-semibold tracking-wide text-brand">
              {credentials.password}
            </code>
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-sm text-stone-600">
        <strong>Se muestra una sola vez.</strong> Al entrar por primera vez, la
        persona tiene que elegir su propia contraseña.
      </p>

      <button
        type="button"
        onClick={copy}
        className="mt-3 rounded-xl border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft"
      >
        {copied ? "Copiado" : "Copiar datos"}
      </button>
    </div>
  );
}
