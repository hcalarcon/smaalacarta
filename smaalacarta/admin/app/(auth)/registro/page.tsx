import type { Metadata } from "next";

import AuthHeading from "../components/AuthHeading";
import SignUpForm from "../components/SignUpForm";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignUpPage() {
  return (
    <>
      <AuthHeading
        title="Creá tu cuenta"
        subtitle="Es el primer paso para gestionar tu menú digital."
      />

      <SignUpForm />
    </>
  );
}
