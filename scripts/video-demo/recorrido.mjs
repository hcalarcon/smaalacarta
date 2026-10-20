// El recorrido: tres navegadores a la vez (cliente, local y repartidor), cada uno grabando su video.
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

import { CURSOR_SCRIPT } from "./cursor.mjs";
import { clienteServicio } from "./db.mjs";
import { CLIENTE, SLUG, ZONA, planGroup } from "./demo.mjs";
import { guardarFallo } from "./fallo.mjs";
import { crearRegistro } from "./pasos.mjs";
import { REALTIME_SCRIPT, crearBitacora, vigilarRLS } from "./realtime.mjs";
import {
  ESPERA,
  ESPERA_PANEL,
  ESPERA_SEGUIMIENTO,
  dormir,
  elegir,
  escapar,
  escribir,
  esperar,
  esperarDialogo,
  esperarOculto,
  pausa,
  tocar,
  verTexto,
} from "./acciones.mjs";
import { URL_ADMIN, URL_WEB } from "./preflight.mjs";

const CELULAR = { width: 390, height: 844 };
const ESCRITORIO = { width: 1280, height: 800 };

// Dónde abre cada ventana, para que se vean las tres juntas mientras graba.
const VENTANAS = {
  cliente: { viewport: CELULAR, x: 0 },
  repartidor: { viewport: CELULAR, x: 420 },
  local: { viewport: ESCRITORIO, x: 840 },
};

