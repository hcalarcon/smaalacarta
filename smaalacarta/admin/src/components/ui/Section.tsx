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
      className="scroll-mt-36 rounded-3xl border border-line bg-white p-4 shadow-sm sm:p-5 focus:outline-none lg:scroll-mt-24"
    >
      <h2 className="text-xl font-semibold text-brand">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-stone-500">{description}</p>
      ) : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
