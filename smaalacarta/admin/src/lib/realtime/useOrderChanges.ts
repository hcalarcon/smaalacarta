"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase-browser";

// Cuánto se espera para juntar los cambios de una misma operación (un pedido toca `orders` y `courier_offers`
// casi a la vez) antes de pedir los datos nuevos.
const DEBOUNCE_MS = 250;

// Con la página abierta, avisa apenas la base cambia un pedido o una oferta (ENVIO-172), en lugar de esperar
// a la consulta periódica. No trae datos: solo dispara `onChange` (un `router.refresh()`), y los avisos que
// suenan los siguen decidiendo las pantallas al comparar lo que ya tenían con lo nuevo. El RLS filtra lo que
// llega: el local ve lo suyo y el repartidor, lo que puede ver. Si el canal no se puede abrir, queda la
// consulta periódica de cada pantalla.
export function useOrderChanges(onChange: () => void) {
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
      channel = client
        .channel("order-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, changed)
        .on("postgres_changes", { event: "*", schema: "public", table: "courier_offers" }, changed)
        .subscribe();
    } catch {
      return;
    }

    return () => {
      if (timer) clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, []);
}
