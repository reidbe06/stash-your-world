ALTER TABLE items ADD COLUMN IF NOT EXISTS product_retailer text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS product_category text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS product_description text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS product_image_url text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS affiliate_url text;
