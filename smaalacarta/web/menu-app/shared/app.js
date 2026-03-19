// =======================
// STATE
// =======================
let categories = [];
let activeCategory = "todos";
let cart = [];
let menuData = [];

// =======================
// CONFIG
// =======================
function getDataPath() {
  const demo = document.body.dataset.demo;

  if (!demo) {
    console.warn("No hay data-demo definido");
    return "./data";
  }

  return `./data/${demo}`;
}

const DATA_PATH = getDataPath();

// =======================
// UI SELECTORS
// =======================
const UI = {
  categories: document.querySelector("[data-categories]"),
  menu: document.querySelector("[data-menu]"),
  statusBadge: document.querySelector("[data-status]"),
  cartFloat: document.querySelector("[data-cart-float]"),
  cartCount: document.querySelector("[data-cart-count]"),
  cartTotal: document.querySelector("[data-cart-total]"),
  checkoutOverlay: document.querySelector("[data-checkout]"),
  checkoutItems: document.querySelector("[data-checkout-items]"),
  totalAmount: document.querySelector("[data-total]"),
};

// =======================
// DATA LOADING
// =======================
async function loadData() {
  try {
    const menuResponse = await fetch(`${DATA_PATH}/menu.json`);
    menuData = await menuResponse.json();

    const categoriesResponse = await fetch(`${DATA_PATH}/categories.json`);
    categories = await categoriesResponse.json();
  } catch (error) {
    console.error("Error loading data:", error);
  }
}

// =======================
// BUSINESS STATUS
// =======================
function isBusinessOpen() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  if (day === 0) return hour >= 10 && hour < 20;
  return hour >= 8 && hour < 22;
}

function updateStatusBadge() {
  if (!UI.statusBadge) return;

  const isOpen = isBusinessOpen();

  UI.statusBadge.textContent = isOpen ? "🟢 Abierto Ahora" : "🔴 Cerrado";

  UI.statusBadge.classList.toggle("open", isOpen);
  UI.statusBadge.classList.toggle("closed", !isOpen);
}

// =======================
// FORMAT
// =======================
function formatPrice(price) {
  return "$" + price.toLocaleString("es-AR");
}

// =======================
// CATEGORIES
// =======================
function renderCategories() {
  UI.categories.innerHTML = categories
    .map(
      (category) => `
    <button 
      class="category-btn ${activeCategory === category.id ? "active" : ""}"
      data-category="${category.id}"
    >
      <span>${category.icon || ""}</span>
      <span>${category.name}</span>
    </button>
  `,
    )
    .join("");
}

function setActiveCategory(categoryId) {
  activeCategory = categoryId;
  renderCategories();
  renderMenu();
}

