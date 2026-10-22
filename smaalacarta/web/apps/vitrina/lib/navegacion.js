// Navegación por categorías de los temas: marca con `aria-current` el link de la sección que se está
// viendo y lo centra en su barra (que se desplaza de costado). Solo en el navegador.

const calmo = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function centrar(link) {
  const barra = link.parentElement;
  const dentro = link.getBoundingClientRect();
  const fuera = barra.getBoundingClientRect();
  const izquierda = barra.scrollLeft + (dentro.left - fuera.left) - (fuera.width - dentro.width) / 2;
  barra.scrollTo?.({ left: izquierda, behavior: calmo() ? "auto" : "smooth" });
}

// Devuelve el observador para poder soltarlo al volver a pintar (cambio de idioma).
export function marcarSeccionActual({ secciones, links }) {
  if (!("IntersectionObserver" in window)) return null;

  const observador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        document.querySelectorAll(links).forEach((link) => {
          if (link.hash === `#${entrada.target.id}`) {
            link.setAttribute("aria-current", "true");
            centrar(link);
          } else link.removeAttribute("aria-current");
        });
      });
    },
    { rootMargin: "-30% 0px -60% 0px" },
  );
  document.querySelectorAll(secciones).forEach((seccion) => observador.observe(seccion));
  return observador;
}
