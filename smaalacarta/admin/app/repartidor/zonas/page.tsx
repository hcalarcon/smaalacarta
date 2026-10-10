import type { Metadata } from "next";

import ZonesClient from "./components/ZonesClient";
import { requireCourier } from "@/lib/auth/courier";
import { listZones } from "@/lib/db/courier";

export const metadata: Metadata = { title: "Barrios y precios" };

export default async function CourierZonesPage() {
  // El repartidor sale de la sesión, nunca de la URL ni del navegador (ENVIO-3).
  const { courierId } = await requireCourier();

  const zones = await listZones(courierId);

  return <ZonesClient zones={zones} />;
}
