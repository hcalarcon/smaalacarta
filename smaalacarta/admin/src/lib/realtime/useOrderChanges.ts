"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase-browser";

// Cuánto se espera para juntar los cambios de una misma operación (un pedido toca `orders` y `courier_offers`
// casi a la vez) antes de pedir los datos nuevos.
const DEBOUNCE_MS = 250;

// Con la página abierta, avisa apenas la base cambia un pedido, una oferta o la disponibilidad de los repartidores
// (ENVIO-172 y 202), en lugar de esperar
// a la consulta periódica. No trae datos: solo dispara `onChange` (un `router.refresh()`), y los avisos que
// suenan los siguen decidiendo las pantallas al comparar lo que ya tenían con lo nuevo. El RLS filtra lo que
// llega: el local ve lo suyo y el repartidor, lo que puede ver. Si el canal no se puede abrir, queda la
// consulta periódica de cada pantalla.
export function useOrderChanges(onChange: () => void) {
  useTableChanges(ORDER_TABLES, onChange);
}

// El panel del repartidor (ENVIO-208): a su cuenta no le llega nada de `orders` (solo lo lee el negocio), así que
// escucha `courier_order_pulse`, que la base sube para él cada vez que cambia un pedido que le importa.
export function useCourierOrderChanges(onChange: () => void) {
  useTableChanges(COURIER_TABLES, onChange);
}

// Solo la disponibilidad de los repartidores (ENVIO-202): el interruptor del repartidor no necesita enterarse
// de cada pedido.
export function useAvailabilityChanges(onChange: () => void) {
  useTableChanges(AVAILABILITY_TABLES, onChange);
}

const ORDER_TABLES = ["orders", "courier_offers", "courier_availability_pulse"] as const;
const COURIER_TABLES = ["courier_order_pulse", "courier_offers", "courier_availability_pulse"] as const;
const AVAILABILITY_TABLES = ["courier_availability_pulse"] as const;

function useTableChanges(tables: readonly string[], onChange: () => void) {
  const latest = useRef(onChange);

  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let client: ReturnType<typeof createClient>;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]>;

    const changed = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        latest.current();
      }, DEBOUNCE_MS);
    };

    try {
      client = createClient();
      // Nombre propio por montaje: uno fijo devuelve el canal anterior si todavía se está cerrando.
      let builder = client.channel(`order-changes-${Math.random().toString(36).slice(2)}`);
      // `courier_availability_pulse` es un contador sin datos de nadie: sube cuando algún repartidor se prende o
      // se apaga (ENVIO-202).
      for (const table of tables) {
        builder = builder.on("postgres_changes", { event: "*", schema: "public", table }, changed);
      }
      channel = builder.subscribe();
    } catch {
      return;
    }

    return () => {
      if (timer) clearTimeout(timer);
      void client.removeChannel(channel);
    };
    // `tables` es una constante de módulo: no cambia entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
