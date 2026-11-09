// Small SMTP client for Hostinger mailboxes. Uses port 465 (TLS from the start), because Edge Functions cannot reach 25 or 587.
export const SMTP_HOST = "smtp.hostinger.com", SMTP_PORT = 465;
export class SmtpError extends Error { constructor(msg: string, public auth = false) { super(msg); } }

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (s: string) => { let x = ""; for (const c of enc.encode(s)) x += String.fromCharCode(c); return btoa(x); };
const clean = (s: string) => s.replace(/[\r\n\0]+/g, " ").trim();
const wrap = (s: string) => s.replace(/.{1,76}/g, "$&\r\n");
// deno-lint-ignore no-control-regex
const ascii = (s: string) => /^[\x20-\x7e]*$/.test(s);

function word(s: string) {
  if (ascii(s)) return s;
  const parts: string[] = []; let cur = "";
  for (const ch of s) { if (enc.encode(cur + ch).length > 42) { parts.push(cur); cur = ""; } cur += ch; }
  if (cur) parts.push(cur);
  return parts.map((p) => `=?UTF-8?B?${b64(p)}?=`).join("\r\n ");
}
const named = (name: string, addr: string) => { const n = clean(name).replace(/[<>]/g, ""); return n ? `${ascii(n) ? `"${n.replace(/(["\\])/g, "\\$1")}"` : word(n)} <${addr}>` : addr; };

export function buildMessage(m: { fromName: string; from: string; to: string; replyTo?: string; subject: string; text: string; html: string }) {
  const domain = m.from.split("@")[1], boundary = `fa_${crypto.randomUUID().replace(/-/g, "")}`;
  const part = (type: string, body: string) => `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64(body))}`;
  return [
    `From: ${named(m.fromName, m.from)}`, `To: <${m.to}>`, ...(m.replyTo ? [`Reply-To: <${clean(m.replyTo)}>`] : []),
    `Subject: ${word(clean(m.subject))}`, `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`, "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    part("text/plain", m.text) + part("text/html", m.html) + `--${boundary}--`, "",
  ].join("\r\n");
}

export class Smtp {
  private buf = ""; private constructor(private c: Deno.Conn) {}

  static async open(user: string, pass: string) {
    let c: Deno.Conn;
    try { c = await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT }); }
    catch { throw new SmtpError("Could not reach Hostinger's mail server. Please try again shortly."); }
    const s = new Smtp(c);
    try {
      await s.reply(220);
      const caps = await s.cmd("EHLO fortabbaspolyclinic.com", 250);
      const auth = await (/AUTH[^\n]*\bPLAIN\b/i.test(caps) ? s.raw(`AUTH PLAIN ${b64(`\0${user}\0${pass}`)}`) : (async () => {
        await s.cmd("AUTH LOGIN", 334); await s.cmd(b64(user), 334); return await s.raw(b64(pass));
      })());
      if (!auth.startsWith("235")) throw new SmtpError("Hostinger did not accept this mailbox address or password. Check them, and change the mailbox password in Hostinger if you are not sure of it.", true);
      return s;
    } catch (e) { s.close(); throw e; }
  }

  private async read() {
    const b = new Uint8Array(4096);
    let t = 0;
    const n = await Promise.race([this.c.read(b), new Promise<never>((_, r) => { t = setTimeout(() => r(new SmtpError("Hostinger's mail server took too long to answer.")), 20000); })]).finally(() => clearTimeout(t));
    if (n === null) throw new SmtpError("Hostinger's mail server closed the connection.");
    this.buf += dec.decode(b.subarray(0, n));
  }
  private async response() {
    for (;;) {
      const lines = this.buf.split("\r\n");
      const end = lines.findIndex((l) => /^\d{3}( |$)/.test(l));
      if (end >= 0 && end < lines.length - 1) { this.buf = lines.slice(end + 1).join("\r\n"); return lines.slice(0, end + 1).join("\n"); }
      await this.read();
    }
  }
  private async write(s: string) { const d = enc.encode(s); let i = 0; while (i < d.length) i += await this.c.write(d.subarray(i)); }
  private async reply(code: number) {
    const r = await this.response();
    if (!r.startsWith(String(code))) throw new SmtpError(r.replace(/\n\d{3}[ -]/g, " ").slice(0, 300));
    return r;
  }
  private async raw(line: string) { await this.write(line + "\r\n"); return await this.response(); }
  private async cmd(line: string, code: number) { await this.write(line + "\r\n"); return await this.reply(code); }

  async send(from: string, to: string, message: string) {
    await this.cmd(`MAIL FROM:<${from}>`, 250);
    await this.cmd(`RCPT TO:<${to}>`, 250);
    await this.cmd("DATA", 354);
    await this.write(message.replace(/^\./gm, "..") + "\r\n.\r\n");
    await this.reply(250);
  }
  async sendMany(from: string, to: string[], message: string) {
    await this.cmd(`MAIL FROM:<${from}>`, 250);
    for (const r of to) await this.cmd(`RCPT TO:<${r}>`, 250);
    await this.cmd("DATA", 354);
    await this.write(message.replace(/^\./gm, "..") + "\r\n.\r\n");
    await this.reply(250);
  }
  async reset() { await this.cmd("RSET", 250); }
  async quit() { try { await this.raw("QUIT"); } catch { /* already closed */ } this.close(); }
  close() { try { this.c.close(); } catch { /* already closed */ } }
}
