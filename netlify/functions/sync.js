// Guarda y devuelve todos los datos del panel en una planilla de Google (hoja "datos").
// Cada fila: colección | id | JSON del registro | última modificación
const { settings, verify, json, sheetApply, sheetRows, google } = require("./_lib");

const COLS = ["clients", "turnos", "ingresos", "gastos", "follow", "ig_conversations", "ig_messages", "ig_comments", "precios"];

function recordFrom(rows, col, id) {
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === col && r[1] === id) { try { return JSON.parse(r[2]); } catch (e) { return null; } }
  }
  return null;
}

// Crea en Google Calendar el turno recien cargado (por el bot o a mano en el
// panel), asi no quedan dos agendas sueltas. Solo para turnos GENUINAMENTE
// nuevos (su id no estaba antes en la hoja) que ademas no traigan ya un eid
// (esos vienen de "Traer turnos de la web", ya tienen su evento). Si falla
// -por ejemplo, todavia no se comparte el calendario en modo edicion con la
// cuenta de servicio- el turno se guarda igual, sin eid.
async function crearEventosDeCalendario(s, ops, rows) {
  if (!s.calendarId) return;
  const existia = {};
  for (let i = 1; i < rows.length; i++) { const r = rows[i]; if (r[0] && r[1]) existia[r[0] + "|" + r[1]] = true; }
  for (const op of ops) {
    if (!op || op.c !== "turnos" || !op.d || op.d.eid || existia["turnos|" + op.id]) continue;
    const t = op.d;
    const cli = recordFrom(rows, "clients", t.cid);
    const nombre = (cli && cli.name) || "Cliente";
    const [hh, mm] = String(t.time || "09:00").split(":");
    const hhFin = String((parseInt(hh, 10) + 1) % 24).padStart(2, "0");
    try {
      const ev = await google(s, "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(s.calendarId) + "/events", {
        method: "POST",
        body: JSON.stringify({
          summary: (t.estado === "pend" ? "SEÑA PENDIENTE: " : "") + nombre + " · " + (t.service || "Turno"),
          description: "Cliente: " + nombre + "\nServicio: " + (t.service || "") + "\nVehículo: " + (t.veh === "camioneta" ? "Camioneta" : "Auto") + (cli && cli.phone ? "\nTeléfono: " + cli.phone : ""),
          start: { dateTime: t.date + "T" + hh + ":" + mm + ":00", timeZone: "America/Argentina/Buenos_Aires" },
          end: { dateTime: t.date + "T" + hhFin + ":" + mm + ":00", timeZone: "America/Argentina/Buenos_Aires" },
        }),
      });
      if (ev && ev.id) t.eid = ev.id;
    } catch (e) { /* sin permiso de edicion todavia, u otro problema: no corta el guardado */ }
  }
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
    const rows = await sheetRows(s);
    await crearEventosDeCalendario(s, ops, rows);
    const { data } = await sheetApply(s, COLS, ops, rows);
    return json(200, { ok: true, data });
  } catch (e) {
    return json(502, { error: "sheet_unavailable", detail: String(e.message || e) });
  }
};
