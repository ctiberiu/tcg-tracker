-- Allow null prices for products where price parsing fails.
-- A product with unknown price is still valuable data for tracking.
ALTER TABLE products ALTER COLUMN price DROP NOT NULL;
