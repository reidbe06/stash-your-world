-- Track whether a user has manually edited an item's category/subcategory
-- so AI reprocessing never silently overwrites their choices.
alter table items
  add column if not exists user_edited boolean not null default false,
  add column if not exists edited_at   timestamptz;
