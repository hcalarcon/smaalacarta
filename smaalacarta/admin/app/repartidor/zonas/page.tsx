import type { Metadata } from "next";

import CoverageClient from "./components/CoverageClient";
import BusinessZonesEditor from "@/components/delivery/BusinessZonesEditor";
import { requireCourier } from "@/lib/auth/courier";
import { listCoverageZones } from "@/lib/db/courier";
import { getCourierOwnBusiness } from "@/lib/db/own-delivery";

export const metadata: Metadata = { title: "Mis zonas" };

export default async function CourierZonesPage() {
  // El repartidor sale de la sesión, nunca de la URL ni del navegador (ENVIO-3).
  const { courierId } = await requireCourier();

  const own = await getCourierOwnBusiness();

  // Repartidor propio de un negocio (ENVIO-261): ve las zonas y los precios de su negocio, en solo lectura. No elige
  // zonas comunes porque no entra en la red.
  if (own) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-brand">Zonas y precios de {own.business.name}</h2>
          <p className="mt-2 text-stone-500">
            Son las zonas y los precios que ven los clientes de {own.business.name}. Las carga el negocio: si querés
            cambiar algo, pedíselo.
          </p>
        </div>

        <BusinessZonesEditor
          zones={own.zones.map((zone, index) => ({ ...zone, sort_order: index }))}
          readOnly
        />
      </section>
    );
  }

  const zones = await listCoverageZones(courierId);

  return <CoverageClient zones={zones} />;
}
