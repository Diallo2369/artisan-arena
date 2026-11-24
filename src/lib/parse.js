// Découpe ce que tape le visiteur en métier, lieu et nom : « Martin couvreur Saint-Flour » → nom « martin »,
// métier couverture, commune Saint-Flour. Fonctions pures, utilisées dans le navigateur (src/scripts/search.js)
// et testables avec Node (scripts/test_parse.mjs).
import { METIERS } from "./metiers.js";

export const norm = (s) => String(s || "").toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// mots sans valeur pour la recherche (« un plombier à Aurillac », « artisan près de Brest »)
const STOP = new Set(["a", "au", "aux", "de", "du", "des", "d", "l", "le", "la", "les", "en", "sur", "pres", "autour", "dans", "un", "une",
  "pour", "et", "artisan", "artisans", "entreprise", "entreprises", "chez", "vers", "proche", "proximite", "cherche", "trouver", "bon", "ville", "commune"]);
// « st flour » → « saint flour »
const ABBR = { st: "saint", ste: "sainte", sts: "saints", stes: "saintes" };

const PHRASES = new Map(); // « pompe a chaleur » → métier
for (const m of METIERS) for (const w of m.mots) PHRASES.set(norm(w), m);
const MAXW = Math.max(...[...PHRASES.keys()].map((p) => p.split(" ").length));

export const depOf = (code) => (code.startsWith("97") ? code.slice(0, 3) : code.slice(0, 2));

// Index des lieux, à partir de public/data/lieux.json (scripts/communes.mjs)
export function indexLieux(L) {
  const byName = new Map(), byCp = new Map(), byCode = new Map(), deps = new Map(), depNames = new Map();
  for (const [nom, code, pop, cps] of L.c) {
    const c = { nom, code, pop, cps: cps ? cps.split(" ") : [], dep: depOf(code) };
    byCode.set(code, c);
    const k = norm(nom);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(c);
    for (const cp of c.cps) { if (!byCp.has(cp)) byCp.set(cp, []); byCp.get(cp).push(c); }
  }
  for (const [code, nom] of L.d) { deps.set(code.toLowerCase(), { code, nom }); depNames.set(norm(nom), { code, nom }); }
  return { byName, byCp, byCode, deps, depNames };
}

// q : texte tapé ; I : indexLieux(). Renvoie les éléments reconnus, chacun avec les positions des mots qu'il occupe
// (pour pouvoir le retirer de la recherche).
// opt.lieu : un mot seul qui est aussi une commune (« Lavergne ») est un lieu ; sans cette option, c'est un nom.
// opt.nom : mots imposés comme nom d'entreprise (« Murat » cherché comme nom, et non comme commune).
export function parse(q, I, opt = {}) {
  const raw = String(q || "").trim();
  const digits = raw.replace(/[\s.]/g, "");
  if (/^\d{9}(\d{5})?$/.test(digits)) return { siren: digits.slice(0, 9), tokens: [digits] };
  const tokens = norm(raw).split(" ").filter(Boolean).map((t) => ABBR[t] || t);
  const out = { tokens, name: [], metier: null, commune: null, cp: null, dep: null, used: {} };
  let communeCands = null;
  for (let i = 0; i < tokens.length;) {
    const t = tokens[i];
    // métier, en plusieurs mots si besoin (« pompe à chaleur »)
    let hit = null;
    for (let n = Math.min(MAXW, tokens.length - i); n >= 1 && !hit; n--) { const m = PHRASES.get(tokens.slice(i, i + n).join(" ")); if (m) hit = [m, n]; }
    if (hit && !out.metier) { out.metier = hit[0]; out.used.metier = range(i, hit[1]); i += hit[1]; continue; }
    // code postal, numéro de département
    if (/^\d{5}$/.test(t) && I.byCp.has(t) && !out.cp && !out.commune) { out.cp = t; out.used.lieu = [i]; i++; continue; }
    if (/^(\d{2}|2a|2b|97\d)$/.test(t) && I.deps.has(t) && !out.dep) { out.dep = I.deps.get(t); out.used.dep = [i]; i++; continue; }
    // commune ou département en toutes lettres, le plus long possible (« Arpajon-sur-Cère », « Puy-de-Dôme »)
    let place = null;
    if (!out.commune && !out.cp) for (let n = Math.min(6, tokens.length - i); n >= 1 && !place; n--) {
      const k = tokens.slice(i, i + n).join(" ");
      if (n === 1 && (k.length < 3 || STOP.has(k))) continue;
      const cs = I.byName.get(k), d = !out.dep && I.depNames.get(k);
      if (cs) place = ["commune", cs, n]; // « Paris » : la commune plutôt que le département
      else if (d) place = ["dep", d, n];
    }
    if (place) {
      if (place[0] === "dep") { out.dep = place[1]; out.used.dep = range(i, place[2]); }
      else { communeCands = place[1]; out.used.lieu = range(i, place[2]); }
      i += place[2]; continue;
    }
    if (!STOP.has(t)) out.name.push(t);
    i++;
  }
  if (communeCands) {
    // homonymes : celui du département tapé, sinon le plus peuplé
    const inDep = out.dep ? communeCands.filter((c) => c.dep === out.dep.code) : [];
    out.commune = (inDep.length ? inDep : communeCands).slice().sort((a, b) => b.pop - a.pop)[0];
    if (inDep.length) { out.used.lieu = [...out.used.lieu, ...(out.used.dep || [])]; out.dep = null; delete out.used.dep; }
  }
  // un mot seul, sans métier : plus probablement un nom de famille qu'une commune (« Lavergne »), sauf une ville (10 000 habitants et plus)
  if (out.commune && !opt.lieu && !out.metier && !out.name.length && !out.dep && out.used.lieu.length === 1 && out.commune.pop < 10000) {
    out.name.push(tokens[out.used.lieu[0]]); out.altLieu = out.commune; out.commune = null; delete out.used.lieu;
  }
  if (out.commune && out.used.lieu.length === 1 && !opt.lieu) out.altNom = tokens[out.used.lieu[0]];
  if (opt.nom) out.name.push(...norm(opt.nom).split(" ").filter(Boolean));
  if (out.cp) { const cs = I.byCp.get(out.cp); out.cpCommune = cs.slice().sort((a, b) => b.pop - a.pop)[0]; }
  out.name = out.name.join(" ");
  return out;
}
const range = (i, n) => Array.from({ length: n }, (_, k) => i + k);

// La recherche sans un élément reconnu (étiquette retirée par le visiteur)
export const without = (p, key) => p.tokens.filter((_, i) => !(p.used[key] || []).includes(i)).join(" ");
