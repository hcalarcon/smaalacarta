import Link from "next/link";

const links = [
  {
    href: "/dashboard",
    label: "Dashboard",
  },
  {
    href: "/dashboard/menu",
    label: "Menú",
  },
  {
    href: "/dashboard/orders",
    label: "Pedidos",
  },
  {
    href: "/dashboard/promotions",
    label: "Promociones",
  },
  {
    href: "/dashboard/settings",
    label: "Configuración",
  },
];

export default function DashboardSidebar() {
  return (
    <aside className="hidden w-72 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="border-b border-slate-200 p-6">
        <h1 className="text-xl font-bold">SMA a la Carta</h1>

        <p className="mt-1 text-sm text-slate-500">Panel administrador</p>
      </div>

      <nav className="flex flex-1 flex-col gap-2 p-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
