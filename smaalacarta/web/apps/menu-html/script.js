/* animaciones */

const reveals = document.querySelectorAll(".reveal");

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  {
    threshold: 0.15,
  },
);

reveals.forEach((el) => {
  revealObserver.observe(el);
});

/* categorias activas */

const sections = document.querySelectorAll(".menu-section");
const chips = document.querySelectorAll(".chip");

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        chips.forEach((c) => c.classList.remove("active"));

        const id = entry.target.getAttribute("id");

        document.querySelector(`.chip[href="#${id}"]`)?.classList.add("active");
      }
    });
  },
  {
    rootMargin: "-40% 0px -55% 0px",
  },
);

sections.forEach((section) => {
  sectionObserver.observe(section);
});

/* modal imagen */

const modal = document.getElementById("modal");
const modalImg = document.getElementById("modal-img");
const imgs = document.querySelectorAll(".menu-img");
const close = document.querySelector(".close");

imgs.forEach((img) => {
  img.addEventListener("click", () => {
    modal.style.display = "flex";
    modalImg.src = img.src;
  });
});

close.onclick = () => (modal.style.display = "none");
modal.onclick = () => (modal.style.display = "none");
