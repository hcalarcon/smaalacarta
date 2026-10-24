import type { Metadata } from "next";
import { redirect } from "next/navigation";

import OrdersClient from "./components/OrdersClient";
import { getBusinessAvailability } from "@/lib/db/availability";
import { listBusinessZones } from "@/lib/db/business-zones";
import { getDeliveryOptions } from "@/lib/db/delivery-zones";
import { getManualOrderMenu, getSuggestedPrepMinutes, listOrderOffers, listOrders } from "@/lib/db/orders";
import { getOwnDelivery } from "@/lib/db/own-delivery";
import { getManualAssignMinutes } from "@/lib/db/platform-minutes";
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

  // Con envío propio (ENVIO-250 y 260): sus zonas y su repartidor propio, en vez de las zonas comunes.
  const ownDelivery = business.courier_delivery && business.delivery_type === "own";
  const own = ownDelivery
    ? { delivery: await getOwnDelivery(business.id), zones: await listBusinessZones(business.id) }
    : null;

  const [orders, menu, delivery, suggestedPrep, prepSettings, vehicleEnabled, availability, assignMinutes] = await Promise.all([
    listOrders(business.id),
    // El menú con sus opciones, para cargar un pedido a mano con el precio de la base (ADMIN-PEDIDOS-47).
    getManualOrderMenu(business.id),
    // Solo los negocios con envío con repartidor habilitado (ENVIO-2): a quién se puede asignar un pedido.
    business.courier_delivery && !ownDelivery ? getDeliveryOptions() : Promise.resolve(null),
    // Para el selector del tiempo al aceptar (ADMIN-PEDIDOS-32): la sugerencia y el tiempo por defecto.
    getSuggestedPrepMinutes(business.id),
    getPrepSettings(business.id),
    // Si la plataforma tiene prendido el vehículo del repartidor (ENVIO-175): "Necesita auto" y los íconos.
    business.courier_delivery ? isVehicleEnabled() : Promise.resolve(false),
    // Cuántos repartidores disponibles cubren sus zonas (ENVIO-200). El negocio sale de la sesión, no del navegador.
    business.courier_delivery
      ? getBusinessAvailability(business.id)
      : Promise.resolve({ enabled: false, total: 0, emptyZoneIds: [] }),
    // A los cuántos minutos sin ofertas se destaca "Nadie ofertó todavía" (ENVIO-241): un valor de toda la plataforma.
    business.courier_delivery ? getManualAssignMinutes() : Promise.resolve(undefined),
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
        delivery: manualDeliveryContext(delivery, own),
      }}
      serverNow={new Date().toISOString()}
      couriers={
        own?.delivery.courier?.active
          ? [{ id: own.delivery.courier.id, name: own.delivery.courier.name, whatsapp: null, zone_ids: [], own: true }]
          : (delivery?.couriers ?? [])
      }
      offers={offers}
      assignMinutes={assignMinutes}
      suggestedPrepMinutes={suggestedPrep}
      defaultPrepMinutes={prepSettings.defaultPrepMinutes}
      vehicleEnabled={vehicleEnabled}
      canAskForCar={!delivery?.vehicles || (delivery.vehicles.moto && delivery.vehicles.auto)}
      availability={availability}
    />
  );
}
