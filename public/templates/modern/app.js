// Menu Data
const menuData = [
  // Cafés
  {
    id: 1,
    name: "Café Americano",
    description: "Café espresso con agua caliente",
    price: 850,
    category: "cafes",
    image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400",
  },
  {
    id: 2,
    name: "Café Latte",
    description: "Espresso con leche vaporizada",
    price: 1200,
    category: "cafes",
    image: "https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400",
  },
  {
    id: 3,
    name: "Capuchino",
    description: "Espresso con espuma de leche",
    price: 1200,
    category: "cafes",
    image: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400",
  },
  {
    id: 4,
    name: "Café Frío",
    description: "Café helado con hielo",
    price: 1400,
    category: "cafes",
    image: "https://images.unsplash.com/photo-1517487881594-2787fef5ebf7?w=400",
  },

  // Comidas
  {
    id: 5,
    name: "Sándwich Club",
    description: "Pollo, tocino, lechuga y tomate",
    price: 3500,
    category: "comidas",
    image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400",
  },
  {
    id: 6,
    name: "Hamburguesa Clásica",
    description: "Carne de res, queso, lechuga y tomate",
    price: 4200,
    category: "comidas",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400",
  },
  {
    id: 7,
    name: "Ensalada César",
    description: "Lechuga romana, pollo, crutones y aderezo",
    price: 3200,
    category: "comidas",
    image: "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400",
  },
  {
    id: 8,
    name: "Pizza Margarita",
    description: "Tomate, mozzarella y albahaca fresca",
    price: 4800,
    category: "comidas",
    image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400",
  },

  // Postres
  {
    id: 9,
    name: "Tarta de Chocolate",
    description: "Delicioso pastel de chocolate oscuro",
    price: 2200,
    category: "postres",
    image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400",
  },
  {
    id: 10,
    name: "Cheesecake",
    description: "Tarta de queso con frutos rojos",
    price: 2200,
    category: "postres",
    image: "https://images.unsplash.com/photo-1533134486753-c833f0ed4866?w=400",
  },
  {
    id: 11,
    name: "Brownie",
    description: "Brownie casero con nueces",
    price: 1800,
    category: "postres",
    image: "https://images.unsplash.com/photo-1607920591413-4ec007e70023?w=400",
  },
  {
    id: 12,
    name: "Helado Artesanal",
    description: "Dos bolas de helado a elegir",
    price: 1500,
    category: "postres",
    image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400",
  },

  // Bebidas
  {
    id: 13,
    name: "Limonada Natural",
    description: "Limonada fresca recién exprimida",
    price: 900,
    category: "bebidas",
    image: "https://images.unsplash.com/photo-1523677011781-c91d1bbe2f9d?w=400",
  },
  {
    id: 14,
    name: "Zumo de Naranja",
    description: "Zumo natural de naranja",
    price: 1100,
    category: "bebidas",
    image: "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400",
  },
  {
    id: 15,
    name: "Té Helado",
    description: "Té frío con limón",
    price: 900,
    category: "bebidas",
    image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400",
  },
  {
    id: 16,
    name: "Batido de Frutas",
    description: "Batido natural de frutas frescas",
    price: 1600,
    category: "bebidas",
    image: "https://images.unsplash.com/photo-1505252585461-04db1eb84625?w=400",
  },
];

const categories = [
  { id: "todos", name: "Todos", icon: "🍽️" },
  { id: "cafes", name: "Cafés", icon: "☕" },
  { id: "comidas", name: "Comidas", icon: "🍔" },
  { id: "postres", name: "Postres", icon: "🍰" },
  { id: "bebidas", name: "Bebidas", icon: "🥤" },
];

// State
let cart = [];
let activeCategory = "todos";

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

// Format price to Argentine pesos
function formatPrice(price) {
  return "$" + price.toLocaleString("es-AR");
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
  `
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
  `
    )
    .join("");
}

// Load cart from localStorage
function loadCart() {
  const savedCart = localStorage.getItem("foodCart");
  if (savedCart) {
    cart = JSON.parse(savedCart);
    updateCartDisplay();
  }
}

// Save cart to localStorage
function saveCart() {
  localStorage.setItem("foodCart", JSON.stringify(cart));
}

// Add to cart
function addToCart(itemId) {
  const item = menuData.find((i) => i.id === itemId);
  const existingItem = cart.find((i) => i.id === itemId);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ ...item, quantity: 1 });
  }

  saveCart();
  updateCartDisplay();
}

// Remove from cart
function removeFromCart(itemId) {
  const existingItem = cart.find((i) => i.id === itemId);

  if (existingItem && existingItem.quantity > 1) {
    existingItem.quantity -= 1;
  } else {
    cart = cart.filter((i) => i.id !== itemId);
  }

  saveCart();
  updateCartDisplay();
  renderCheckoutItems();
}

// Delete from cart
function deleteFromCart(itemId) {
  cart = cart.filter((i) => i.id !== itemId);
  saveCart();
  updateCartDisplay();
  renderCheckoutItems();
}

// Get total items
function getTotalItems() {
  return cart.reduce((total, item) => total + item.quantity, 0);
}

// Get total price
function getTotalPrice() {
  return cart.reduce((total, item) => total + item.price * item.quantity, 0);
}

