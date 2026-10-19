import type { Metadata } from "next";

import ZonesClient from "./components/ZonesClient";
import DeliveryModeCard from "./components/DeliveryModeCard";
import CourierAvailabilitySwitchCard from "./components/CourierAvailabilitySwitchCard";
import CourierTermsSwitchCard from "./components/CourierTermsSwitchCard";
import VehicleSwitchCard from "./components/VehicleSwitchCard";
import { listDeliveryZones } from "@/lib/db/delivery-zones";
import {
  getCourierAvailabilitySwitch,
  getCourierTermsSwitch,
  getDeliveryModeStatus,
  getVehicleSwitch,
} from "@/lib/db/platform-settings";

export const metadata: Metadata = { title: "Zonas de envío" };

export default async function SuperAdminZonesPage() {
  // El layout ya exige superadmin; el RLS de la base vuelve a exigirlo en cada escritura.
  const [zones, status, vehicleEnabled, terms, availability] = await Promise.all([
    listDeliveryZones(),
    getDeliveryModeStatus(),
    getVehicleSwitch(),
    getCourierTermsSwitch(),
    getCourierAvailabilitySwitch(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <DeliveryModeCard mode={status.mode} searching={status.searching} />
      <VehicleSwitchCard enabled={vehicleEnabled} />
      <CourierTermsSwitchCard enabled={terms.required} version={terms.version} />
      <CourierAvailabilitySwitchCard enabled={availability} />
      <ZonesClient zones={zones} />
    </div>
  );
}
