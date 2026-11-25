// Guarda y devuelve todos los datos del panel en una planilla de Google (hoja "datos").
// Cada fila: colección | id | JSON del registro | última modificación
const { settings, verify, json, sheetApply } = require("./_lib");

const COLS = ["clients", "turnos", "ingresos", "gastos", "follow", "ig_conversations", "ig_messages"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method" });
  const s = settings();
  if (!s) return json(503, { error: "not_configured" });
  if (!verify(s, event.headers.authorization || event.headers.Authorization)) return json(401, { error: "auth" });
  let p;
  try { p = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "bad_json" }); }
  const ops = Array.isArray(p.ops) ? p.ops.slice(0, 500) : [];
  try {
    const { data } = await sheetApply(s, COLS, ops);
    return json(200, { ok: true, data });
  } catch (e) {
    return json(502, { error: "sheet_unavailable", detail: String(e.message || e) });
  }
};
