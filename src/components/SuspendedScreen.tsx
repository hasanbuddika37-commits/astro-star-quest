import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { createTicket, listTickets } from "@/lib/support.functions";

type Props = { initData: string; reason: string | null };

type TicketRow = { id: string; subject: string; status: string; created_at: string };

export default function SuspendedScreen({ initData, reason }: Props) {
  const create = useServerFn(createTicket);
  const list = useServerFn(listTickets);
  const [subject, setSubject] = useState("Account suspended — please review");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);

  async function refresh() {
    try {
      const r = await list({ data: { initData } });
      setTickets((r as TicketRow[]) ?? []);
    } catch { /* ignore */ }
  }
  useEffect(() => { refresh(); }, []);

  async function send() {
    setErr(null);
    if (!body.trim()) { setErr("Please describe your issue"); return; }
    try {
      await create({ data: { initData, subject, body } });
      setSent(true); setBody("");
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="min-h-dvh px-5 py-6 ab-safe-top ab-safe-bottom">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="rounded-3xl border border-destructive/40 bg-destructive/10 p-5 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-destructive/30 text-3xl">🚫</div>
          <h1 className="mt-3 text-xl font-extrabold text-destructive">Account Suspended</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            {reason ?? "Your account has been suspended."} You cannot play, withdraw, or earn until an admin reviews your case.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card/80 p-4 backdrop-blur">
          <h2 className="text-sm font-bold">📨 Contact Support</h2>
          <p className="text-[11px] text-muted-foreground">Open a ticket — an admin will reply via the bot.</p>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Subject" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Describe your issue…" />
          {err && <p className="mt-2 rounded-lg bg-destructive/15 px-3 py-2 text-[11px] text-destructive">{err}</p>}
          <button onClick={send} className="mt-3 h-11 w-full rounded-xl text-sm font-bold text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
            📨 Send ticket
          </button>
          {sent && <p className="mt-2 rounded-lg bg-green-500/15 px-3 py-2 text-[11px] text-green-300">✅ Ticket sent. We'll reply through the bot.</p>}
        </div>

        {tickets.length > 0 && (
          <div className="rounded-3xl border border-border bg-card/60 p-4">
            <h3 className="text-sm font-bold mb-2">Your tickets</h3>
            <div className="space-y-2">
              {tickets.map((t) => (
                <div key={t.id} className="rounded-xl border border-border bg-background/40 p-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-bold">{t.subject}</span>
                    <span className="capitalize text-muted-foreground">{t.status}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
