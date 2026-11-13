// Guarda y devuelve todos los datos del panel en una planilla de Google (hoja "datos").
// Cada fila: colección | id | JSON del registro | última modificación
const { settings, google, verify, json } = require("./_lib");

const COLS = ["clients", "turnos", "ingresos", "gastos", "follow"];
const SHEET = "datos";
const API = "https://sheets.googleapis.com/v4/spreadsheets/";

async function readAll(s) {
  const r = await google(s, API + s.sheetId + "/values/" + SHEET + "!A:D?majorDimension=ROWS");
  return r.values || [];
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method" });
  const s = settings();
  if (!s) return json(503, { error: "not_configured" });
  if (!verify(s, event.headers.authorization || event.headers.Authorization)) return json(401, { error: "auth" });
  let p;
  try { p = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "bad_json" }); }
  const ops = Array.isArray(p.ops) ? p.ops.slice(0, 500) : [];
  try {
    let rows = await readAll(s);
    if (!rows.length) {
      await google(s, API + s.sheetId + "/values/" + SHEET + "!A1:D1?valueInputOption=RAW", { method: "PUT", body: JSON.stringify({ values: [["coleccion", "id", "datos", "modificado"]] }) });
      rows = [["coleccion", "id", "datos", "modificado"]];
    }
    const index = {};
    rows.forEach((r, i) => { if (i > 0 && r[0] && r[1]) index[r[0] + "|" + r[1]] = i + 1; }); // número de fila (1 = encabezado)
    const now = new Date().toISOString();
    const updates = [], appends = [];
    for (const op of ops) {
      if (!op || !COLS.includes(op.c) || typeof op.id !== "string" || !op.id || op.id.length > 60) continue;
      const key = op.c + "|" + op.id, row = index[key];
      if (op.d === null) {
        if (row) { updates.push({ range: SHEET + "!A" + row + ":D" + row, values: [["", "", "", ""]] }); delete index[key]; const i = row - 1; if (rows[i]) rows[i] = []; }
        continue;
      }
      const text = JSON.stringify(op.d);
      if (text.length > 20000) continue;
      const vals = [op.c, op.id, text, now];
      if (row) { updates.push({ range: SHEET + "!A" + row + ":D" + row, values: [vals] }); rows[row - 1] = vals; }
      else { appends.push(vals); rows.push(vals); index[key] = rows.length; }
    }
    if (updates.length) await google(s, API + s.sheetId + "/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: updates }) });
    if (appends.length) await google(s, API + s.sheetId + "/values/" + SHEET + "!A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", { method: "POST", body: JSON.stringify({ values: appends }) });
    const data = {};
    COLS.forEach((c) => (data[c] = []));
    rows.forEach((r, i) => {
      if (i === 0 || !r[0] || !r[1] || !data[r[0]]) return;
      try { data[r[0]].push(JSON.parse(r[2])); } catch (e) {}
    });
    return json(200, { ok: true, data });
  } catch (e) {
    return json(502, { error: "sheet_unavailable", detail: String(e.message || e) });
  }
};
