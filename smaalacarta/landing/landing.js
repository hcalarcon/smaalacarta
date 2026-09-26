const root = document.documentElement;
const body = document.body;
const header = document.querySelector(".header");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const nav = document.querySelector(".nav");
const mobileNavOverlay = document.getElementById("mobileNavOverlay");
const navLinks = document.querySelectorAll(".nav-link");
const demosBtn = document.getElementById("demosBtn");
const demosModal = document.getElementById("demosModal");

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// =====================================================
// ENCABEZADO: toma fondo al bajar
// =====================================================
function updateHeader() {
  const scrolled = window.scrollY > 50;
  header?.classList.toggle("scrolled", scrolled);
  mobileMenuBtn?.classList.toggle("scrolled", scrolled);
}

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

// =====================================================
// MENÚ DEL CELULAR
// =====================================================
const isMenuOpen = () => nav?.classList.contains("mobile-nav-open") ?? false;

function setMenu(open) {
  nav?.classList.toggle("mobile-nav-open", open);
  mobileMenuBtn?.classList.toggle("mobile-menu-active", open);
  mobileNavOverlay?.classList.toggle("show", open);
  body.classList.toggle("menu-open", open);
  mobileMenuBtn?.setAttribute("aria-expanded", String(open));
  mobileMenuBtn?.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
}

if (mobileMenuBtn && nav) {
  mobileMenuBtn.addEventListener("click", () => setMenu(!isMenuOpen()));
}

mobileNavOverlay?.addEventListener("click", () => setMenu(false));
navLinks.forEach((link) => link.addEventListener("click", () => setMenu(false)));

// =====================================================
// MODAL DE DEMOS
// =====================================================
const isModalOpen = () => demosModal?.classList.contains("show") ?? false;

function focusableInModal() {
  return [...demosModal.querySelectorAll("a[href], button:not([disabled])")];
}

function openDemosModal() {
  if (!demosModal) return;
  demosModal.classList.add("show");
  body.style.overflow = "hidden";
  (demosModal.querySelector(".modal-close") ?? focusableInModal()[0])?.focus();
}

function closeDemosModal() {
  if (!demosModal) return;
  demosModal.classList.remove("show");
  body.style.overflow = "";
  demosBtn?.focus();
}

demosBtn?.addEventListener("click", openDemosModal);
demosModal?.querySelector(".modal-close")?.addEventListener("click", closeDemosModal);

// Tocar afuera del contenido (sobre el fondo oscuro) cierra el modal.
demosModal?.addEventListener("click", (event) => {
  if (event.target === demosModal) closeDemosModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (isModalOpen()) {
      closeDemosModal();
    } else if (isMenuOpen()) {
      setMenu(false);
      mobileMenuBtn?.focus();
    }
    return;
  }

  // Con el modal abierto, Tab da la vuelta adentro en lugar de salir a la página.
  if (event.key === "Tab" && isModalOpen()) {
    const items = focusableInModal();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && (document.activeElement === first || !demosModal.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !demosModal.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }
});

// =====================================================
// ANIMACIÓN DE ENTRADA
// El contenido es visible por defecto: el CSS solo lo esconde si este script activa
// `js-reveal`, y no lo hace si el navegador no soporta IntersectionObserver o la persona
// pidió menos movimiento.
// =====================================================
if ("IntersectionObserver" in window && !prefersReducedMotion()) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
  );

  root.classList.add("js-reveal");
  document
    .querySelectorAll(".step, .benefit-card, .plan-card, .contact-method")
    .forEach((el) => {
      el.classList.add("reveal");
      observer.observe(el);
    });
}
