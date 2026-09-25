export default function AuthHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-semibold text-brand">{title}</h1>
      <p className="mt-2 text-stone-600">{subtitle}</p>
    </div>
  );
}
