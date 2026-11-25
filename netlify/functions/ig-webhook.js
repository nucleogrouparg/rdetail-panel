// Recibe los mensajes nuevos de Instagram (webhook de Meta) y los guarda en la planilla.
// Meta llama a esto directamente, sin el token de sesión del panel: se valida con la firma de la app.
const crypto = require("crypto");
const { settings, sheetRows, sheetApply, json } = require("./_lib");

const COLS = ["clients", "turnos", "ingresos", "gastos", "follow", "ig_conversations", "ig_messages", "ig_comments"];
const GRAPH = "https://graph.facebook.com/v21.0/";
const pad = (n) => (n < 10 ? "0" + n : "" + n);
function arDateTime(ms) {
  const ar = new Date((ms || Date.now()) - 3 * 3600000); // hora de Argentina
  return { date: ar.getUTCFullYear() + "-" + pad(ar.getUTCMonth() + 1) + "-" + pad(ar.getUTCDate()), time: pad(ar.getUTCHours()) + ":" + pad(ar.getUTCMinutes()) };
}

function validSignature(secret, body, header) {
  if (!secret) return true; // sin app secret configurado todavía: no se puede validar, se deja pasar
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(body || "", "utf8").digest("hex");
  const a = Buffer.from(String(header || "")), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.handler = async (event) => {
  const s = settings();
  if (!s) return json(503, { error: "not_configured" });

  if (event.httpMethod === "GET") {
    const q = event.queryStringParameters || {};
    if (q["hub.mode"] === "subscribe" && s.igVerifyToken && q["hub.verify_token"] === s.igVerifyToken) {
      return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: q["hub.challenge"] || "" };
    }
    return json(403, { error: "verify_failed" });
  }
  if (event.httpMethod !== "POST") return json(405, { error: "method" });
  if (!validSignature(s.igAppSecret, event.body, event.headers["x-hub-signature-256"] || event.headers["X-Hub-Signature-256"])) {
    return json(401, { error: "bad_signature" });
  }
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "bad_json" }); }

  try {
    const rows = await sheetRows(s);
    const byConv = {};
    rows.forEach((r, i) => { if (i > 0 && r[0] === "ig_conversations" && r[1]) { try { byConv[r[1]] = JSON.parse(r[2]); } catch (e) {} } });

    const ops = [];
    for (const entry of body.entry || []) {
      for (const m of entry.messaging || []) {
        if (!m.message || m.message.is_echo || !m.sender || !m.sender.id) continue; // ignora los que mandamos nosotros
        const psid = m.sender.id;
        const text = m.message.text || (m.message.attachments ? "[adjunto]" : "");
        const { date, time } = arDateTime(m.timestamp);
        const mid = m.message.mid || ("ig_" + psid + "_" + (m.timestamp || Date.now()));
        ops.push({ c: "ig_messages", id: mid, d: { convId: psid, dir: "in", text, date, time } });

        let conv = byConv[psid];
        let username = conv ? conv.username : psid;
        if (!conv && s.igToken) {
          try {
            const r = await fetch(GRAPH + psid + "?fields=username&access_token=" + encodeURIComponent(s.igToken));
            const j = await r.json();
            if (j && j.username) username = j.username;
          } catch (e) {}
        }
        conv = Object.assign({ id: psid, username }, conv, { lastText: text, lastDate: date, lastTime: time, unread: true });
        byConv[psid] = conv;
        ops.push({ c: "ig_conversations", id: psid, d: conv });
      }
      for (const ch of entry.changes || []) {
        if (!ch || ch.field !== "comments" || !ch.value || !ch.value.id) continue;
        const v = ch.value;
        if (v.from && s.igId && v.from.id === s.igId) continue; // es una respuesta nuestra, no un comentario nuevo
        const { date, time } = arDateTime(Date.now()); // Meta no manda timestamp propio en este evento
        ops.push({
          c: "ig_comments", id: v.id,
          d: { mediaId: v.media ? v.media.id : "", fromId: v.from ? v.from.id : "", username: v.from ? v.from.username : "alguien", text: v.text || "", date, time, replied: false }
        });
      }
    }
    if (ops.length) await sheetApply(s, COLS, ops, rows);
    return json(200, { ok: true });
  } catch (e) {
    // devolvemos 200 igual: si no, Meta reintenta en bucle el mismo webhook fallido
    return json(200, { ok: false, detail: String(e.message || e) });
  }
};
