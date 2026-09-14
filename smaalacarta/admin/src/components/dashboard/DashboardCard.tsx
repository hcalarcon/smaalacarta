type DashboardCardProps = {
  title: string;
  value: string;
  description: string;
};

export default function DashboardCard({
  title,
  value,
  description,
}: DashboardCardProps) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>

      <h3 className="mt-3 text-3xl font-bold text-slate-900">{value}</h3>

      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </article>
  );
}
