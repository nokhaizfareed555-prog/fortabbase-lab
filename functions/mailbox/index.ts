// mailbox: brings email from the Hostinger mailbox into Conversations (IMAP) and sends replies (SMTP). Runs every minute from pg_cron and on staff request.
import PostalMime from "npm:postal-mime@2.4.3";
import { Smtp, SmtpError } from "../send-email/smtp.ts";
import { Imap, ImapError } from "./imap.ts";
import { type Addr, type Att, build } from "./mime.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-hook-secret" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const svc = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
const rows = async (q: string) => { const r = await fetch(`${URL_}/rest/v1/${q}`, { headers: svc }); return r.ok ? await r.json() : []; };
const patch = (q: string, b: unknown) => fetch(`${URL_}/rest/v1/${q}`, { method: "PATCH", headers: svc, body: JSON.stringify(b) });
const upsert = (t: string, b: unknown) => fetch(`${URL_}/rest/v1/${t}`, { method: "POST", headers: { ...svc, prefer: "resolution=merge-duplicates" }, body: JSON.stringify(b) });
const ingest = async (m: unknown) => { const r = await fetch(`${URL_}/rest/v1/rpc/_mail_ingest`, { method: "POST", headers: svc, body: JSON.stringify({ m }) }); if (!r.ok) throw new Error("Could not save the email: " + (await r.text()).slice(0, 200)); return await r.json(); };
const EMAIL = /^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$/;
const MAX_MAIL = 12e6, MAX_ATT = 10e6, RUN_BYTES = 8e6, RUN_MAILS = 15, FIRST_IMPORT = 300, RUN_MS = 100000;
const safe = (s: string) => s.replace(/[^\w.-]+/g, "_").slice(-60) || "file";
const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
const strip = (h: string) => h.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*/g, "\n\n").trim();
const when = (d: unknown) => { const t = new Date(String(d ?? "")).getTime(); return new Date(Number.isFinite(t) && t < Date.now() + 864e5 ? t : Date.now()).toISOString(); };
const flat = (l: any[] | undefined): Addr[] => (l ?? []).flatMap((a) => a.group ? flat(a.group) : a.address ? [{ name: a.name ?? "", email: String(a.address).toLowerCase() }] : []);
const idsIn = (s: unknown) => String(s ?? "").match(/<[^<>\s]+>/g) ?? [];

