import type { Metadata } from "next";
import { redirect } from "next/navigation";

import OrdersClient from "./components/OrdersClient";
import { getBusinessAvailability } from "@/lib/db/availability";
import { getDeliveryOptions } from "@/lib/db/delivery-zones";
import { getManualOrderMenu, getSuggestedPrepMinutes, listOrderOffers, listOrders } from "@/lib/db/orders";
import { getPrepSettings } from "@/lib/db/settings";
import { isVehicleEnabled } from "@/lib/db/vehicle";
import { requireBusiness } from "@/lib/get-current-business";
import { manualDeliveryContext } from "@/lib/orders/manual-context";
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

  // Primero las ofertas: esa lectura resuelve lo vencido (la elección automática, ENVIO-106) y los pedidos
  // que se leen después ya la ven.
  const offers = business.courier_delivery ? await listOrderOffers() : [];

  const [orders, menu, delivery, suggestedPrep, prepSettings, vehicleEnabled, availability] = await Promise.all([
    listOrders(business.id),
    // El menú con sus opciones, para cargar un pedido a mano con el precio de la base (ADMIN-PEDIDOS-47).
    getManualOrderMenu(business.id),
    // Solo los negocios con envío con repartidor habilitado (ENVIO-2): a quién se puede asignar un pedido.
    business.courier_delivery ? getDeliveryOptions() : Promise.resolve(null),
    // Para el selector del tiempo al aceptar (ADMIN-PEDIDOS-32): la sugerencia y el tiempo por defecto.
    getSuggestedPrepMinutes(business.id),
    getPrepSettings(business.id),
    // Si la plataforma tiene prendido el vehículo del repartidor (ENVIO-175): "Necesita auto" y los íconos.
    business.courier_delivery ? isVehicleEnabled() : Promise.resolve(false),
    // Cuántos repartidores disponibles cubren sus zonas (ENVIO-200). El negocio sale de la sesión, no del navegador.
    business.courier_delivery
      ? getBusinessAvailability(business.id)
      : Promise.resolve({ enabled: false, total: 0, emptyZoneIds: [] }),
  ]);

  return (
    <OrdersClient
      slug={business.slug}
      orders={orders}
      manualSetup={{
        businessName: business.name,
        slug: business.slug,
        courier: business.courier_delivery === true,
        menu,
        delivery: manualDeliveryContext(delivery),
      }}
      serverNow={new Date().toISOString()}
      couriers={delivery?.couriers ?? []}
      offers={offers}
      suggestedPrepMinutes={suggestedPrep}
      defaultPrepMinutes={prepSettings.defaultPrepMinutes}
      vehicleEnabled={vehicleEnabled}
      availability={availability}
    />
  );
}
