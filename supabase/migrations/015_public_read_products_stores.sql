-- Allow anonymous (logged-out) read access to products and stores so the
-- public, read-only /view page can display the dashboard without a login.
-- Writes remain restricted to authenticated users (existing policies unchanged).

CREATE POLICY "Public read access for products"
  ON products FOR SELECT TO anon USING (true);

CREATE POLICY "Public read access for stores"
  ON stores FOR SELECT TO anon USING (true);
