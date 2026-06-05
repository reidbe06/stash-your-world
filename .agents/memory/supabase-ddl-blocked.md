---
name: Supabase DDL access from Replit environment
description: All programmatic DDL paths to Supabase are blocked; user must use dashboard
---

## Rule
You cannot run DDL (ALTER TABLE, CREATE TABLE, etc.) against the Supabase database
from within the Replit development environment.

**What was tried:**
- PostgREST REST API — only supports CRUD (SELECT/INSERT/UPDATE/DELETE), no DDL
- Direct postgres port 5432 on `db.[ref].supabase.co` — ECONNREFUSED (IPv6 reachable, port blocked)
- Session pooler `aws-0-[region].pooler.supabase.com:5432` — ENOTFOUND (tenant format not found)
- Transaction pooler port 6543 — ENOTFOUND (same issue)  
- Supabase Management API `api.supabase.com/v1/projects/{ref}/database/query` — requires PAT, rejects service role JWT
- pg_meta endpoint `[ref].supabase.co/pg/meta/v1/query` — 404
- exec_sql RPC — function does not exist in public schema

**What works:**
- Supabase dashboard → SQL editor (manual, fast)
- The active Supabase project is `dnuddyepaarejqxtayte` (process env wins over .env file which has `lefanhnswvkmtwbawowy`)

**How to apply:**
Direct the user to https://app.supabase.com → select project → SQL Editor → paste and run the migration.

**Why:**
Supabase restricts direct postgres access; only the service role JWT works for the
PostgREST API (CRUD), not for the Management API (DDL). The pooler uses a different
auth mechanism that requires the database password, not the service role JWT.
