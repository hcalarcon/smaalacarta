import type { Metadata } from "next";
import Link from "next/link";

import TermsText from "../components/TermsText";
import { requireCourier } from "@/lib/auth/courier";
import { formatAcceptedAt } from "@/lib/courier/terms";
import { loadTerms } from "@/lib/courier/terms-file";
import { getCourierTermsStatus } from "@/lib/db/courier-terms";

export const metadata: Metadata = { title: "Términos para repartidores" };

// Para releer los términos (ENVIO-184). Si falta aceptar la versión vigente, el layout muestra la pantalla de
// aceptación en su lugar.
export default async function CourierTermsPage() {
  await requireCourier();

  const status = await getCourierTermsStatus();
  const terms = loadTerms();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/repartidor/perfil" className="inline-block py-2 text-sm font-medium text-brand underline">
        Volver a Mi perfil
      </Link>

      <section className="space-y-4 rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-6">
        <TermsText body={terms.body} />

        {status.acceptedAt ? (
          <p className="text-sm text-stone-500">
            Versión {status.acceptedVersion}, aceptada el {formatAcceptedAt(status.acceptedAt)}
          </p>
        ) : null}
      </section>
    </div>
  );
}
