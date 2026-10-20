// Chequeos antes de grabar: avisa en castellano todo lo que falte, de una vez.
import { clienteAnonimo, clienteServicio, iniciarSesion } from "./db.mjs";
import { BUSINESS_ID, SLUG, ZONA, pickProducts } from "./demo.mjs";
import { pedidosDemo } from "./borrar.mjs";
import { closedNotice } from "../../smaalacarta/web/apps/menu-app/lib/info.js";
import { normalizePublicMenu } from "../../smaalacarta/web/apps/menu-app/lib/public-menu.js";
import { isOpenNow } from "../../smaalacarta/web/apps/menu-app/lib/schedule.js";

export const URL_ADMIN = "http://localhost:3000";
export const URL_WEB = "http://localhost:8000";

// El repartidor se apaga solo a las 4 h sin actividad (courier_available_now): se pide margen.
const MARGEN_ACTIVIDAD_MS = 3.5 * 60 * 60 * 1000;
const LIMITE_ACTIVIDAD_MS = 4 * 60 * 60 * 1000;

async function responde(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function chequearServidores(problemas) {
  if (!(await responde(`${URL_ADMIN}/admin/login`))) {
    problemas.push("El admin no está levantado en localhost:3000. Corré `npm run dev` en smaalacarta/admin.");
  }
  if (!(await responde(`${URL_WEB}/apps/menu-app/index.html`))) {
    problemas.push("El servidor de web/ no está levantado en localhost:8000. Corré `npx serve . -l 8000` en smaalacarta/web.");
  }
}

// Devuelve { problemas, datos }. `datos` trae lo que el recorrido necesita saber del negocio y del menú.
export async function chequear({ url, key, serviceKey, cuentas, otrosRepartidores }) {
  const problemas = [];
  const datos = {};

  await chequearServidores(problemas);

  const service = clienteServicio(url, serviceKey);
  const anon = clienteAnonimo(url, key);

  // Negocio
  const { data: negocio } = await service.from("businesses").select("id, name, slug").eq("id", BUSINESS_ID).maybeSingle();
  if (!negocio) {
    problemas.push(`No existe el negocio ${BUSINESS_ID} en la base dev.`);
    return { problemas, datos };
  }
  if (negocio.slug !== SLUG) {
    problemas.push(`El negocio ${BUSINESS_ID} tiene el slug «${negocio.slug}», no «${SLUG}».`);
  }
  datos.negocio = negocio;

  // Modo de envíos
  const { data: plataforma } = await service
    .from("platform_settings")
    .select("delivery_mode, courier_terms_required, courier_terms_version")
    .maybeSingle();
  if (plataforma?.delivery_mode !== "fixed") {
    problemas.push("Los envíos no están en precio fijo. Cambialo en /superadmin (modo de envíos) y volvé a correr.");
  }

  // Zona Centro y que Santa Julia le envíe
  const { data: zonas } = await service
    .from("delivery_zones")
    .select("id, name")
    .ilike("name", `${ZONA}%`)
    .eq("active", true)
    .order("name")
    .limit(1);
  const zona = zonas?.[0] ?? null;
  if (!zona) {
    problemas.push(`No hay una zona de envío activa que empiece con «${ZONA}».`);
  } else {
    const { data: envio } = await service
      .from("business_delivery_zones")
      .select("zone_id")
      .eq("business_id", BUSINESS_ID)
      .eq("zone_id", zona.id)
      .maybeSingle();
    if (!envio) problemas.push(`${negocio.name} no tiene envío a ${ZONA}. Sumalo en Configuración.`);
  }

  // Menú público: publicado, abierto y con productos para armar el pedido
  // A veces la base dev corta la consulta por tiempo: se reintenta antes de dar el menú por ausente.
  let publico = null;
  let falloMenu = null;
  for (let intento = 0; intento < 4 && !publico; intento += 1) {
    if (intento > 0) await new Promise((resolve) => setTimeout(resolve, 3000));
    const res = await anon.rpc("public_menu", { p_slug: SLUG, p_via_path: false, p_static: false });
    publico = res.data;
    falloMenu = res.error?.message ?? null;
  }
  const menu = normalizePublicMenu(publico);
  if (!menu) {
    problemas.push(
      `${negocio.name} no devuelve menú público (${falloMenu ?? "vacío"}): revisá que esté publicado y con el plan completo.`,
    );
  } else {
    if (closedNotice(menu.config)) problemas.push(`${negocio.name} tiene un cierre temporal activo.`);
    else if (!isOpenNow(menu.config.horarios)) problemas.push(`${negocio.name} está cerrado según sus horarios.`);

    datos.productos = pickProducts(menu.menu);
    if (!datos.productos.conOpciones) problemas.push("No hay ningún producto con opciones que se pueda pedir en el menú.");
    if (datos.productos.simples.length < 2) problemas.push("Hacen falta al menos dos productos sin opciones y con stock.");
  }

  // Pedidos demo de otra corrida: confundirían las tarjetas
  const viejos = await pedidosDemo(service);
  if (viejos.length > 0) {
    problemas.push(`Hay ${viejos.length} pedido(s) demo de una corrida anterior. Borralos con \`npm run video-demo -- --borrar\`.`);
  }

  // Cuenta del local
  try {
    const { client, user } = await iniciarSesion(url, key, cuentas.localEmail, cuentas.localPassword, "local");
    const { data: miembro } = await client
      .from("business_users")
      .select("business_id")
      .eq("user_id", user.id)
      .eq("business_id", BUSINESS_ID)
      .maybeSingle();
    if (!miembro) problemas.push(`La cuenta DEMO_LOCAL_EMAIL no es del negocio ${negocio.name}.`);
    await client.auth.signOut();
  } catch (error) {
    problemas.push(error.message);
  }

  // Cuenta del repartidor
  try {
    const { client, user } = await iniciarSesion(url, key, cuentas.repartidorEmail, cuentas.repartidorPassword, "repartidor");
    await chequearRepartidor({ service, client, user, zona, plataforma, problemas, datos, otrosRepartidores });
    await client.auth.signOut();
  } catch (error) {
    problemas.push(error.message);
  }

  return { problemas, datos };
}

async function chequearRepartidor({ service, client, user, zona, plataforma, problemas, datos, otrosRepartidores }) {
  const { data: vinculo } = await service.from("courier_users").select("courier_id").eq("user_id", user.id).maybeSingle();
  if (!vinculo) {
    problemas.push("La cuenta DEMO_REPARTIDOR_EMAIL no es de ningún repartidor.");
    return;
  }

  const { data: repartidor } = await service.from("couriers").select("id, name, active").eq("id", vinculo.courier_id).maybeSingle();
  if (!repartidor?.active) problemas.push("El repartidor de la demo está inactivo.");
  datos.repartidor = repartidor;

  if (zona) {
    const { data: cubre } = await service
      .from("courier_zone_coverage")
      .select("zone_id")
      .eq("courier_id", vinculo.courier_id)
      .eq("zone_id", zona.id)
      .maybeSingle();
    if (!cubre) problemas.push(`El repartidor ${repartidor?.name ?? ""} no cubre ${ZONA}. Sumalo en /repartidor/zonas.`);
  }

  if (plataforma?.courier_terms_required) {
    const { data: acepto } = await service
      .from("courier_terms_acceptances")
      .select("version")
      .eq("courier_id", vinculo.courier_id)
      .gte("version", plataforma.courier_terms_version)
      .limit(1);
    if (!acepto?.length) problemas.push("El repartidor no aceptó los términos vigentes. Aceptalos entrando a /repartidor.");
  }

  // Disponible: si no lo está, se prende con su propia sesión (es lo que hace su interruptor).
  const disponible = async () => {
    const { data } = await service
      .from("courier_availability")
      .select("available, last_activity_at")
      .eq("courier_id", vinculo.courier_id)
      .maybeSingle();
    return Boolean(data?.available && Date.now() - new Date(data.last_activity_at).getTime() < MARGEN_ACTIVIDAD_MS);
  };
  if (!(await disponible())) {
    const { error } = await client.rpc("courier_set_available", { p_available: true });
    if (!error) console.log("El repartidor de la demo estaba apagado: lo prendí con su sesión (se apaga solo tras 4 h sin actividad).");
    if (error || !(await disponible())) {
      problemas.push(
        `El repartidor no está disponible y no pude ponerlo disponible solo (${error?.message ?? "sin efecto"}). Prendé su interruptor en /repartidor.`,
      );
    }
  }

  // Otros repartidores disponibles en Centro recibirían el aviso del pedido demo.
  if (zona && !otrosRepartidores) {
    const { data: cubren } = await service
      .from("courier_zone_coverage")
      .select("courier_id")
      .eq("zone_id", zona.id)
      .neq("courier_id", vinculo.courier_id);
    const ids = (cubren ?? []).map((row) => row.courier_id);
    if (ids.length) {
      const { data: libres } = await service
        .from("courier_availability")
        .select("courier_id, last_activity_at")
        .in("courier_id", ids)
        .eq("available", true);
      const activos = (libres ?? []).filter((row) => Date.now() - new Date(row.last_activity_at).getTime() < LIMITE_ACTIVIDAD_MS);
      if (activos.length) {
        problemas.push(
          `Hay ${activos.length} repartidor(es) más disponibles en ${ZONA} que podrían recibir un aviso del pedido demo. ` +
            "Apagalos o corré con --permitir-otros-repartidores.",
        );
      }
    }
  }
}
