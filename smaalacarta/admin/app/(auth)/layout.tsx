import Image from "next/image";

import Logo from "@/components/brand/Logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand lg:block">
        <Image
          src="/auth-hero.jpg"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand via-brand/60 to-brand/30" />

        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Logo tone="light" />

          <div className="max-w-md">
            <h2 className="text-4xl font-semibold leading-tight">
              Tu menú digital, siempre al día.
            </h2>
            <p className="mt-4 text-lg text-white/80">
              Cargá categorías, productos y promociones, y tus clientes ven los
              cambios al instante.
            </p>
          </div>
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
