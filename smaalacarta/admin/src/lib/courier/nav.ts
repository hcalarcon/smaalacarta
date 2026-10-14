// La navegación del repartidor en el celular (ADMIN-MOVIL-7 y 8). Puro: la barra solo pinta.

export type CourierTab = "pedidos" | "rendiciones";

// La pestaña sale de la URL (`/repartidor?tab=rendiciones`); cualquier otra cosa es Pedidos.
export function courierTab(param: string | null | undefined): CourierTab {
  return param === "rendiciones" ? "rendiciones" : "pedidos";
}

export type CourierBarItem = {
  key: "pedidos" | "rendiciones" | "zonas";
  href: string;
  label: string;
  // Trazo de un ícono de 24x24 (estilo outline).
  icon: string;
  // Pendientes junto al nombre; 0 no se muestra.
  badge: number;
  active: boolean;
};

export function courierBarItems(pathname: string, tab: CourierTab, toSettleCount: number): CourierBarItem[] {
  const onZones = pathname.startsWith("/repartidor/zonas");
  const onOrders = !onZones;

  return [
    {
      key: "pedidos",
      href: "/repartidor",
      label: "Pedidos",
      icon: "M6 6h15l-1.5 9h-12L6 3H3M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z",
      badge: 0,
      active: onOrders && tab === "pedidos",
    },
    {
      key: "rendiciones",
      href: "/repartidor?tab=rendiciones",
      label: "Rendiciones",
      icon: "M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
      badge: toSettleCount,
      active: onOrders && tab === "rendiciones",
    },
    {
      key: "zonas",
      href: "/repartidor/zonas",
      label: "Mis zonas",
      icon: "M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4z",
      badge: 0,
      active: onZones,
    },
  ];
}
