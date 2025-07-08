const express = require("express");
const postgres = require("postgres");
const z = require("zod");
const crypto = require("crypto");
const fetch = require("node-fetch");

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

function hashPassword(password) {
  return crypto.createHash("sha512").update(password).digest("hex");
}

app.post("/products", async (req, res) => {
  const result = await CreateProductSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).send(result);
  }

  const { name, about, price } = result.data;

  try {
    const product = await sql`
      INSERT INTO products (name, about, price)
      VALUES (${name}, ${about}, ${price})
      RETURNING *
    `;
    res.status(201).send(product[0]);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la création du produit." });
  }
});

app.get("/products", async (req, res) => {
  try {
    const { name, about, price } = req.query;

    let query = sql`SELECT * FROM products WHERE TRUE`;

    if (name) {
      query = sql`${query} AND name ILIKE ${'%' + name + '%'}`;
    }
    if (about) {
      query = sql`${query} AND about ILIKE ${'%' + about + '%'}`;
    }
    if (price) {
      const numericPrice = parseFloat(price);
      if (!isNaN(numericPrice)) {
        query = sql`${query} AND price <= ${numericPrice}`;
      }
    }

    const products = await query;
    res.send(products);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la recherche des produits." });
  }
});

app.get("/products/:id", async (req, res) => {
  const product = await sql`
    SELECT * FROM products WHERE id = ${req.params.id}
  `;

  if (product.length > 0) {
    res.send(product[0]);
  } else {
    res.status(404).send({ message: "Produit non trouvé." });
  }
});

app.delete("/products/:id", async (req, res) => {
  const product = await sql`
    DELETE FROM products
    WHERE id = ${req.params.id}
    RETURNING *
  `;

  if (product.length > 0) {
    res.send(product[0]);
  } else {
    res.status(404).send({ message: "Produit non trouvé." });
  }
});

app.post("/users", async (req, res) => {
  const result = await CreateUserSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).send(result);
  }

  const { username, password, email } = result.data;
  const hashed = hashPassword(password);

  try {
    const user = await sql`
      INSERT INTO users (username, password, email)
      VALUES (${username}, ${hashed}, ${email})
      RETURNING id, username, email
    `;
    res.status(201).send(user[0]);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la création de l'utilisateur." });
  }
});

app.put("/users/:id", async (req, res) => {
  const result = await CreateUserSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).send(result);
  }

  const { username, password, email } = result.data;
  const hashed = hashPassword(password);

  try {
    const updated = await sql`
      UPDATE users
      SET username = ${username}, password = ${hashed}, email = ${email}
      WHERE id = ${req.params.id}
      RETURNING id, username, email
    `;

    if (updated.length > 0) {
      res.send(updated[0]);
    } else {
      res.status(404).send({ message: "Utilisateur non trouvé." });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la mise à jour." });
  }
});

app.patch("/users/:id", async (req, res) => {
  const result = await UpdateUserSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).send(result);
  }

  try {
    const userInDb = await sql`
      SELECT * FROM users WHERE id = ${req.params.id}
    `;

    if (userInDb.length === 0) {
      return res.status(404).send({ message: "Utilisateur non trouvé." });
    }

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
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la modification." });
  }
});

app.get("/f2p-games", async (req, res) => {
  try {
    const response = await fetch("https://www.freetogame.com/api/games");
    const games = await response.json();
    res.send(games);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la récupération des jeux." });
  }
});

app.get("/f2p-games/:id", async (req, res) => {
  try {
    const response = await fetch(`https://www.freetogame.com/api/game?id=${req.params.id}`);
    const game = await response.json();

    if (game && game.id) {
      res.send(game);
    } else {
      res.status(404).send({ message: "Jeu non trouvé." });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la récupération du jeu." });
  }
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${port}`);
});
