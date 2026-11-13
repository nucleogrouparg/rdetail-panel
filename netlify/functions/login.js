const { settings, sign, samePassword, json } = require("./_lib");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method" });
  const s = settings();
  if (!s) return json(503, { error: "not_configured" });
  let p;
  try { p = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "bad_json" }); }
  if (!samePassword(p.password || "", s.password)) {
    await new Promise((r) => setTimeout(r, 700)); // frena los intentos al azar
    return json(401, { error: "bad_password" });
  }
  return json(200, { ok: true, token: sign(s) });
};
