import type { Metadata } from "next";

import ZonesClient from "./components/ZonesClient";
import DeliveryModeCard from "./components/DeliveryModeCard";
import CourierAvailabilitySwitchCard from "./components/CourierAvailabilitySwitchCard";
import AssignMinutesCard from "./components/AssignMinutesCard";
import CourierTermsSwitchCard from "./components/CourierTermsSwitchCard";
import VehicleSwitchCard from "./components/VehicleSwitchCard";
import { listDeliveryZones } from "@/lib/db/delivery-zones";
import {
  getAssignMinutesSetting,
  getCourierAvailabilitySwitch,
  getCourierTermsSwitch,
  getDeliveryModeStatus,
  getVehicleSwitch,
} from "@/lib/db/platform-settings";

export const metadata: Metadata = { title: "Zonas de envío" };

export default async function SuperAdminZonesPage() {
  // El layout ya exige superadmin; el RLS de la base vuelve a exigirlo en cada escritura.
  const [zones, status, vehicleEnabled, terms, availability, assignMinutes] = await Promise.all([
    listDeliveryZones(),
    getDeliveryModeStatus(),
    getVehicleSwitch(),
    getCourierTermsSwitch(),
    getCourierAvailabilitySwitch(),
    getAssignMinutesSetting(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <DeliveryModeCard mode={status.mode} searching={status.searching} />
      <VehicleSwitchCard enabled={vehicleEnabled} />
      <CourierTermsSwitchCard enabled={terms.required} version={terms.version} />
      <CourierAvailabilitySwitchCard enabled={availability} />
      <AssignMinutesCard minutes={assignMinutes} />
      <ZonesClient zones={zones} />
    </div>
  );
}
