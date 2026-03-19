// Data loading
let categories = [];
let activeCategory = "todos";

// Load JSON data from files (menuData is declared in cart.js)
async function loadData() {
  try {
    // Load menu data
    const menuResponse = await fetch("./data/menu.json");
    menuData = await menuResponse.json();

    // Load categories data
    const categoriesResponse = await fetch("./data/categories.json");
    categories = await categoriesResponse.json();
  } catch (error) {
    console.error("Error loading data:", error);
    // Fallback in case JSON files are not available
    console.warn("Using fallback data");
  }
}

// Render categories
function renderCategories() {
  const categoriesContainer = document.getElementById("categories");
  if (!categoriesContainer) return;

  categoriesContainer.innerHTML = categories
    .map(
      (cat) => `
    <button class="category-btn ${cat.id === activeCategory ? "active" : ""}" onclick="filterByCategory('${cat.id}')">
      <span>${cat.icon}</span>
      <span>${cat.name}</span>
    </button>
  `
    )
    .join("");
}

// Filter menu by category
function filterByCategory(categoryId) {
  activeCategory = categoryId;
  renderCategories();
  renderMenu();
}

// Render menu items
function renderMenu() {
  const menuGrid = document.getElementById("menuGrid");
  if (!menuGrid) return;

  const filteredMenu =
    activeCategory === "todos"
      ? menuData
      : menuData.filter((item) => item.category === activeCategory);

  menuGrid.innerHTML = filteredMenu
    .map(
      (item) => `
    <div class="menu-card">
      <div class="menu-card-image">
        <img src="${item.image}" alt="${item.name}" />
      </div>
      <div class="menu-card-content">
        <h3 class="menu-card-title">${item.name}</h3>
        <p class="menu-card-description">${item.description}</p>
        <div class="menu-card-footer">
          <span class="menu-card-price">$${item.price}</span>
          <button class="menu-card-btn" onclick="addToCart(${item.id})">
            Agregar
          </button>
        </div>
      </div>
    </div>
  `
    )
    .join("");
}

// Add to cart
function addToCart(itemId) {
  const item = menuData.find((i) => i.id === itemId);
  if (!item) return;

  const existingItem = cart.find((c) => c.id === itemId);
  if (existingItem) {
    existingItem.quantity++;
  } else {
    cart.push({ ...item, quantity: 1 });
  }

  updateCartUI();
  showCartNotification();
}

// Remove from cart
function removeFromCart(itemId) {
  cart = cart.filter((item) => item.id !== itemId);
  updateCartUI();
}

// Update quantity
function updateQuantity(itemId, quantity) {
  const item = cart.find((c) => c.id === itemId);
  if (item) {
    item.quantity = Math.max(1, quantity);
    updateCartUI();
  }
}

// Update cart UI
function updateCartUI() {
  const cartFloat = document.getElementById("cartFloat");
  const cartCount = document.getElementById("cartCount");
  const cartTotal = document.getElementById("cartTotal");
  const checkoutItems = document.getElementById("checkoutItems");

  if (!cartFloat || cart.length === 0) {
    if (cartFloat) cartFloat.style.display = "none";
    return;
  }

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (cartCount) cartCount.textContent = count;
  if (cartTotal) cartTotal.textContent = `$${total}`;
  if (cartFloat) cartFloat.style.display = "flex";

  if (checkoutItems) {
    checkoutItems.innerHTML = cart
      .map(
        (item) => `
      <div class="checkout-item">
        <img src="${item.image}" alt="${item.name}" class="checkout-item-image">
        <div class="checkout-item-info">
          <h4>${item.name}</h4>
          <p>$${item.price}</p>
        </div>
        <div class="checkout-item-quantity">
          <button onclick="updateQuantity(${item.id}, ${item.quantity - 1})">-</button>
          <span>${item.quantity}</span>
          <button onclick="updateQuantity(${item.id}, ${item.quantity + 1})">+</button>
        </div>
        <button class="remove-btn" onclick="removeFromCart(${item.id})">✕</button>
      </div>
    `
      )
      .join("");
  }
}

// Checkout functions
function openCheckout() {
  const checkoutOverlay = document.getElementById("checkoutOverlay");
  if (checkoutOverlay) {
    checkoutOverlay.style.display = "flex";
  }
}

function closeCheckout() {
  const checkoutOverlay = document.getElementById("checkoutOverlay");
  if (checkoutOverlay) {
    checkoutOverlay.style.display = "none";
  }
}

// Show notification
function showCartNotification() {
  // Simple feedback
  console.log("Item added to cart");
}

// Scroll to menu
function scrollToMenu() {
  const menu = document.getElementById("menu");
  if (menu) {
    menu.scrollIntoView({ behavior: "smooth" });
  }
}

// Update status badge
function updateStatusBadge() {
  const statusBadge = document.getElementById("statusBadge");
  if (!statusBadge) return;

  const now = new Date();
  const hours = now.getHours();
  const isOpen = hours >= 12 && hours < 23;

  statusBadge.textContent = isOpen ? "Abierto" : "Cerrado";
  statusBadge.className = `status-badge ${isOpen ? "open" : "closed"}`;
}

// Initialize
async function init() {
  await loadData();
  renderCategories();
  renderMenu();
  updateStatusBadge();
}

// Start app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
