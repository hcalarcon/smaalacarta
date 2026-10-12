import Link from "next/link";

import Logo from "@/components/brand/Logo";

// La 404 del panel (ADMIN-PWA-32): cualquier dirección inventada bajo /admin. `next/link` suma el
// `basePath`, así que "/" es la raíz del panel; desde ahí el proxy manda a cada uno a lo suyo.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-cream px-4 py-10 text-center">
      <Logo />

      <div className="max-w-sm space-y-2">
        <p className="text-sm font-semibold text-accent">Error 404</p>
        <h1 className="text-2xl font-bold text-brand">No encontramos esta página</h1>
        <p className="text-sm text-foreground/70">
          Puede que la dirección esté mal escrita o que la página ya no exista.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
      >
        Volver al panel
      </Link>
    </main>
  );
}
