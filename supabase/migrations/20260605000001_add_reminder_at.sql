-- Remind Me Later: store the date/time the user wants to be reminded about a saved item
alter table items
  add column if not exists reminder_at timestamptz;
