import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CanEditZonesToggle from "../components/CanEditZonesToggle";
import CourierProfileForm from "../components/CourierProfileForm";
import {
  createOwnZoneAction,
  deleteOwnZoneAction,
  reorderOwnZonesAction,
  setCanEditZonesAction,
  setOwnZoneActiveAction,
  updateOwnZoneAction,
} from "../actions";
import ResetPasswordButton from "../../components/ResetPasswordButton";
import OwnZonesEditor from "@/components/courier/OwnZonesEditor";
import VehicleIcons from "@/components/ui/VehicleIcon";
import { canEditOwnZones, listOwnZones } from "@/lib/db/courier-own-zones";
import { getCourier } from "@/lib/db/couriers";
import { isVehicleEnabled } from "@/lib/db/vehicle";

export const metadata: Metadata = { title: "Repartidor" };

export default async function CourierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Un id que no es un UUID haría fallar la consulta: se trata como inexistente.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const courier = await getCourier(id);
  if (!courier) notFound();

  const [vehicleEnabled, ownZones, canEdit] = await Promise.all([
    isVehicleEnabled(),
    listOwnZones(courier.id),
    canEditOwnZones(courier.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href="/superadmin/repartidores" className="text-sm font-medium text-accent hover:text-accent-hover">
          ← Todos los repartidores
        </Link>
      </div>

      <section>
        <h1 className="text-3xl font-bold text-brand">{courier.name}</h1>
        <p className="mt-2 text-stone-500">
          {courier.zoneCount === 1 ? "Cubre 1 zona" : `Cubre ${courier.zoneCount} zonas`}
          {courier.email ? ` · ${courier.email}` : " · sin cuenta"}
        </p>
        {vehicleEnabled ? (
          <p className="mt-1 flex items-center gap-1.5 text-stone-500">
            Vehículo:
            <VehicleIcons vehicles={[...(courier.moto ? ["moto"] : []), ...(courier.auto ? ["auto"] : [])]} />
            {courier.moto && courier.auto ? "Moto y auto" : courier.auto ? "Auto" : "Moto"}
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-brand">Datos</h2>
        <div className="mt-4">
          <CourierProfileForm
            courierId={courier.id}
            name={courier.name}
            whatsapp={courier.whatsapp ?? ""}
            active={courier.active}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-brand">Zonas y precios propios</h2>
        <p className="mt-2 text-sm text-stone-500">
          Solo se ofrecen en los negocios con precio &ldquo;Del repartidor&rdquo; cuyo favorito es esta persona. Son
          independientes de las zonas comunes.
        </p>
        <div className="mt-4 space-y-4">
          <CanEditZonesToggle
            canEdit={canEdit}
            action={setCanEditZonesAction.bind(null, courier.id)}
          />
          <OwnZonesEditor
            zones={ownZones}
            readOnly={false}
            api={{
              create: createOwnZoneAction.bind(null, courier.id),
              update: updateOwnZoneAction.bind(null, courier.id),
              setActive: setOwnZoneActiveAction.bind(null, courier.id),
              remove: deleteOwnZoneAction.bind(null, courier.id),
              reorder: reorderOwnZonesAction.bind(null, courier.id),
            }}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-brand">Cuenta</h2>
        {courier.email ? (
          <div className="mt-4">
            <ResetPasswordButton courierId={courier.id} label={courier.email} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-500">Este repartidor no tiene una cuenta para entrar.</p>
        )}
      </section>
    </div>
  );
}
