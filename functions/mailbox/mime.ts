// Builds the raw email for a reply or new message: plain text, HTML, attachments and the headers that keep a conversation together.
const enc = new TextEncoder();
export const b64Bytes = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 32766) s += String.fromCharCode(...b.subarray(i, i + 32766)); return btoa(s); };
const b64 = (s: string) => b64Bytes(enc.encode(s));
const clean = (s: string) => s.replace(/[\r\n\0]+/g, " ").trim();
const wrap = (s: string) => s.replace(/.{1,76}/g, "$&\r\n");
// deno-lint-ignore no-control-regex
const ascii = (s: string) => /^[\x20-\x7e]*$/.test(s);
export function word(s: string) {
  if (ascii(s)) return s;
  const parts: string[] = []; let cur = "";
  for (const ch of s) { if (enc.encode(cur + ch).length > 42) { parts.push(cur); cur = ""; } cur += ch; }
  if (cur) parts.push(cur);
  return parts.map((p) => `=?UTF-8?B?${b64(p)}?=`).join("\r\n ");
}
export type Addr = { name?: string; email: string };
export const addr = (a: Addr) => { const n = clean(a.name ?? "").replace(/[<>]/g, ""); return n ? `${ascii(n) ? `"${n.replace(/(["\\])/g, "\\$1")}"` : word(n)} <${a.email}>` : `<${a.email}>`; };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const toHtml = (t: string) => `<div dir="auto" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1c2636;white-space:pre-wrap">${esc(t)}</div>`;
export type Att = { name: string; type: string; bytes: Uint8Array };
export function build(m: { from: Addr; to: Addr[]; cc: Addr[]; subject: string; text: string; messageId: string; inReplyTo?: string; refs: string[]; attachments: Att[] }) {
  const id = crypto.randomUUID().replace(/-/g, ""), alt = `alt_${id}`, mix = `mix_${id}`;
  const part = (type: string, body: string) => `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64(body))}`;
  const bodyPart = `Content-Type: multipart/alternative; boundary="${alt}"\r\n\r\n--${alt}\r\n${part("text/plain", m.text)}--${alt}\r\n${part("text/html", toHtml(m.text))}--${alt}--\r\n`;
  const head = [`From: ${addr(m.from)}`, `To: ${m.to.map(addr).join(", ")}`, ...(m.cc.length ? [`Cc: ${m.cc.map(addr).join(", ")}`] : []), `Subject: ${word(clean(m.subject))}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`, `Message-ID: ${m.messageId}`, ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`] : []), ...(m.refs.length ? [`References: ${m.refs.slice(-20).join(" ")}`] : []), "MIME-Version: 1.0"].join("\r\n");
  if (!m.attachments.length) return `${head}\r\n${bodyPart}`;
  const atts = m.attachments.map((a) => `--${mix}\r\nContent-Type: ${clean(a.type) || "application/octet-stream"}\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(clean(a.name))}\r\n\r\n${wrap(b64Bytes(a.bytes))}`).join("");
  return `${head}\r\nContent-Type: multipart/mixed; boundary="${mix}"\r\n\r\n--${mix}\r\n${bodyPart}${atts}--${mix}--\r\n`;
}
