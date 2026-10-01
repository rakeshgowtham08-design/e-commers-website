const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = 3000;
const db = new Database("shop.db");

db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price REAL NOT NULL,
  image TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Placed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);
`);

const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
if (productCount === 0) {
  const insert = db.prepare(`
    INSERT INTO products (name, description, price, image, stock)
    VALUES (?, ?, ?, ?, ?)
  `);

  const products = [
    ["Wireless Headphones", "Comfortable Bluetooth headphones with clear sound and long battery life.", 2499, "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80", 20],
    ["Smart Watch", "Fitness tracking, notifications and a bright touch display.", 3299, "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80", 15],
    ["Running Shoes", "Lightweight everyday running shoes with cushioned support.", 2899, "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80", 25],
    ["Laptop Backpack", "Water-resistant backpack with a padded laptop compartment.", 1599, "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80", 30],
    ["Mechanical Keyboard", "Compact mechanical keyboard designed for work and gaming.", 3999, "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80", 12],
    ["Coffee Mug", "Minimal ceramic mug for coffee, tea and hot drinks.", 499, "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=80", 50]
  ];

  const transaction = db.transaction(() => products.forEach(p => insert.run(...p)));
  transaction();
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "change-this-secret-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }
}));
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please login first." });
  }
  next();
}

app.get("/api/products", (req, res) => {
  const products = db.prepare("SELECT * FROM products ORDER BY id DESC").all();
  res.json(products);
});

app.get("/api/products/:id", (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });
  res.json(product);
});

app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: "Name, email and password (6+ characters) are required." });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)"
    ).run(name.trim(), email.trim().toLowerCase(), hash);

    req.session.userId = result.lastInsertRowid;
    res.json({ message: "Registration successful.", user: { id: result.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase() } });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Email is already registered." });
    }
    res.status(500).json({ error: "Registration failed." });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get((email || "").trim().toLowerCase());

  if (!user || !(await bcrypt.compare(password || "", user.password))) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  req.session.userId = user.id;
  res.json({ message: "Login successful.", user: { id: user.id, name: user.name, email: user.email } });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ message: "Logged out." }));
});

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(req.session.userId);
  res.json({ user: user || null });
});

app.post("/api/orders", requireAuth, (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Your cart is empty." });
  }

  const getProduct = db.prepare("SELECT * FROM products WHERE id = ?");
  const createOrder = db.prepare("INSERT INTO orders (user_id, total, status) VALUES (?, ?, 'Placed')");
  const createItem = db.prepare("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)");
  const reduceStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?");

  try {
    const result = db.transaction(() => {
      let total = 0;
      const validated = [];

      for (const item of items) {
        const product = getProduct.get(Number(item.productId));
        const quantity = Number(item.quantity);

        if (!product || !Number.isInteger(quantity) || quantity < 1) {
          throw new Error("Invalid product or quantity.");
        }
        if (product.stock < quantity) {
          throw new Error(`${product.name} does not have enough stock.`);
        }

        total += product.price * quantity;
        validated.push({ product, quantity });
      }

      const order = createOrder.run(req.session.userId, total);
      for (const item of validated) {
        const updated = reduceStock.run(item.quantity, item.product.id, item.quantity);
        if (updated.changes !== 1) throw new Error("Stock changed. Please try again.");
        createItem.run(order.lastInsertRowid, item.product.id, item.quantity, item.product.price);
      }

      return { id: order.lastInsertRowid, total };
    })();

    res.json({ message: "Order placed successfully.", order: result });
  } catch (err) {
    res.status(400).json({ error: err.message || "Order could not be placed." });
  }
});

app.get("/api/orders", requireAuth, (req, res) => {
  const orders = db.prepare(`
    SELECT id, total, status, created_at
    FROM orders
    WHERE user_id = ?
    ORDER BY id DESC
  `).all(req.session.userId);
  res.json(orders);
});

app.listen(PORT, () => {
  console.log(`Shop running at http://localhost:${PORT}`);
});