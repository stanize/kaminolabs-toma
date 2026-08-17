# Diario del bebé (toma)

Mobile-first tracker for newborn diaper changes (pipí/popó), breastfeeding
(toma), and baths (baño). Tap a button, confirm or edit the date/time in
the sheet, done.

## Setup

1. In Supabase, run `schema.sql` in the SQL editor (creates `toma_events`,
   optionally `toma_profile`, with RLS policies).
2. In Vercel, set environment variables on the project:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy. `npm install && npm run build` outputs static files to `dist/`.

The Supabase anon key is safe to expose client-side — access control comes
from the RLS policies in `schema.sql`, not from hiding the key.
