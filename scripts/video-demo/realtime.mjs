// Diagnóstico de Realtime sin tocar la app: qué canales abre cada panel, en qué estado quedan, qué eventos
// llegan y cuándo, qué refrescos pide la página y si el RLS deja leer la fila a cada cuenta en ese momento.
// Todo va a `realtime.log` con la hora en segundos desde el inicio del video de esa pantalla (la misma
// línea de tiempo que `pasos.json`).
//
// Límite conocido: en el navegador solo se ven la apertura y el cierre del socket; los mensajes del canal
// (join, eventos) no pasan por el WebSocket envuelto. Lo que sí sirve en el log: los «refresco» (un refresco
// fuera del ritmo de 15/20 s lo disparó un evento de Realtime) y las líneas «RLS» (si la cuenta puede leer
// la fila del pedido, que es lo que decide si la base le manda el evento).
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { iniciarSesion } from "./db.mjs";

// Se inyecta en el panel del local y en el del repartidor. Envuelve el WebSocket del cliente de Supabase
// para mirar el protocolo de Phoenix; no cambia nada de lo que la app manda ni recibe.
export const REALTIME_SCRIPT = `(() => {
  if (window.__rtLog) return;
  window.__rtLog = true;
  const say = (kind, detail) => console.debug("[RT] " + JSON.stringify({ at: Date.now(), kind, detail }));
  const Native = window.WebSocket;
  // El protocolo v2 manda arreglos [join_ref, ref, topic, event, payload]; el v1, objetos.
  const parse = (data) => {
    const m = parse(data);
    return Array.isArray(m) ? { join_ref: m[0], ref: m[1], topic: m[2], event: m[3], payload: m[4] } : m;
  };
  const role = (token) => {
    try {
      return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role || "?";
    } catch {
      return String(token).startsWith("sb_") ? "clave-publica" : "?";
    }
  };
  function Wrapped(url, protocols) {
    const ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
    if (!/realtime/.test(String(url))) return ws;
    const joins = new Map();
    say("ws-abre", String(url).split("?")[0]);
    ws.addEventListener("open", () => say("ws-abierto", ""));
    ws.addEventListener("close", (e) => say("ws-cerrado", { code: e.code }));
    ws.addEventListener("error", () => say("ws-error", ""));
    const send = ws.send.bind(ws);
    ws.send = (data) => {
      try {
        const m = parse(data);
        if (m.event === "phx_join") {
          const cfg = m.payload?.config?.postgres_changes ?? [];
          const tables = cfg.map((c) => c.table + (c.filter ? "[" + c.filter + "]" : "")).join(",");
          joins.set(m.ref, m.topic);
          say("canal-join", { canal: m.topic, tablas: tables, token: role(m.payload?.access_token ?? "") });
          setTimeout(() => {
            if (joins.has(m.ref)) say("canal-TIMED_OUT", { canal: m.topic, tras: "10 s sin respuesta" });
          }, 10000);
        } else if (m.event === "access_token") {
          say("token-nuevo", { canal: m.topic, token: role(m.payload?.access_token ?? "") });
        }
      } catch {}
      return send(data);
    };
    ws.addEventListener("message", (e) => {
      try {
        const m = parse(e.data);
        if (m.event === "phx_reply" && joins.has(m.ref)) {
          joins.delete(m.ref);
          const ok = m.payload?.status === "ok";
          say(ok ? "canal-SUBSCRIBED" : "canal-CHANNEL_ERROR", {
            canal: m.topic,
            ids: (m.payload?.response?.postgres_changes ?? []).map((c) => c.table).join(","),
            error: ok ? undefined : m.payload?.response,
          });
        } else if (m.event === "system") {
          say("system", { estado: m.payload?.status, mensaje: m.payload?.message, extension: m.payload?.extension });
        } else if (m.event === "postgres_changes") {
          const d = m.payload?.data ?? {};
          say("evento", {
            tabla: d.table,
            tipo: d.type,
            pedido: d.record?.order_number,
            status: d.record?.status,
            courier_status: d.record?.courier_status,
            contador: d.record?.counter,
          });
        } else if (m.event === "phx_error" || m.event === "phx_close") {
          say("canal-" + m.event, { canal: m.topic });
        }
      } catch {}
    });
    return ws;
  }
  Wrapped.prototype = Native.prototype;
  for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) Wrapped[k] = Native[k];
  window.WebSocket = Wrapped;
})();`;

export function crearBitacora(origenes) {
  const lineas = [];
  const segundos = (ms, pantalla) => ((ms - origenes[pantalla]) / 1000).toFixed(2).padStart(7);

  return {
    lineas,
    escribir(pantalla, ms, texto) {
      lineas.push({ ms, texto: `${segundos(ms, pantalla)} s  ${pantalla.padEnd(10)} ${texto}` });
    },
    // Mira la consola de la página: lo que manda REALTIME_SCRIPT y los pedidos de refresco de Next (`_rsc`).
    mirar(pantalla, page) {
      page.on("console", (msg) => {
        const texto = msg.text();
        if (!texto.startsWith("[RT] ")) return;
        try {
          const { at, kind, detail } = JSON.parse(texto.slice(5));
          this.escribir(pantalla, at, `${kind} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
        } catch {
          /* línea ajena */
        }
      });
      page.on("request", (req) => {
        if (/[?&]_rsc=/.test(req.url())) this.escribir(pantalla, Date.now(), `refresco (router.refresh) → ${new URL(req.url()).pathname}`);
      });
    },
    async guardar(carpeta) {
      const ordenadas = [...lineas].sort((a, b) => a.ms - b.ms).map((l) => l.texto);
      await writeFile(path.join(carpeta, "realtime.log"), `${ordenadas.join("\n")}\n`);
    },
  };
}

// Cada 2 s, con la sesión de cada cuenta, ¿se ve la fila del pedido? Es lo que decide el RLS de Realtime:
// si la cuenta no puede leerla, la base no le manda el evento. Solo anota cuando algo cambia.
export async function vigilarRLS({ supabase, cuentas, pedidoId, bitacora }) {
  const sesiones = {
    local: await iniciarSesion(supabase.url, supabase.key, cuentas.localEmail, cuentas.localPassword, "local"),
    repartidor: await iniciarSesion(supabase.url, supabase.key, cuentas.repartidorEmail, cuentas.repartidorPassword, "repartidor"),
  };
  const ultimo = {};
  let activo = true;

  const tick = async () => {
    for (const [pantalla, { client }] of Object.entries(sesiones)) {
      const { data, error } = await client
        .from("orders")
        .select("status, courier_status, courier_id")
        .eq("id", pedidoId)
        .maybeSingle();
      const { data: pulso } = await client.from("courier_availability_pulse").select("*").limit(1);
      const resumen = error
        ? `RLS orders: error ${error.message}`
        : data
          ? `RLS orders: la ve (status=${data.status}, courier_status=${data.courier_status}, courier=${data.courier_id ? "sí" : "no"})`
          : "RLS orders: NO la ve";
      const total = `${resumen} · pulse: ${pulso?.length ? "la ve" : "NO la ve"}`;
      if (ultimo[pantalla] !== total) {
        ultimo[pantalla] = total;
        bitacora.escribir(pantalla, Date.now(), total);
      }
    }
  };

  const timer = setInterval(() => {
    if (activo) tick().catch(() => {});
  }, 2000);
  await tick();

  return async () => {
    activo = false;
    clearInterval(timer);
    for (const { client } of Object.values(sesiones)) await client.auth.signOut().catch(() => {});
  };
}
