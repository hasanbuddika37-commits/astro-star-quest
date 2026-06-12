# 🚀 AstroBlitz — Telegram Mini-App

Earn-crypto Telegram mini-app: play, watch ads, complete tasks, refer friends, withdraw TON / USDT (BEP20).

Stack: **TanStack Start** + **Supabase** + **Tailwind v4**.

---

## Deploy

### Option A — Lovable (recommended)
Just click **Publish** in the Lovable editor. Custom domains supported in project settings.

### Option B — GitHub → Netlify
1. In Lovable, open the **+** menu → **GitHub → Connect project**. This creates a GitHub repo synced two-way with Lovable.
2. In Netlify, click **Add new site → Import from Git**, pick the GitHub repo.
3. Build settings (auto-detected from `netlify.toml`):
   - Command: `NITRO_PRESET=netlify bun run build`
   - Publish: `dist`
4. Add the env vars from `.env.example` in **Site settings → Environment variables**.
5. After first deploy, update these in the mini-app **Admin → Settings**:
   - `site_url` → your Netlify URL (e.g. `https://astroblitz.netlify.app`)
   - cron URLs in DB if you migrated them
6. Re-point the Telegram bot's `Menu Button` URL and `Mini App` `play` short-name URL (via BotFather) to your Netlify domain.

### Self-host elsewhere
Any Node 20+ host that runs `bun run build` and serves `dist/` works. Set `NITRO_PRESET` to `node` for a standalone Node server. See the [TanStack Start hosting docs](https://tanstack.com/start).

---

## Admin

Admin panel lives **inside the mini-app** — only the user whose Telegram ID matches `admin_tg_id` (set via initial migration / app_settings) sees the **Admin** tab. The legacy `/admin` web URL is auto-locked to that same Telegram ID.

To change the admin: update `app_settings.admin_tg_id` in the database, or use **Admin → Profile → Change admin Telegram ID**.

---

## Local dev

```bash
bun install
cp .env.example .env.local   # fill values
bun run dev
```

Then expose your dev host (ngrok / cloudflared) and set the Telegram bot webhook to `https://YOUR-DEV-URL/api/public/telegram/webhook`.
