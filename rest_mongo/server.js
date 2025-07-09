const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const { z } = require("zod");
const http = require("http");
const { Server } = require("socket.io");


const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = 8000;
const client = new MongoClient("mongodb://localhost:27017");
let db;

app.use(express.json());

const ProductSchema = z.object({
    _id: z.string(),
    name: z.string(),
    about: z.string(),
    price: z.number().positive(),
    categoryIds: z.array(z.string())
});
const CreateProductSchema = ProductSchema.omit({ _id: true });

app.use(express.static("public"));

app.post("/products", async (req, res) => {
    const result = await CreateProductSchema.safeParse(req.body);

    if (result.success) {
        try {
            const { name, about, price, categoryIds } = result.data;
            const categoryObjectIds = categoryIds.map((id) => new ObjectId(id));

            const ack = await db.collection("products").insertOne({
                name,
                about,
                price,
                categoryIds: categoryObjectIds,
            });

            const newProduct = {
                _id: ack.insertedId,
                name,
                about,
                price,
                categoryIds: categoryObjectIds,
            };

            io.emit("products", { type: "create", data: newProduct });

            res.status(201).send(newProduct);
        } catch (error) {
            console.error("Erreur POST /products :", error);
            res.status(500).send({ message: "Erreur serveur" });
        }
    } else {
        res.status(400).send(result);
    }
});

app.get("/products", async (req, res) => {
    try {
        const products = await db
            .collection("products")
            .aggregate([
                { $match: {} },
                {
                    $lookup: {
                        from: "categories",
                        localField: "categoryIds",
                        foreignField: "_id",
                        as: "categories",
                    },
                },
            ])
            .toArray();

        res.send(products);
    } catch (error) {
        console.error("Erreur GET /products :", error);
        res.status(500).send({ message: "Erreur serveur" });
    }
});

app.put("/products/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "ID invalide" });
        }

        const result = await CreateProductSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).send(result);
        }

        const { name, about, price, categoryIds } = result.data;
        const categoryObjectIds = categoryIds.map((cid) => new ObjectId(cid));

        const updateResult = await db.collection("products").updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    name,
                    about,
                    price,
                    categoryIds: categoryObjectIds,
                },
            }
        );

        if (updateResult.matchedCount === 0) {
            return res.status(404).send({ message: "Produit non trouvé" });
        }

        const updatedProduct = {
            _id: id,
            name,
            about,
            price,
            categoryIds: categoryObjectIds,
        };

        io.emit("products", { type: "update", data: updatedProduct });

        res.send({ message: "Produit mis à jour" });
    } catch (error) {
        console.error("Erreur PUT /products/:id :", error);
        res.status(500).send({ message: "Erreur serveur" });
    }
});

app.delete("/products/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "ID invalide" });
        }

        const deleteResult = await db.collection("products").deleteOne({ _id: new ObjectId(id) });

        if (deleteResult.deletedCount === 0) {
            return res.status(404).send({ message: "Produit non trouvé" });
        }

        io.emit("products", { type: "delete", data: { _id: id } });

        res.send({ message: "Produit supprimé" });
    } catch (error) {
        console.error("Erreur DELETE /products/:id :", error);
        res.status(500).send({ message: "Erreur serveur" });
    }
});

app.get("/", (req, res) => {
    res.send("API Products avec Socket.io est en ligne !");
});

client.connect().then(async () => {
    db = client.db("myDB");
    console.log("MongoDB connecté");

    server.listen(port, () => {
        console.log(`Serveur démarré sur http://localhost:${port}`);
    });
});
