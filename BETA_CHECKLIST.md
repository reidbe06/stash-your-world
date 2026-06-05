# STASHd Private Beta — Test Checklist

Use this checklist when onboarding beta testers or verifying a build.

---

## 1. Auth

- [ ] Sign up with a new email → lands on /dashboard
- [ ] Sign in with existing credentials → works
- [ ] Wrong password → shows friendly error ("Email or password is incorrect")
- [ ] Already-registered email in signup mode → shows clear message
- [ ] Sign out → redirects to /auth, session cleared
- [ ] Refresh while signed in → stays signed in (session persists)
- [ ] Navigate to protected route while logged out → redirects to /auth

---

## 2. Saving Items

- [ ] Save a recipe URL (Instagram, TikTok, YouTube) → thumbnail appears, AI categorizes
- [ ] Save an article → metadata populated, category assigned
- [ ] Save a product page → type = "Product Page", image shown
- [ ] Save a duplicate URL → returns existing item, no double-save
- [ ] Save from the browser extension → appears in library
- [ ] AI summary and tags populated within a few seconds

---

## 3. Data Isolation

- [ ] Sign in as User A, save 3 items
- [ ] Sign in as User B → sees 0 items from User A ✓
- [ ] User B saves their own items → User A cannot see them
- [ ] Verify /search returns only your own items

---

## 4. Core Features

- [ ] Search (keyword) finds the right items
- [ ] AI search (Ask) returns relevant results
- [ ] Subcategory folders (e.g. Recipes > Dinner) are clickable
- [ ] Breadcrumb header shows when inside a subcategory
- [ ] Bell (Remind Me Later) → requires DB migration (see README)
- [ ] Reminders page shows upcoming items grouped by date

---

## 5. Performance

- [ ] Dashboard loads in < 3 seconds on a fresh login
- [ ] Save action completes (processing starts) in < 5 seconds
- [ ] Search returns results in < 2 seconds
- [ ] No visible layout shift on page load

---

## 6. Mobile

- [ ] Bottom nav renders correctly (5 items, equal spacing)
- [ ] Save button tappable and leads to /save
- [ ] Cards readable and tappable on 375px screen
- [ ] Feedback button accessible in header

---

## 7. Error States

- [ ] Save an invalid URL → user-friendly error shown
- [ ] Save with no internet → error handled gracefully
- [ ] Wrong credentials → friendly message, not raw Supabase error
- [ ] OpenAI timeout → toast shown, item still saved

---

## 8. Feedback

- [ ] Feedback button visible in header (desktop + mobile)
- [ ] All 3 rating options selectable
- [ ] Submit with message → success toast shown
- [ ] Feedback stored in `beta_feedback` table (check with: `SELECT * FROM beta_feedback ORDER BY created_at DESC;`)

---

## Known Limitations (Beta)

- **Remind Me Later**: Requires running `ALTER TABLE items ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;` in the Supabase SQL editor before reminders work.
- **Thumbnail caching**: Instagram/TikTok thumbnails are downloaded server-side; may take a few seconds to appear.
- **No push notifications**: Reminder dates are stored but no notification is sent yet.

---

## How to Query Feedback

```sql
SELECT created_at, rating, message, email, page
FROM beta_feedback
ORDER BY created_at DESC;
```

Run against the Replit postgres database (`DATABASE_URL`).
