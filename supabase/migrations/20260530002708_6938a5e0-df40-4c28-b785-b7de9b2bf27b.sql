
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS share_source text;

UPDATE public.items SET share_source = 'web' WHERE share_source IS NULL;

ALTER TABLE public.items
  ALTER COLUMN share_source SET DEFAULT 'web',
  ALTER COLUMN share_source SET NOT NULL;

ALTER TABLE public.items
  ADD CONSTRAINT items_share_source_check
  CHECK (share_source IN ('web','extension','pwa_share','ios_shortcut','mobile_app'));

CREATE INDEX IF NOT EXISTS idx_items_share_source ON public.items(user_id, share_source);
