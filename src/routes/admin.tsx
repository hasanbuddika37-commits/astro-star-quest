import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  adminLoginByTgId, adminStats, adminListWithdrawals, adminApproveWithdrawal, adminRejectWithdrawal,
  adminListTasks, adminSaveTask, adminDeleteTask,
  adminListChallenges, adminSaveChallenge, adminDeleteChallenge,
  adminGetSettings, adminSaveSetting, adminCreateBroadcast,
  adminListTickets, adminReplyTicket, adminChangeCredentials,
} from "@/lib/admin.functions";
import {
  adminListAdBlocks, adminSaveAdBlock, adminDeleteAdBlock,
  adminListUsers, adminGetUserDetail, adminSuspendUser, adminAdjustBalance, adminFixBalance,
  adminPostToCommunity, adminAdNetworkCounts,
} from "@/lib/admin-extra.functions";
import { useTelegram } from "@/lib/telegram-webapp";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "AstroBlitz Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

type View = "dashboard" | "withdrawals" | "users" | "ads" | "tasks" | "challenges" | "broadcast" | "community" | "tickets" | "settings" | "profile";

function AdminPage() {
  const { tg, ready } = useTelegram();
  const login = useServerFn(adminLoginByTgId);
  const [token, setToken] = useState<string | null>(() => (typeof localStorage !== "undefined" ? localStorage.getItem("ab_admin_token") : null));
  const [err, setErr] = useState<string | null>(null);
  const [trying, setTrying] = useState(false);

  useEffect(() => {
    if (token || !ready) return;
    const initData = tg?.initData ?? "";
    if (!initData) { setErr("Open this page from inside the AstroBlitz mini-app."); return; }
    setTrying(true);
    login({ data: { initData } })
      .then(({ token }) => { localStorage.setItem("ab_admin_token", token); setToken(token); })
      .catch((e) => setErr(e instanceof Error ? e.message : "Not authorized"))
      .finally(() => setTrying(false));
  }, [ready, tg, token, login]);

  if (token) return <Panel token={token} onLogout={() => { localStorage.removeItem("ab_admin_token"); setToken(null); }} />;
  return (
    <div className="min-h-dvh grid place-items-center p-6 text-center">
      <div className="max-w-sm rounded-3xl border border-border bg-card/80 p-6 backdrop-blur">
        <div className="text-5xl mb-3">🛰️</div>
        {trying ? (
          <p className="text-sm text-muted-foreground">Verifying admin access…</p>
        ) : (
          <p className="text-sm text-muted-foreground">{err ?? "🔒 Admin only."}</p>
        )}
      </div>
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
          {(["dashboard", "withdrawals", "users", "ads", "tasks", "challenges", "broadcast", "community", "tickets", "settings", "profile"] as View[]).map((v) => (
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
        {view === "profile" && <Profile token={token} />}
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
  const empty = { title: "", description: "", reward: 100, url: "", kind: "link", is_active: true, sort_order: 0, task_type: "main" as "main" | "partner" | "community", channel_username: "", verify_via_join: false, icon_url: "" };
  const [f, setF] = useState<typeof empty & { id?: string }>(empty);
  const [filterCat, setFilterCat] = useState<"all" | "main" | "partner" | "community">("all");
  async function load() { setRows(await list({ data: { token } })); }
  useEffect(() => { load().catch(console.error); }, []);
  async function submit() {
    await save({ data: { token, ...f, reward: Number(f.reward), sort_order: Number(f.sort_order) } });
    setF(empty); await load();
  }
  const filtered = rows.filter((t) => filterCat === "all" || ((t as unknown as { task_type?: string }).task_type ?? "main") === filterCat);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <div className="flex gap-1">
          {(["all", "main", "partner", "community"] as const).map((c) => (
            <button key={c} onClick={() => setFilterCat(c)} className={`rounded-lg px-2 py-1 text-[11px] capitalize ${filterCat === c ? "bg-primary text-primary-foreground" : "border border-border"}`}>{c}</button>
          ))}
        </div>
        {filtered.map((t) => {
          const tt = (t as unknown as { task_type?: string; channel_username?: string | null; verify_via_join?: boolean; icon_url?: string | null });
          return (
            <div key={t.id} className="rounded-xl border border-border bg-card/70 p-3 text-xs">
              <div className="flex items-start gap-2">
                {tt.icon_url && <img src={tt.icon_url} alt="" className="h-8 w-8 rounded-lg object-cover border border-border" onError={(e) => (e.currentTarget.style.display = "none")} />}
                <div className="flex-1">
                  <p className="font-bold">{t.title} <span className="text-gold">+{t.reward}</span> <span className="text-[10px] text-muted-foreground">[{tt.task_type ?? "main"}]</span></p>
                  <p className="text-muted-foreground">{t.description}</p>
                  <p className="font-mono break-all">{t.url}</p>
                  {tt.channel_username && <p className="text-cyan-accent">🔗 join-verify: {tt.channel_username}</p>}
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setF({ id: t.id, title: t.title, description: t.description ?? "", reward: Number(t.reward), url: t.url ?? "", kind: t.kind, is_active: t.is_active, sort_order: t.sort_order, task_type: (tt.task_type as "main") ?? "main", channel_username: tt.channel_username ?? "", verify_via_join: tt.verify_via_join ?? false, icon_url: tt.icon_url ?? "" })} className="rounded-lg border border-border px-2 py-1">Edit</button>
                <button onClick={async () => { if (confirm("Delete?")) { await del({ data: { token, id: t.id } }); load(); } }} className="rounded-lg bg-destructive px-2 py-1 text-destructive-foreground">Delete</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <h3 className="font-bold">{f.id ? "Edit task" : "New task"}</h3>
        <Field label="Category">
          <select className="w-full bg-background rounded px-2 py-1" value={f.task_type} onChange={(e) => setF({ ...f, task_type: e.target.value as "main" })}>
            <option value="main">🎯 Main (counts for withdraw)</option>
            <option value="partner">🤝 Partner</option>
            <option value="community">💬 Community</option>
          </select>
        </Field>
        <Field label="Title"><input className="w-full bg-background rounded px-2 py-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className="w-full bg-background rounded px-2 py-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Reward (coins)"><input type="number" className="w-full bg-background rounded px-2 py-1" value={f.reward} onChange={(e) => setF({ ...f, reward: Number(e.target.value) })} /></Field>
        <Field label="URL"><input className="w-full bg-background rounded px-2 py-1" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
        <Field label="Icon URL (imgbb / any https image)"><input className="w-full bg-background rounded px-2 py-1" value={f.icon_url} onChange={(e) => setF({ ...f, icon_url: e.target.value })} placeholder="https://i.ibb.co/xxxx/icon.png" /></Field>
        <Field label="Kind">
          <select className="w-full bg-background rounded px-2 py-1" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="link">link</option>
            <option value="telegram_channel">telegram_channel (verify via bot)</option>
          </select>
        </Field>
        <Field label="Channel @username (for verify, bot must be admin)"><input className="w-full bg-background rounded px-2 py-1" value={f.channel_username} onChange={(e) => setF({ ...f, channel_username: e.target.value })} placeholder="@astroblitzcommunity" /></Field>
        <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={f.verify_via_join} onChange={(e) => setF({ ...f, verify_via_join: e.target.checked })} /> Verify join via bot</label>
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

function Users({ token }: { token: string }) {
  const list = useServerFn(adminListUsers);
  const detail = useServerFn(adminGetUserDetail);
  const suspend = useServerFn(adminSuspendUser);
  const adjust = useServerFn(adminAdjustBalance);
  const fixBal = useServerFn(adminFixBalance);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminListUsers>>["rows"]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "suspended">("all");
  const [sel, setSel] = useState<Awaited<ReturnType<typeof adminGetUserDetail>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [actTab, setActTab] = useState<"ledger" | "ads" | "games" | "withdrawals" | "tasks" | "refers" | "challenges" | "tickets" | "actions">("ledger");

  async function load() {
    setBusy(true);
    try {
      const r = await list({ data: { token, q, status, limit: 100, offset: 0 } });
      setRows(r.rows);
    } finally { setBusy(false); }
  }
  useEffect(() => { load().catch(console.error); }, [status]);

  async function open(tgId: number) {
    const r = await detail({ data: { token, tg_id: tgId } });
    setSel(r); setActTab("ledger");
  }
  async function toggleSuspend(tgId: number, on: boolean) {
    const reason = on ? prompt("Reason:") ?? undefined : undefined;
    if (on && !reason) return;
    await suspend({ data: { token, tg_id: tgId, suspend: on, reason } });
    await load(); if (sel?.profile?.tg_id === tgId) await open(tgId);
  }
  async function doAdjust(tgId: number) {
    const v = prompt("Delta (positive add, negative remove):");
    if (!v) return;
    const note = prompt("Note (optional):") ?? "";
    await adjust({ data: { token, tg_id: tgId, delta: Number(v), note } });
    await open(tgId); await load();
  }
  async function doFix(tgId: number) {
    if (!confirm("Reset the coin balance to match the activity ledger?")) return;
    const r = await fixBal({ data: { token, tg_id: tgId } });
    alert(`Adjusted by ${r.adjusted}. New balance: ${r.new_balance}`);
    await open(tgId); await load();
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tg_id / username" className="flex-1 rounded-lg bg-background border border-border px-3 py-1.5 text-xs" />
          <button onClick={load} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Search</button>
        </div>
        <div className="flex gap-1">
          {(["all", "active", "suspended"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`rounded-lg px-2 py-1 text-xs capitalize ${status === s ? "bg-primary text-primary-foreground" : "border border-border"}`}>{s}</button>
          ))}
        </div>
        {busy && <p className="text-xs text-muted-foreground">Loading…</p>}
        <div className="max-h-[70vh] overflow-y-auto space-y-1">
          {rows.map((u) => (
            <button key={u.tg_id} onClick={() => open(u.tg_id)} className={`block w-full text-left rounded-xl border p-2 text-xs ${u.is_suspended ? "border-destructive/40 bg-destructive/5" : "border-border bg-card/60"}`}>
              <div className="flex justify-between">
                <span className="font-bold">{u.first_name ?? "?"} {u.username && <span className="text-muted-foreground">@{u.username}</span>}</span>
                <span className="text-gold">{Number(u.coins).toLocaleString()}</span>
              </div>
              <p className="text-muted-foreground">🆔 {u.tg_id} • L{u.game_level} • {u.ads_watched} ads • {u.verified_refer_count} ref</p>
              {u.is_suspended && <p className="text-destructive">🚫 {u.suspend_reason}</p>}
            </button>
          ))}
        </div>
      </div>
      <div>
        {!sel && <p className="text-xs text-muted-foreground">Select a user.</p>}
        {sel?.profile && (() => {
          const sp = sel.profile!;
          const mismatch = Math.abs(Number(sp.coins) - sel.expected_balance) > 0.01;
          return (
            <div className="rounded-2xl border border-border bg-card/70 p-3 text-xs space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-sm">{sp.first_name} {sp.username && <span className="text-muted-foreground">@{sp.username}</span>}</p>
                  <p className="text-muted-foreground">🆔 {sp.tg_id} • L{sp.game_level ?? 1} • Joined {new Date(sp.created_at).toLocaleDateString()}</p>
                </div>
                {sp.is_suspended && <span className="rounded-md bg-destructive/20 text-destructive px-2 py-0.5 text-[10px] font-bold">🚫 Suspended</span>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <BalCard label="Balance" value={`${Number(sp.coins).toLocaleString()} 🪙`} accent="text-gold" />
                <BalCard label="Ledger sum" value={`${Number(sel.expected_balance).toLocaleString()} 🪙`} accent={mismatch ? "text-destructive" : "text-green-300"} />
                <BalCard label="Ads watched" value={sp.ads_watched ?? 0} />
                <BalCard label="Verified refers" value={sp.verified_refer_count ?? 0} />
                <BalCard label="Total withdraw" value={`$${Number(sp.total_withdraw ?? 0).toFixed(4)}`} />
                <BalCard label="Game level" value={sp.game_level ?? 1} />
              </div>

              {mismatch && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2 text-[11px] text-destructive">
                  ⚠ Balance and ledger don't match (diff {(Number(sp.coins) - sel.expected_balance).toFixed(4)}).
                  <button onClick={() => doFix(sp.tg_id)} className="ml-2 rounded-md bg-destructive px-2 py-0.5 text-destructive-foreground font-bold">Fix now</button>
                </div>
              )}
              {sp.is_suspended && sp.suspend_reason && (
                <div className="rounded-lg bg-destructive/5 border border-destructive/30 p-2 text-[11px] text-destructive">{sp.suspend_reason}</div>
              )}

              <div className="flex flex-wrap gap-2">
                <button onClick={() => doAdjust(sp.tg_id)} className="rounded-lg bg-primary px-2 py-1 text-primary-foreground">± Balance</button>
                <button onClick={() => doFix(sp.tg_id)} className="rounded-lg border border-border px-2 py-1">🔧 Fix balance</button>
                <button onClick={() => toggleSuspend(sp.tg_id, !sp.is_suspended)} className={`rounded-lg px-2 py-1 text-white ${sp.is_suspended ? "bg-green-600" : "bg-destructive"}`}>
                  {sp.is_suspended ? "Un-suspend" : "Suspend"}
                </button>
              </div>

              <div className="flex flex-wrap gap-1 border-t border-border pt-2">
                {(["ledger","ads","games","withdrawals","tasks","refers","challenges","tickets","actions"] as const).map((t) => (
                  <button key={t} onClick={() => setActTab(t)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold capitalize ${actTab === t ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
                    {t} ({(sel[t] as unknown[]).length})
                  </button>
                ))}
              </div>

              <div className="max-h-[50vh] overflow-y-auto space-y-1 text-[10px] font-mono">
                {actTab === "ledger" && sel.ledger.map((l) => (
                  <p key={l.id}><span className="text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span> {Number(l.delta) >= 0 ? "+" : ""}{l.delta} <span className="text-cyan-accent">{l.reason}</span> {l.meta && <span className="text-muted-foreground">{JSON.stringify(l.meta)}</span>}</p>
                ))}
                {actTab === "ads" && sel.ads.map((a) => (
                  <p key={a.id}><span className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span> {a.slot} • {a.network ?? "-"} • +{a.reward}</p>
                ))}
                {actTab === "games" && sel.games.map((g) => (
                  <p key={g.id}><span className="text-muted-foreground">{new Date(g.created_at).toLocaleString()}</span> L{g.level_reached} • +{g.coins_earned} {g.revived && "• revived"}</p>
                ))}
                {actTab === "withdrawals" && sel.withdrawals.map((w) => (
                  <p key={w.id}><span className="text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</span> [{w.status}] {w.currency} {Number(w.net_amount).toFixed(6)} • {w.coins} 🪙 {w.tx_id && `• TX ${w.tx_id.slice(0, 12)}…`}</p>
                ))}
                {actTab === "tasks" && sel.tasks.map((t) => {
                  const tt = t as unknown as { id: string; task_id: string; created_at: string; tasks?: { title?: string } };
                  return <p key={tt.id}><span className="text-muted-foreground">{new Date(tt.created_at).toLocaleString()}</span> {tt.tasks?.title ?? tt.task_id}</p>;
                })}
                {actTab === "refers" && sel.refers.map((r) => {
                  const rr = r as unknown as { id: string; created_at: string; referee_tg_id: number; source: string; amount: number };
                  return <p key={rr.id}><span className="text-muted-foreground">{new Date(rr.created_at).toLocaleString()}</span> from {rr.referee_tg_id} • {rr.source} • +{rr.amount}</p>;
                })}
                {actTab === "challenges" && sel.challenges.map((c) => {
                  const cc = c as unknown as { id: string; claimed_at: string; challenges?: { title?: string }; challenge_id: string; reward?: number };
                  return <p key={cc.id}><span className="text-muted-foreground">{new Date(cc.claimed_at).toLocaleString()}</span> {cc.challenges?.title ?? cc.challenge_id} {cc.reward != null && `• +${cc.reward}`}</p>;
                })}
                {actTab === "tickets" && sel.tickets.map((tk) => {
                  const t = tk as unknown as { id: string; created_at: string; subject: string; status: string };
                  return <p key={t.id}><span className="text-muted-foreground">{new Date(t.created_at).toLocaleString()}</span> [{t.status}] {t.subject}</p>;
                })}
                {actTab === "actions" && sel.actions.map((a) => (
                  <p key={a.id}><span className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span> {a.action} {a.delta != null && `• ${a.delta}`} {a.note && `• ${a.note}`}</p>
                ))}
                {(sel[actTab] as unknown[]).length === 0 && <p className="text-muted-foreground italic">No records.</p>}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function BalCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-2">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-extrabold ${accent ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

function Ads({ token }: { token: string }) {
  const list = useServerFn(adminListAdBlocks);
  const save = useServerFn(adminSaveAdBlock);
  const del = useServerFn(adminDeleteAdBlock);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminListAdBlocks>>>([]);
  const empty = { network: "", label: "", logo_url: "", buttons_count: 10, reward_min: 5, reward_max: 10, cooldown_seconds: 43200, button_lock_seconds: 5, is_enabled: true, sort_order: 0, zone_id: "", sdk_extra: "" };
  const [f, setF] = useState<typeof empty & { id?: string }>(empty);
  async function load() { setRows(await list({ data: { token } })); }
  useEffect(() => { load().catch(console.error); }, []);
  async function submit() {
    await save({ data: { token, ...f, buttons_count: Number(f.buttons_count), reward_min: Number(f.reward_min), reward_max: Number(f.reward_max), cooldown_seconds: Number(f.cooldown_seconds), button_lock_seconds: Number(f.button_lock_seconds), sort_order: Number(f.sort_order) } });
    setF(empty); await load();
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        {rows.map((b) => (
          <div key={b.id} className="rounded-xl border border-border bg-card/70 p-3 text-xs">
            <div className="flex justify-between">
              <p className="font-bold">{b.label} <span className="text-muted-foreground">({b.network})</span></p>
              <span className={b.is_enabled ? "text-green-300" : "text-muted-foreground"}>{b.is_enabled ? "ON" : "OFF"}</span>
            </div>
            <p className="text-muted-foreground">{b.buttons_count} buttons • {Number(b.reward_min)}–{Number(b.reward_max)} coins • {b.cooldown_seconds}s cd • {b.button_lock_seconds}s lock</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setF({ id: b.id, network: b.network, label: b.label, logo_url: b.logo_url ?? "", buttons_count: b.buttons_count, reward_min: Number(b.reward_min), reward_max: Number(b.reward_max), cooldown_seconds: b.cooldown_seconds, button_lock_seconds: b.button_lock_seconds, is_enabled: b.is_enabled, sort_order: b.sort_order, zone_id: b.zone_id ?? "", sdk_extra: b.sdk_extra ? JSON.stringify(b.sdk_extra) : "" })} className="rounded-lg border border-border px-2 py-1">Edit</button>
              <button onClick={async () => { if (confirm("Delete?")) { await del({ data: { token, id: b.id } }); load(); } }} className="rounded-lg bg-destructive px-2 py-1 text-destructive-foreground">Delete</button>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <h3 className="font-bold">{f.id ? "Edit ad block" : "New ad block"}</h3>
        <Field label="Network slug (lowercase)"><input className="w-full bg-background rounded px-2 py-1" value={f.network} onChange={(e) => setF({ ...f, network: e.target.value })} /></Field>
        <Field label="Label"><input className="w-full bg-background rounded px-2 py-1" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <Field label="Logo URL"><input className="w-full bg-background rounded px-2 py-1" value={f.logo_url} onChange={(e) => setF({ ...f, logo_url: e.target.value })} /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Buttons"><input type="number" className="w-full bg-background rounded px-2 py-1" value={f.buttons_count} onChange={(e) => setF({ ...f, buttons_count: Number(e.target.value) })} /></Field>
          <Field label="Reward min"><input type="number" className="w-full bg-background rounded px-2 py-1" value={f.reward_min} onChange={(e) => setF({ ...f, reward_min: Number(e.target.value) })} /></Field>
          <Field label="Reward max"><input type="number" className="w-full bg-background rounded px-2 py-1" value={f.reward_max} onChange={(e) => setF({ ...f, reward_max: Number(e.target.value) })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cooldown (s)"><input type="number" className="w-full bg-background rounded px-2 py-1" value={f.cooldown_seconds} onChange={(e) => setF({ ...f, cooldown_seconds: Number(e.target.value) })} /></Field>
          <Field label="Button lock (s)"><input type="number" className="w-full bg-background rounded px-2 py-1" value={f.button_lock_seconds} onChange={(e) => setF({ ...f, button_lock_seconds: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Zone / block id"><input className="w-full bg-background rounded px-2 py-1" value={f.zone_id} onChange={(e) => setF({ ...f, zone_id: e.target.value })} /></Field>
        <Field label="SDK extra (JSON)"><textarea rows={3} className="w-full bg-background rounded px-2 py-1 font-mono text-[11px]" value={f.sdk_extra} onChange={(e) => setF({ ...f, sdk_extra: e.target.value })} /></Field>
        <Field label="Sort order"><input type="number" className="w-full bg-background rounded px-2 py-1" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} /></Field>
        <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={f.is_enabled} onChange={(e) => setF({ ...f, is_enabled: e.target.checked })} /> Enabled</label>
        <div className="mt-3 flex gap-2">
          <button onClick={submit} className="rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground">{f.id ? "Update" : "Create"}</button>
          {f.id && <button onClick={() => setF(empty)} className="rounded-lg border border-border px-3 py-1.5">Cancel</button>}
        </div>
      </div>
    </div>
  );
}

function CommunityPost({ token }: { token: string }) {
  const post = useServerFn(adminPostToCommunity);
  const [message, setMessage] = useState("");
  const [image, setImage] = useState("");
  const [btnText, setBtnText] = useState("");
  const [btnUrl, setBtnUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function submit() {
    try {
      await post({ data: { token, message, image_url: image, button_text: btnText, button_url: btnUrl } });
      setMsg("✅ Posted to community.");
      setMessage(""); setImage(""); setBtnText(""); setBtnUrl("");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); }
  }
  return (
    <div className="max-w-xl rounded-2xl border border-border bg-card/70 p-4">
      <h3 className="font-bold">📣 Post to community channel</h3>
      <p className="text-[11px] text-muted-foreground">Posts via bot to the channel set in <code>community_chat_id</code>. Make sure bot is admin in the channel.</p>
      <Field label="Message (HTML allowed)"><textarea rows={6} className="w-full bg-background rounded px-2 py-1" value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
      <Field label="Image URL (optional)"><input className="w-full bg-background rounded px-2 py-1" value={image} onChange={(e) => setImage(e.target.value)} /></Field>
      <Field label="Button text"><input className="w-full bg-background rounded px-2 py-1" value={btnText} onChange={(e) => setBtnText(e.target.value)} /></Field>
      <Field label="Button URL"><input className="w-full bg-background rounded px-2 py-1" value={btnUrl} onChange={(e) => setBtnUrl(e.target.value)} /></Field>
      <button onClick={submit} className="mt-3 rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground">Send now</button>
      {msg && <p className="mt-3 text-xs">{msg}</p>}
    </div>
  );
}

function Profile({ token }: { token: string }) {
  const change = useServerFn(adminChangeCredentials);
  const [current, setCurrent] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setMsg(null); setErr(null); setBusy(true);
    try {
      await change({ data: {
        token, current_password: current,
        new_email: email || undefined, new_password: pw || undefined,
      }});
      setMsg("✅ Updated. Use new credentials next time.");
      setCurrent(""); setEmail(""); setPw("");
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <div className="max-w-md rounded-2xl border border-border bg-card/70 p-4">
      <h3 className="font-bold">🔐 Change admin email / password</h3>
      <p className="text-[11px] text-muted-foreground">Leave a field blank to keep it unchanged.</p>
      <Field label="Current password"><input type="password" className="w-full bg-background rounded px-2 py-1" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <Field label="New email (optional)"><input type="email" className="w-full bg-background rounded px-2 py-1" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="New password (optional, min 6)"><input type="password" className="w-full bg-background rounded px-2 py-1" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <button onClick={submit} disabled={busy || !current} className="mt-3 rounded-lg bg-primary px-3 py-1.5 font-bold text-primary-foreground disabled:opacity-50">
        {busy ? "Saving…" : "Save"}
      </button>
      {msg && <p className="mt-3 text-xs text-green-300">{msg}</p>}
      {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
    </div>
  );
}
