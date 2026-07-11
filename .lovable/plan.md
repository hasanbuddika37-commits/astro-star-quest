# AstroBlitz — Major Update Plan

මේ update එකේ කොටස් ගොඩක් තියෙන නිසා confirm කරලා තමයි ගොඩනගන්නේ.

## 1. Refer System — 3 අදියර rewards

**Stage 0 (Join):** නව user කෙනෙක් refer link එකෙන් join වූ මොහොතේම **referrer ට 25 coins**.
**Stage 1 (Day 1 — 10 ads):** Referred user පලමු දිනයේ 10 ads බැලුවම **referrer ට 50 coins**.
**Stage 2 (Day 2 — 15 ads):** දෙවන දිනයේ (join කරලා 24h+) 15 ads බැලුවම **referrer ට 75 coins**.

- `profiles` වලට `refer_stage` (0/1/2/3), `day1_ads_watched`, `day2_ads_watched`, `day1_date`, `day2_date` columns.
- පවතින `maybe_verify_referral` function එක අලුත් 3-stage logic එකට වෙනස් කරනවා.
- Refer Tab එකේ history: friend එක්කෙනා යටතේ **Stage 1 ✅ / Stage 2 ⏳ 6/10 ads / Stage 3 🔒** කියලා progress පෙන්නනවා.
- සෑම stage එකකදීම **Telegram bot හරහා referrer ට message + "🎮 Open Mini App" button** යවනවා.
- පරණ single-stage `refer_reward_coins` + `refer_verify_ads` settings ඉවත් කරලා `refer_stage0_coins=25`, `refer_stage1_coins=50`, `refer_stage1_ads=10`, `refer_stage2_coins=75`, `refer_stage2_ads=15` ලෙස දානවා.

## 2. Taddy Ad Network integration

- `src/routes/__root.tsx` head එකට Taddy SDK script tag එක දානවා (pub-id `ce87…6fd9`).
- `src/lib/adsdk.ts` එකට `taddy` provider එක එකතු කරනවා (`window.Taddy?.showAd`).
- Admin `ad_blocks` වල Watch Ads block එකට Taddy network එක daily cap 10 එක්ක enable කරනවා.
- Random ad picker (`getRandomAdNetwork`) එකට Taddy weight එක එකතු කරනවා.
- **Watch Ads coin reward:** 3–5 coins random (settings `ad_reward_min=3`, `ad_reward_max=5`).

## 3. Gigapub full ad fix

- `adsdk.ts` gigapub loader එකේ init/show sequence නැවත ලියනවා (SDK script async load වෙන්න wait කරලා `showAd()` call එකට හරි parameters දෙනවා). Ad load fail වුනොත් fallback network එකකට යනවා.

## 4. Task Tab — 3 categories

- `tasks` table එකට `category` column: `main` | `partner` | `community` (default `main`).
- Task Tab එක 3 tab UI එකකට වෙන් කරනවා.
- Admin Panel → Tasks: category dropdown එක්ක create/edit/delete වෙන වෙනම කරන්න පුළුවන්.
- **Telegram channel join verify:** task type `telegram_channel` වලට bot API `getChatMember` හරහා user කෙනා member ද කියලා server-side check කරනවා (bot එක channel එකේ admin නිසා). Membership `member/administrator/creator` නම් විතරයි reward දෙන්නේ; නැත්නම් "Please join the channel first" error එකක්.

## 5. Withdrawals — USDT BEP20 only

- TON option එක Withdraw Tab, Admin Panel, notifications, database enum/check සියල්ලෙන් ඉවත් කරනවා.
- `withdrawals.currency` USDT_BEP20 විතරයි accept කරන්නේ (validation trigger).
- Wallet input එකේ TON field එක ඉවත් කරලා USDT BEP20 විතරයි.
- Price cache TON ඉවත් කරනවා (USDT price cache විතරයි ඉතුරු).

## 6. Withdraw Requirements (අලුත්)

Withdraw button unlock වෙන්නේ මේ **3ම** සම්පූර්ණ නම් විතරයි:
- **අද දින** Watch-Ads tab එකෙන් 20+ ads (daily reset).
- **Verified refers ≥ 2** (stage 2 දක්වා ගිය අය).
- **All active Main tasks completed.**

Requirements card එකට 3 progress lines එකතු කරනවා.

## 7. Pending withdraw block

දැනටමත් `has_pending` logic තියෙනවා — UI + server දෙකේම extra guard confirm කරලා message clearer කරනවා ("⏳ Pending withdrawal එකක් තියෙනවා. Approve/Reject වෙන තුරු අලුත් එකක් submit කරන්න බෑ.").

## Technical details

**Database migration:**
- `ALTER TABLE profiles ADD refer_stage int DEFAULT 0, day1_ads int DEFAULT 0, day2_ads int DEFAULT 0, day1_date date, day2_date date`
- `ALTER TABLE tasks ADD category text DEFAULT 'main' CHECK (category IN ('main','partner','community'))`
- Replace `maybe_verify_referral` → new `progress_referral(p_referee bigint)` (called on join + each ad watch).
- Trigger on `withdrawals` to reject non-USDT_BEP20.
- New settings rows for refer stages, ad reward min/max.

**Files touched:**
- `src/lib/refer.functions.ts` — 3-stage stats + share URL
- `src/lib/ads.functions.ts`, `src/lib/adsdk.ts` — Taddy + gigapub fix + random reward
- `src/lib/tasks.functions.ts` — category filter + telegram join verify
- `src/lib/withdraw.functions.ts` — USDT only + new requirements
- `src/lib/admin.functions.ts` + `src/lib/admin-extra.functions.ts` — task category, ad_blocks Taddy option
- `src/lib/telegram.server.ts` — `sendReferStageMessage(referrer_tg_id, stage)` helper with Open Mini App inline keyboard
- `src/components/tabs/TaskTab.tsx`, `WithdrawTab.tsx`, `WatchTab.tsx`, `ReferTab.tsx`
- `src/routes/admin.tsx` — task category selector, ad_blocks Taddy toggle
- `src/routes/__root.tsx` — Taddy script

**Non-breaking:**
- Existing users' TON balances/wallets retained but hidden (read-only in admin history).
- Existing pending TON withdrawals: admin can still reject; no new TON submissions.

---

**Approve කරන්න මේ scope එක — approve වුනාට පස්සේ migration + code එකපාරටම ලියනවා.**
