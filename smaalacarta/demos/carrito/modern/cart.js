// Cart Management Module
let cart = [];
let menuData = [];

// Format price to Argentine pesos
function formatPrice(price) {
  return "$" + price.toLocaleString("es-AR");
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

// Remove from cart (decrease quantity)
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

// Delete from cart completely
function deleteFromCart(itemId) {
  cart = cart.filter((i) => i.id !== itemId);
  saveCart();
  updateCartDisplay();
  renderCheckoutItems();
}

// Get total items count
function getTotalItems() {
  return cart.reduce((total, item) => total + item.quantity, 0);
}

// Get total price
function getTotalPrice() {
  return cart.reduce((total, item) => total + item.price * item.quantity, 0);
}

// Update floating cart display
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

// Open checkout modal
function openCheckout() {
  if (cart.length === 0) return;

  const overlay = document.getElementById("checkoutOverlay");
  overlay.style.display = "flex";
  document.getElementById("cartFloat").style.display = "none";

  renderCheckoutItems();
}

// Close checkout modal
function closeCheckout() {
  const overlay = document.getElementById("checkoutOverlay");
  overlay.style.display = "none";

  if (cart.length > 0) {
    document.getElementById("cartFloat").style.display = "flex";
  }
}

// Render checkout items in modal
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

// Toggle scheduled time input visibility
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
