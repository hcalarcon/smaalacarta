const header = document.querySelector(".header");

window.addEventListener("scroll", () => {
  if (window.scrollY > 50) {
    header.classList.add("scrolled");
    if (mobileMenuBtn) mobileMenuBtn.classList.add("scrolled");
  } else {
    header.classList.remove("scrolled");
    if (mobileMenuBtn) mobileMenuBtn.classList.remove("scrolled");
  }
});

// Handle mobile menu
const body = document.body;
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const nav = document.querySelector(".nav");
const mobileNavOverlay = document.getElementById("mobileNavOverlay");
const navLinks = document.querySelectorAll(".nav-link");

function closeMobileMenu() {
  const scrollY = body.style.top;

  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";

  window.scrollTo(0, parseInt(scrollY || "0") * -1);
  if (nav) nav.classList.remove("mobile-nav-open");
  if (mobileMenuBtn) mobileMenuBtn.classList.remove("mobile-menu-active");
  if (mobileNavOverlay) mobileNavOverlay.classList.remove("show");
  body.classList.remove("menu-open");
}

function openMobileMenu() {
  const scrollY = window.scrollY;

  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  if (nav) nav.classList.add("mobile-nav-open");
  if (mobileMenuBtn) mobileMenuBtn.classList.add("mobile-menu-active");
  if (mobileNavOverlay) mobileNavOverlay.classList.add("show");
  body.classList.add("menu-open");
}

if (mobileMenuBtn && nav) {
  mobileMenuBtn.addEventListener("click", function () {
    if (nav.classList.contains("mobile-nav-open")) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });
}

if (mobileNavOverlay) {
  mobileNavOverlay.addEventListener("click", closeMobileMenu);
}

navLinks.forEach((link) => {
  link.addEventListener("click", closeMobileMenu);
});

// Animate elements on scroll
const observerOptions = {
  threshold: 0.1,
  rootMargin: "0px 0px -50px 0px",
};

const observer = new IntersectionObserver(function (entries) {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = "1";
      entry.target.style.transform = "translateY(0)";
    }
  });
}, observerOptions);

// Observe elements for animation
const animateElements = document.querySelectorAll(
  ".step, .benefit-card, .plan-card, .contact-method",
);

animateElements.forEach((el) => {
  el.style.opacity = "0";
  el.style.transform = "translateY(20px)";
  el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
  observer.observe(el);
});

// Add hover effects to cards
const cards = document.querySelectorAll(".benefit-card, .plan-card");

cards.forEach((card) => {
  card.addEventListener("mouseenter", function () {
    this.style.transform = "translateY(-8px)";
  });

  card.addEventListener("mouseleave", function () {
    this.style.transform = "translateY(0)";
  });
});

// =====================================================
// DEMOS MODAL FUNCTIONALITY
// =====================================================

// Get modal elements
const demosBtn = document.getElementById("demosBtn");
const demosModal = document.getElementById("demosModal");

// Open modal function
function openDemosModal() {
  demosModal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

// Close modal function
function closeDemosModal() {
  demosModal.style.display = "none";
  document.body.style.overflow = "auto";
}

// Open modal on button click
if (demosBtn) {
  demosBtn.addEventListener("click", openDemosModal);
}

// Close modal when clicking outside (on the overlay)
if (demosModal) {
  demosModal.addEventListener("click", function (event) {
    if (event.target === this) {
      closeDemosModal();
    }
  });
}

// Close modal when pressing ESC
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    closeDemosModal();
  }
});

// Add pulse effect to CTA buttons
const pulseButtons = document.querySelectorAll(".hero-cta");

pulseButtons.forEach((button) => {
  setInterval(() => {
    button.style.transform = "scale(1.02)";
    setTimeout(() => {
      button.style.transform = "scale(1)";
    }, 200);
  }, 3000);
});
