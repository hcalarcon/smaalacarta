import type { Metadata } from "next";

import ZonesClient from "./components/ZonesClient";
import DeliveryModeCard from "./components/DeliveryModeCard";
import VehicleSwitchCard from "./components/VehicleSwitchCard";
import { listDeliveryZones } from "@/lib/db/delivery-zones";
import { getDeliveryModeStatus, getVehicleSwitch } from "@/lib/db/platform-settings";

export const metadata: Metadata = { title: "Zonas de envío" };

export default async function SuperAdminZonesPage() {
  // El layout ya exige superadmin; el RLS de la base vuelve a exigirlo en cada escritura.
  const [zones, status, vehicleEnabled] = await Promise.all([
    listDeliveryZones(),
    getDeliveryModeStatus(),
    getVehicleSwitch(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <DeliveryModeCard mode={status.mode} searching={status.searching} />
      <VehicleSwitchCard enabled={vehicleEnabled} />
      <ZonesClient zones={zones} />
    </div>
  );
}
