export type NavLink = {
  href: string;
  label: string;
  // Trazo de un ícono de 24x24 (estilo outline).
  icon: string;
  // Contador junto al nombre (por ejemplo, pedidos nuevos).
  badge?: number;
};

export const dashboardLinks: NavLink[] = [
  {
    href: "/dashboard",
    label: "Resumen",
    icon: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10",
  },
  {
    href: "/dashboard/menu",
    label: "Menú",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    href: "/dashboard/orders",
    label: "Pedidos",
    icon: "M6 6h15l-1.5 9h-12L6 3H3M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z",
  },
  {
    href: "/dashboard/promotions",
    label: "Promociones",
    icon: "M7 7h.01M3 12V5a2 2 0 012-2h7l9 9a2 2 0 010 2.8l-6.2 6.2a2 2 0 01-2.8 0L3 12z",
  },
  {
    href: "/dashboard/settings",
    label: "Configuración",
    icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  },
];

export const superAdminLinks: NavLink[] = [
  {
    href: "/superadmin",
    label: "Negocios",
    icon: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6",
  },
  {
    href: "/superadmin/negocios/nuevo",
    label: "Nuevo negocio",
    icon: "M12 5v14M5 12h14",
  },
];
