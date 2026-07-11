import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getWithdrawData, saveWallet, requestWithdraw } from "@/lib/withdraw.functions";
import { createTicket, listTickets } from "@/lib/support.functions";
import { getRandomAdNetwork } from "@/lib/ads.functions";
import { showAd } from "@/lib/adsdk";
import type { Profile } from "../MainApp";

type Data = Awaited<ReturnType<typeof getWithdrawData>>;

export default function WithdrawTab({ initData, profile, onCoins }: { initData: string; profile: Profile; onCoins: (c: number) => void }) {
  const get = useServerFn(getWithdrawData);
  const save = useServerFn(saveWallet);
  const submit = useServerFn(requestWithdraw);
  const ticket = useServerFn(createTicket);
  const mineTickets = useServerFn(listTickets);
  const pickAd = useServerFn(getRandomAdNetwork);
  const [d, setD] = useState<Data | null>(null);
  const [amount, setAmount] = useState("");
  const [wallet, setWallet] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"withdraw" | "history" | "support">("withdraw");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportBody, setSupportBody] = useState("");
  const [supportSent, setSupportSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  async function refresh() {
    const r = await get({ data: { initData } });
    setD(r); setWallet(r.wallet_usdt_bep20);
  }
  useEffect(() => { mounted.current = true; refresh().catch((e) => setErr(String(e))); return () => { mounted.current = false; }; }, []);

  async function onSaveWallet() {
    setMsg(null); setErr(null);
    if (!wallet.trim()) { setErr("Enter your USDT (BEP20) address"); return; }
    try {
      await save({ data: { initData, wallet_usdt_bep20: wallet } });
      setMsg("✅ Wallet saved");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
  }

  async function onWithdraw() {
    setMsg(null); setErr(null);
    const coins = Math.floor(Number(amount));
    if (!coins) { setErr("Enter amount in coins"); return; }
    setBusy(true);
    try {
      try {
        const net = await pickAd({ data: { initData } });
        if (net?.network) await showAd(net.network, net.sdk_extra as never, "reward");
      } catch {
        setErr("Ad failed — please retry."); setBusy(false); return;
      }
      const w = await submit({ data: { initData, coins } });
      setMsg(`✅ Submitted — ${Number(w.net_amount).toFixed(6)} USDT`);
      setAmount("");
      onCoins(Number(profile.coins) - coins);
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function sendSupport() {
    if (!supportSubject || !supportBody) return;
    try {
      await ticket({ data: { initData, subject: supportSubject, body: supportBody } });
      setSupportSent(true); setSupportSubject(""); setSupportBody("");
      await mineTickets({ data: { initData } });
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
  }

  if (!d) return <p className="text-center text-sm text-muted-foreground">Loading…</p>;

  const coinsNum = Number(amount) || 0;
  const previewUsd = coinsNum * d.coin_to_usd_rate;
  const feeUsd = d.fee_flat_usd + previewUsd * (d.fee_pct / 100);
  const previewNetUsd = Math.max(0, previewUsd - feeUsd);
  const previewNet = previewNetUsd; // USDT ≈ 1 USD
  const overLimit = coinsNum > d.coins;
  const underMin = coinsNum > 0 && previewUsd < d.min_withdraw_usd;
  const overMax = previewUsd > d.max_withdraw_usd;
  const maxCoins = Math.floor(d.max_withdraw_usd / d.coin_to_usd_rate);
  const reqMet = d.requirements.met;
  const blocked = d.has_pending;

  return (
    <div>
      <h2 className="text-xl font-extrabold">💸 Withdraw (USDT BEP20)</h2>
      <div className="mt-2 rounded-2xl border border-border bg-card/70 p-3 text-xs">
        Balance: <b className="text-gold">{Number(d.coins).toLocaleString()}</b> coins ≈ <b>${d.usd_balance.toFixed(4)}</b>
        <div className="mt-1 grid grid-cols-2 gap-x-3 text-[11px] text-muted-foreground">
          <span>💵 USDT: <b className="text-foreground">${d.prices.USDT.toFixed(3)}</b></span>
          <span>Fee: ${d.fee_flat_usd} + {d.fee_pct}%</span>
          <span>Min ${d.min_withdraw_usd}</span>
          <span>Max ${d.max_withdraw_usd}</span>
        </div>
      </div>

      <div className={`mt-2 rounded-2xl border p-3 text-xs ${reqMet ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
        <p className="font-bold">{reqMet ? "✅ Requirements met" : "🔒 Withdraw requirements"}</p>
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          <li>📺 Today's ads: <b className={d.requirements.ads_done_today >= d.requirements.min_ads_daily ? "text-green-300" : "text-foreground"}>{d.requirements.ads_done_today}</b> / {d.requirements.min_ads_daily}</li>
          <li>👥 Verified refers: <b className={d.requirements.refers_done >= d.requirements.min_refers ? "text-green-300" : "text-foreground"}>{d.requirements.refers_done}</b> / {d.requirements.min_refers}</li>
          {d.requirements.require_main_tasks && (
            <li>✅ Main tasks pending: <b className={d.requirements.main_tasks_pending === 0 ? "text-green-300" : "text-destructive"}>{d.requirements.main_tasks_pending}</b></li>
          )}
        </ul>
      </div>

      {blocked && (
        <div className="mt-2 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs text-yellow-200">
          ⏳ Pending withdrawal exists. Wait until it's approved or rejected before submitting another.
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card/50 p-1">
        {(["withdraw", "history", "support"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-xl py-2 text-xs font-bold capitalize ${tab === t ? "text-primary-foreground" : "text-muted-foreground"}`} style={tab === t ? { background: "var(--gradient-primary)" } : undefined}>{t}</button>
        ))}
      </div>

      {tab === "withdraw" && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-border bg-card/70 p-3">
            <label className="text-xs text-muted-foreground">USDT BEP20 (BSC) wallet address</label>
            <input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              className="mt-1 w-full rounded-xl bg-background px-3 py-2 text-sm outline-none border border-border font-mono"
              placeholder="0x…"
            />
            <button onClick={onSaveWallet} className="mt-2 h-9 w-full rounded-xl text-xs font-bold text-primary-foreground" style={{ background: "var(--gradient-blitz)" }}>
              💾 Save wallet
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-card/70 p-3">
            <label className="text-xs text-muted-foreground flex justify-between">
              <span>Amount (coins)</span>
              <button onClick={() => setAmount(String(Math.min(d.coins, maxCoins)))} className="underline text-cyan-accent">Max</button>
            </label>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className="mt-1 w-full rounded-xl bg-background border border-border px-3 py-2 text-lg font-bold outline-none" placeholder="0" />
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>≈ <b className="text-foreground">${previewUsd.toFixed(4)}</b></div>
              <div className="text-right">Fee: <b className="text-foreground">${feeUsd.toFixed(4)}</b></div>
              <div className="col-span-2 text-right">Net: <b className="text-gold">{previewNet.toFixed(6)} USDT</b></div>
            </div>
            {overLimit && <p className="mt-1 text-xs text-destructive">Exceeds your balance</p>}
            {underMin && <p className="mt-1 text-xs text-destructive">Below ${d.min_withdraw_usd} minimum</p>}
            {overMax && <p className="mt-1 text-xs text-destructive">Above ${d.max_withdraw_usd} maximum</p>}
            <button onClick={onWithdraw} disabled={busy || blocked || !reqMet || !amount || overLimit || underMin || overMax} className="mt-3 h-11 w-full rounded-xl text-sm font-bold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-blitz)" }}>
              {busy ? "Submitting…" : blocked ? "⏳ Pending withdrawal" : !reqMet ? "🔒 Requirements not met" : "💸 Watch ad & request"}
            </button>
          </div>

          {msg && <p className="rounded-xl bg-green-500/15 px-3 py-2 text-xs text-green-300">{msg}</p>}
          {err && <p className="rounded-xl bg-destructive/15 px-3 py-2 text-xs text-destructive">{err}</p>}
        </div>
      )}

      {tab === "history" && (
        <div className="mt-4 space-y-2">
          {d.history.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No withdrawals yet.</p>}
          {d.history.map((w) => (
            <div key={w.id} className="rounded-2xl border border-border bg-card/60 p-3 text-xs space-y-1">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💵</span>
                  <span><b>{Number(w.net_amount).toFixed(6)}</b> {w.currency === "TON" ? "TON" : "USDT"}</span>
                </div>
                <Status status={w.status} />
              </div>
              <div className="grid grid-cols-2 gap-x-3 text-muted-foreground">
                <span>🪙 {Number(w.coins).toLocaleString()} coins</span>
                <span className="text-right">💵 ${Number(w.amount_usd).toFixed(4)}</span>
              </div>
              <p className="text-muted-foreground">📅 {new Date(w.created_at).toLocaleString()}</p>
              {w.tx_id && <p className="font-mono text-cyan-accent break-all">🔗 TX: {w.tx_id}</p>}
              {w.admin_note && <p className="text-muted-foreground">📝 {w.admin_note}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === "support" && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">Open a support ticket — we reply through the bot.</p>
          <input value={supportSubject} onChange={(e) => setSupportSubject(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none" placeholder="Subject" />
          <textarea value={supportBody} onChange={(e) => setSupportBody(e.target.value)} rows={4} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none" placeholder="Describe your issue…" />
          <button onClick={sendSupport} className="h-11 w-full rounded-xl text-sm font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>📨 Send ticket</button>
          {supportSent && <p className="rounded-xl bg-green-500/15 px-3 py-2 text-xs text-green-300">✅ Ticket sent — we'll reply through the bot.</p>}
        </div>
      )}
    </div>
  );
}

function Status({ status }: { status: string }) {
  const map: Record<string, { c: string; e: string }> = {
    pending: { c: "bg-yellow-500/20 text-yellow-300", e: "⏳" },
    approved: { c: "bg-green-500/20 text-green-300", e: "✅" },
    rejected: { c: "bg-destructive/20 text-destructive", e: "❌" },
    failed: { c: "bg-destructive/20 text-destructive", e: "⚠️" },
  };
  const s = map[status] ?? { c: "bg-muted", e: "" };
  return <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold capitalize ${s.c}`}>{s.e} {status}</span>;
}
