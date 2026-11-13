// Lee los turnos reservados en la web (Google Calendar "Turnos RDETAIL") para cargarlos en el panel.
const { settings, google, verify, json } = require("./_lib");

const pad = (n) => (n < 10 ? "0" + n : "" + n);
function field(desc, label) {
  const m = new RegExp("^" + label + ":\\s*(.*)$", "mi").exec(desc || "");
  return m ? m[1].trim() : "";
}

exports.handler = async (event) => {
  const s = settings();
  if (!s) return json(503, { error: "not_configured" });
  if (!verify(s, event.headers.authorization || event.headers.Authorization)) return json(401, { error: "auth" });
  if (!s.calendarId) return json(200, { ok: true, enabled: false, events: [] });
  try {
    const from = new Date(Date.now() - 2 * 86400000).toISOString(), to = new Date(Date.now() + 90 * 86400000).toISOString();
    const url = "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(s.calendarId) + "/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=" + encodeURIComponent(from) + "&timeMax=" + encodeURIComponent(to);
    const r = await google(s, url);
    const events = [];
    (r.items || []).forEach((e) => {
      if (e.status === "cancelled" || !e.start || !e.start.dateTime) return;
      const d = e.description || "";
      let name = field(d, "Cliente"), service = field(d, "Servicio");
      if (!name || !service) { name = "Turno manual"; service = (e.summary || "Sin título").trim(); } // cargado a mano en el calendario, sin los campos de la web
      const t = new Date(e.start.dateTime);
      const ar = new Date(t.getTime() - 3 * 3600000); // hora de Argentina
      events.push({
        eid: e.id,
        date: ar.getUTCFullYear() + "-" + pad(ar.getUTCMonth() + 1) + "-" + pad(ar.getUTCDate()),
        time: pad(ar.getUTCHours()) + ":" + pad(ar.getUTCMinutes()),
        name, service, veh: /camioneta/i.test(field(d, "Vehículo")) ? "camioneta" : "auto",
        phone: field(d, "Teléfono"), email: field(d, "Mail"),
        estado: /^SEÑA PENDIENTE/i.test(e.summary || "") ? "pend" : "conf"
      });
    });
    return json(200, { ok: true, enabled: true, events, from: from.slice(0, 10) });
  } catch (e) {
    return json(502, { error: "calendar_unavailable", detail: String(e.message || e) });
  }
};
