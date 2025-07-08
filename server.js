const express = require("express");
const postgres = require("postgres");
const z = require("zod");
const crypto = require("crypto");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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
  if (result.success) {
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
  } else {
    res.status(400).send(result);
  }
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/products", async (req, res) => {
  try {
    const products = await sql`SELECT * FROM products`;
    res.send(products);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la récupération des produits." });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    const product = await sql`SELECT * FROM products WHERE id=${req.params.id}`;
    if (product.length > 0) {
      res.send(product[0]);
    } else {
      res.status(404).send({ message: "Produit non trouvé." });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur serveur." });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    const product = await sql`
      DELETE FROM products
      WHERE id=${req.params.id}
      RETURNING *
    `;
    if (product.length > 0) {
      res.send(product[0]);
    } else {
      res.status(404).send({ message: "Produit non trouvé." });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur serveur." });
  }
});


app.post("/users", async (req, res) => {
  const result = await CreateUserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).send(result);
  }
  const { username, password, email } = result.data;
  try {
    const hashed = hashPassword(password);
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
    const userInDb = await sql`SELECT * FROM users WHERE id = ${req.params.id}`;
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
    if (!response.ok) {
      return res.status(500).json({ message: "Erreur lors de la récupération des jeux F2P." });
    }
    const games = await response.json();
    res.json(games);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur." });
  }
});

app.get("/f2p-games/:id", async (req, res) => {
  try {
    const response = await fetch(`https://www.freetogame.com/api/game?id=${req.params.id}`);
    if (!response.ok) {
      return res.status(500).json({ message: "Erreur lors de la récupération du jeu F2P." });
    }
    const game = await response.json();
    if (!game || game.status === 0) {
      return res.status(404).json({ message: "Jeu F2P non trouvé." });
    }
    res.json(game);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur." });
  }
});

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