// =======================
// MENU
// =======================
function renderMenu() {
  const filtered =
    activeCategory === "todos"
      ? menuData
      : menuData.filter((item) => item.category === activeCategory);

  UI.menu.innerHTML = filtered
    .map(
      (item) => `
    <div class="menu-card">
      <img src="${item.image}" alt="${item.name}" />

      <div class="menu-card-content">
        <h3>${item.name}</h3>
        <p>${item.description}</p>

        <div class="menu-card-footer">
          <span>${formatPrice(item.price)}</span>
          <button data-add data-id="${item.id}">
            Agregar +
          </button>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

// =======================
// CART
// =======================
function loadCart() {
  const saved = localStorage.getItem("foodCart");
  if (saved) {
    cart = JSON.parse(saved);
    updateCartDisplay();
  }
}

function saveCart() {
  localStorage.setItem("foodCart", JSON.stringify(cart));
}

function addToCart(id) {
  const item = menuData.find((i) => i.id === id);
  const existing = cart.find((i) => i.id === id);

  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ ...item, quantity: 1 });
  }

  saveCart();
  updateCartDisplay();
}

function removeFromCart(id) {
  const item = cart.find((i) => i.id === id);

  if (!item) return;

  item.quantity--;

  if (item.quantity <= 0) {
    cart = cart.filter((i) => i.id !== id);
  }

  saveCart();
  updateCartDisplay();
  renderCheckoutItems();
}

function deleteFromCart(id) {
  cart = cart.filter((i) => i.id !== id);
  saveCart();
  updateCartDisplay();
  renderCheckoutItems();
}

function getTotalItems() {
  return cart.reduce((t, i) => t + i.quantity, 0);
}

function getTotalPrice() {
  return cart.reduce((t, i) => t + i.price * i.quantity, 0);
}

// =======================
// CART UI
// =======================
function updateCartDisplay() {
  if (!UI.cartFloat) return;

  if (cart.length > 0) {
    UI.cartFloat.style.display = "flex";
    UI.cartCount.textContent = getTotalItems();
    UI.cartTotal.textContent = formatPrice(getTotalPrice());
  } else {
    UI.cartFloat.style.display = "none";
  }
}

// =======================
// CHECKOUT
// =======================
function openCheckout() {
  if (cart.length === 0) return;

  UI.checkoutOverlay.style.display = "flex";
  UI.cartFloat.style.display = "none";

  renderCheckoutItems();
}

function closeCheckout() {
  UI.checkoutOverlay.style.display = "none";

  if (cart.length > 0) {
    UI.cartFloat.style.display = "flex";
  }
}

function renderCheckoutItems() {
  if (!UI.checkoutItems) return;

  if (cart.length === 0) {
    UI.checkoutItems.innerHTML = "<p>Tu carrito está vacío</p>";
    return;
  }

  UI.checkoutItems.innerHTML = cart
    .map(
      (item) => `
    <div class="checkout-item">
      <img src="${item.image}" />
      <div>
        <h4>${item.name}</h4>
        <p>${formatPrice(item.price)}</p>
      </div>

      <div>
        <button data-qty-minus data-id="${item.id}">-</button>
        <span>${item.quantity}</span>
        <button data-qty-plus data-id="${item.id}">+</button>
        <button data-delete data-id="${item.id}">🗑️</button>
      </div>
    </div>
  `,
    )
    .join("");

  UI.totalAmount.textContent = formatPrice(getTotalPrice());
}

// =======================
// WHATSAPP
// =======================
function sendOrder() {
  let message = "Nuevo Pedido:%0A";

  cart.forEach((item) => {
    message += `- ${item.name} x${item.quantity}%0A`;
  });

  message += `%0ATotal: ${formatPrice(getTotalPrice())}`;

  window.open(`https://wa.me/?text=${message}`, "_blank");

  cart = [];
  saveCart();
  closeCheckout();
  updateCartDisplay();
}

// =======================
// EVENTS (GLOBAL)
// =======================
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-category]")) {
    setActiveCategory(e.target.closest("[data-category]").dataset.category);
  }

  if (e.target.closest("[data-add]")) {
    addToCart(Number(e.target.closest("[data-add]").dataset.id));
  }

  if (e.target.closest("[data-qty-plus]")) {
    addToCart(Number(e.target.closest("[data-qty-plus]").dataset.id));
  }

  if (e.target.closest("[data-qty-minus]")) {
    removeFromCart(Number(e.target.closest("[data-qty-minus]").dataset.id));
  }

  if (e.target.closest("[data-delete]")) {
    deleteFromCart(Number(e.target.closest("[data-delete]").dataset.id));
  }

  if (e.target.closest("[data-open-checkout]")) {
    openCheckout();
  }

  if (e.target.closest("[data-close-checkout]")) {
    closeCheckout();
  }

  if (e.target.closest("[data-send-order]")) {
    sendOrder();
  }
});

// =======================
// INIT
// =======================
async function init() {
  await loadData();
  updateStatusBadge();
  renderCategories();
  renderMenu();
  loadCart();

  setInterval(updateStatusBadge, 60000);
}

document.addEventListener("DOMContentLoaded", init);
