-- Fix any existing NULL values before adding NOT NULL constraint
UPDATE products SET in_stock = true WHERE in_stock IS NULL;

-- Add NOT NULL constraint to match TypeScript Product type contract
ALTER TABLE products ALTER COLUMN in_stock SET NOT NULL;
