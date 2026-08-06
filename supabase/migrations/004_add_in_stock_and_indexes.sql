-- Add in_stock column to products (default true so existing products are not hidden)
ALTER TABLE products ADD COLUMN in_stock boolean DEFAULT true;

-- Add store_id FK to products for proper relational link
ALTER TABLE products ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE SET NULL;

-- Indexes for filtered queries
CREATE INDEX idx_products_store_name ON products (store_name);
CREATE INDEX idx_products_price ON products (price);
CREATE INDEX idx_products_in_stock ON products (in_stock);

-- Trigger to preserve first_seen on upsert updates
CREATE OR REPLACE FUNCTION preserve_first_seen()
RETURNS TRIGGER AS $$
BEGIN
  NEW.first_seen = OLD.first_seen;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_preserve_first_seen
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION preserve_first_seen();
