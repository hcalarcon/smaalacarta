import DashboardCard from "@/components/dashboard/DashboardCard";
import type { MetricsSummary } from "@/lib/orders/metrics";
import { deltaText, formatArs, webShareText } from "@/lib/orders/metrics-format";

type MetricsCardsProps = {
  current: MetricsSummary;
  previous: MetricsSummary;
  // "7 días" o "30 días", para los títulos.
  periodLabel: string;
  // Cómo se llama el período anterior en "↑ 12 % vs …".
  versus: string;
  truncated?: boolean;
};

// Las cuatro tarjetas de pedidos de un período (Resumen y Métricas, ADMIN-METRICAS-8 y 9).
export default function MetricsCards({
  current,
  previous,
  periodLabel,
  versus,
  truncated = false,
}: MetricsCardsProps) {
  const delta = deltaText(current.count, previous.count, versus, truncated);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <DashboardCard
        title={`Pedidos (${periodLabel})`}
        value={String(current.count)}
        description={delta ?? "Pedidos confirmados"}
      />
      <DashboardCard
        title={`Vendido (${periodLabel})`}
        value={formatArs(current.revenue)}
        description={
          current.unconfirmed > 0
            ? `Sin confirmar: ${current.unconfirmed}`
            : "Sin contar cancelados"
        }
      />
      <DashboardCard
        title="Ticket promedio"
        value={formatArs(current.avgTicket)}
        description="Lo que gasta cada pedido"
      />
      <DashboardCard
        title="Por tu menú"
        value={`${current.webCount} de ${current.count}`}
        description={webShareText(current.webCount, current.count)}
      />
    </div>
  );
}
