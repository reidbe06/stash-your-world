-- Migration: Add media_format column and reclassify type as content purpose

-- 1. Add media_format column (technical format: Video, Article, Webpage, etc.)
ALTER TABLE items ADD COLUMN IF NOT EXISTS media_format text;

-- 2. Backfill media_format from the old type values (which were media formats)
UPDATE items SET media_format = CASE
  WHEN type = 'video'   THEN 'Video'
  WHEN type = 'article' THEN 'Article'
  WHEN type = 'social'  THEN 'Social Post'
  WHEN type = 'product' THEN 'Product Page'
  WHEN type = 'recipe'  THEN 'Article'
  WHEN type = 'link'    THEN 'Webpage'
  ELSE 'Webpage'
END
WHERE media_format IS NULL;

-- 3. Reclassify type as content purpose using ai_category (preferred) or old type value
UPDATE items SET type = CASE
  WHEN ai_category = 'Recipes'                         THEN 'Recipe'
  WHEN ai_category IN ('Products', 'Shopping Deals')   THEN 'Product'
  WHEN ai_category = 'Fashion'                         THEN 'Fashion / Outfit'
  WHEN ai_category = 'Home'                            THEN 'Home Idea'
  WHEN ai_category = 'Travel'                          THEN 'Travel Idea'
  WHEN ai_category = 'Fitness'                         THEN 'Fitness / Workout'
  WHEN ai_category = 'Beauty'                          THEN 'Beauty'
  WHEN ai_category = 'Parenting'                       THEN 'Parenting'
  WHEN ai_category = 'Business Ideas'                  THEN 'Business Idea'
  WHEN ai_category IN ('Entertainment', 'Videos')      THEN 'Entertainment'
  WHEN ai_category = 'Education'                       THEN 'Tutorial'
  -- Fallback: derive from old type value when no ai_category
  WHEN ai_category IS NULL AND type = 'recipe'         THEN 'Recipe'
  WHEN ai_category IS NULL AND type = 'product'        THEN 'Product'
  WHEN ai_category IS NULL AND type = 'fashion'        THEN 'Fashion / Outfit'
  ELSE 'Other'
END;
