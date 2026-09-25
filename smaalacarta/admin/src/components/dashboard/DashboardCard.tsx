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
    <article className="rounded-3xl border border-line bg-white p-6 shadow-sm">
      <p className="text-sm text-stone-500">{title}</p>

      <h3 className="mt-3 text-3xl font-bold text-brand">{value}</h3>

      <p className="mt-2 text-sm text-stone-500">{description}</p>
    </article>
  );
}
