-- Create waitlist table for pre-launch email capture
CREATE TABLE IF NOT EXISTS public.waitlist (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text        NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Only the service role can read/write waitlist entries
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
