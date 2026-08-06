-- Track when a product last transitioned to out-of-stock, so the scraper can
-- clean up products that have been continuously OOS for a long time. Handled
-- entirely at the DB level (mirrors the existing preserve_first_seen trigger)
-- so the scraper's upsert doesn't need to carry the transition logic itself:
--   - in_stock goes true -> false: stamp out_of_stock_since = now()
--   - still false on both sides (unchanged): preserve the original timestamp
--     (NOT now() — otherwise the "how long has this been OOS" clock would
--     reset on every single scrape and cleanup could never trigger)
--   - back in stock: clear to NULL

ALTER TABLE products ADD COLUMN out_of_stock_since timestamptz;

CREATE OR REPLACE FUNCTION set_out_of_stock_since()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.out_of_stock_since := CASE WHEN NEW.in_stock = false THEN now() ELSE NULL END;
    RETURN NEW;
  END IF;

  IF NEW.in_stock = false AND OLD.in_stock = true THEN
    NEW.out_of_stock_since := now();
  ELSIF NEW.in_stock = true THEN
    NEW.out_of_stock_since := NULL;
  ELSE
    NEW.out_of_stock_since := OLD.out_of_stock_since;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_out_of_stock_since
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION set_out_of_stock_since();

CREATE INDEX idx_products_out_of_stock_since ON products (out_of_stock_since);
