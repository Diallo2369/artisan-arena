// Vérifie le découpage des recherches (src/lib/parse.js) sur des phrases types. Usage : node scripts/test_parse.mjs
import fs from "node:fs";
import { parse, indexLieux } from "../src/lib/parse.js";

const I = indexLieux(JSON.parse(fs.readFileSync("public/data/lieux.json", "utf-8")));
const show = (p) => p.siren ? `SIREN ${p.siren}` : [p.metier && `métier=${p.metier.k}`, p.commune && `commune=${p.commune.nom} (${p.commune.code})`, p.cp && `cp=${p.cp}`, p.dep && `dep=${p.dep.code} ${p.dep.nom}`, p.name && `nom=« ${p.name} »`].filter(Boolean).join(" · ");
const CASES = [
  ["plombier aurillac", "métier=plomberie · commune=Aurillac (15014)"],
  ["Martin couvreur Saint-Flour", "métier=couverture · commune=Saint-Flour (15187) · nom=« martin »"],
  ["électricien 15", "métier=electricite · dep=15 Cantal"],
  ["couvreur st flour", "métier=couverture · commune=Saint-Flour (15187)"],
  ["Dumas plomberie", "métier=plomberie · nom=« dumas »"],
  ["pompe à chaleur Clermont-Ferrand", "métier=chauffage · commune=Clermont-Ferrand (63113)"],
  ["maçon Puy-de-Dôme", "métier=maconnerie · dep=63 Puy-de-Dôme"],
  ["un plombier près de Arpajon sur Cère", "métier=plomberie · commune=Arpajon-sur-Cère (15012)"],
  ["peintre 15000", "métier=peinture · cp=15000"],
  ["carreleur Le Puy-en-Velay", "métier=carrelage · commune=Le Puy-en-Velay (43157)"],
  ["menuisier Saint-Martin-Valmeroux", "métier=menuiserie · commune=Saint-Martin-Valmeroux (15202)"],
  ["plombier Lavergne", "métier=plomberie · commune=Lavergne (47144)"],
  ["Aurillac", "commune=Aurillac (15014)"],
  ["Lavergne 47", "commune=Lavergne (47144)"],
  ["Bernard", "nom=« bernard »"],
  ["853 456 789", "SIREN 853456789"],
  ["85345678900012", "SIREN 853456789"],
  ["JC Couverture Aurillac", "métier=couverture · commune=Aurillac (15014) · nom=« jc »"],
  ["chauffagiste Paris", "métier=chauffage · commune=Paris (75056)"],
  ["couvreur Murat Cantal", "métier=couverture · commune=Murat (15138)"],
  ["plombier Cantal", "métier=plomberie · dep=15 Cantal"],
  ["Lavergne", "nom=« lavergne »"],
];
let bad = 0;
for (const [q, want] of CASES) { const got = show(parse(q, I)); const ok = got === want; if (!ok) bad++; console.log(`${ok ? "ok " : "NON"} ${q.padEnd(38)} → ${got}${ok ? "" : `   (attendu : ${want})`}`); }
console.log(bad ? `${bad} cas différents` : "Tous les cas sont bons.");
process.exit(bad ? 1 : 0);
