"use client";

import { useSettingsSave } from "./SettingsSaveProvider";
import {
  createZoneAction,
  deleteZoneAction,
  reorderZonesAction,
  setZoneActiveAction,
  updateZoneAction,
} from "../actions";
import BusinessZonesEditor from "@/components/delivery/BusinessZonesEditor";
import Section from "@/components/ui/Section";
import type { BusinessZone } from "@/lib/db/business-zones";
import type { OwnDelivery } from "@/lib/db/own-delivery";

// Envíos con envío propio (ENVIO-260): el local carga sus zonas y precios, ve a su repartidor propio y puede dejar de
// ofrecer el envío cuando su repartidor no está. Las zonas se guardan al tocar, como la lista de productos; el
// interruptor "Ofrecer envío" es el mismo "Delivery" de Entrega y pago y se guarda con "Guardar cambios".
export default function OwnDeliverySection({
  delivery,
  zones,
}: {
  delivery: OwnDelivery;
  zones: BusinessZone[];
}) {
  const { deliveryEnabled, setDeliveryEnabled } = useSettingsSave();

  const priced = zones.filter((zone) => zone.active && zone.price !== null).length;
  const courier = delivery.courier?.active ? delivery.courier : null;

  return (
    <Section
      id="envios"
      title="Envíos"
      description="Tus zonas y precios de envío, y tu repartidor propio."
    >
      <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
        <input
          type="checkbox"
          checked={deliveryEnabled ?? true}
          onChange={(event) => setDeliveryEnabled(event.target.checked)}
          className="h-5 w-5"
        />
        <span>
          <span className="block font-medium text-stone-900">Ofrecer envío</span>
          <span className="block text-sm text-stone-500">
            Si tu repartidor no está disponible, desactivalo: tus clientes solo verán el retiro. Se guarda con
            &ldquo;Guardar cambios&rdquo;.
          </span>
        </span>
      </label>

      {priced === 0 ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Cargá tus zonas y precios para que tus clientes vean el costo del envío.
        </p>
      ) : null}

      {courier ? null : (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Todavía no tenés repartidor asignado: los envíos los llevás vos.
        </p>
      )}

      <div>
        <p className="mb-1.5 block text-sm font-medium text-brand">Repartidor propio</p>
        <p className="rounded-xl border border-line bg-cream px-4 py-3 text-base text-stone-900">
          {courier?.name ?? "Sin asignar"}
        </p>
        <p className="mt-1.5 text-sm text-stone-500">
          Los pedidos con envío van directo a él, con el precio de la zona. Lo asigna el equipo de SMA a la Carta.
        </p>
      </div>

      <div>
        <p className="mb-1.5 block text-sm font-medium text-brand">Zonas y precios</p>
        <p className="mb-3 text-sm text-stone-500">
          Tus clientes eligen entre estas zonas al pedir un envío. Una zona sin precio o desactivada no se ofrece. Si
          no cargás ninguna, el costo se coordina con el cliente y lo cargás vos en cada pedido.
        </p>
        <BusinessZonesEditor
          zones={zones}
          readOnly={false}
          api={{
            create: createZoneAction,
            update: updateZoneAction,
            setActive: setZoneActiveAction,
            remove: deleteZoneAction,
            reorder: reorderZonesAction,
          }}
        />
      </div>
    </Section>
  );
}
