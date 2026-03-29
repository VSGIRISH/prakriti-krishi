CREATE TABLE categories (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  price       DECIMAL(10,2) NOT NULL,
  old_price   DECIMAL(10,2),
  category_id INT REFERENCES categories(id),
  tag         VARCHAR(50),
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE orders (
  id         SERIAL PRIMARY KEY,
  email      VARCHAR(255) NOT NULL,
  total      DECIMAL(10,2) NOT NULL,
  status     VARCHAR(20) DEFAULT 'pending',
  shipping   JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INT REFERENCES orders(id),
  product_id INT REFERENCES products(id),
  qty        INT NOT NULL,
  price      DECIMAL(10,2) NOT NULL
);
