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
