import type { Metadata } from "next";

import ZonesClient from "./components/ZonesClient";
import { listDeliveryZones } from "@/lib/db/delivery-zones";

export const metadata: Metadata = { title: "Zonas de envío" };

export default async function SuperAdminZonesPage() {
  // El layout ya exige superadmin; el RLS de la base vuelve a exigirlo en cada escritura.
  const zones = await listDeliveryZones();

  return <ZonesClient zones={zones} />;
}
