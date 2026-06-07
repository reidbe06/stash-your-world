-- Add recipe_nutrition JSONB column for structured per-serving nutrition data
-- Extracted by AI from recipe content (calories, protein, carbs, fat)
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS recipe_nutrition JSONB;
