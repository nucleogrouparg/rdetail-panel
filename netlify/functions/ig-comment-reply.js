// Responde (público, visible para todos) un comentario de Instagram.
const { settings, verify, json } = require("./_lib");

const GRAPH = "https://graph.facebook.com/v21.0/";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method" });
  const s = settings();
  if (!s) return json(503, { error: "not_configured" });
  if (!verify(s, event.headers.authorization || event.headers.Authorization)) return json(401, { error: "auth" });
  if (!s.igToken) return json(503, { error: "ig_not_configured" });
  let p;
  try { p = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "bad_json" }); }
  const commentId = String(p.commentId || "").trim(), message = String(p.message || "").trim().slice(0, 1000);
  if (!commentId || !message) return json(400, { error: "missing_fields" });
  try {
    const body = new URLSearchParams({ message, access_token: s.igToken });
    const r = await fetch(GRAPH + commentId + "/replies", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
    const j = await r.json();
    if (!r.ok) return json(502, { error: "reply_failed", detail: j });
    return json(200, { ok: true, id: j.id || "" });
  } catch (e) {
    return json(502, { error: "reply_error", detail: String(e.message || e) });
  }
};
