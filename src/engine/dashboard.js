// Ported from prototype/desk-v0.2.html — the KPI arithmetic inside renderDash(), separated from markup.
import { phase } from "./phase.js";
import { clientStats } from "./clientStats.js";
import { money, today } from "./dates.js";

export function dashboard(clients, entries, r, t = today()) {
  let duty = 0, p1 = 0, pr = 0, gone = 0, urg = 0, past = 0, est = 0, na = 0;
  entries.forEach(e => { const p = phase(e, r, t); if (p.na) { na++; return; } duty += p.duty; if (p.phase.startsWith("Phase 1")) p1 += p.duty; else if (p.phase.startsWith("Protest")) pr += p.duty; else if (p.phase.startsWith("Deadline")) gone += p.duty; if (p.days != null) { if (p.days < 0) past++; else if (p.days < r.urg) urg++; } if (p.est) est++; });
  const gross = (p1 * r.fee1 + pr * r.fee2) * r.real, net = gross * (1 - r.brok); const exposure = clients.reduce((a, c) => a + clientStats(c, entries, r, t).exposure, 0);
  const kpis = [["Clients", clients.length], ["Est. exposure", money(exposure)], ["IEEPA duty logged", money(duty)], ["Phase 1 — filable now", money(p1), "good"], ["Protest required", money(pr), pr ? "warn" : ""], ["Past deadline", money(gone), gone ? "bad" : ""], ["Urgent entries", urg, urg ? "warn" : ""], ["Past deadline (#)", past, past ? "bad" : ""], ["Estimated liq. dates", est, est ? "warn" : ""], ["Non-IEEPA lines excluded", na], ["Expected gross fee", money(gross)], ["Expected net fee", money(net), "good"]];
  const clocks = entries.map(e => ({ e, p: phase(e, r, t) })).filter(x => x.p.days != null && x.p.days >= 0 && !x.p.na).sort((a, b) => a.p.days - b.p.days).slice(0, 14);
  return { duty, p1, pr, gone, urg, past, est, na, gross, net, exposure, kpis, clocks };
}
