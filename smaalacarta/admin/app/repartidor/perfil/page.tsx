import type { Metadata } from "next";

import ProfileClient from "./components/ProfileClient";
import { requireCourier } from "@/lib/auth/courier";
import { getCourierPreferences, getCourierVehicles } from "@/lib/db/courier";
import { isVehicleEnabled } from "@/lib/db/vehicle";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function CourierProfilePage() {
  // El repartidor sale de la sesión, nunca de la URL ni del navegador (ENVIO-3).
  await requireCourier();

  const [preferences, vehicles, vehicleEnabled] = await Promise.all([
    getCourierPreferences(),
    getCourierVehicles(),
    isVehicleEnabled(),
  ]);

  return <ProfileClient initial={preferences} vehicles={vehicles} vehicleEnabled={vehicleEnabled} />;
}
