// A quién le llega el aviso de "pedido nuevo" cuando el pedido necesita auto (ENVIO-177): solo a los repartidores
// que marcaron Auto, igual que la lista y que `courier_sees_order()`. Con el interruptor del vehículo apagado, o si
// el pedido no pide auto, no se filtra a nadie.
export function withCarIfNeeded<T extends { id: string; auto: boolean }>(
  couriers: T[],
  rule: { needsCar: boolean; enabled: boolean },
): T[] {
  if (!rule.enabled || !rule.needsCar) return couriers;

  return couriers.filter((courier) => courier.auto);
}

// Y con los vehículos del negocio (ENVIO-204): solo les avisa a los repartidores que tienen al menos uno de los
// vehículos con los que trabaja el local, igual que `courier_vehicle_ok()`. Apagado el interruptor, no filtra.
export function withBusinessVehicles<T extends { moto: boolean; auto: boolean }>(
  couriers: T[],
  rule: { enabled: boolean; business: { moto: boolean; auto: boolean } },
): T[] {
  if (!rule.enabled) return couriers;

  return couriers.filter((courier) => (courier.moto && rule.business.moto) || (courier.auto && rule.business.auto));
}
