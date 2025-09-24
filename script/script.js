// Scroll to contact section
function scrollToContact() {
  document.getElementById("contact").scrollIntoView({
    behavior: "smooth",
  });
}

// Open WhatsApp with pre-filled message
function openWhatsApp() {
  const phoneNumber = "5491123456789"; // Replace with actual phone number
  const message = encodeURIComponent(
    "Hola! Me interesa saber más sobre los menús digitales de SMA a la Carta."
  );
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
  window.open(whatsappUrl, "_blank");
}

// Open email client
function openEmail() {
  const email = "info@smaalacarta.com";
  const subject = encodeURIComponent("Consulta sobre menús digitales");
  const body = encodeURIComponent(
    "Hola,\n\nMe gustaría recibir más información sobre sus servicios de menús digitales.\n\nGracias!"
  );
  const emailUrl = `mailto:${email}?subject=${subject}&body=${body}`;
  window.location.href = emailUrl;
}

// Show demo (placeholder function)
function showDemo() {
  alert(
    "¡Próximamente tendremos una demo disponible! Mientras tanto, contactanos para ver ejemplos de nuestros trabajos."
  );
}

// Add scroll effects
window.addEventListener("scroll", function () {
  const scrolled = window.pageYOffset;
  const parallax = document.querySelector(".hero-background");

  if (parallax) {
    const speed = scrolled * 0.5;
    parallax.style.transform = `translateY(${speed}px)`;
  }
});

// Add loading animation for images
document.addEventListener("DOMContentLoaded", function () {
  const images = document.querySelectorAll("img");

  images.forEach((img) => {
    img.addEventListener("load", function () {
      this.style.opacity = "1";
    });

    // Set initial opacity
    img.style.opacity = "0";
    img.style.transition = "opacity 0.3s ease";
  });
});

// Add intersection observer for animations
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

// Observe elements for scroll animations
document.addEventListener("DOMContentLoaded", function () {
  const animatedElements = document.querySelectorAll(
    ".step-card, .benefit-item, .plan-card, .contact-item"
  );

  animatedElements.forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(30px)";
    el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
    observer.observe(el);
  });
});

// Plan selection handlers
document.querySelectorAll(".plan-btn").forEach((btn) => {
  btn.addEventListener("click", function () {
    const planName =
      this.closest(".plan-card").querySelector(".plan-name").textContent;
    const message = encodeURIComponent(
      `Hola! Me interesa el plan "${planName}" de SMA a la Carta. ¿Podrían darme más información?`
    );
    const phoneNumber = "5491123456789";
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    window.open(whatsappUrl, "_blank");
  });
});

// Add mobile menu functionality (if needed in future)
function initMobileMenu() {
  // Mobile menu code would go here
  // Currently not needed as this is a single-page site
}

// Performance optimization - lazy loading for images
function lazyLoadImages() {
  const images = document.querySelectorAll("img[data-src]");

  const imageObserver = new IntersectionObserver(function (entries) {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
        imageObserver.unobserve(img);
      }
    });
  });

  images.forEach((img) => imageObserver.observe(img));
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  // Initialize lazy loading
  lazyLoadImages();

  // Add smooth scrolling to all anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });

  // Add loading states to buttons
  document.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", function () {
      const originalText = this.innerHTML;
      if (!this.classList.contains("loading")) {
        this.classList.add("loading");
        this.style.opacity = "0.8";
        setTimeout(() => {
          this.classList.remove("loading");
          this.style.opacity = "1";
        }, 500);
      }
    });
  });
});

// Add some easter eggs for engagement
let clickCount = 0;
document.querySelector(".hero-title").addEventListener("click", function () {
  clickCount++;
  if (clickCount === 5) {
    this.style.background =
      "linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #f9ca24)";
    this.style.backgroundSize = "400% 400%";
    this.style.animation = "gradient 3s ease infinite";
    this.style.webkitBackgroundClip = "text";
    this.style.webkitTextFillColor = "transparent";
    this.style.backgroundClip = "text";

    // Add gradient animation
    const style = document.createElement("style");
    style.textContent = `
            @keyframes gradient {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
        `;
    document.head.appendChild(style);

    setTimeout(() => {
      location.reload();
    }, 5000);
  }
});
