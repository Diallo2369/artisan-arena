// Compare les règles de la page /artisan/ (src/lib/fiche.js, en JavaScript) à celles de scripts/prepare_data.py (Python)
// sur toutes les entreprises RGE : procédures collectives et comptes doivent donner le même verdict.
// Usage : node scripts/check_live.mjs  (après npm run data:prepare, avec data/raw/bodacc.json et ratios.json)
import fs from "node:fs";
import { bodaccEvents, procStatus, comptes, OPEN } from "../src/lib/fiche.js";

const site = JSON.parse(fs.readFileSync("data/build/site.json", "utf-8"));
const today = new Date(site.meta.built + "T12:00:00");
const group = (rows, key) => { const g = {}; for (const r of rows) for (const s of key(r)) (g[s] ||= []).push(r); return g; };
const bod = group(JSON.parse(fs.readFileSync("data/raw/bodacc.json", "utf-8")), (a) => new Set((a.registre || []).map((x) => String(x).replace(/\D/g, ""))));
const rat = group(JSON.parse(fs.readFileSync("data/raw/ratios.json", "utf-8")), (r) => [r.siren]);
let n = 0, bad = [];
for (const e of Object.values(site.ent)) {
  n++;
  const ev = bodaccEvents(bod[e.id] || [], e.id);
  const [st, d] = procStatus(ev, today);
  const k = !st ? "ok" : st in OPEN ? "bad" : "warn";
  const [cs, kc] = comptes(rat[e.id] || [], today);
  const diffs = [];
  if (st !== e.proc || d !== e.proc_d || k !== e.k_proc) diffs.push(`procédure ${e.proc}/${e.proc_d} ≠ ${st}/${d}`);
  if (Math.min(ev.length, 25) !== e.bod.length || ev.slice(-25).some((b, i) => b.k !== e.bod[i].k || b.d !== e.bod[i].d)) diffs.push(`jugements ${e.bod.length} ≠ ${ev.length}`);
  if (kc !== e.k_cpt || JSON.stringify(cs) !== JSON.stringify(e.cpt)) diffs.push(`comptes ${e.k_cpt} ≠ ${kc}`);
  if (diffs.length) bad.push(`${e.id} ${e.nom} : ${diffs.join(" ; ")}`);
}
console.log(`${n} entreprises comparées, ${bad.length} différence(s).`);
bad.slice(0, 15).forEach((x) => console.log("  " + x));
process.exit(bad.length ? 1 : 0);
