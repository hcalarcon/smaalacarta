import { redirect } from "next/navigation";

// La raíz no muestra nada propio: el proxy manda a /login a quien no tiene
// sesión, y con sesión el panel decide si hay negocio o no.
export default function Home() {
  redirect("/dashboard");
}
