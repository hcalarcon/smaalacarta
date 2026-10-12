"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import ConfirmDeleteDialog from "../../components/ConfirmDeleteDialog";
import Section from "@/components/ui/Section";
import { BASE_PATH } from "@/lib/base-path";
import type { MpConnectionStatus } from "@/lib/mp/oauth-status";

type Props = {
  status: MpConnectionStatus;
  // Solo el dueño conecta o desconecta (MP-9); un miembro staff ve el estado.
  isOwner: boolean;
  // Lo que dejó el callback (`?mp=`), para avisarlo una vez.
  result: "connected" | "error" | null;
};

const ENDPOINT = `${BASE_PATH}/api/mp/oauth`;

const buttonClass =
  "rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";

// Conexión de la cuenta de Mercado Pago del negocio (MP-9 a MP-16). Todavía no se cobra con ella: eso viene
// en el siguiente PR. Nunca muestra tokens ni ids.
export default function MercadoPagoSection({ status, isOwner, result }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const connected = status === "connected";

  async function connect() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`${ENDPOINT}/start`, { method: "POST" });
      const body = (await response.json()) as { url?: string };

      if (!response.ok || !body.url) throw new Error("start");
      window.location.assign(body.url);
    } catch {
      setError("No pudimos iniciar la conexión con Mercado Pago. Probá de nuevo en unos segundos.");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`${ENDPOINT}/disconnect`, { method: "POST" });
      if (!response.ok) throw new Error("disconnect");

      setConfirming(false);
      router.refresh();
    } catch {
      setConfirming(false);
      setError("No pudimos desconectar la cuenta. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      id="mercadopago"
      title="Mercado Pago"
      description="Conectá tu cuenta de Mercado Pago para que tus clientes te paguen online."
    >
      {result === "connected" ? (
        <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800">
          Tu cuenta de Mercado Pago quedó conectada.
        </p>
      ) : null}

      {result === "error" ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          No pudimos conectar tu cuenta de Mercado Pago. Probá de nuevo.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-stone-700">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-green-500" />
            Conectado
          </p>

          {isOwner ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className="rounded-2xl border border-line px-4 py-2 text-sm font-medium text-stone-700 hover:bg-cream disabled:opacity-50"
            >
              Desconectar
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">
            {status === "needs_reconnect"
              ? "Hay que volver a conectar tu cuenta."
              : "Vas a pasar a Mercado Pago para autorizar a SMA a la Carta. Tiene que ser una cuenta de Argentina y solo puede estar conectada a un negocio."}
          </p>

          {isOwner ? (
            <button type="button" disabled={busy} onClick={connect} className={buttonClass}>
              {busy ? "Conectando..." : "Conectar Mercado Pago"}
            </button>
          ) : null}
        </div>
      )}

      {!isOwner ? (
        <p className="text-sm text-stone-500">Solo el dueño del negocio puede conectar o desconectar la cuenta.</p>
      ) : null}

      <ConfirmDeleteDialog
        open={confirming}
        title="Desconectar Mercado Pago"
        description="Vamos a borrar la conexión de este negocio. Si querés, también podés revocar el acceso de SMA a la Carta desde tu cuenta de Mercado Pago."
        confirmLabel="Desconectar"
        loadingLabel="Desconectando..."
        loading={busy}
        onConfirm={disconnect}
        onClose={() => setConfirming(false)}
      />
    </Section>
  );
}
