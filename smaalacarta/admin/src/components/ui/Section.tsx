export default function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-36 rounded-3xl border border-line bg-white p-6 shadow-sm focus:outline-none lg:scroll-mt-24"
    >
      <h2 className="text-xl font-semibold text-brand">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-stone-500">{description}</p>
      ) : null}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}
