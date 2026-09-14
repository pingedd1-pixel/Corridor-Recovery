// Ported verbatim from prototype/desk-v0.2.html (helpers used by the engine).
// NOTE: fmt() uses toISOString(), i.e. UTC. Local midnight in America/Vancouver
// formats to the same calendar day, so the process must run with TZ=America/Vancouver
// (server.js and the test runner enforce this) to match the prototype exactly.
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const D = s => { if (!s) return null; const t = String(s).trim(); let d = new Date(t.length == 10 ? t + "T00:00:00" : t); if (isNaN(d)) { const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (m) { d = new Date(+(m[3].length == 2 ? "20" + m[3] : m[3]), +m[1] - 1, +m[2]); } } return isNaN(d) ? null : d; };
export const fmt = d => d ? d.toISOString().slice(0, 10) : "";
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const money = n => n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
export const db = (a, b) => Math.round((a - b) / 86400000);
export const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
