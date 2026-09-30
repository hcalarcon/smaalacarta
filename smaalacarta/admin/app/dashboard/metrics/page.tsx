import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import MetricsCards from "@/components/dashboard/MetricsCards";
import { startOfDayInArgentina } from "@/lib/dates";
import { listOrdersForMetrics } from "@/lib/db/metrics";
import { requireBusiness } from "@/lib/get-current-business";
import {
  byHour,
  byWeekday,
  comparePeriods,
  summarize,
  topProducts,
} from "@/lib/orders/metrics";
import { barPercent, parseDays, peakHourText, periodCopy } from "@/lib/orders/metrics-view";
import { hasOrders } from "@/lib/plan-access";

export const metadata: Metadata = { title: "Métricas" };

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { business } = await requireBusiness();

  // Las métricas son de pedidos: exclusivas de plan_completo (ADMIN-METRICAS-9).
  if (
    !hasOrders({
      planPdf: business.plan_pdf,
      planWeb: business.plan_web,
      planCompleto: business.plan_completo,
    })
  ) {
    redirect("/dashboard");
  }

  const days = parseDays((await searchParams).dias);
  const { label, versus } = periodCopy(days);

  const now = new Date();
  const { orders, truncated } = await listOrdersForMetrics(
    business.id,
    startOfDayInArgentina(now, 2 * days - 1).toISOString(),
  );
  const { current, previous } = comparePeriods(orders, now, days);
  const summary = summarize(current);

  const products = topProducts(current);
  const hours = byHour(current);
  const weekdays = byWeekday(current);
  const peak = peakHourText(hours);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold text-brand">Métricas</h1>
        <p className="mt-2 text-stone-500">Cómo le va a {business.name} con los pedidos.</p>

        <nav aria-label="Período" className="mt-4 inline-flex rounded-2xl border border-line bg-white p-1">
          {([7, 30] as const).map((option) => (
            <Link
              key={option}
              href={`/dashboard/metrics?dias=${option}`}
              aria-current={option === days ? "page" : undefined}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                option === days ? "bg-brand text-white" : "text-stone-600 hover:bg-cream"
              }`}
            >
              {option} días
            </Link>
          ))}
        </nav>
      </section>

      {truncated ? (
        <p className="rounded-2xl border border-accent/40 bg-white px-4 py-3 text-sm text-stone-600">
          Mostrando los últimos 5000 pedidos
        </p>
      ) : null}

      {summary.count === 0 ? (
        <p className="rounded-3xl border border-line bg-white p-5 text-stone-500 shadow-sm">
          Todavía no hay pedidos en los últimos {label}. Cuando lleguen, acá vas a ver cuánto vendés, qué
          se pide más y a qué hora.
        </p>
      ) : (
        <>
          <MetricsCards
            current={summary}
            previous={summarize(previous)}
            periodLabel={label}
            versus={versus}
            truncated={truncated}
          />

          <Panel title="Lo más pedido">
            {products.length === 0 ? (
              <p className="text-sm text-stone-500">Todavía no hay productos para mostrar.</p>
            ) : (
              <ul className="space-y-3">
                {products.map((product) => (
                  <li key={product.name}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 break-words text-stone-700">{product.name}</span>
                      <span className="shrink-0 font-semibold text-brand">{product.quantity}</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-cream">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${barPercent(product.quantity, products[0].quantity)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Horarios">
            {peak ? <p className="mb-4 text-lg font-bold text-accent">{peak}</p> : null}
            <Bars
              values={hours}
              labels={hours.map((_, hour) => (hour % 3 === 0 ? String(hour) : ""))}
              describe={(hour, count) => `${hour} h: ${count} pedidos`}
              compact
            />
            <p className="mt-2 text-xs text-stone-500">Hora del día, en horario argentino</p>
          </Panel>

          <Panel title="Días de la semana">
            <Bars
              values={weekdays}
              labels={WEEKDAYS}
              describe={(day, count) => `${WEEKDAYS[day]}: ${count} pedidos`}
            />
          </Panel>
        </>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-brand">{title}</h2>
      {children}
    </section>
  );
}

// Barras verticales de CSS. Cada una lleva su cantidad escrita encima (no solo el color).
function Bars({
  values,
  labels,
  describe,
  compact = false,
}: {
  values: number[];
  labels: string[];
  describe: (index: number, count: number) => string;
  compact?: boolean;
}) {
  const max = Math.max(...values);

  return (
    <div className={`flex h-44 items-end ${compact ? "gap-0.5" : "gap-2"}`}>
      {values.map((count, index) => (
        <div
          key={index}
          title={describe(index, count)}
          aria-label={describe(index, count)}
          className="flex h-full min-w-0 flex-1 flex-col justify-end text-center"
        >
          <span className={`${compact ? "text-[10px]" : "text-xs"} leading-4 text-stone-600`}>
            {count > 0 ? count : ""}
          </span>
          <div
            className="w-full rounded-t bg-brand"
            style={{ height: `${barPercent(count, max) * 0.8}%` }}
          />
          <span className={`${compact ? "text-[10px]" : "text-xs"} mt-1 h-4 leading-4 text-stone-500`}>
            {labels[index]}
          </span>
        </div>
      ))}
    </div>
  );
}
