const header = document.querySelector(".header");

window.addEventListener("scroll", () => {
  if (window.scrollY > 50) {
    header.classList.add("scrolled");
  } else {
    header.classList.remove("scrolled");
  }
});

// Handle mobile menu
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const nav = document.querySelector(".nav");

if (mobileMenuBtn && nav) {
  mobileMenuBtn.addEventListener("click", function () {
    nav.classList.toggle("mobile-nav-open");
    this.classList.toggle("mobile-menu-active");
  });
}

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
  ".step, .benefit-card, .plan-card, .contact-method"
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
