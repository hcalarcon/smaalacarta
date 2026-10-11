import { asUser, type QueryResult, type TestDb } from "./db";

// Ayudas de los tests del circuito de ofertas (ENVIO-95 en adelante).

const text = (value: string | null) => (value === null ? "null" : "'" + value.replace(/'/g, "''") + "'");

// El repartidor `user` oferta por el pedido: con el precio de lista si no dice otro.
export async function offer(
  db: TestDb,
  user: string | null,
  orderId: string,
  price: number | null = null,
  reason: string | null = null,
): Promise<QueryResult> {
  const list = (
    await db.query<{ p: string | null }>("select delivery_fee_list as p from orders where id = $1", [orderId])
  ).rows[0]?.p;

  return asUser(
    db,
    user,
    `select public.courier_make_offer('${orderId}', ${price ?? Number(list ?? 0)}, ${text(reason)})`,
  );
}

// El cliente (sin sesión, con el código del pedido) elige la oferta de ese repartidor.
export async function choose(db: TestDb, courierUser: string, orderId: string): Promise<QueryResult> {
  const found = (
    await db.query<{ code: string; id: string }>(
      `select o.code, f.id
       from orders o
       join courier_offers f on f.order_id = o.id
       join courier_users cu on cu.courier_id = f.courier_id
       where o.id = $1 and cu.user_id = $2`,
      [orderId, courierUser],
    )
  ).rows[0];

  if (!found) return { ok: false, error: "el repartidor no tiene oferta en ese pedido", code: "TEST" };

  return asUser(db, null, `select public.public_choose_courier('${found.code}', '${found.id}')`);
}

// Atajo de los tests viejos: el repartidor oferta y el cliente lo elige. Devuelve el primer error.
export async function take(
  db: TestDb,
  courierUser: string,
  orderId: string,
  price: number | null = null,
  reason: string | null = null,
): Promise<QueryResult> {
  const made = await offer(db, courierUser, orderId, price, reason);
  if (!made.ok) return made;
  return choose(db, courierUser, orderId);
}
