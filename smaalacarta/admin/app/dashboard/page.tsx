import DashboardCard from "@/components/dashboard/DashboardCard";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>

        <p className="mt-2 text-slate-500">Resumen general del negocio.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard
          title="Pedidos hoy"
          value="17"
          description="Pedidos registrados hoy"
        />

        <DashboardCard
          title="Ventas"
          value="$182.000"
          description="Ventas del día"
        />

        <DashboardCard
          title="Productos"
          value="42"
          description="Productos activos"
        />

        <DashboardCard
          title="Promociones"
          value="3"
          description="Promos activas"
        />
      </section>
    </div>
  );
}