// El seguimiento no tiene rutas de Vercel en `serve`: /pedido/<código> se resuelve con la misma página.
const RUTA_PEDIDO = /^http:\/\/localhost:8000\/pedido\/[^/?#]+/;
const WHATSAPP = /^https?:\/\/(api\.whatsapp\.com|wa\.me)\//;

async function iniciarSesionAdmin(browser, { email, password }, quien) {
  const context = await browser.newContext({ locale: "es-AR" });
  try {
    const page = await context.newPage();
    await page.goto(`${URL_ADMIN}/admin/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    try {
      await page.waitForURL(/\/admin\/(dashboard|repartidor)/, { timeout: ESPERA });
    } catch {
      throw new Error(
        `La cuenta del ${quien} no entró al panel (¿contraseña temporal sin cambiar o datos incorrectos?). Estaba en ${new URL(page.url()).pathname}.`,
      );
    }
    return await context.storageState();
  } finally {
    await context.close();
  }
}

// Si el negocio pregunta la zona al entrar, se contesta como lo haría un cliente.
async function elegirZona(page) {
  const tarjeta = page.locator("#zona-card");
  const aparece = await tarjeta
    .getByRole("button", { name: "Envío", exact: true })
    .waitFor({ state: "visible", timeout: 3000 })
    .then(
      () => true,
      () => false,
    );
  if (!aparece) return;

  await pausa();
  await tocar(page, tarjeta.getByRole("button", { name: "Envío", exact: true }));
  await escribir(page, tarjeta.getByRole("searchbox", { name: "Buscar tu barrio" }), ZONA);
  await tocar(page, tarjeta.getByRole("button", { name: new RegExp(escapar(ZONA), "i") }).first());
  await pausa();
  const sigue = await tarjeta.getByRole("button", { name: "Cerrar" }).isVisible();
  if (sigue) await tocar(page, tarjeta.getByRole("button", { name: "Cerrar" }));
}

async function agregarSimple(page, { item, categoria }) {
  await tocar(page, page.locator("#categorias").getByRole("button", { name: categoria, exact: true }));
  await pausa();
  const tarjeta = page.locator(".producto").filter({ has: page.getByRole("heading", { name: item.nombre, exact: true }) });
  await tocar(page, tarjeta.first().getByRole("button", { name: "+", exact: true }));
  await pausa(600, 1000);
}

async function agregarConOpciones(page, { item, categoria }) {
  await tocar(page, page.locator("#categorias").getByRole("button", { name: categoria, exact: true }));
  await pausa();
  const tarjeta = page.locator(".producto").filter({ has: page.getByRole("heading", { name: item.nombre, exact: true }) });
  await tocar(page, tarjeta.first().getByRole("button", { name: "+", exact: true }));

  const hoja = page.getByRole("dialog", { name: item.nombre, exact: true });
  await esperarDialogo(hoja);
  await pausa();

  for (const group of item.opciones) {
    // El nombre accesible del grupo lleva pegada la regla («Salsa» + «Obligatorio…»).
    const grupo = hoja.getByRole("group", { name: new RegExp(`^${escapar(group.nombre)}(?![a-záéíóúñ])`) }).first();
    for (const { nombre, veces } of planGroup(group) ?? []) {
      if (group.repetir) {
        for (let i = 0; i < veces; i += 1) {
          await tocar(page, grupo.getByRole("button", { name: `Sumar ${nombre}`, exact: true }));
        }
      } else {
        await tocar(page, grupo.getByText(nombre, { exact: true }).first());
      }
      await pausa(600, 1000);
    }
  }

  await tocar(page, hoja.getByRole("button", { name: /^Agregar/ }));
  await esperarOculto(hoja);
  await pausa(600, 1000);
}

async function completarCheckout(page) {
  const checkout = page.getByRole("dialog", { name: "Finalizar pedido" });
  await esperarDialogo(checkout);
  await pausa();

  await escribir(page, checkout.getByPlaceholder("Nombre y Apellido"), CLIENTE.nombre);
  await escribir(page, checkout.getByPlaceholder("Teléfono de contacto"), CLIENTE.telefono);

  const entrega = checkout.locator('select[name="entrega"]');
  if ((await entrega.inputValue()) !== "delivery") await elegir(page, entrega, "delivery");

  const barrio = checkout.locator('select[name="barrio"]');
  const centro = await barrio.locator("option").filter({ hasText: new RegExp(`^\\s*${escapar(ZONA)}\\b`, "i") }).first().getAttribute("value");
  if (!centro) throw new Error(`El barrio ${ZONA} no está en las opciones del checkout.`);
  if ((await barrio.inputValue()) !== centro) await elegir(page, barrio, centro);

  await escribir(page, checkout.getByPlaceholder("Dirección (calle y número)"), CLIENTE.direccion);

  const pago = checkout.locator('select[name="pago"]');
  const valores = await pago.locator("option").evaluateAll((options) => options.filter((o) => o.value && !o.disabled).map((o) => o.value));
  await elegir(page, pago, valores.includes("efectivo") ? "efectivo" : valores[0]);

  await escribir(page, checkout.getByPlaceholder("Notas"), CLIENTE.notas);
  await pausa();
  return checkout;
}

// Corre el recorrido completo. Devuelve { registro, videos, error }; los videos quedan guardados aunque falle.
export async function grabar({ salida, supabase, serviceKey, cuentas, datos, headless = false }) {
  const tmp = path.join(salida, "_tmp");
  await mkdir(tmp, { recursive: true });

  const browsers = {};
  const contextos = {};
  const paginas = {};
  const origenes = {};
  const estado = { numero: null, pedidoId: null, detenerRLS: null };
  let bitacora = null;
  let registro;
  let error = null;

  try {
    for (const [nombre, { viewport, x }] of Object.entries(VENTANAS)) {
      browsers[nombre] = await chromium.launch({
        headless,
        args: [`--window-position=${x},0`, `--window-size=${viewport.width},${viewport.height + 130}`],
      });
    }

    const sesiones = {
      local: await iniciarSesionAdmin(browsers.local, { email: cuentas.localEmail, password: cuentas.localPassword }, "local"),
      repartidor: await iniciarSesionAdmin(
        browsers.repartidor,
        { email: cuentas.repartidorEmail, password: cuentas.repartidorPassword },
        "repartidor",
      ),
    };

    for (const [nombre, { viewport }] of Object.entries(VENTANAS)) {
      const context = await browsers[nombre].newContext({
        viewport,
        screen: viewport,
        deviceScaleFactor: 1,
        isMobile: nombre !== "local",
        hasTouch: false,
        locale: "es-AR",
        timezoneId: "America/Argentina/Buenos_Aires",
        serviceWorkers: "block",
        storageState: sesiones[nombre],
        recordVideo: { dir: path.join(tmp, nombre), size: viewport },
      });
      await context.tracing.start({ screenshots: true, snapshots: true });
      await context.addInitScript(CURSOR_SCRIPT);
      if (nombre !== "cliente") await context.addInitScript(REALTIME_SCRIPT);
      // Ningún WhatsApp real: ni el del checkout ni el del seguimiento.
      await context.route(WHATSAPP, (route) => route.abort());
      contextos[nombre] = context;
    }

    // `web/` en local cae en la base de producción: se le da la de dev (menú y seguimiento comparten el módulo).
    const configDev = `export const SUPABASE = ${JSON.stringify({ url: supabase.url, key: supabase.key })};`;
    await contextos.cliente.route("**/apps/menu-app/supabase-config.js", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: configDev }),
    );
    await contextos.cliente.route(RUTA_PEDIDO, async (route) => {
      const res = await fetch(`${URL_WEB}/apps/tracker/index.html`);
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: await res.text() });
    });
    for (const nombre of Object.keys(VENTANAS)) {
      origenes[nombre] = Date.now();
      paginas[nombre] = await contextos[nombre].newPage();
    }
    registro = crearRegistro(origenes);
    bitacora = crearBitacora(origenes);
    for (const nombre of ["local", "repartidor"]) bitacora.mirar(nombre, paginas[nombre]);

    // Una ventana nueva (el placeholder de WhatsApp en PC) no es parte del recorrido.
    contextos.cliente.on("page", (popup) => {
      popup.close().catch(() => {});
    });

    await recorrer({ registro, paginas, datos, supabase, serviceKey, estado, bitacora, cuentas });
  } catch (err) {
    // Dónde estaba cada pantalla ayuda a ver qué faltó (sin sesión, términos pendientes, otra ruta…).
    const donde = [];
    for (const [nombre, page] of Object.entries(paginas)) {
      const ruta = page.url().replace(/^https?:\/\/[^/]+/, "") || "(vacía)";
      // Con tarjetas (pedidos), lo que dicen: es lo que más ayuda a ver en qué estado quedó.
      const texto = await page
        .evaluate(() => {
          const tarjetas = [...document.querySelectorAll("article")].map((a) => a.innerText);
          return tarjetas.length ? tarjetas.join(" | ") : (document.body?.innerText ?? "");
        })
        .catch(() => "");
      donde.push(`${nombre}: ${ruta} «${texto.replace(/\s+/g, " ").slice(0, 260)}»`);
    }
    try {
      await guardarFallo({
        salida,
        paso: err.message.split(":")[0],
        error: err,
        paginas,
        contextos,
        service: clienteServicio(supabase.url, serviceKey),
        numero: estado.numero,
      });
    } catch (e) {
      console.error(`No pude guardar la evidencia del fallo: ${e.message}`);
    }
    err.message = `${err.message} [pantallas → ${donde.join(" · ")}]`;
    error = err;
  }

  await estado.detenerRLS?.().catch(() => {});
  await bitacora?.guardar(salida).catch(() => {});

  // Cerrar los contextos es lo que termina de escribir los videos.
  const videos = {};
  for (const nombre of Object.keys(contextos)) await contextos[nombre].close().catch(() => {});
  for (const nombre of Object.keys(paginas)) {
    const destino = path.join(salida, `${nombre}.webm`);
    try {
      await paginas[nombre].video().saveAs(destino);
      videos[nombre] = destino;
    } catch {
      /* sin video de esta pantalla */
    }
  }
  for (const nombre of Object.keys(browsers)) await browsers[nombre].close().catch(() => {});
  await rm(tmp, { recursive: true, force: true });

  return { registro, videos, error };
}

// Cuánto tarda el panel del repartidor en mostrar un cambio del local. `desde_click` incluye lo que tarda la
// acción del local en llegar a la base (cota superior); `desde_base` usa la hora del evento en la base.
async function medirLatencia({ registro, service, pedidoId, evento, estadoPedido, clickMs, vistoMs }) {
  const { data } = await service
    .from("order_events")
    .select("created_at")
    .eq("order_id", pedidoId)
    .eq("status", estadoPedido)
    .order("created_at", { ascending: false })
    .limit(1);
  const base = data?.[0] ? new Date(data[0].created_at).getTime() : null;
  registro.latencias.push({
    evento,
    desde_click_ms: vistoMs - clickMs,
    desde_base_ms: base === null ? null : vistoMs - base,
  });
}

async function recorrer({ registro, paginas, datos, supabase, serviceKey, estado, bitacora, cuentas }) {
  const { cliente, local, repartidor } = paginas;
  const { paso } = registro;
  const negocio = datos.negocio.name;
  const { conOpciones, simples } = datos.productos;
  let numero;

  // Las pantallas del equipo ya están abiertas cuando el cliente empieza.
  await paso("paneles", "El local y el repartidor tienen su panel abierto", async () => {
    await Promise.all([
      local.goto(`${URL_ADMIN}/admin/dashboard/orders`),
      repartidor.goto(`${URL_ADMIN}/admin/repartidor`),
    ]);
    await Promise.all([
      // Sin pedidos el tablero no muestra columnas: se espera el botón de la pantalla.
      esperar(local.getByRole("button", { name: "+ Pedido manual" })),
      esperar(repartidor.getByRole("heading", { name: "Disponibles" })),
    ]);
    await pausa(1500, 2200);
  });

  await paso("menu-abre", `El cliente abre el menú de ${negocio}`, async () => {
    // La base dev a veces corta `public_menu` por tiempo y el menú dice «No encontramos este menú»: se recarga.
    const categorias = cliente.locator("#categorias").getByRole("button");
    const noEncontrado = cliente.getByText("No encontramos este menú");
    for (let intento = 1; ; intento += 1) {
      await cliente.goto(`${URL_WEB}/apps/menu-app/?cliente=${SLUG}`);
      await esperar(categorias.or(noEncontrado));
      if (!(await noEncontrado.isVisible()) || intento >= 3) break;
      await dormir(2000);
    }
    await esperarOculto(cliente.locator("#loader"));
    await esperar(categorias);
    await elegirZona(cliente);
    await pausa(1500, 2200);
  });

  await paso("menu-categorias", "El cliente mira las categorías", async () => {
    const botones = cliente.locator("#categorias").getByRole("button");
    const cantidad = Math.min(await botones.count(), 3);
    for (let i = 0; i < cantidad; i += 1) {
      await tocar(cliente, botones.nth(i));
      await pausa();
    }
  });

  await paso("producto-opciones", `El cliente abre ${conOpciones.item.nombre} y elige sus opciones`, () =>
    agregarConOpciones(cliente, conOpciones),
  );

  for (const [i, producto] of simples.entries()) {
    await paso(`producto-${i + 2}`, `El cliente agrega ${producto.item.nombre}`, () => agregarSimple(cliente, producto));
  }

  await paso("carrito", "El cliente revisa su pedido", async () => {
    // Moderna y Minimalista tienen «Carrito (N)» en la barra de abajo; Clásica, el botón flotante (sin texto).
    const carrito = cliente.getByRole("button", { name: /^Carrito( \(\d+\))?$/ }).or(cliente.locator("#btn-carrito"));
    await tocar(cliente, carrito.filter({ visible: true }).first());
    await esperarDialogo(cliente.getByRole("dialog", { name: "Tu pedido" }));
    await pausa(1800, 2400);
  });

  await paso("checkout", "El cliente completa sus datos de envío", async () => {
    await tocar(cliente, cliente.getByRole("button", { name: "Enviar pedido" }));
    await completarCheckout(cliente);
  });

  await paso("confirma", "El cliente confirma el pedido", async () => {
    await tocar(cliente, cliente.getByRole("dialog", { name: "Finalizar pedido" }).getByRole("button", { name: "Confirmar pedido" }));
    await cliente.waitForURL(RUTA_PEDIDO, { timeout: 30_000 });
  });

  // El envío se empieza a buscar recién cuando el local acepta (ENVIO-155): antes el seguimiento dice que espera.
  await paso("recibido", "El cliente ve su pedido recibido, esperando al local", async () => {
    await verTexto(cliente, "Recibimos tu pedido");
    // El pedido se identifica por el código de la URL de seguimiento, no por el marcado demo.
    const codigo = new URL(cliente.url()).pathname.split("/").pop();
    const service = clienteServicio(supabase.url, serviceKey);
    const { data: pedido } = await service.from("orders").select("id, order_number").eq("code", codigo).maybeSingle();
    if (!pedido) throw new Error("No encontré en la base el pedido que acaba de crear el cliente.");
    numero = pedido.order_number;
    estado.detenerRLS = await vigilarRLS({ supabase, cuentas, pedidoId: pedido.id, bitacora });
    estado.numero = numero;
    estado.pedidoId = pedido.id;
    await pausa(1500, 2200);
  });

  // El texto de la tarjeta pega «#9» con el nombre del cliente: no hay \b, se pide que no siga otro dígito.
  const tarjetaLocal = () => local.locator("article").filter({ hasText: new RegExp(`#${numero}(?!\\d)`) });
  const tarjetaRepartidor = () => repartidor.locator("article").filter({ hasText: new RegExp(`#${numero} · ${escapar(negocio)}`) });

  await paso("local-recibe", "Al local le entra el pedido", async () => {
    await esperar(local.getByRole("alertdialog").or(tarjetaLocal()), ESPERA_PANEL);
    await pausa(1800, 2400);
  });

  await paso("local-acepta", "El local acepta el pedido con una demora", async () => {
    const alerta = local.getByRole("alertdialog");
    const origen = (await alerta.isVisible()) ? alerta : tarjetaLocal();
    await tocar(local, origen.getByRole("button", { name: "Aceptar", exact: true }));
    const selector = local.getByRole("dialog", { name: /Aceptar pedido/ });
    await esperarDialogo(selector);
    await pausa();
    await tocar(local, selector.getByRole("button", { name: "20 min", exact: true }));
    await pausa(800, 1200);
    await tocar(local, selector.getByRole("button", { name: /^Aceptar con/ }));
    const clickMs = Date.now();
    const visto = esperar(tarjetaRepartidor(), ESPERA_PANEL).then(() => Date.now());
    await esperarOculto(selector);
    await medirLatencia({
      registro,
      service: clienteServicio(supabase.url, serviceKey),
      pedidoId: estado.pedidoId,
      evento: "El local acepta → el pedido aparece en Disponibles del repartidor",
      estadoPedido: "confirmed",
      clickMs,
      vistoMs: await visto,
    });
    await verTexto(cliente, "Pedido confirmado");
    await verTexto(cliente, "Buscando repartidor");
    await pausa(1500, 2200);
  });

  await paso("repartidor-ve", "El repartidor lo ve en Disponibles", async () => {
    await esperar(tarjetaRepartidor(), ESPERA_PANEL);
    await tarjetaRepartidor().first().scrollIntoViewIfNeeded();
    await pausa(1800, 2400);
  });

  await paso("repartidor-toma", "El repartidor toma el pedido", async () => {
    await tocar(repartidor, tarjetaRepartidor().first().getByRole("button", { name: /^Tomar/ }), ESPERA_PANEL);
    await esperar(tarjetaRepartidor().getByText(/Cuando el local te lo entregue/), ESPERA_PANEL);
    await esperar(cliente.getByText(/Lo lleva |Ya tiene repartidor/), ESPERA_SEGUIMIENTO);
    await pausa();
  });

  await paso("local-prepara", "El local pasa el pedido a preparación", async () => {
    await tocar(local, tarjetaLocal().first().getByRole("button", { name: "Preparar", exact: true }), ESPERA_PANEL);
    await verTexto(cliente, "Estamos preparando tu pedido");
    await pausa();
  });

  await paso("local-listo", "El local marca el pedido como listo", async () => {
    await tocar(local, tarjetaLocal().first().getByRole("button", { name: "Marcar listo", exact: true }), ESPERA_PANEL);
    await verTexto(cliente, "¡Tu pedido está listo!");
    await pausa();
  });

  await paso("local-entrega", "El local se lo entrega al repartidor", async () => {
    await tocar(local, tarjetaLocal().first().getByRole("button", { name: "Entregar al repartidor", exact: true }), ESPERA_PANEL);
    const clickMs = Date.now();
    const visto = esperar(
      tarjetaRepartidor().first().getByRole("button", { name: "En camino", exact: true }),
      ESPERA_PANEL,
    ).then(() => Date.now());
    await medirLatencia({
      registro,
      service: clienteServicio(supabase.url, serviceKey),
      pedidoId: estado.pedidoId,
      evento: "El local entrega → el repartidor ve el botón En camino",
      estadoPedido: "handed_to_courier",
      clickMs,
      vistoMs: await visto,
    });
    await verTexto(cliente, "Tu pedido salió del local");
    await pausa();
  });

  await paso("repartidor-en-camino", "El repartidor sale hacia el cliente", async () => {
    await tocar(repartidor, tarjetaRepartidor().first().getByRole("button", { name: "En camino", exact: true }), ESPERA_PANEL);
    await verTexto(cliente, "Tu pedido está en camino");
    await pausa(1800, 2400);
  });

  await paso("repartidor-entrega", "El repartidor entrega el pedido", async () => {
    await tocar(repartidor, tarjetaRepartidor().first().getByRole("button", { name: "Entregado", exact: true }), ESPERA_PANEL);
    await verTexto(cliente, "Pedido entregado");
  });

  await paso("fin", "El cliente ve su pedido entregado", async () => {
    await dormir(3500);
  });
}
