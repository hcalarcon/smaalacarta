// El vehículo del repartidor en el seguimiento (ENVIO-178). Solo lógica: el ícono sale de `icons.js` y el texto se
// pinta con textContent. La base manda `vehiculo` únicamente con el interruptor del vehículo prendido; si falta o
// viene roto, no se muestra nada.

import { t } from "../../menu-app/lib/i18n.js";

const VEHICLES = ["moto", "auto"];

// ["moto", "auto"] tal como llega, sin repetidos y en ese orden. Todo lo que no sea moto o auto se descarta.
export function normalizeVehicles(value) {
  if (!Array.isArray(value)) return [];

  return VEHICLES.filter((vehicle) => value.includes(vehicle));
}

// El texto que acompaña al ícono, para lectores de pantalla y para el título: "Moto", "Auto" o "Moto y auto".
export function vehicleLabel(vehicles, lang) {
  if (!Array.isArray(vehicles) || vehicles.length === 0) return "";

  return vehicles.length > 1 ? t("tracker.vehicle.both", lang) : t(`tracker.vehicle.${vehicles[0]}`, lang);
}
