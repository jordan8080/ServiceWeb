const express = require("express");
const postgres = require("postgres");
const z = require("zod");
const crypto = require("crypto");

const app = express();
const port = 8000;
const sql = postgres({ db: "REST", user: "user", password: "postgres", port: "5433" });

app.use(express.json());

const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  about: z.string(),
  price: z.number().positive(),
});
const CreateProductSchema = ProductSchema.omit({ id: true });

const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  password: z.string(),
  email: z.string().email(),
});
const CreateUserSchema = UserSchema.omit({ id: true });
const UpdateUserSchema = CreateUserSchema.partial();

const OrderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  productIds: z.array(z.string()),
  total: z.number(),
  payment: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const CreateOrderSchema = z.object({
  userId: z.number(),
  productIds: z.array(z.number()),
});

function hashPassword(password) {
  return crypto.createHash("sha512").update(password).digest("hex");
}

app.post("/products", async (req, res) => {
  const result = await CreateProductSchema.safeParse(req.body);
  if (result.success) {
    const { name, about, price } = result.data;
    const product = await sql`
      INSERT INTO products (name, about, price)
      VALUES (${name}, ${about}, ${price})
      RETURNING *
    `;
    res.send(product[0]);
  } else {
    res.status(400).send(result);
  }
});

app.get("/products", async (req, res) => {
  const { name, about, price } = req.query;

  try {
    let conditions = [];
    if (name) {
      conditions.push(sql`name ILIKE ${'%' + name + '%'}`);
    }
    if (about) {
      conditions.push(sql`about ILIKE ${'%' + about + '%'}`);
    }
    if (price) {
      conditions.push(sql`price <= ${Number(price)}`);
    }

    let products;

    if (conditions.length > 0) {
      products = await sql`
        SELECT * FROM products
        WHERE ${sql.join(conditions, sql` AND `)}
      `;
    } else {
      products = await sql`
        SELECT * FROM products
      `;
    }

    res.send(products);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la recherche de produits." });
  }
});

