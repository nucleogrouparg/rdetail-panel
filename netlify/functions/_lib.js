const crypto = require("crypto");

let cached = { token: null, exp: 0 };

function settings() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  const sheetId = process.env.SHEET_ID;
  const password = process.env.PANEL_PASSWORD;
  if (!raw || !sheetId || !password) return null;
  try {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(text);
    if (!sa.client_email || !sa.private_key) return null;
    return {
      sa, sheetId, password, calendarId: process.env.GOOGLE_CALENDAR_ID || "", calendarId2: process.env.GOOGLE_CALENDAR_ID_2 || "", secret: process.env.PANEL_SECRET || sa.private_key.slice(-200),
      igToken: process.env.IG_ACCESS_TOKEN || "", igId: process.env.IG_BUSINESS_ID || "", igAppSecret: process.env.IG_APP_SECRET || "", igVerifyToken: process.env.IG_VERIFY_TOKEN || ""
    };
  } catch (e) { return null; }
}

const b64u = (v) => Buffer.from(v).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (cached.token && cached.exp - 60 > now) return cached.token;
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // "calendar" (lectura/escritura) y no "calendar.readonly": sync.js crea el
  // evento del turno nuevo en Google Calendar ademas de guardarlo en la hoja.
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = crypto.createSign("RSA-SHA256").update(head + "." + body).sign(sa.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: head + "." + body + "." + b64u(sig) })
  });
  if (!res.ok) throw new Error("google_auth_" + res.status);
  const j = await res.json();
  cached = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return cached.token;
}

async function google(s, url, options) {
  const token = await accessToken(s.sa);
  const res = await fetch(url, { ...options, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error("google_" + res.status);
  if (res.status === 204) return {};
  return res.json();
}

// sesión: token firmado que dura 90 días
function sign(s) {
  const payload = b64u(JSON.stringify({ exp: Date.now() + 90 * 86400000 }));
  return payload + "." + b64u(crypto.createHmac("sha256", s.secret).update(payload).digest());
}
function verify(s, header) {
  const t = String(header || "").replace(/^Bearer\s+/i, "");
  const [p, sig] = t.split(".");
  if (!p || !sig) return false;
  const ok = b64u(crypto.createHmac("sha256", s.secret).update(p).digest());
  if (ok.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(ok), Buffer.from(sig))) return false;
  try { return JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()).exp > Date.now(); } catch (e) { return false; }
}
function samePassword(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
const json = (status, body) => ({ statusCode: status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });

// ---- planilla "datos": una fila por registro (coleccion | id | json | modificado)
const SHEET = "datos", SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets/";
async function sheetRows(s) {
  const r = await google(s, SHEETS_API + s.sheetId + "/values/" + SHEET + "!A:D?majorDimension=ROWS");
  return r.values || [];
}
// aplica una lista de ops {c,id,d} (d=null borra) sobre la planilla y devuelve los datos agrupados por colección
async function sheetApply(s, cols, ops, rows) {
  if (!rows) rows = await sheetRows(s);
  if (!rows.length) {
    await google(s, SHEETS_API + s.sheetId + "/values/" + SHEET + "!A1:D1?valueInputOption=RAW", { method: "PUT", body: JSON.stringify({ values: [["coleccion", "id", "datos", "modificado"]] }) });
    rows = [["coleccion", "id", "datos", "modificado"]];
  }
  const index = {};
  rows.forEach((r, i) => { if (i > 0 && r[0] && r[1]) index[r[0] + "|" + r[1]] = i + 1; }); // número de fila (1 = encabezado)
  const now = new Date().toISOString();
  const updates = [], appends = [];
  for (const op of ops) {
    if (!op || !cols.includes(op.c) || typeof op.id !== "string" || !op.id || op.id.length > 120) continue;
    const key = op.c + "|" + op.id, row = index[key];
    if (op.d === null) {
      if (row) { updates.push({ range: SHEET + "!A" + row + ":D" + row, values: [["", "", "", ""]] }); delete index[key]; rows[row - 1] = []; }
      continue;
    }
    const text = JSON.stringify(op.d);
    if (text.length > 20000) continue;
    const vals = [op.c, op.id, text, now];
    if (row) { updates.push({ range: SHEET + "!A" + row + ":D" + row, values: [vals] }); rows[row - 1] = vals; }
    else { appends.push(vals); rows.push(vals); index[key] = rows.length; }
  }
  if (updates.length) await google(s, SHEETS_API + s.sheetId + "/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: updates }) });
  if (appends.length) await google(s, SHEETS_API + s.sheetId + "/values/" + SHEET + "!A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", { method: "POST", body: JSON.stringify({ values: appends }) });
  const data = {};
  cols.forEach((c) => (data[c] = []));
  rows.forEach((r, i) => {
    if (i === 0 || !r[0] || !r[1] || !data[r[0]]) return;
    try { data[r[0]].push(JSON.parse(r[2])); } catch (e) {}
  });
  return { data, rows };
}

module.exports = { settings, google, sign, verify, samePassword, json, sheetRows, sheetApply };
