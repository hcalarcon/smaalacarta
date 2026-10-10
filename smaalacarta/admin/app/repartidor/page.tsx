import type { Metadata } from "next";

import CourierOrdersClient from "./components/CourierOrdersClient";
import { requireCourier } from "@/lib/auth/courier";
import { listCourierOrders } from "@/lib/db/courier";

export const metadata: Metadata = { title: "Pedidos con envío" };

export default async function CourierOrdersPage() {
  // El layout ya lo comprobó; se repite porque una página puede pedirse sola (ENVIO-30).
  await requireCourier();

  const orders = await listCourierOrders();

  return <CourierOrdersClient orders={orders} serverNow={new Date().toISOString()} />;
}
