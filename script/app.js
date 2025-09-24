// Smooth scrolling for navigation links
document.addEventListener("DOMContentLoaded", function () {
  // Handle navigation links
  const navLinks = document.querySelectorAll('a[href^="#"]');

  navLinks.forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();

      const targetId = this.getAttribute("href");
      const targetSection = document.querySelector(targetId);

      if (targetSection) {
        const headerHeight = document.querySelector(".header").offsetHeight;
        const targetPosition = targetSection.offsetTop - headerHeight;

        window.scrollTo({
          top: targetPosition,
          behavior: "smooth",
        });
      }
    });
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

  // Handle CTA button clicks
  const ctaButtons = document.querySelectorAll(
    ".hero-cta, .contact-btn, .plan-btn"
  );

  ctaButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const buttonText = this.textContent.toLowerCase();

      if (buttonText.includes("whatsapp") || buttonText.includes("contactar")) {
        // Open WhatsApp
        const phoneNumber = "5492972000000"; // Replace with actual number
        const message = encodeURIComponent(
          "Hola! Me interesa conocer más sobre los servicios de SMA a la Carta."
        );
        window.open(`https://wa.me/${phoneNumber}?text=${message}`, "_blank");
      } else if (
        buttonText.includes("email") ||
        buttonText.includes("enviar")
      ) {
        // Open email client
        const email = "info@smaacarta.com";
        const subject = encodeURIComponent(
          "Consulta sobre servicios SMA a la Carta"
        );
        const body = encodeURIComponent(
          "Hola,\n\nMe interesa conocer más sobre los servicios de menús digitales.\n\nSaludos."
        );
        window.open(`mailto:${email}?subject=${subject}&body=${body}`);
      } else if (
        buttonText.includes("solicitar") ||
        buttonText.includes("sitio")
      ) {
        // Scroll to contact section
        const contactSection = document.querySelector("#contacto");
        if (contactSection) {
          const headerHeight = document.querySelector(".header").offsetHeight;
          const targetPosition = contactSection.offsetTop - headerHeight;

          window.scrollTo({
            top: targetPosition,
            behavior: "smooth",
          });
        }
      } else if (buttonText.includes("elegir")) {
        // Handle plan selection
        const contactSection = document.querySelector("#contacto");
        if (contactSection) {
          const headerHeight = document.querySelector(".header").offsetHeight;
          const targetPosition = contactSection.offsetTop - headerHeight;

          window.scrollTo({
            top: targetPosition,
            behavior: "smooth",
          });
        }
      }
    });
  });

  // Add scroll effect to header
  let lastScrollY = window.scrollY;

  window.addEventListener("scroll", function () {
    const header = document.querySelector(".header");
    const currentScrollY = window.scrollY;

    if (currentScrollY > 100) {
      header.style.background = "rgba(255, 255, 255, 0.98)";
      header.style.backdropFilter = "blur(15px)";
    } else {
      header.style.background = "rgba(255, 255, 255, 0.95)";
      header.style.backdropFilter = "blur(10px)";
    }

    lastScrollY = currentScrollY;
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

  // Handle form submissions (if any forms are added later)
  const forms = document.querySelectorAll("form");

  forms.forEach((form) => {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // Add form handling logic here
      console.log("Form submitted");

      // Show success message
      const successMessage = document.createElement("div");
      successMessage.textContent = "¡Mensaje enviado! Te contactaremos pronto.";
      successMessage.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #388b46;
                color: white;
                padding: 1rem 2rem;
                border-radius: 0.5rem;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                z-index: 9999;
                animation: slideIn 0.3s ease;
            `;

      document.body.appendChild(successMessage);

      setTimeout(() => {
        successMessage.remove();
      }, 5000);
    });
  });

  // Add loading states to buttons
  function addLoadingState(button, text = "Cargando...") {
    const originalText = button.textContent;
    button.textContent = text;
    button.disabled = true;
    button.style.opacity = "0.7";

    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
      button.style.opacity = "1";
    }, 2000);
  }

  // Add click animations to all buttons
  const allButtons = document.querySelectorAll(".btn");

  allButtons.forEach((button) => {
    button.addEventListener("click", function () {
      this.style.transform = "scale(0.95)";
      setTimeout(() => {
        this.style.transform = "scale(1)";
      }, 150);
    });
  });
});

// Add CSS animations
const style = document.createElement("style");
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    .mobile-nav-open {
        display: flex !important;
        position: fixed;
        top: 4rem;
        left: 0;
        right: 0;
        background: white;
        flex-direction: column;
        padding: 2rem;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        z-index: 999;
    }
    
    .mobile-menu-active span:nth-child(1) {
        transform: rotate(45deg) translate(5px, 5px);
    }
    
    .mobile-menu-active span:nth-child(2) {
        opacity: 0;
    }
    
    .mobile-menu-active span:nth-child(3) {
        transform: rotate(-45deg) translate(7px, -6px);
    }
    
    @media (max-width: 767px) {
        .mobile-nav-open .nav-link {
            padding: 1rem 0;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .mobile-nav-open .nav-link:last-child {
            border-bottom: none;
        }
    }
`;

document.head.appendChild(style);
