import type { Metadata } from "next";

import ProfileClient from "./components/ProfileClient";
import { requireCourier } from "@/lib/auth/courier";
import { getCourierPreferences } from "@/lib/db/courier";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function CourierProfilePage() {
  // El repartidor sale de la sesión, nunca de la URL ni del navegador (ENVIO-3).
  await requireCourier();

  const preferences = await getCourierPreferences();

  return <ProfileClient initial={preferences} />;
}
