## Remove Profile from primary navigation

The top-right avatar already links to `/profile`, so the Profile entry in both the desktop header pills and the mobile bottom nav is redundant. Removing it also gives the mobile bottom bar more breathing room.

### Changes

**File:** `src/routes/_authenticated.tsx`

1. Remove the `Profile` entry from the `navItems` array (line 18).
2. Drop the now-unused `User as UserIcon` import (line 3).
3. Mobile bottom nav: with 4 items + the center "+" FAB, rebalance the split so two items sit on each side of the FAB instead of `slice(0,2)` / `slice(2)`.

### Kept

- Top-right `UserAvatar` linking to `/profile` (with existing `aria-label="Profile"`).
- All other nav entries: Home, Search, Ask, Collections.

No other files affected.