async function store(path: string, bytes: Uint8Array | ArrayBuffer) {
  // Always stored as a plain download, so an attached web page can never run on our address.
  const r = await fetch(`${URL_}/storage/v1/object/mail/${path}`, { method: "POST", headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/octet-stream", "x-upsert": "true" }, body: bytes });
  if (!r.ok) throw new Error("Could not store the attachment");
}

async function importOne(imap: Imap, uid: number, folder: string, uv: number, mailbox: string, info: { size: number; seen: boolean }, headersOnly: boolean) {
  const raw = await imap.body(uid, headersOnly), p: any = await PostalMime.parse(raw);
  const message_id = p.messageId || `<${uv}.${uid}.${folder}@import>`;
  if ((await rows(`mail_messages?message_id=eq.${encodeURIComponent(message_id)}&select=id`)).length) return;
  const from = flat(p.from ? [p.from] : [])[0] ?? { name: "", email: "" }, to = flat(p.to), cc = flat(p.cc), mine = from.email === mailbox || folder === "sent";
  const contact = mine ? (to.find((a) => a.email !== mailbox) ?? to[0] ?? from) : from;
  const atts = [] as unknown[], key = await hash(message_id);
  if (!headersOnly) for (const [i, a] of (p.attachments ?? []).entries()) {
    const size = a.content?.byteLength ?? 0, name = a.filename || `attachment-${i + 1}`;
    if (size > MAX_ATT) { atts.push({ name, type: a.mimeType, size, skipped: true }); continue; }
    const path = `${key}/${i}-${safe(name)}`; await store(path, a.content);
    atts.push({ name, type: a.mimeType, size, path, inline: a.disposition === "inline" && !!a.contentId, cid: a.contentId ?? "" });
  }
  const note = "This email was too large to bring in. Open it in the Hostinger mailbox to read it.";
  const body_html = headersOnly ? "" : p.html ?? "", body_text = headersOnly ? note : (p.text?.trim() ? p.text : strip(body_html));
  await ingest({ message_id, refs: [...idsIn(p.references), ...idsIn(p.inReplyTo)], kind: mine ? "out" : "in", folder, seen: info.seen || mine, from_email: from.email, from_name: from.name, reply_to: flat(p.replyTo)[0]?.email ?? "",
    to_list: to, cc_list: cc, subject: p.subject ?? "(no subject)", body_text, body_html, attachments: atts, at: when(p.date), contact_email: contact.email, contact_name: contact.name });
}

async function sync(user: string, pass: string) {
  const started = Date.now(); let added = 0, bytes = 0, more = false;
  const imap = await Imap.open(user, pass);
  try {
    const all = await imap.list(), find = (flag: RegExp, name: RegExp) => (all.find((f) => flag.test(f.flags)) ?? all.find((f) => name.test(f.name)))?.name;
    const boxes: [string | undefined, string][] = [["INBOX", "inbox"], [find(/\\Sent/i, /(^|[./])sent( items| messages)?$/i), "sent"], [find(/\\Junk/i, /(^|[./])(spam|junk)$/i), "spam"]];
    for (const [name, folder] of boxes) {
      if (!name) continue;
      const { uidvalidity } = await imap.select(name);
      const st = (await rows(`mail_sync?folder=eq.${folder}&select=*`))[0] ?? { folder, uidvalidity, last_uid: 0, try_uid: 0, tries: 0 };
      if (Number(st.uidvalidity) !== uidvalidity) { st.uidvalidity = uidvalidity; st.last_uid = 0; }
      let uids = await imap.uidsAfter(Number(st.last_uid));
      if (!Number(st.last_uid)) uids = uids.slice(-FIRST_IMPORT);
      for (const uid of uids) {
        if (added >= RUN_MAILS || bytes >= RUN_BYTES || Date.now() - started > RUN_MS) { more = true; break; }
        const info = await imap.info(uid);
        // Note the attempt first, so one email that crashes the function cannot block everything behind it.
        st.tries = Number(st.try_uid) === uid ? Number(st.tries) + 1 : 1; st.try_uid = uid;
        await upsert("mail_sync", st);
        await importOne(imap, uid, folder, uidvalidity, user, info, info.size > MAX_MAIL || st.tries >= 3);
        st.last_uid = uid; added++; bytes += Math.min(info.size, MAX_MAIL);
        await upsert("mail_sync", st);
      }
    }
  } finally { await imap.quit(); }
  await patch("mail_settings?id=eq.1", { last_sync_at: new Date().toISOString(), last_error: "" });
  return { added, more };
}

const list = (a: unknown): Addr[] => (Array.isArray(a) ? a : []).filter((r: any) => EMAIL.test(r?.email ?? "")).map((r: any) => ({ name: String(r.name ?? "").slice(0, 120), email: String(r.email).toLowerCase() }));

async function send(b: any, me: any, user: string, pass: string, name: string) {
  const to = list(b.to), cc = list(b.cc), bcc = list(b.bcc), subject = String(b.subject ?? "").trim().slice(0, 300), text = String(b.text ?? "").slice(0, 100000);
  if (!to.length) return out({ error: "Add at least one valid email address" }, 400);
  if (to.length + cc.length + bcc.length > 20) return out({ error: "Send to 20 people or fewer at a time" }, 400);
  if (!subject || !text.trim()) return out({ error: "Write a subject and a message" }, 400);
  const files: Att[] = (Array.isArray(b.attachments) ? b.attachments : []).map((a: any) => ({ name: String(a.name ?? "file").slice(0, 160), type: String(a.type ?? ""), bytes: Uint8Array.from(atob(String(a.data ?? "")), (c) => c.charCodeAt(0)) }));
  if (files.reduce((n, f) => n + f.bytes.length, 0) > MAX_ATT) return out({ error: "Attachments can be 10 MB in total" }, 400);
  let inReplyTo: string | undefined, refs: string[] = [];
  if (b.thread_id && b.in_reply) {
    const last = (await rows(`mail_messages?thread_id=eq.${encodeURIComponent(b.thread_id)}&kind=neq.note&message_id=not.is.null&order=at.desc&limit=1&select=message_id,refs`))[0];
    if (last) { inReplyTo = last.message_id; refs = [...(last.refs ?? []), last.message_id]; }
  }
  const message_id = `<${crypto.randomUUID()}@${user.split("@")[1]}>`, from = { name, email: user };
  const raw = build({ from, to, cc, subject, text, messageId: message_id, inReplyTo, refs, attachments: files });
  let smtp: Smtp | null = null;
  try { smtp = await Smtp.open(user, pass); await smtp.sendMany(user, [...to, ...cc, ...bcc].map((a) => a.email), raw); await smtp.quit(); }
  catch (e) { smtp?.close(); return out({ error: e instanceof SmtpError ? e.message : "Could not send this email" }, 400); }
  const key = await hash(message_id), atts = [] as unknown[];
  for (const [i, f] of files.entries()) { const path = `${key}/${i}-${safe(f.name)}`; await store(path, f.bytes).then(() => atts.push({ name: f.name, type: f.type, size: f.bytes.length, path })).catch(() => atts.push({ name: f.name, type: f.type, size: f.bytes.length, skipped: true })); }
  const thread = await ingest({ thread_id: b.thread_id || null, message_id, refs, kind: "out", folder: "sent", seen: true, from_email: user, from_name: name, to_list: to, cc_list: cc, bcc_list: bcc, subject, body_text: text, attachments: atts, at: new Date().toISOString(), contact_email: to[0].email, contact_name: to[0].name, sent_by: me.name || me.email });
  await fetch(`${URL_}/rest/v1/email_log`, { method: "POST", headers: svc, body: JSON.stringify({ actor: me.email, template: "conversation", recipient: to[0].email, subject, status: "sent" }) });
  // Copy to the mailbox's own Sent folder so it also shows in Hostinger webmail. The email is already sent if this fails.
  let copied = true;
  try { const imap = await Imap.open(user, pass); try { const all = await imap.list(), s = (all.find((f) => /\\Sent/i.test(f.flags)) ?? all.find((f) => /(^|[./])sent( items| messages)?$/i.test(f.name)))?.name; if (s) await imap.append(s, new TextEncoder().encode(raw)); else copied = false; } finally { await imap.quit(); } } catch { copied = false; }
  return out({ ok: true, thread_id: thread, copied });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const [sec] = await rows("blog_secrets?id=eq.1&select=hook_secret,smtp_password"), [set] = await rows("blog_settings?id=eq.1&select=smtp_user,smtp_name");
  const given = req.headers.get("x-hook-secret") ?? "", hook = !!sec?.hook_secret && given === sec.hook_secret;
  let me: any = null;
  if (!hook) {
    const who = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, authorization: req.headers.get("authorization") ?? "" } });
    if (!who.ok) return out({ error: "Not signed in" }, 401);
    me = (await rows(`profiles?id=eq.${(await who.json()).id}&active=eq.true&select=*`))[0];
    if (!me || !(me.role === "owner" || me.perms?.conversations === true)) return out({ error: "Not allowed" }, 403);
  }
  const b = await req.json().catch(() => ({}));
  if (!set?.smtp_user || !sec?.smtp_password) return out({ error: "Finish Messages > Email setup first: add the Hostinger mailbox and its password" }, 400);
  try {
    if (b.action === "sync") return out(await sync(set.smtp_user, sec.smtp_password));
    if (hook) return out({ error: "Not allowed" }, 403);
    if (b.action === "send") return await send(b, me, set.smtp_user, sec.smtp_password, set.smtp_name);
    if (b.action === "file") {
      const m = (await rows(`mail_messages?id=eq.${encodeURIComponent(b.message)}&select=attachments`))[0], a = m?.attachments?.[Number(b.index)];
      if (!a?.path) return out({ error: "This attachment is not available" }, 404);
      const r = await fetch(`${URL_}/storage/v1/object/sign/mail/${a.path}`, { method: "POST", headers: svc, body: JSON.stringify({ expiresIn: 120 }) }), j = await r.json();
      if (!r.ok) return out({ error: "This attachment is not available" }, 404);
      return out({ url: `${URL_}/storage/v1${j.signedURL}&download=${encodeURIComponent(a.name)}` });
    }
    if (b.action === "purge") {
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).filter((x: string) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 200);
      if (!ids.length) return out({ ok: true });
      const t = await rows(`mail_threads?id=in.(${ids.join(",")})&folder=eq.trash&select=id`), keep = t.map((x: any) => x.id);
      if (!keep.length) return out({ ok: true });
      const ms = await rows(`mail_messages?thread_id=in.(${keep.join(",")})&select=attachments`), prefixes = ms.flatMap((m: any) => (m.attachments ?? []).map((a: any) => a.path).filter(Boolean));
      if (prefixes.length) await fetch(`${URL_}/storage/v1/object/mail`, { method: "DELETE", headers: svc, body: JSON.stringify({ prefixes }) });
      await fetch(`${URL_}/rest/v1/mail_threads?id=in.(${keep.join(",")})`, { method: "DELETE", headers: svc });
      return out({ ok: true });
    }
    return out({ error: "Unknown action" }, 400);
  } catch (e) {
    const msg = e instanceof ImapError || e instanceof SmtpError ? e.message : "The mailbox could not be reached";
    console.error(e);
    if (b.action === "sync") await patch("mail_settings?id=eq.1", { last_error: msg.slice(0, 300) });
    return out({ error: msg }, 400);
  }
});
