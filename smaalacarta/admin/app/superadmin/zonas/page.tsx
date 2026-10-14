import type { Metadata } from "next";

import ZonesClient from "./components/ZonesClient";
import DeliveryModeCard from "./components/DeliveryModeCard";
import { listDeliveryZones } from "@/lib/db/delivery-zones";
import { getDeliveryModeStatus } from "@/lib/db/platform-settings";

export const metadata: Metadata = { title: "Zonas de envío" };

export default async function SuperAdminZonesPage() {
  // El layout ya exige superadmin; el RLS de la base vuelve a exigirlo en cada escritura.
  const [zones, status] = await Promise.all([listDeliveryZones(), getDeliveryModeStatus()]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <DeliveryModeCard mode={status.mode} searching={status.searching} />
      <ZonesClient zones={zones} />
    </div>
  );
}
