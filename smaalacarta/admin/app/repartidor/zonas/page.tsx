import type { Metadata } from "next";

import CoverageClient from "./components/CoverageClient";
import { requireCourier } from "@/lib/auth/courier";
import { listCoverageZones } from "@/lib/db/courier";

export const metadata: Metadata = { title: "Mis zonas" };

export default async function CourierZonesPage() {
  // El repartidor sale de la sesión, nunca de la URL ni del navegador (ENVIO-3).
  const { courierId } = await requireCourier();

  const zones = await listCoverageZones(courierId);

  return <CoverageClient zones={zones} />;
}
