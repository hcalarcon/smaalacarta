import type { Metadata } from "next";

import AuthHeading from "../components/AuthHeading";
import RecoverForm from "../components/RecoverForm";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <>
      <AuthHeading
        title="Recuperá tu contraseña"
        subtitle="Ingresá tu email y te enviamos un link para elegir una nueva."
      />

      <RecoverForm />
    </>
  );
}
