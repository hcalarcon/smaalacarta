// Evidencia de un paso que falló: captura y HTML de las tres pantallas, el pedido en la base y el trace
// de Playwright de cada una. Queda en <salida>/fallo/ para decidir el arreglo mirando, no adivinando.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { pedidosDemo } from "./borrar.mjs";

async function estadoDelPedido(service, numero) {
  try {
    const demo = await pedidosDemo(service);
    const id = demo.find((o) => o.order_number === numero)?.id ?? demo.at(-1)?.id;
    if (!id) return { aviso: "No encontré el pedido demo en la base." };

    const { data: pedido, error } = await service.from("orders").select("*").eq("id", id).maybeSingle();
    if (error) return { error: error.message };
    const { data: eventos } = await service
      .from("order_events")
      .select("status, kind, note, changed_by, created_at")
      .eq("order_id", id)
      .order("created_at");
    const { data: ofertas } = await service.from("courier_offers").select("courier_id, price, created_at, closed_at").eq("order_id", id);

    return {
      resumen: {
        status: pedido?.status,
        courier_status: pedido?.courier_status,
        courier_id: pedido?.courier_id,
        courier_requested_at: pedido?.courier_requested_at,
        courier_responded_at: pedido?.courier_responded_at,
        courier_eta_pickup_at: pedido?.courier_eta_pickup_at,
        courier_eta_dropoff_at: pedido?.courier_eta_dropoff_at,
        prep_ready_at: pedido?.prep_ready_at,
        updated_at: pedido?.updated_at,
      },
      pedido,
      eventos,
      ofertas,
    };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

export async function guardarFallo({ salida, paso, error, paginas, contextos, service, numero }) {
  const dir = path.join(salida, "fallo");
  await mkdir(dir, { recursive: true });

  await writeFile(path.join(dir, "fallo.txt"), `Paso: ${paso}\n\n${error?.message ?? error}\n`);
  await writeFile(
    path.join(dir, "pedido.json"),
    JSON.stringify(await estadoDelPedido(service, numero), null, 2),
  );

  for (const [nombre, page] of Object.entries(paginas)) {
    await page.screenshot({ path: path.join(dir, `${nombre}.png`) }).catch(() => {});
    const html = await page.content().catch(() => "");
    await writeFile(path.join(dir, `${nombre}.html`), html);
  }
  for (const [nombre, context] of Object.entries(contextos)) {
    await context.tracing.stop({ path: path.join(dir, `trace-${nombre}.zip`) }).catch(() => {});
  }
}
