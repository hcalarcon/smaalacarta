import type { Metadata } from "next";
import { redirect } from "next/navigation";

import OrdersClient from "./components/OrdersClient";
import { getDeliveryOptions } from "@/lib/db/delivery-zones";
import { listOrders } from "@/lib/db/orders";
import { listProductsForPromotions } from "@/lib/db/promotions";
import { requireBusiness } from "@/lib/get-current-business";
import { hasOrders } from "@/lib/plan-access";

export const metadata: Metadata = { title: "Pedidos" };

export default async function OrdersPage() {
  const { business } = await requireBusiness();

  // Pedidos (carrito) es exclusivo de plan_completo.
  if (
    !hasOrders({
      planPdf: business.plan_pdf,
      planWeb: business.plan_web,
      planCompleto: business.plan_completo,
    })
  ) {
    redirect("/dashboard");
  }

  const [orders, products, delivery] = await Promise.all([
    listOrders(business.id),
    // Para sugerir productos y precios al cargar un pedido a mano.
    listProductsForPromotions(business.id),
    // Solo los negocios con envío con repartidor habilitado (ENVIO-2): a quién se puede asignar un pedido.
    business.courier_delivery ? getDeliveryOptions() : Promise.resolve(null),
  ]);

  return (
    <OrdersClient
      slug={business.slug}
      orders={orders}
      products={products.map((p) => ({ name: p.name, price: p.price }))}
      serverNow={new Date().toISOString()}
      couriers={delivery?.couriers ?? []}
      favoriteId={delivery?.favorite_id ?? null}
    />
  );
}
