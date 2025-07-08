CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  about VARCHAR(500),
  price FLOAT
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_ids INTEGER[] NOT NULL,
    total NUMERIC NOT NULL,
    payment BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);


INSERT INTO products (name, about, price) VALUES
  ('My first game', 'This is an awesome game', '60')