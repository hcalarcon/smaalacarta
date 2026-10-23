import type { Metadata } from "next";

import {
  createOwnZoneAction,
  deleteOwnZoneAction,
  reorderOwnZonesAction,
  setOwnZoneActiveAction,
  updateOwnZoneAction,
} from "../actions";
import CoverageClient from "./components/CoverageClient";
import OwnZonesEditor from "@/components/courier/OwnZonesEditor";
import { requireCourier } from "@/lib/auth/courier";
import { listCoverageZones } from "@/lib/db/courier";
import { canEditOwnZones, listOwnZones } from "@/lib/db/courier-own-zones";

export const metadata: Metadata = { title: "Mis zonas" };

export default async function CourierZonesPage() {
  // El repartidor sale de la sesión, nunca de la URL ni del navegador (ENVIO-3).
  const { courierId } = await requireCourier();

  const [zones, ownZones, canEdit] = await Promise.all([
    listCoverageZones(courierId),
    listOwnZones(courierId),
    canEditOwnZones(courierId),
  ]);

  return (
    <div className="space-y-10">
      <CoverageClient zones={zones} />

      {/* "Mis zonas y precios" (ENVIO-221 y 227): solo si tiene zonas propias o el permiso para cargarlas. */}
      {canEdit || ownZones.length > 0 ? (
        <section className="mx-auto max-w-3xl space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-brand">Mis zonas y precios</h2>
            <p className="mt-2 text-stone-500">
              {canEdit
                ? "Son las zonas y los precios que ven los clientes de los negocios que trabajan con vos. Cargalas y cambialas cuando quieras."
                : "Son las zonas y los precios que ven los clientes de los negocios que trabajan con vos. Las carga el equipo de SMA a la Carta: si querés cambiar algo, pedíselo."}
            </p>
          </div>

          <OwnZonesEditor
            zones={ownZones}
            readOnly={!canEdit}
            api={{
              create: createOwnZoneAction,
              update: updateOwnZoneAction,
              setActive: setOwnZoneActiveAction,
              remove: deleteOwnZoneAction,
              reorder: reorderOwnZonesAction,
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
