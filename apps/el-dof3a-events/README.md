# 🎟️ MNU Vet 3 Events — `vet3-mnu.pages.dev/el-dof3a-events`

A general events platform for the batch (movie day, trips, workshops…). Own Vite build (`vite.events.config.ts`),
own Postgres schema (`el_dof3a_events`) in the same Supabase project. `npm run build` builds both apps.

Per event you choose: **seats** (cinema hall map) or **names only**; **payment** on/off; free events can be **auto-approved**.

## One-time setup
1. `npm install`, then commit `package.json` + `package-lock.json` (Cloudflare uses `npm ci`).
2. Supabase → SQL Editor → run `apps/el-dof3a-events/supabase/el-dof3a-events.sql` (safe to re-run; upgrades older versions in place).
3. Supabase → Project Settings → API → **Exposed schemas** → add `el_dof3a_events` → Save.
4. First Super Admin — staff log in with **phone + password**:
   - Authentication → Users → *Add user* → email `01XXXXXXXXX@staff.vet3-mnu.pages.dev` (your phone), strong password, tick **Auto Confirm User**.
   - SQL Editor:
     ```sql
     insert into el_dof3a_events.staff (user_id, username, name, role)
     select id, '01XXXXXXXXX', 'Super Admin', 'super_admin' from auth.users where email = '01XXXXXXXXX@staff.vet3-mnu.pages.dev';
     ```
   - Log in at `/el-dof3a-events/staff/login`. If it fails, the page says exactly why.
5. Cloudflare Pages → Variables and Secrets (Team page only): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret).

## Roles
| Role | Access |
|---|---|
| super_admin | everything |
| reviewer | الحجوزات only |
| scanner | السكانر only |

## Seat numbering
Blocks: **A** = right side, **B** = middle, **C** = left. Numbers continue row after row inside each block
(A1–A4 in row 1, A5–A9 in row 2, …). Direction (from the right edge or the left) is chosen when you generate the hall.
Shortcuts on the seats page: Shift+click range · Ctrl+click add · Ctrl+E / Ctrl+Q add a chair right / left · Ctrl+A · Delete · B/O block/open · M/F/G.

## Local
`npm run dev:events` → http://localhost:5173/el-dof3a-events/ · `npm run preview` for the Cloudflare-like run.
