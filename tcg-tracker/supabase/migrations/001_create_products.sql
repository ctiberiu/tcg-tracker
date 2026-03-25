-- Create products table
CREATE TABLE products (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL,
  title      text NOT NULL,
  price      numeric NOT NULL,
  url        text NOT NULL UNIQUE,
  image_url  text,
  is_notified boolean NOT NULL DEFAULT false,
  first_seen timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all products
CREATE POLICY "Authenticated users can read products"
  ON products
  FOR SELECT
  TO authenticated
  USING (true);

-- Index for dashboard query (newest first)
CREATE INDEX idx_products_first_seen_desc ON products (first_seen DESC);