// Update cart display
function updateCartDisplay() {
  const cartFloat = document.getElementById("cartFloat");
  const cartCount = document.getElementById("cartCount");
  const cartTotal = document.getElementById("cartTotal");

  if (cart.length > 0) {
    cartFloat.style.display = "flex";
    cartCount.textContent = getTotalItems();
    cartTotal.textContent = formatPrice(getTotalPrice());
  } else {
    cartFloat.style.display = "none";
  }
}

// Open checkout
function openCheckout() {
  if (cart.length === 0) return;

  const overlay = document.getElementById("checkoutOverlay");
  overlay.style.display = "flex";
  document.getElementById("cartFloat").style.display = "none";

  renderCheckoutItems();
}

// Close checkout
function closeCheckout() {
  const overlay = document.getElementById("checkoutOverlay");
  overlay.style.display = "none";

  if (cart.length > 0) {
    document.getElementById("cartFloat").style.display = "flex";
  }
}

// Render checkout items
function renderCheckoutItems() {
  const checkoutItems = document.getElementById("checkoutItems");
  const checkoutTotal = document.getElementById("checkoutTotal");
  const checkoutForm = document.getElementById("checkoutForm");
  const totalAmount = document.getElementById("totalAmount");

  if (cart.length === 0) {
    checkoutItems.innerHTML = '<p class="empty-cart">Tu carrito está vacío</p>';
    checkoutTotal.style.display = "none";
    checkoutForm.style.display = "none";
  } else {
    checkoutItems.innerHTML = `
      <div class="checkout-items">
        ${cart
          .map(
            (item) => `
          <div class="checkout-item">
            <img src="${item.image}" alt="${
              item.name
            }" class="checkout-item-image" />
            <div class="checkout-item-details">
              <h4>${item.name}</h4>
              <p class="checkout-item-price">${formatPrice(item.price)}</p>
            </div>
            <div class="checkout-item-controls">
              <button class="qty-btn" onclick="removeFromCart(${
                item.id
              })">−</button>
              <span class="qty-display">${item.quantity}</span>
              <button class="qty-btn" onclick="addToCart(${item.id})">+</button>
              <button class="delete-btn" onclick="deleteFromCart(${
                item.id
              })">🗑️</button>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;

    checkoutTotal.style.display = "flex";
    checkoutForm.style.display = "block";
    totalAmount.textContent = formatPrice(getTotalPrice());
  }
}

// Toggle scheduled time input
function toggleScheduledTime() {
  const pickupTime = document.querySelector(
    'input[name="pickupTime"]:checked'
  ).value;
  const scheduledTimeInput = document.getElementById("scheduledTime");

  if (pickupTime === "scheduled") {
    scheduledTimeInput.style.display = "block";
  } else {
    scheduledTimeInput.style.display = "none";
  }
}

// Send order to WhatsApp
function sendOrder() {
  const customerName = document.getElementById("customerName").value.trim();

  if (!customerName) {
    alert("Por favor, ingresa tu nombre");
    return;
  }

  // Get form values
  const deliveryType = document.querySelector(
    'input[name="deliveryType"]:checked'
  ).value;
  const pickupTime = document.querySelector(
    'input[name="pickupTime"]:checked'
  ).value;
  const scheduledTime = document.getElementById("scheduledTime").value;
  const paymentMethod = document.querySelector(
    'input[name="paymentMethod"]:checked'
  ).value;

  // Generate WhatsApp message
  let message = "*Nuevo Pedido* 🍽️\\n\\n";
  message += `*Cliente:* ${customerName}\\n`;

  const deliveryTypeLabel =
    deliveryType === "delivery" ? "Entrega a domicilio" : "Para llevar";
  message += `*Tipo de Entrega:* ${deliveryTypeLabel}\\n`;

  if (pickupTime === "scheduled" && scheduledTime) {
    message += `*Hora:* ${scheduledTime}\\n`;
  } else {
    message += "*Hora:* Lo antes posible\\n";
  }

  const paymentLabels = {
    efectivo: "Efectivo",
    qr: "QR",
    transferencia: "Transferencia",
  };
  message += `*Método de Pago:* ${paymentLabels[paymentMethod]}\\n`;
  message += "\\n*Pedido:*\\n";

  cart.forEach((item) => {
    const itemTotal = item.price * item.quantity;
    message += `• ${item.quantity}x ${item.name} - ${formatPrice(
      itemTotal
    )}\\n`;
  });

  message += `\\n*Total: ${formatPrice(getTotalPrice())}*`;

  // Encode message for WhatsApp
  const encodedMessage = encodeURIComponent(message);

  // IMPORTANTE: Reemplaza este número con tu número de WhatsApp
  // Formato: código de país + número sin espacios ni símbolos
  // Ejemplo: 5491123456789 para Argentina
  const whatsappNumber = ""; // <-- CONFIGURA TU NÚMERO AQUÍ

  let whatsappUrl;
  if (whatsappNumber) {
    whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
  } else {
    whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
  }

  // Open WhatsApp
  window.open(whatsappUrl, "_blank");

  // Clear cart and close checkout
  cart = [];
  saveCart();
  closeCheckout();
  updateCartDisplay();

  // Reset form
  document.getElementById("customerName").value = "";
  document.querySelector(
    'input[name="deliveryType"][value="takeaway"]'
  ).checked = true;
  document.querySelector(
    'input[name="pickupTime"][value="now"]'
  ).checked = true;
  document.getElementById("scheduledTime").value = "";
  document.getElementById("scheduledTime").style.display = "none";
  document.querySelector(
    'input[name="paymentMethod"][value="efectivo"]'
  ).checked = true;
}

// Initialize app
function init() {
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
