import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Logo from "@/components/brand/Logo";
import { signOutAction } from "../(auth)/actions";
import { resolveAccess } from "@/lib/get-current-business";

export const metadata: Metadata = { title: "Cuenta sin negocio" };

export default async function NoBusinessPage() {
  const { current, state } = await resolveAccess();

  if (state === "login") redirect("/login");
  if (state === "superadmin") redirect("/superadmin");
  if (state === "ok") redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-line bg-white p-8 shadow-sm">
        <Logo />

        <h1 className="mt-8 text-2xl font-semibold text-brand">
          Tu cuenta todavía no tiene un negocio
        </h1>

        <p className="mt-3 text-stone-600">
          Ingresaste como{" "}
          <strong className="font-semibold">{current?.user.email}</strong>, pero
          no tenés ningún negocio asignado. Escribinos para que te lo asignemos
          y puedas empezar a cargar tu menú.
        </p>

        <form action={signOutAction} className="mt-8">
          <button
            type="submit"
            className="w-full rounded-xl border border-line-strong px-4 py-3 font-semibold text-brand transition hover:bg-brand-soft"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
