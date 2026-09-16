# Accounts, plans and payments — setup

Do these in order. About 20 minutes.

## 1. Run the SQL

Supabase, **SQL Editor**, **New query**.

1. Paste all of `supabase/schema.sql`, click **Run**
2. New query, paste all of `supabase/auth-schema.sql`, click **Run**

The second file creates a `profiles` table, a trigger that makes a profile automatically whenever someone signs up, and the functions that decide who has paid.

Passwords are never in these tables. Supabase Auth stores them hashed in `auth.users` and handles login, sessions and recovery emails. That is why no password should ever be hardcoded in this project.

## 2. Turn on email

Supabase, **Authentication**, **Providers**, make sure **Email** is enabled.

Then **Authentication**, **URL Configuration**:

- **Site URL**: your live address, or `http://localhost:5173` while testing
- **Redirect URLs**: add both, one per line

```
http://localhost:5173
https://YOUR-GITHUB-USERNAME.github.io/walletly/
```

Without these, password reset links bounce.

While testing, go to **Authentication, Providers, Email** and switch off **Confirm email**, so you can sign in immediately. Turn it back on before real users arrive.

## 3. Get your keys

Supabase, **Project Settings**, **API**. Copy the **Project URL** and the **anon public** key.

Create `web/.env`:

```
VITE_API_URL=https://YOUR-WORKER.workers.dev
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

The anon key is meant to be public. Row level security protects the data and it is switched on. Never put the **service_role** key in this file; that one belongs in the Worker only.

Restart `npm run dev` after editing `.env`. Vite only reads it at startup.

## 4. Create your account

Open the app. You will see a sign-in screen. Click **Create an account** and use:

- Username `walta`
- Email `tadlaouiwalid9@gmail.com`
- A password you choose

Sign in. You will land on the plans page, because no payment has been recorded yet.

## 5. Give yourself permanent access

Supabase, **SQL Editor**, run once:

```sql
update public.profiles
set plan = 'lifetime', expires_at = null
where lower(email) = lower('tadlaouiwalid9@gmail.com');
```

Confirm:

```sql
select username, email, plan, expires_at from public.profiles;
```

Refresh the app. The plans page is gone and Settings shows **Lifetime access**.

## 6. Payments, when you are ready

Supabase cannot take money. Stripe is the shortest route and needs no backend code.

1. Create a Stripe account
2. **Products**, add two: `Walletly Monthly` at $5 recurring monthly, and `Walletly Quarterly` at $12 recurring every 3 months
3. For each, create a **Payment link** and copy the URL
4. Add them to `web/.env`:

```
VITE_PAY_MONTHLY=https://buy.stripe.com/...
VITE_PAY_QUARTERLY=https://buy.stripe.com/...
```

The buttons on the plans page go live immediately.

**Activating an account after payment.** Until you wire a Stripe webhook, do it by hand. Stripe emails you on every payment; run this with the buyer's email:

```sql
select public.activate_plan('buyer@example.com', 'monthly');
-- or 'quarterly'
```

It returns the new expiry date. Renewing early extends from the existing date, so nobody loses time they paid for.

Automate it later with a Stripe webhook that calls `activate_plan` through your Worker using the service role key. Manual is fine for your first hundred customers, and it means you read every sale.

## Common problems

**"Accounts are not configured"** — the two `VITE_SUPABASE_` values are missing from `.env`, or you did not restart `npm run dev`.

**Sign-up succeeds but sign-in fails** — email confirmation is on. Confirm from your inbox or switch it off as in step 2.

**Reset email never arrives** — Supabase's built-in mailer is rate limited to a few messages an hour and often lands in spam. For real users, connect your own SMTP under **Project Settings, Authentication, SMTP Settings**.

**Signed in but still on the plans page** — the `update` in step 5 matched no rows. Run the `select` to check the exact email stored on your profile.

## What the paywall does and does not do

The plans page is a front door, not a vault. Someone determined could read the public chain data themselves, because it is public. What you are selling is the reading of it: every wallet at once, the matrix, the allowlist checker, spam filtering, and history. That is the honest pitch, and it is a good one.
