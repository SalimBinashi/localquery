import type { PlaygroundState } from '@/types/workspace';
import { GENERATOR_VERSION } from '@/lib/limits';

export const DEFAULT_SCHEMA = `-- Example e-commerce schema. Edit freely, then press "Interpret Schema & Generate Seed".
CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  phone       TEXT,                                   -- nullable
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  TEXT                                    -- mostly NULL
);

CREATE TABLE products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sku         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  price       REAL NOT NULL CHECK (price >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at  TEXT NOT NULL
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  total       REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  shipped_at  TEXT
);

CREATE TABLE order_items (
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  REAL NOT NULL CHECK (unit_price >= 0),
  PRIMARY KEY (order_id, product_id)
);

CREATE INDEX idx_orders_user ON orders(user_id);
`;

export const DEFAULT_QUERY = `-- Revenue per customer (JOIN + aggregation). Press Ctrl/Cmd+Enter to run.
SELECT
  u.id,
  u.first_name || ' ' || u.last_name AS customer,
  COUNT(DISTINCT o.id)                  AS orders,
  ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
FROM users u
JOIN orders o       ON o.user_id = u.id
JOIN order_items oi ON oi.order_id = o.id
GROUP BY u.id
ORDER BY revenue DESC
LIMIT 20;
`;

export const EXAMPLE_QUERIES: readonly { readonly label: string; readonly sql: string }[] = [
  { label: 'JOIN + aggregation', sql: DEFAULT_QUERY },
  { label: 'Window function (rank orders)', sql: `SELECT user_id, id AS order_id, total,\n  RANK() OVER (PARTITION BY user_id ORDER BY total DESC) AS rank_in_user\nFROM orders\nORDER BY user_id, rank_in_user\nLIMIT 50;` },
  { label: 'Recursive CTE (1..10)', sql: `WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 10)\nSELECT x, x * x AS square FROM n;` },
  { label: 'CTE + subquery', sql: `WITH order_totals AS (\n  SELECT order_id, SUM(quantity * unit_price) AS amount FROM order_items GROUP BY order_id\n)\nSELECT o.id, o.status, ot.amount\nFROM orders o JOIN order_totals ot ON ot.order_id = o.id\nWHERE ot.amount > (SELECT AVG(amount) FROM order_totals)\nORDER BY ot.amount DESC;` },
  { label: 'GROUP BY + HAVING', sql: `SELECT status, COUNT(*) AS n, ROUND(AVG(total), 2) AS avg_total\nFROM orders\nGROUP BY status\nHAVING COUNT(*) > 1\nORDER BY n DESC;` },
  { label: 'INSERT … RETURNING', sql: `INSERT INTO users (email, first_name, last_name)\nVALUES ('ada@example.com', 'Ada', 'Lovelace')\nRETURNING id, email, created_at;` },
  { label: 'UPDATE', sql: `UPDATE products SET stock = stock + 10 WHERE stock < 20;` },
  { label: 'DELETE (cascades)', sql: `DELETE FROM orders WHERE status = 'cancelled';` },
  { label: 'Create a view', sql: `CREATE VIEW IF NOT EXISTS active_users AS\n  SELECT id, email FROM users WHERE is_active = 1 AND deleted_at IS NULL;\nSELECT * FROM active_users LIMIT 10;` },
  { label: 'ALTER TABLE', sql: `ALTER TABLE users ADD COLUMN nickname TEXT;\nSELECT id, email, nickname FROM users LIMIT 5;` },
  { label: 'Explicit transaction', sql: `BEGIN;\nUPDATE products SET price = price * 1.1;\nSELECT id, name, price FROM products LIMIT 5;\nROLLBACK;` },
  { label: 'PRAGMA foreign_key_list', sql: `PRAGMA foreign_key_list('order_items');` },
  { label: 'JSON functions', sql: `SELECT json_object('id', id, 'email', email) AS doc FROM users LIMIT 5;` },
];

export function defaultWorkspace(randomSeed = 42): PlaygroundState {
  return {
    version: 1,
    generatorVersion: GENERATOR_VERSION,
    schema: DEFAULT_SCHEMA,
    currentQuery: DEFAULT_QUERY,
    seedConfig: { enabled: true, rowsPerTable: 50, randomSeed, locale: 'en' },
    schemaOptions: { seedOnApply: true },
  };
}
