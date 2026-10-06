import type { Metadata } from "next";

import AuthHeading from "../components/AuthHeading";
import LoginForm from "../components/LoginForm";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <>
      <AuthHeading
        title="Bienvenido"
        subtitle="Ingresá para administrar tu menú."
      />

      <LoginForm next={next} />
    </>
  );
}
