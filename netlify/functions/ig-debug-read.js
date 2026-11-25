// TEMPORAL: lee los últimos payloads crudos que llegaron al webhook de Instagram, para diagnosticar. Borrar cuando se resuelva.
const { settings, verify, sheetRows, json } = require("./_lib");

exports.handler = async (event) => {
  const s = settings();
  if (!s) return json(503, { error: "not_configured" });
  if (!verify(s, event.headers.authorization || event.headers.Authorization)) return json(401, { error: "auth" });
  const rows = await sheetRows(s);
  const out = [];
  rows.forEach((r, i) => { if (i > 0 && r[0] === "ig_debug") out.push({ id: r[1], d: r[2], at: r[3] }); });
  return json(200, { ok: true, rows: out.slice(-10) });
};
