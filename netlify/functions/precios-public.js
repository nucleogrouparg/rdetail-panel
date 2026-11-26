// Lista de precios pública (sin login): la usa la web de RDETAIL y, más adelante, el bot.
const { settings, sheetRows } = require("./_lib");

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=120" };

function precioFinal(v) { return Math.round((v.price || 0) * (1 - (v.disc || 0) / 100)); }

exports.handler = async () => {
  const s = settings();
  if (!s) return { statusCode: 503, headers, body: JSON.stringify({ error: "not_configured" }) };
  try {
    const rows = await sheetRows(s);
    const items = [];
    rows.forEach((r, i) => {
      if (i === 0 || r[0] !== "precios" || !r[1]) return;
      let p; try { p = JSON.parse(r[2]); } catch (e) { return; }
      items.push({
        id: p.id, order: p.order || 0, name: p.name, tag: p.tag || "", consultar: !!p.consultar,
        auto: p.consultar ? null : { precio: precioFinal(p.auto || {}), precioLista: (p.auto || {}).price || 0, descuento: (p.auto || {}).disc || 0 },
        camioneta: p.consultar ? null : { precio: precioFinal(p.camioneta || {}), precioLista: (p.camioneta || {}).price || 0, descuento: (p.camioneta || {}).disc || 0 }
      });
    });
    items.sort((a, b) => a.order - b.order);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, servicios: items }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "sheet_unavailable", detail: String(e.message || e) }) };
  }
};
