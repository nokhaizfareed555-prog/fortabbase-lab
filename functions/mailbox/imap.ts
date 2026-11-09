// Small IMAP client for the Hostinger mailbox (port 993, TLS). Works on bytes because email bodies are not always UTF-8.
export const IMAP_HOST = "imap.hostinger.com", IMAP_PORT = 993;
export class ImapError extends Error {}
const enc = new TextEncoder(), dec = new TextDecoder("latin1");
const quote = (s: string) => `"${s.replace(/(["\\])/g, "\\$1")}"`;
const join = (a: Uint8Array, b: Uint8Array) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
export type Untagged = { line: string; literals: Uint8Array[] };
type Conn = { read(b: Uint8Array): Promise<number | null>; write(b: Uint8Array): Promise<number>; close(): void };

export class Imap {
  private buf = new Uint8Array(0); private n = 0;
  private c: Conn;
  constructor(c: Conn) { this.c = c; }
  static async open(user: string, pass: string) {
    let c: Conn;
    try { c = await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT }); } catch { throw new ImapError("Could not reach Hostinger's mail server. Please try again shortly."); }
    const s = new Imap(c);
    try { await s.line(); await s.cmd(`LOGIN ${quote(user)} ${quote(pass)}`).catch(() => { throw new ImapError("Hostinger did not accept this mailbox address or password."); }); return s; }
    catch (e) { s.close(); throw e; }
  }
  private async fill() {
    const b = new Uint8Array(65536); let t = 0;
    const r = await Promise.race([this.c.read(b), new Promise<never>((_, x) => { t = setTimeout(() => x(new ImapError("The mail server took too long to answer.")), 25000); })]).finally(() => clearTimeout(t));
    if (r === null) throw new ImapError("The mail server closed the connection.");
    this.buf = join(this.buf, b.subarray(0, r));
  }
  private async line() {
    for (let from = 0;;) {
      for (let i = from; i < this.buf.length - 1; i++) if (this.buf[i] === 13 && this.buf[i + 1] === 10) { const l = dec.decode(this.buf.subarray(0, i)); this.buf = this.buf.slice(i + 2); return l; }
      from = Math.max(0, this.buf.length - 1); await this.fill();
    }
  }
  private async take(n: number) { while (this.buf.length < n) await this.fill(); const o = this.buf.slice(0, n); this.buf = this.buf.slice(n); return o; }
  private async write(b: Uint8Array) { let i = 0; while (i < b.length) i += await this.c.write(b.subarray(i)); }
  private async finish(tag: string) {
    const out: Untagged[] = [];
    for (;;) {
      let l = await this.line();
      if (l.startsWith(tag + " ")) { if (!/^\S+ OK/i.test(l)) throw new ImapError(l.slice(tag.length + 1, 300)); return out; }
      const u: Untagged = { line: "", literals: [] };
      for (;;) {
        const m = l.match(/\{(\d+)\}$/);
        if (!m) { u.line += l; break; }
        u.line += l; u.literals.push(await this.take(Number(m[1]))); l = await this.line();
      }
      out.push(u);
    }
  }
  async cmd(c: string) { const tag = `A${++this.n}`; await this.write(enc.encode(`${tag} ${c}\r\n`)); return await this.finish(tag); }
  async list() {
    return (await this.cmd('LIST "" "*"')).map((u) => u.line.match(/^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (?:"((?:[^"\\]|\\.)*)"|(\S+))$/i)).filter(Boolean).map((m) => ({ flags: m![1], name: (m![2] ?? m![3]).replace(/\\(.)/g, "$1") }));
  }
  async select(folder: string) { const r = await this.cmd(`EXAMINE ${quote(folder)}`); const v = r.map((u) => u.line.match(/UIDVALIDITY (\d+)/i)).find(Boolean); return { uidvalidity: v ? Number(v[1]) : 0 }; }
  async uidsAfter(last: number) {
    const r = await this.cmd(`UID SEARCH UID ${last + 1}:*`), s = r.find((u) => /^\* SEARCH/i.test(u.line));
    return (s ? s.line.replace(/^\* SEARCH/i, "").trim().split(/\s+/).filter(Boolean).map(Number) : []).filter((n) => n > last).sort((a, b) => a - b);
  }
  async info(uid: number) { const l = (await this.cmd(`UID FETCH ${uid} (FLAGS RFC822.SIZE)`))[0]?.line ?? ""; return { size: Number(l.match(/RFC822\.SIZE (\d+)/i)?.[1] ?? 0), seen: /\\Seen/i.test(l) }; }
  async body(uid: number, headersOnly = false) { const r = await this.cmd(`UID FETCH ${uid} BODY.PEEK[${headersOnly ? "HEADER" : ""}]`); const b = r.find((u) => u.literals.length)?.literals[0]; if (!b) throw new ImapError("The mail server did not return this email."); return b; }
  async append(folder: string, raw: Uint8Array) {
    const tag = `A${++this.n}`; await this.write(enc.encode(`${tag} APPEND ${quote(folder)} (\\Seen) {${raw.length}}\r\n`));
    const l = await this.line(); if (!l.startsWith("+")) throw new ImapError(l.slice(0, 200));
    await this.write(raw); await this.write(enc.encode("\r\n")); await this.finish(tag);
  }
  async quit() { try { await this.cmd("LOGOUT"); } catch { /* already closed */ } this.close(); }
  close() { try { this.c.close(); } catch { /* already closed */ } }
}
