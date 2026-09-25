import type { Metadata } from "next";

import AuthHeading from "../components/AuthHeading";
import LoginForm from "../components/LoginForm";
import FormAlert from "@/components/ui/FormAlert";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <>
      <AuthHeading
        title="Bienvenido"
        subtitle="Ingresá para administrar tu menú."
      />

      {error === "link" ? (
        <div className="mb-5">
          <FormAlert tone="error">
            El link no es válido o ya venció. Pedí uno nuevo desde
            &ldquo;¿Olvidaste tu contraseña?&rdquo;.
          </FormAlert>
        </div>
      ) : null}

      <LoginForm next={next} />
    </>
  );
}
