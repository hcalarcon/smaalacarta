export default function Section({
  id,
  title,
  description,
  children,
  collapsible = false,
  defaultOpen = false,
  className = "",
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
}) {
  if (collapsible) {
    return (
      <details
        id={id}
        open={defaultOpen || undefined}
        className={`group scroll-mt-36 rounded-2xl border border-line bg-white shadow-sm focus:outline-none open:shadow-md lg:scroll-mt-24 ${className}`}
      >
        <summary className="flex min-h-[4.5rem] cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-4 py-3 transition hover:bg-brand-soft/50 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden sm:px-5">
          <span className="min-w-0">
            <span className="block text-lg font-semibold text-brand">{title}</span>
            {description ? (
              <span className="mt-0.5 block text-sm leading-snug text-stone-500">{description}</span>
            ) : null}
          </span>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-lg text-brand transition-transform group-open:rotate-180"
          >
            ⌄
          </span>
        </summary>
        <div className="space-y-4 border-t border-line px-4 py-4 sm:px-5">
          {children}
        </div>
      </details>
    );
  }

  return (
    <section
      id={id}
      className={`scroll-mt-36 rounded-3xl border border-line bg-white p-4 shadow-sm sm:p-5 focus:outline-none lg:scroll-mt-24 ${className}`}
    >
      <h2 className="text-xl font-semibold text-brand">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-stone-500">{description}</p>
      ) : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
