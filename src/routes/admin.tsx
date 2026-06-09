import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  adminLoginFn, adminStats, adminListWithdrawals, adminApproveWithdrawal, adminRejectWithdrawal,
  adminListTasks, adminSaveTask, adminDeleteTask,
  adminListChallenges, adminSaveChallenge, adminDeleteChallenge,
  adminGetSettings, adminSaveSetting, adminCreateBroadcast,
  adminListTickets, adminReplyTicket,
} from "@/lib/admin.functions";
import {
  adminListAdBlocks, adminSaveAdBlock, adminDeleteAdBlock,
  adminListUsers, adminGetUserDetail, adminSuspendUser, adminAdjustBalance,
  adminPostToCommunity, adminAdNetworkCounts,
} from "@/lib/admin-extra.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "AstroBlitz Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

type View = "dashboard" | "withdrawals" | "users" | "ads" | "tasks" | "challenges" | "broadcast" | "community" | "tickets" | "settings";

function AdminPage() {
  const [token, setToken] = useState<string | null>(() => (typeof localStorage !== "undefined" ? localStorage.getItem("ab_admin_token") : null));
  if (!token) return <Login onToken={(t) => { localStorage.setItem("ab_admin_token", t); setToken(t); }} />;
  return <Panel token={token} onLogout={() => { localStorage.removeItem("ab_admin_token"); setToken(null); }} />;
}

