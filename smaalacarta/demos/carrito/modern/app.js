// Data loading
let categories = [];
let activeCategory = "todos";

// Load JSON data from files
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

// Check business hours
function isBusinessOpen() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // Example: Open Monday-Saturday 8:00-22:00, Sunday 10:00-20:00
  if (day === 0) {
    // Sunday
    return hour >= 10 && hour < 20;
  }
  return hour >= 8 && hour < 22;
}

// Update status badge
function updateStatusBadge() {
  const statusBadge = document.getElementById("statusBadge");
  const isOpen = isBusinessOpen();

  if (isOpen) {
    statusBadge.textContent = "🟢 Abierto Ahora";
    statusBadge.classList.add("open");
    statusBadge.classList.remove("closed");
  } else {
    statusBadge.textContent = "🔴 Cerrado";
    statusBadge.classList.add("closed");
    statusBadge.classList.remove("open");
  }
}

// Scroll to menu
function scrollToMenu() {
  document.getElementById("menu").scrollIntoView({ behavior: "smooth" });
}

// Render categories
function renderCategories() {
  const categoriesContainer = document.getElementById("categories");
  categoriesContainer.innerHTML = categories
    .map(
      (category) => `
    <button 
      class="category-btn ${activeCategory === category.id ? "active" : ""}" 
      onclick="setActiveCategory('${category.id}')"
    >
      <span class="category-icon">${category.icon}</span>
      <span class="category-name">${category.name}</span>
    </button>
  `,
    )
    .join("");
}

// Set active category
function setActiveCategory(categoryId) {
  activeCategory = categoryId;
  renderCategories();
  renderMenu();
}

// Render menu
function renderMenu() {
  const menuGrid = document.getElementById("menuGrid");
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
          <span class="menu-card-price">${formatPrice(item.price)}</span>
          <button class="add-to-cart-btn" onclick="addToCart(${item.id})">
            Agregar +
          </button>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

// Initialize app
async function init() {
  await loadData();
  updateStatusBadge();
  renderCategories();
  renderMenu();
  loadCart();

  // Update status badge every minute
  setInterval(updateStatusBadge, 60000);
}

// Start app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
