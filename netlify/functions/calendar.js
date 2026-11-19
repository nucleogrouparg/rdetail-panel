// Lee los turnos reservados en la web (Google Calendar "Turnos RDETAIL") para cargarlos en el panel.
const { settings, google, verify, json } = require("./_lib");

const pad = (n) => (n < 10 ? "0" + n : "" + n);
// Servicio probable a partir del título escrito a mano en Google Calendar
const SV = [[/preventa/i, "Preventa"], [/interior.*motor|motor.*interior/i, "Promo interior, motor y lavado"], [/interior/i, "Promo interior y lavado"], [/premium/i, "Lavado premium"], [/abrillant|puli/i, "Abrillantado"], [/motor/i, "Lavado de motor"], [/cer[aá]mic/i, "Tratamiento cerámico"], [/acr[ií]lic/i, "Tratamiento acrílico"], [/polariz/i, "Polarizado"], [/sacabollo/i, "Sacabollos"], [/plan/i, "Plan mensual"]];
const guessService = (t) => { for (const [re, n] of SV) if (re.test(t)) return n; return "Otro"; };
const cleanName = (t) => (t || "").replace(/\$\s?[\d.,]+/g, "").replace(/\b(restan?|resta|se[nñ]a|abona|abonó|pag[oó])\b.*$/i, "").replace(/\s+/g, " ").trim().slice(0, 60);
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
    const from = new Date(Date.now() - 45 * 86400000).toISOString(), to = new Date(Date.now() + 90 * 86400000).toISOString();
    const calendarIds = [s.calendarId, s.calendarId2].filter(Boolean);
    const lists = await Promise.all(calendarIds.map((id) => {
      const url = "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(id) + "/events?singleEvents=true&orderBy=startTime&maxResults=1000&timeMin=" + encodeURIComponent(from) + "&timeMax=" + encodeURIComponent(to);
      return google(s, url);
    }));
    const events = [];
    lists.forEach((r) => {
      (r.items || []).forEach((e) => {
        if (e.status === "cancelled" || !e.start || !(e.start.dateTime || e.start.date)) return;
        const d = e.description || "", sum = e.summary || "", name = field(d, "Cliente"), service = field(d, "Servicio");
        const nowAr = new Date(Date.now() - 3 * 3600000), todayAr = nowAr.getUTCFullYear() + "-" + pad(nowAr.getUTCMonth() + 1) + "-" + pad(nowAr.getUTCDate());
        let date, time;
        if (e.start.dateTime) {
          const ar = new Date(new Date(e.start.dateTime).getTime() - 3 * 3600000); // hora de Argentina
          date = ar.getUTCFullYear() + "-" + pad(ar.getUTCMonth() + 1) + "-" + pad(ar.getUTCDate()); time = pad(ar.getUTCHours()) + ":" + pad(ar.getUTCMinutes());
        } else { date = e.start.date; time = "09:00"; } // evento de todo el día
        if (name && service) { // reserva de la web
          events.push({ eid: e.id, date, time, name, service, veh: /camioneta/i.test(field(d, "Vehículo")) ? "camioneta" : "auto", phone: field(d, "Teléfono"), email: field(d, "Mail"), estado: /^SEÑA PENDIENTE/i.test(sum) ? "pend" : "conf" });
          return;
        }
        // turno cargado a mano en Google Calendar
        const title = sum.trim(); if (!title) return;
        const ph = (/(\+?\d[\d\s().-]{7,}\d)/.exec(d) || [])[1] || "";
        events.push({ eid: e.id, manual: true, allDay: !e.start.dateTime, title, date, time, name: cleanName(title) || "Sin nombre", service: guessService(title + " " + d), veh: /camioneta|hilux|amarok|ranger|s10|frontier|duster|kangoo|partner|berlingo/i.test(title) ? "camioneta" : "auto", phone: ph.trim(), email: "", estado: /^SEÑA PENDIENTE/i.test(title) ? "pend" : (date < todayAr ? "hecho" : "conf") });
      });
    });
    events.sort((a, b) => (a.date + a.time) < (b.date + b.time) ? -1 : 1);
    return json(200, { ok: true, enabled: true, events, from: from.slice(0, 10) });
  } catch (e) {
    return json(502, { error: "calendar_unavailable", detail: String(e.message || e) });
  }
};