function Login({ onToken }: { onToken: (t: string) => void }) {
  const login = useServerFn(adminLoginFn);
  const [email, setEmail] = useState("athapaththubuddika1@gmail.com");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const { token } = await login({ data: { email, password: pw } }); onToken(token); }
    catch (er) { setErr(er instanceof Error ? er.message : "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 backdrop-blur" style={{ boxShadow: "var(--shadow-glow-purple)" }}>
        <h1 className="text-2xl font-extrabold">🛰️ Admin Panel</h1>
        <p className="text-xs text-muted-foreground">AstroBlitz control center</p>
        <label className="mt-4 block text-xs">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl bg-background px-3 py-2 text-sm outline-none" />
        <label className="mt-3 block text-xs">Password</label>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1 w-full rounded-xl bg-background px-3 py-2 text-sm outline-none" />
        {err && <p className="mt-3 rounded-lg bg-destructive/15 px-3 py-2 text-xs text-destructive">{err}</p>}
        <button disabled={busy} className="mt-4 h-11 w-full rounded-xl text-sm font-bold text-primary-foreground disabled:opacity-50" style={{ background: "var(--gradient-primary)" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function Panel({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [view, setView] = useState<View>("dashboard");
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-3">
          <h1 className="text-base font-extrabold">🛰️ AstroBlitz Admin</h1>
          <button onClick={onLogout} className="rounded-lg border border-border px-3 py-1 text-xs">Log out</button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 text-xs">
          {(["dashboard", "withdrawals", "users", "ads", "tasks", "challenges", "broadcast", "community", "tickets", "settings"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`shrink-0 rounded-lg px-3 py-1.5 font-bold capitalize ${view === v ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
              {v}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4">
        {view === "dashboard" && <Dashboard token={token} />}
        {view === "withdrawals" && <Withdrawals token={token} />}
        {view === "users" && <Users token={token} />}
        {view === "ads" && <Ads token={token} />}
        {view === "tasks" && <Tasks token={token} />}
        {view === "challenges" && <Challenges token={token} />}
        {view === "broadcast" && <Broadcast token={token} />}
        {view === "community" && <CommunityPost token={token} />}
        {view === "tickets" && <Tickets token={token} />}
        {view === "settings" && <Settings token={token} />}
      </main>
    </div>
  );
}

function Dashboard({ token }: { token: string }) {
  const s = useServerFn(adminStats);
  const a = useServerFn(adminAdNetworkCounts);
  const [d, setD] = useState<Awaited<ReturnType<typeof adminStats>> | null>(null);
  const [nc, setNc] = useState<Record<string, number>>({});
  useEffect(() => {
    s({ data: { token } }).then(setD).catch(console.error);
    a({ data: { token } }).then(setNc).catch(console.error);
  }, [token]);
  if (!d) return <p>Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Users" value={d.users} />
        <Card label="Ads watched" value={d.ads} />
        <Card label="Pending withdraws" value={d.pending_withdrawals} />
        <Card label="Total paid (USD)" value={`$${d.total_paid_usd.toFixed(2)}`} />
      </div>
      <div>
        <h3 className="text-sm font-bold mb-2">Ads by network</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(nc).map(([k, v]) => <Card key={k} label={k} value={v} />)}
          {Object.keys(nc).length === 0 && <p className="text-xs text-muted-foreground">No ads counted yet.</p>}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function Withdrawals({ token }: { token: string }) {
  const list = useServerFn(adminListWithdrawals);
  const approve = useServerFn(adminApproveWithdrawal);
  const reject = useServerFn(adminRejectWithdrawal);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminListWithdrawals>>>([]);
  const [status, setStatus] = useState("pending");
  async function load() { setRows(await list({ data: { token, status } })); }
  useEffect(() => { load().catch(console.error); }, [status]);

  async function onApprove(id: string, currency: string) {
    const tx = prompt(`Enter ${currency} TX id:`); if (!tx) return;
    await approve({ data: { token, id, tx_id: tx } }); await load();
  }
  async function onReject(id: string) {
    const r = prompt("Reason for rejection:"); if (!r) return;
    await reject({ data: { token, id, reason: r } }); await load();
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {["pending", "approved", "rejected"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-lg px-3 py-1 text-xs capitalize ${status === s ? "bg-primary text-primary-foreground" : "border border-border"}`}>{s}</button>
        ))}
      </div>
      <div className="space-y-2">
        {rows.map((w) => (
          <div key={w.id} className="rounded-xl border border-border bg-card/70 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold">User <code>{w.tg_id}</code> • <b className="text-gold">{Number(w.net_amount).toFixed(6)} {w.currency}</b></p>
                <p className="text-muted-foreground">Coins: {w.coins} • ${Number(w.amount_usd).toFixed(4)} • Fee {Number(w.fee_pct)}%</p>
                <p className="font-mono break-all">{w.address}</p>
                {w.tx_id && <p className="text-cyan-accent">TX: {w.tx_id}</p>}
                {w.admin_note && <p>Note: {w.admin_note}</p>}
              </div>
              {w.status === "pending" && (
                <div className="flex gap-2">
                  <button onClick={() => onApprove(w.id, w.currency)} className="rounded-lg bg-green-600 px-3 py-1 font-bold text-white">Approve</button>
                  <button onClick={() => onReject(w.id)} className="rounded-lg bg-destructive px-3 py-1 font-bold text-destructive-foreground">Reject</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-center text-sm text-muted-foreground">None</p>}
      </div>
    </div>
  );
}

function Tasks({ token }: { token: string }) {
  const list = useServerFn(adminListTasks);
  const save = useServerFn(adminSaveTask);
  const del = useServerFn(adminDeleteTask);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminListTasks>>>([]);
  const empty = { title: "", description: "", reward: 100, url: "", kind: "link", is_active: true, sort_order: 0 };
  const [f, setF] = useState<typeof empty & { id?: string }>(empty);
  async function load() { setRows(await list({ data: { token } })); }
  useEffect(() => { load().catch(console.error); }, []);
  async function submit() {
    await save({ data: { token, ...f, reward: Number(f.reward), sort_order: Number(f.sort_order) } });
    setF(empty); await load();
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        {rows.map((t) => (
          <div key={t.id} className="rounded-xl border border-border bg-card/70 p-3 text-xs">
            <p className="font-bold">{t.title} <span className="text-gold">+{t.reward}</span></p>
            <p className="text-muted-foreground">{t.description}</p>
            <p className="font-mono break-all">{t.url}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setF({ id: t.id, title: t.title, description: t.description ?? "", reward: Number(t.reward), url: t.url ?? "", kind: t.kind, is_active: t.is_active, sort_order: t.sort_order })} className="rounded-lg border border-border px-2 py-1">Edit</button>
              <button onClick={async () => { if (confirm("Delete?")) { await del({ data: { token, id: t.id } }); load(); } }} className="rounded-lg bg-destructive px-2 py-1 text-destructive-foreground">Delete</button>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <h3 className="font-bold">{f.id ? "Edit task" : "New task"}</h3>
        <Field label="Title"><input className="w-full bg-background rounded px-2 py-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className="w-full bg-background rounded px-2 py-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Reward (coins)"><input type="number" className="w-full bg-background rounded px-2 py-1" value={f.reward} onChange={(e) => setF({ ...f, reward: Number(e.target.value) })} /></Field>
        <Field label="URL"><input className="w-full bg-background rounded px-2 py-1" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
        <Field label="Sort order"><input type="number" className="w-full bg-background rounded px-2 py-1" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} /></Field>
        <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Active</label>
        <div className="mt-3 flex gap-2">
          <button onClick={submit} className="rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground">{f.id ? "Update" : "Create"}</button>
          {f.id && <button onClick={() => setF(empty)} className="rounded-lg border border-border px-3 py-1.5">Cancel</button>}
        </div>
      </div>
    </div>
  );
}

function Challenges({ token }: { token: string }) {
  const list = useServerFn(adminListChallenges);
  const save = useServerFn(adminSaveChallenge);
  const del = useServerFn(adminDeleteChallenge);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminListChallenges>>>([]);
  const empty = { title: "", description: "", kind: "ads" as const, goal: 5, reward: 100, period: "daily" as const, is_active: true };
  const [f, setF] = useState<typeof empty & { id?: string }>(empty);
  async function load() { setRows(await list({ data: { token } })); }
  useEffect(() => { load().catch(console.error); }, []);
  async function submit() {
    await save({ data: { token, ...f, goal: Number(f.goal), reward: Number(f.reward) } });
    setF(empty); await load();
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        {rows.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-card/70 p-3 text-xs">
            <p className="font-bold">{c.title} <span className="text-gold">+{c.reward}</span> <span className="text-muted-foreground">({c.period}, {c.kind} ≥ {c.goal})</span></p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setF({ id: c.id, title: c.title, description: c.description ?? "", kind: c.kind as "ads", goal: c.goal, reward: Number(c.reward), period: c.period as "daily", is_active: c.is_active })} className="rounded-lg border border-border px-2 py-1">Edit</button>
              <button onClick={async () => { if (confirm("Delete?")) { await del({ data: { token, id: c.id } }); load(); } }} className="rounded-lg bg-destructive px-2 py-1 text-destructive-foreground">Delete</button>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <h3 className="font-bold">{f.id ? "Edit challenge" : "New challenge"}</h3>
        <Field label="Title"><input className="w-full bg-background rounded px-2 py-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className="w-full bg-background rounded px-2 py-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Kind">
          <select className="w-full bg-background rounded px-2 py-1" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "ads" })}>
            <option value="ads">ads</option><option value="game_level">game_level</option><option value="refers">refers</option>
          </select>
        </Field>
        <Field label="Goal"><input type="number" className="w-full bg-background rounded px-2 py-1" value={f.goal} onChange={(e) => setF({ ...f, goal: Number(e.target.value) })} /></Field>
        <Field label="Reward"><input type="number" className="w-full bg-background rounded px-2 py-1" value={f.reward} onChange={(e) => setF({ ...f, reward: Number(e.target.value) })} /></Field>
        <Field label="Period">
          <select className="w-full bg-background rounded px-2 py-1" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value as "daily" })}>
            <option value="daily">daily</option><option value="weekly">weekly</option>
          </select>
        </Field>
        <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Active</label>
        <div className="mt-3 flex gap-2">
          <button onClick={submit} className="rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground">{f.id ? "Update" : "Create"}</button>
          {f.id && <button onClick={() => setF(empty)} className="rounded-lg border border-border px-3 py-1.5">Cancel</button>}
        </div>
      </div>
    </div>
  );
}

function Broadcast({ token }: { token: string }) {
  const create = useServerFn(adminCreateBroadcast);
  const [message, setMessage] = useState("");
  const [image, setImage] = useState("");
  const [btnText, setBtnText] = useState("");
  const [btnUrl, setBtnUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function submit() {
    try {
      await create({ data: { token, message, image_url: image, button_text: btnText, button_url: btnUrl } });
      setMsg("Queued — cron worker will deliver shortly.");
      setMessage(""); setImage(""); setBtnText(""); setBtnUrl("");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); }
  }
  return (
    <div className="max-w-xl rounded-2xl border border-border bg-card/70 p-4">
      <h3 className="font-bold">📢 New broadcast</h3>
      <Field label="Message (HTML allowed)"><textarea rows={6} className="w-full bg-background rounded px-2 py-1" value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
      <Field label="Image URL (optional)"><input className="w-full bg-background rounded px-2 py-1" value={image} onChange={(e) => setImage(e.target.value)} /></Field>
      <Field label="Button text"><input className="w-full bg-background rounded px-2 py-1" value={btnText} onChange={(e) => setBtnText(e.target.value)} /></Field>
      <Field label="Button URL"><input className="w-full bg-background rounded px-2 py-1" value={btnUrl} onChange={(e) => setBtnUrl(e.target.value)} /></Field>
      <button onClick={submit} className="mt-3 rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground">Queue broadcast</button>
      {msg && <p className="mt-3 text-xs">{msg}</p>}
      <p className="mt-3 text-[11px] text-muted-foreground">Tip: Trigger delivery by GET to <code>/api/public/cron/broadcast-worker?secret=…</code> (set <b>broadcast_cron_secret</b> in Settings).</p>
    </div>
  );
}

function Tickets({ token }: { token: string }) {
  const list = useServerFn(adminListTickets);
  const reply = useServerFn(adminReplyTicket);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminListTickets>>>([]);
  useEffect(() => { list({ data: { token } }).then(setRows).catch(console.error); }, []);
  async function onReply(id: string) {
    const body = prompt("Reply:"); if (!body) return;
    await reply({ data: { token, ticket_id: id, body } });
    setRows(await list({ data: { token } }));
  }
  return (
    <div className="space-y-2">
      {rows.map((t) => (
        <div key={t.id} className="rounded-xl border border-border bg-card/70 p-3 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">{t.subject}</p>
              <p className="text-muted-foreground">User {t.tg_id} • {t.status}</p>
            </div>
            <button onClick={() => onReply(t.id)} className="rounded-lg bg-primary px-3 py-1 font-bold text-primary-foreground">Reply</button>
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="text-center text-sm text-muted-foreground">No tickets</p>}
    </div>
  );
}

function Settings({ token }: { token: string }) {
  const get = useServerFn(adminGetSettings);
  const save = useServerFn(adminSaveSetting);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminGetSettings>>>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  async function load() {
    const r = await get({ data: { token } });
    setRows(r);
    setDraft(Object.fromEntries(r.map((s) => [s.key, JSON.stringify(s.value)])));
  }
  useEffect(() => { load().catch(console.error); }, []);
  async function onSave(key: string) {
    await save({ data: { token, key, value: draft[key] } });
    await load();
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Values are JSON. Strings need quotes. Booleans: <code>true</code>/<code>false</code>.</p>
      {rows.map((s) => (
        <div key={s.key} className="rounded-xl border border-border bg-card/70 p-3 text-xs">
          <p className="font-mono font-bold">{s.key}</p>
          <textarea rows={2} className="mt-1 w-full rounded bg-background px-2 py-1 font-mono" value={draft[s.key] ?? ""} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} />
          <button onClick={() => onSave(s.key)} className="mt-1 rounded-lg bg-primary px-3 py-1 font-bold text-primary-foreground">Save</button>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-2 block">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
