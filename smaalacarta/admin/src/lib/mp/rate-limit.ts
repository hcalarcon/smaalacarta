// Freno básico por clave (MP-5): una consulta cada `minIntervalMs`. Vive en la memoria de la instancia,
// así que en serverless es un freno aproximado; alcanza para que un cliente que recarga sin parar no
// dispare una consulta a Mercado Pago por cada recarga.
export function createRateLimiter(minIntervalMs: number, maxKeys = 5000) {
  const last = new Map<string, number>();

  return {
    allow(key: string, now: number) {
      const previous = last.get(key);
      if (previous !== undefined && now - previous < minIntervalMs) return false;

      if (last.size >= maxKeys) {
        for (const [k, at] of last) if (now - at >= minIntervalMs) last.delete(k);
        if (last.size >= maxKeys) last.clear();
      }

      last.set(key, now);
      return true;
    },
  };
}