app.get("/products/:id", async (req, res) => {
  const product = await sql`SELECT * FROM products WHERE id=${req.params.id}`;
  if (product.length > 0) {
    res.send(product[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

app.delete("/products/:id", async (req, res) => {
  const product = await sql`
    DELETE FROM products
    WHERE id=${req.params.id}
    RETURNING *
  `;
  if (product.length > 0) {
    res.send(product[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

app.post("/users", async (req, res) => {
  const result = await CreateUserSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result);
  const { username, password, email } = result.data;
  const hashed = hashPassword(password);
  const user = await sql`
    INSERT INTO users (username, password, email)
    VALUES (${username}, ${hashed}, ${email})
    RETURNING id, username, email
  `;
  res.status(201).send(user[0]);
});

app.get("/users", async (req, res) => {
  try {
    const users = await sql`
      SELECT id, username, email FROM users
    `;
    res.send(users);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la récupération des utilisateurs." });
  }
});

app.put("/users/:id", async (req, res) => {
  const result = await CreateUserSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result);
  const { username, password, email } = result.data;
  const hashed = hashPassword(password);
  const updated = await sql`
    UPDATE users
    SET username = ${username}, password = ${hashed}, email = ${email}
    WHERE id = ${req.params.id}
    RETURNING id, username, email
  `;
  if (updated.length > 0) res.send(updated[0]);
  else res.status(404).send({ message: "Utilisateur non trouvé." });
});

app.patch("/users/:id", async (req, res) => {
  const result = await UpdateUserSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result);
  const userInDb = await sql`SELECT * FROM users WHERE id = ${req.params.id}`;
  if (userInDb.length === 0) return res.status(404).send({ message: "Utilisateur non trouvé." });
  const user = userInDb[0];
  const newUsername = result.data.username ?? user.username;
  const newPassword = result.data.password ? hashPassword(result.data.password) : user.password;
  const newEmail = result.data.email ?? user.email;
  const updated = await sql`
    UPDATE users
    SET username = ${newUsername}, password = ${newPassword}, email = ${newEmail}
    WHERE id = ${req.params.id}
    RETURNING id, username, email
  `;
  res.send(updated[0]);
});

app.get("/f2p-games", async (req, res) => {
  const response = await fetch("https://www.freetogame.com/api/games");
  const data = await response.json();
  res.send(data);
});

app.get("/f2p-games/:id", async (req, res) => {
  const response = await fetch(`https://www.freetogame.com/api/game?id=${req.params.id}`);
  const data = await response.json();
  res.send(data);
});

app.post("/orders", async (req, res) => {
  const result = await CreateOrderSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result);

  const { userId, productIds } = result.data;
  const products = await sql`SELECT * FROM products WHERE id = ANY(${productIds})`;
  const total = products.reduce((sum, p) => sum + p.price, 0) * 1.2;

  const now = new Date().toISOString();
  const order = await sql`
    INSERT INTO orders (user_id, product_ids, total, payment, created_at, updated_at)
    VALUES (${userId}, ${productIds}, ${total}, false, ${now}, ${now})
    RETURNING *
  `;

  res.status(201).send(order[0]);
});

app.get("/orders", async (req, res) => {
  const orders = await sql`SELECT * FROM orders`;
  const detailedOrders = await Promise.all(
    orders.map(async (order) => {
      const user = await sql`SELECT id, username, email FROM users WHERE id = ${order.user_id}`;
      const products = await sql`SELECT * FROM products WHERE id = ANY(${order.product_ids})`;
      return {
        ...order,
        user: user[0],
        products: products,
      };
    })
  );
  res.send(detailedOrders);
});

app.get("/orders/:id", async (req, res) => {
  const orders = await sql`SELECT * FROM orders WHERE id = ${req.params.id}`;
  if (orders.length === 0) return res.status(404).send({ message: "Commande non trouvée." });
  const order = orders[0];
  const user = await sql`SELECT id, username, email FROM users WHERE id = ${order.user_id}`;
  const products = await sql`SELECT * FROM products WHERE id = ANY(${order.product_ids})`;
  res.send({ ...order, user: user[0], products: products });
});

app.put("/orders/:id", async (req, res) => {
  const result = await CreateOrderSchema.safeParse(req.body);
  if (!result.success) return res.status(400).send(result);

  const { userId, productIds } = result.data;
  const products = await sql`SELECT * FROM products WHERE id = ANY(${productIds})`;
  const total = products.reduce((sum, p) => sum + p.price, 0) * 1.2;
  const now = new Date().toISOString();

  const updated = await sql`
    UPDATE orders
    SET user_id = ${userId}, product_ids = ${productIds}, total = ${total}, updated_at = ${now}
    WHERE id = ${req.params.id}
    RETURNING *
  `;

  if (updated.length === 0) return res.status(404).send({ message: "Commande non trouvée." });
  res.send(updated[0]);
});

app.patch("/orders/:id", async (req, res) => {
  const orderInDb = await sql`SELECT * FROM orders WHERE id = ${req.params.id}`;
  if (orderInDb.length === 0) return res.status(404).send({ message: "Commande non trouvée." });
  const order = orderInDb[0];

  const newPayment = req.body.payment ?? order.payment;
  const now = new Date().toISOString();

  const updated = await sql`
    UPDATE orders
    SET payment = ${newPayment}, updated_at = ${now}
    WHERE id = ${req.params.id}
    RETURNING *
  `;

  res.send(updated[0]);
});

app.delete("/orders/:id", async (req, res) => {
  const deleted = await sql`DELETE FROM orders WHERE id = ${req.params.id} RETURNING *`;
  if (deleted.length === 0) return res.status(404).send({ message: "Commande non trouvée." });
  res.send(deleted[0]);
});

// ---------------- Root ----------------
app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
