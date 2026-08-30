# Fitness app

Phone-first food logging. Next.js + Supabase + shadcn.

The analysis side of this system stays in the Health repo; this app is the fast
write path.

## Setup

### 1. Supabase project

Run the migrations in order, in the SQL editor:

- `supabase/migrations/0001_init.sql` — tables, view, RLS
- `supabase/migrations/0002_seed_foods.sql` — 94 foods from the Health repo
- `supabase/migrations/0003_default_settings.sql` — gives every user a settings row
- `supabase/migrations/0004_standard_goals_and_meals.sql` — goals plus meal on each entry

### 2. Environment

```
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
Project Settings > API.

### 3. Email template (REQUIRED — sign-in is broken without it)

Authentication > Emails > Magic Link. Replace the body with:

```html
<h2>Sign in</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Open the app</a></p>
<p>Or enter this code: <strong>{{ .Token }}</strong></p>
```

Two reasons this is not optional:

1. **The default template has no `{{ .Token }}`**, so the six-digit code the
   login screen asks for would never arrive.
2. **The default template uses PKCE**, whose code verifier lives in a cookie in
   the browser that requested the link. Request on a laptop, open on a phone,
   and it fails. `{{ .TokenHash }}` is verified server-side, so the link works
   on any device.

`/auth/confirm` still accepts a PKCE `?code=` as well, so an already-sent link
keeps working.

### 4. URL configuration

Authentication > URL Configuration:

- Site URL: `http://localhost:3000` in development, the Vercel URL in production
- Redirect URLs: add `http://localhost:3000/**` and `https://<your-app>.vercel.app/**`

### 5. Your goals

Sign in, then open Goals from the gear icon on the log screen. Migration 0003
creates the row; the screen is where you set calories and macros.

## Run

```
npm run dev
```

## Conventions

- `qty` means COUNT for `per_unit` foods and GRAMS for `per_100g` foods — the
  same convention `log_food.py` uses, so a number means the same thing in both
  systems.
- The log day is the WAKING day: anything before 04:00 files under the previous
  date.
- Catalog rows are append-only to non-creators. Correcting a shared food's
  macros would retroactively change someone else's logged history, so a
  correction is a new row.
- Meals are the fixed four: Breakfast, Lunch, Dinner, Snacks.
