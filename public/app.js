const money = n => `₹${Number(n).toLocaleString("en-IN", {minimumFractionDigits: 2})}`;

function getCart() {
  return JSON.parse(localStorage.getItem("cart") || "[]");
}

function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  const count = getCart().reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll("#cartCount").forEach(el => el.textContent = count);
}

async function loadProducts() {
  const res = await fetch("/api/products");
  const products = await res.json();
  const grid = document.getElementById("productGrid");
  const search = document.getElementById("search");

  function render(list) {
    grid.innerHTML = list.map(p => `
      <article class="card product-card">
        <img src="${p.image}" alt="${escapeHtml(p.name)}">
        <div class="product-info">
          <h3>${escapeHtml(p.name)}</h3>
          <p>${escapeHtml(p.description.slice(0, 80))}...</p>
          <div class="price">${money(p.price)}</div>
          <div class="stock">${p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}</div>
          <div class="product-actions">
            <a class="btn outline" href="product.html?id=${p.id}">Details</a>
            <button class="btn" onclick="addToCart(${p.id})" ${p.stock === 0 ? "disabled" : ""}>Add</button>
          </div>
        </div>
      </article>
    `).join("");
  }

  render(products);
  search?.addEventListener("input", () => {
    const q = search.value.toLowerCase();
    render(products.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)));
  });
}

async function addToCart(productId) {
  const res = await fetch(`/api/products/${productId}`);
  const product = await res.json();
  const cart = getCart();
  const existing = cart.find(x => x.productId === product.id);

  if (existing) {
    if (existing.quantity < product.stock) existing.quantity++;
  } else {
    cart.push({ productId: product.id, quantity: 1, name: product.name, price: product.price, image: product.image, stock: product.stock });
  }

  saveCart(cart);
  alert("Product added to cart.");
}

async function loadProductDetail() {
  updateCartCount();
  const id = new URLSearchParams(location.search).get("id");
  const box = document.getElementById("productDetail");
  if (!id) return box.innerHTML = "<p>Product not found.</p>";

  const res = await fetch(`/api/products/${id}`);
  if (!res.ok) return box.innerHTML = "<p>Product not found.</p>";
  const p = await res.json();

  box.innerHTML = `
    <div class="detail">
      <img src="${p.image}" alt="${escapeHtml(p.name)}">
      <div>
        <p class="eyebrow">Product Details</p>
        <h1>${escapeHtml(p.name)}</h1>
        <p>${escapeHtml(p.description)}</p>
        <div class="price">${money(p.price)}</div>
        <p>${p.stock} available</p>
        <button class="btn" onclick="addToCart(${p.id})" ${p.stock === 0 ? "disabled" : ""}>Add to Cart</button>
      </div>
    </div>
  `;
}

async function loadCart() {
  updateCartCount();
  const box = document.getElementById("cartItems");
  const summary = document.getElementById("cartSummary");
  let cart = getCart();

  if (!cart.length) {
    box.innerHTML = "<p>Your cart is empty. <a href='index.html'>Continue shopping</a>.</p>";
    summary.innerHTML = "";
    return;
  }

  const fresh = [];
  for (const item of cart) {
    const r = await fetch(`/api/products/${item.productId}`);
    if (r.ok) {
      const p = await r.json();
      fresh.push({...item, name: p.name, price: p.price, image: p.image, stock: p.stock});
    }
  }
  cart = fresh;
  saveCart(cart);

  box.innerHTML = cart.map((item, i) => `
    <div class="cart-row">
      <img src="${item.image}" alt="${escapeHtml(item.name)}">
      <div><strong>${escapeHtml(item.name)}</strong><br>${money(item.price)}</div>
      <input class="qty" type="number" min="1" max="${item.stock}" value="${item.quantity}" onchange="changeQty(${i}, this.value)">
      <button class="btn outline" onclick="removeItem(${i})">Remove</button>
    </div>
  `).join("");

  const total = cart.reduce((sum, x) => sum + x.price * x.quantity, 0);
  summary.innerHTML = `
    <div><strong>Total: ${money(total)}</strong></div>
    <br>
    <button class="btn" onclick="checkout()">Place Order</button>
  `;
}

function changeQty(index, value) {
  const cart = getCart();
  const item = cart[index];
  item.quantity = Math.max(1, Math.min(Number(value), item.stock));
  saveCart(cart);
  loadCart();
}

function removeItem(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
  loadCart();
}

async function checkout() {
  const me = await fetch("/api/me").then(r => r.json());
  if (!me.user) {
    alert("Please login before placing an order.");
    location.href = "auth.html";
    return;
  }

  const cart = getCart();
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ items: cart.map(x => ({ productId: x.productId, quantity: x.quantity })) })
  });
  const data = await res.json();

  if (!res.ok) return alert(data.error || "Order failed.");

  localStorage.removeItem("cart");
  alert(`Order #${data.order.id} placed successfully!`);
  location.href = "orders.html";
}

function setupAuth() {
  updateCartCount();

  document.getElementById("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    const res = await fetch("/api/login", {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)
    });
    const data = await res.json();
    document.getElementById("loginMsg").textContent = data.error || data.message;
    if (res.ok) setTimeout(() => location.href = "index.html", 500);
  });

  document.getElementById("registerForm").addEventListener("submit", async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    const res = await fetch("/api/register", {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)
    });
    const data = await res.json();
    document.getElementById("registerMsg").textContent = data.error || data.message;
    if (res.ok) setTimeout(() => location.href = "index.html", 500);
  });
}

async function loadOrders() {
  updateCartCount();
  const box = document.getElementById("ordersList");
  const me = await fetch("/api/me").then(r => r.json());

  if (!me.user) {
    box.innerHTML = `<p>Please <a href="auth.html">login</a> to see your orders.</p>`;
    return;
  }

  const res = await fetch("/api/orders");
  const orders = await res.json();

  if (!orders.length) {
    box.innerHTML = "<p>No orders yet.</p>";
    return;
  }

  box.innerHTML = orders.map(o => `
    <div class="order">
      <h3>Order #${o.id}</h3>
      <p>Total: <strong>${money(o.total)}</strong></p>
      <p>Status: ${escapeHtml(o.status)}</p>
      <small>${new Date(o.created_at).toLocaleString()}</small>
    </div>
  `).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

document.addEventListener("DOMContentLoaded", () => {
  updateCartCount();
  if (document.getElementById("productGrid")) loadProducts();
});
