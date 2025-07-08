const express = require("express");
const postgres = require("postgres");
const crypto = require("crypto");
const z = require("zod");

const app = express();
const port = 8000;

// ✅ Connexion PostgreSQL
const sql = postgres({ db: "REST", user: "user", password: "postgres", port: "5433" });

// ✅ Middleware pour JSON
app.use(express.json());

/* ---------------------------------------------------------
  🔥 Schémas Zod
--------------------------------------------------------- */

// Produits
const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  about: z.string(),
  price: z.number().positive(),
});
const CreateProductSchema = ProductSchema.omit({ id: true });

// Utilisateurs
const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  password: z.string(),
  email: z.string().email(),
});
const CreateUserSchema = UserSchema.omit({ id: true });
const UpdateUserSchema = CreateUserSchema.partial();

/* ---------------------------------------------------------
  🔥 Utilitaires
--------------------------------------------------------- */
function hashPassword(password) {
  return crypto.createHash("sha512").update(password).digest("hex");
}

/* ---------------------------------------------------------
  🔥 Routes Produits
--------------------------------------------------------- */

// Créer un produit
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

// Lister tous les produits
app.get("/products", async (req, res) => {
  try {
    const products = await sql`SELECT * FROM products`;
    res.send(products);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la récupération des produits." });
  }
});

// Obtenir un produit par ID
app.get("/products/:id", async (req, res) => {
  try {
    const product = await sql`SELECT * FROM products WHERE id = ${req.params.id}`;
    if (product.length > 0) {
      res.send(product[0]);
    } else {
      res.status(404).send({ message: "Produit non trouvé." });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la récupération du produit." });
  }
});

// Supprimer un produit
app.delete("/products/:id", async (req, res) => {
  try {
    const deleted = await sql`
      DELETE FROM products
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (deleted.length > 0) {
      res.send(deleted[0]);
    } else {
      res.status(404).send({ message: "Produit non trouvé." });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Erreur lors de la suppression du produit." });
  }
});

/* ---------------------------------------------------------
  🔥 Routes Utilisateurs
--------------------------------------------------------- */

// Créer un utilisateur
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

// Modifier entièrement un utilisateur (PUT)
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

// Modifier partiellement un utilisateur (PATCH)
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

/* ---------------------------------------------------------
  🔥 Route racine
--------------------------------------------------------- */
app.get("/", (req, res) => {
  res.send("Hello World!");
});

/* ---------------------------------------------------------
  🔥 Lancement du serveur
--------------------------------------------------------- */
app.listen(port, () => {
  console.log(`✅ Listening on http://localhost:${port}`);
});
