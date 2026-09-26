import type { Metadata } from "next";

import OrdersClient from "./components/OrdersClient";
import { listOrders } from "@/lib/db/orders";
import { listProductsForPromotions } from "@/lib/db/promotions";
import { requireBusiness } from "@/lib/get-current-business";

export const metadata: Metadata = { title: "Pedidos" };

export default async function OrdersPage() {
  const { business } = await requireBusiness();

  const [orders, products] = await Promise.all([
    listOrders(business.id),
    // Para sugerir productos y precios al cargar un pedido a mano.
    listProductsForPromotions(business.id),
  ]);

  return (
    <OrdersClient
      slug={business.slug}
      orders={orders}
      products={products.map((p) => ({ name: p.name, price: p.price }))}
      serverNow={new Date().toISOString()}
    />
  );
}
