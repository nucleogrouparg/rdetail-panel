// Manda un mensaje directo de Instagram desde el panel.
const { settings, verify, json } = require("./_lib");

const GRAPH = "https://graph.facebook.com/v21.0/";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method" });
  const s = settings();
  if (!s) return json(503, { error: "not_configured" });
  if (!verify(s, event.headers.authorization || event.headers.Authorization)) return json(401, { error: "auth" });
  if (!s.igToken || !s.igId) return json(503, { error: "ig_not_configured" });
  let p;
  try { p = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "bad_json" }); }
  const psid = String(p.psid || "").trim(), text = String(p.text || "").trim().slice(0, 1000);
  if (!psid || !text) return json(400, { error: "missing_fields" });
  try {
    const body = new URLSearchParams({ recipient: JSON.stringify({ id: psid }), message: JSON.stringify({ text }), access_token: s.igToken });
    const r = await fetch(GRAPH + s.igId + "/messages", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
    const j = await r.json();
    if (!r.ok) return json(502, { error: "ig_send_failed", detail: j });
    return json(200, { ok: true, mid: j.message_id || "" });
  } catch (e) {
    return json(502, { error: "ig_send_error", detail: String(e.message || e) });
  }
};
