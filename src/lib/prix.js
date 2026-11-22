// Articles « Prix des matériaux » : un article par mois, construit à partir de l'instantané figé
// data/prix/AAAA-MM.json (scripts/prix_snapshots.py). Les textes sont écrits par des règles fixes à partir des chiffres.
import fs from "node:fs";
import path from "node:path";
import CFG from "./prix.json" with { type: "json" };
import { esc, monthFr, dateFr } from "./fmt.js";

const DIR = path.join(process.cwd(), "data/prix");
const INSEE = "https://www.insee.fr/fr/statistiques/serie/";
const nb = (s) => s.replace(/[   ]/g, " ");
const num = (v, d = 1) => nb(v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const slugify = (s) => s.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const MATERIAUX = CFG.familles.flatMap((f) => f.series.map((s) => ({ ...s, famille: f.slug })));
const BY_ID = Object.fromEntries([...MATERIAUX, ...CFG.metiers].map((s) => [s.id, s]));
const BT50 = "001710982";

export const prixUrl = (mois) => (mois ? `/prix-des-materiaux/${slugify(monthFr(mois))}/` : "/prix-des-materiaux/");

// ---------- lecture et calculs ----------
let cache;
export function snapshots() {
  if (cache) return cache;
  cache = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf-8"))) : [];
  return cache;
}
const shift = (mois, k) => { let [y, m] = mois.split("-").map(Number); m += k; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, "0")}`; };
const pos = (snap, mois) => { const [y0, m0] = snap.debut.split("-").map(Number), [y, m] = mois.split("-").map(Number); return (y - y0) * 12 + (m - m0); };
const at = (snap, id, mois) => { const v = snap.s[id]?.v; const i = pos(snap, mois); return v && i >= 0 && i < v.length ? v[i] : null; };
const ratio = (a, b) => (a != null && b != null && b ? (a / b - 1) * 100 : null);

export function stats(snap, id) {
  const M = snap.mois, v = at(snap, id, M);
  const y21 = Array.from({ length: 12 }, (_, k) => at(snap, id, `2021-${String(k + 1).padStart(2, "0")}`));
  const avg21 = y21.every((x) => x != null) ? y21.reduce((a, b) => a + b, 0) / 12 : null;
  const spark = Array.from({ length: 25 }, (_, k) => at(snap, id, shift(M, k - 24)));
  const i0 = (snap.s[id]?.v || []).findIndex((x) => x != null), first = i0 >= 0 ? shift(snap.debut, i0) : null;
  return { id, v, first, f0: ratio(v, first ? at(snap, id, first) : null), m1: ratio(v, at(snap, id, shift(M, -1))), y1: ratio(v, at(snap, id, shift(M, -12))), s21: ratio(v, avg21), m6: ratio(v, at(snap, id, shift(M, -6))), v6: at(snap, id, shift(M, -6)), spark, prov: snap.s[id]?.p };
}

// « +2,1 % », « −0,4 % » ; au-delà de 10 %, arrondi à l'unité
const pv = (x) => { if (x == null) return "—"; const r = Math.abs(x) >= 10 ? Math.round(x) : Math.round(x * 10) / 10; const s = Math.abs(x) >= 10 ? num(Math.abs(r), 0) : num(Math.abs(r)); return (r > 0 ? "+" : r < 0 ? "−" : "") + s + " %"; };
const cls = (x) => (x == null ? "" : x >= 0.05 ? "up" : x <= -0.05 ? "down" : "");
const cell = (x) => `<td class="r ${cls(x)}">${pv(x)}</td>`;
// Colonne « 1 mois » : flèche de tendance par rapport au mois précédent ; en dessous de 0,5 %, flèche horizontale (stable)
const TREND = { up: "en hausse", down: "en baisse", flat: "stable" };
const trend = (x) => (x == null ? null : x >= 0.5 ? "up" : x <= -0.5 ? "down" : "flat");
const cellMois = (x) => { const t = trend(x); return t ? `<td class="r ${t === "flat" ? "" : t}"><i class="tr ${t}" title="${TREND[t]} sur un mois" aria-hidden="true"></i>${pv(x)}</td>` : cell(x); };
const evol = (x) => (x == null ? "n'est pas encore comparable" : Math.abs(x) < 0.05 ? "est stable" : `${x > 0 ? "augmente" : "baisse"} de ${pv(Math.abs(x)).replace("+", "")}`);

function spark(vals) {
  const pts = vals.map((v, i) => [i, v]).filter((p) => p[1] != null);
  if (pts.length < 2) return "";
  const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1])), W = 96, H = 26;
  const xy = pts.map(([i, v]) => [(i / 24) * W, hi === lo ? H / 2 : H - 2 - ((v - lo) / (hi - lo)) * (H - 4)]);
  const [lx, ly] = xy[xy.length - 1];
  return `<svg class="spark" width="${W}" height="${H}" viewBox="-2 0 ${W + 4} ${H}" aria-hidden="true"><polyline points="${xy.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")}"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6"/></svg>`;
}

// ---------- article d'un mois : chiffres et textes ----------
export function article(snap) {
  const M = snap.mois;
  const mats = MATERIAUX.map((s) => ({ ...s, ...stats(snap, s.id) })).filter((s) => s.v != null);
  const mets = CFG.metiers.map((s) => ({ ...s, ...stats(snap, s.id) })).filter((s) => s.v != null);
  const yr = mats.filter((s) => s.y1 != null).sort((a, b) => b.y1 - a.y1);
  const up = yr.filter((s) => s.y1 >= 0.5), down = yr.filter((s) => s.y1 <= -0.5).reverse();
  const reno = stats(snap, BT50);
  // titre : le matériau qui a le plus bougé dans le mois (change d'un mois à l'autre) ; à défaut, le plus fort mouvement sur un an
  const base = `Prix des matériaux en ${monthFr(M)} : `;
  const mo = mats.filter((s) => s.m1 != null).sort((x, y) => Math.abs(y.m1) - Math.abs(x.m1))[0];
  const yl = [...yr].sort((x, y) => Math.abs(y.y1) - Math.abs(x.y1))[0];
  let hook = mo && Math.abs(mo.m1) >= 1 ? `${mo.nom} ${pv(mo.m1)} en un mois` : yl && Math.abs(yl.y1) >= 1 ? `${yl.nom} ${pv(yl.y1)} sur un an` : "des prix stables";
  if (mo && yl && mo.id !== yl.id && Math.abs(mo.m1) >= 1 && (base + hook + `, ${yl.nom} ${pv(yl.y1)} sur un an`).length <= 80) hook += `, ${yl.nom} ${pv(yl.y1)} sur un an`;
  const title = base + hook;
  const st = yr.length - up.length - down.length;
  const lede = `En ${monthFr(M)}, le coût des travaux de rénovation (index BT50 de l'INSEE) ${evol(reno.y1)} sur un an${reno.s21 != null ? ` ; il a pris ${pv(reno.s21).replace("+", "")} depuis 2021` : ""}. Sur les ${yr.length} matériaux suivis, ${up.length} ${up.length > 1 ? "sont plus chers" : "est plus cher"} qu'il y a un an, ${down.length} moins ${down.length > 1 ? "chers" : "cher"} et ${st} quasi ${st > 1 ? "stables" : "stable"}.`;
  const movers = mats.filter((s) => s.m1 != null && Math.abs(s.m1) >= 2).sort((x, y) => Math.abs(y.m1) - Math.abs(x.m1));
  const s21 = mats.filter((s) => s.s21 != null).sort((x, y) => y.s21 - x.s21);
  const list = (l) => l.map((s) => `${s.label.toLowerCase()} (${pv(s.y1)})`).join(", ");
  const key = [
    up.length ? `<b>Plus fortes hausses sur un an</b> : ${list(up.slice(0, 3))}.` : "<b>Aucun matériau suivi</b> n'est nettement plus cher qu'il y a un an.",
    down.length ? `<b>Plus fortes baisses sur un an</b> : ${list(down.slice(0, 3))}.` : "<b>Aucun matériau suivi</b> n'est moins cher qu'il y a un an.",
    movers.length ? `<b>Sur un mois</b> : ${movers.slice(0, 3).map((s) => `${s.label.toLowerCase()} (${pv(s.m1)})`).join(", ")}.` : "<b>Sur un mois</b>, aucun matériau n'a varié de plus de 2 %.",
    s21.length ? `<b>Depuis 2021</b> : ${s21[0].label.toLowerCase()} (${pv(s21[0].s21)}), la plus forte hausse des matériaux suivis.` : "",
  ].filter(Boolean);
  return { mois: M, title, hook, lede, key, mats, mets, reno, fige: snap.fige, prov: [...mats, ...mets].some((s) => s.prov) };
}

const table = (rows, { code = false } = {}) => `<div class="tw"><table class="px">
  <thead><tr><th scope="col">${code ? "Métier" : "Matériau"}</th><th scope="col" class="r">Indice</th><th scope="col" class="r">1 mois</th><th scope="col" class="r">1 an</th><th scope="col" class="r">Depuis 2021</th><th scope="col" class="c">24 mois</th></tr></thead>
  <tbody>${rows.map((s) => `<tr><th scope="row"><a href="${INSEE}${s.id}" target="_blank" rel="noopener">${esc(s.label)}</a>${code ? ` <small>${s.code}</small>` : s.note ? `<small>${esc(s.note)}</small>` : ""}</th><td class="r">${num(s.v)}</td>${cellMois(s.m1)}${cell(s.y1)}${cell(s.s21)}<td class="c">${spark(s.spark)}</td></tr>`).join("")}</tbody>
</table></div>`;

export function renderArticle(snap, { prev, next }) {
  const A = article(snap), M = A.mois;
  const ex = A.reno.v6 ? Math.round((10000 * A.reno.v) / A.reno.v6 / 10) * 10 : null;
  const TOC = [["essentiel", "L'essentiel"], ...CFG.familles.map((f) => [f.slug, f.label]), ["metiers", "Le coût des travaux par métier"], ["devis", "Ce que ça change pour votre devis"], ["sources", "Sources et méthode"]];
  return `<section class="band"><div class="wrap">
  <p class="crumb"><a href="/">Accueil</a><span>›</span><a href="${prixUrl()}">Prix des matériaux</a></p>
  <h1>${esc(A.title)}</h1>
  <p class="lede">${A.lede}</p>
  <p class="meta-l">Chiffres de l'INSEE pour ${monthFr(M)}, arrêtés le ${dateFr(A.fige)}${A.prov ? ". Les derniers mois sont provisoires et peuvent être révisés" : ""}.</p>
</div></section>
<section class="block"><div class="wrap doc">
  <aside><nav class="toc" aria-label="Sur cette page"><b>Sur cette page</b>${TOC.map((t) => `<a href="#${t[0]}">${t[1]}</a>`).join("")}</nav></aside>
  <article class="doc-main">
    <section id="essentiel"><h2>L'essentiel</h2><ul class="key">${A.key.map((k) => `<li>${k}</li>`).join("")}</ul></section>
    ${CFG.familles.map((f) => `<section id="${f.slug}"><h2>${f.label}</h2>${table(A.mats.filter((s) => s.famille === f.slug))}</section>`).join("")}
    <p class="src">Prix de production de l'industrie française pour le marché français, hors TVA, base 100 en 2021. Ce sont les prix de sortie d'usine : le prix en magasin ou sur un devis suit la même tendance, avec un décalage et la marge du distributeur.</p>
    <section id="metiers"><h2>Le coût des travaux par métier</h2>
      <p>Les index du bâtiment (BT) mesurent le coût d'un chantier pour l'entreprise : matériaux, salaires, matériel, transport et énergie. Ce sont eux qu'utilisent les clauses de révision de prix.</p>
      ${table(A.mets, { code: true })}
      <p class="src">Index bâtiment de l'INSEE, base 100 en 2010, publiés au Journal officiel.</p></section>
    <section id="devis"><h2>Ce que ça change pour votre devis</h2>
      <ul>
        <li><b>Un devis signé engage l'artisan sur son prix.</b> Le prix ne peut bouger que si le devis prévoit une clause de révision. Elle s'appuie alors le plus souvent sur l'index BT du métier concerné : vérifiez lequel, et sa valeur de départ.</li>
        ${ex ? `<li><b>Exemple</b> : avec une clause qui applique entièrement l'index BT50, un devis de 10 000 € signé en ${monthFr(shift(M, -6))} passerait à ${nb(ex.toLocaleString("fr-FR"))} € en ${monthFr(M)}. Beaucoup de clauses n'appliquent l'index qu'à une partie du prix : l'écart réel est alors plus faible.</li>` : ""}
        <li><b>Un devis non signé</b> n'engage que pendant sa durée de validité. Au-delà, l'artisan peut le réactualiser : comparez la hausse demandée avec l'évolution de l'index de son métier sur la même période.</li>
        <li><b>Avant de verser un acompte</b>, vérifiez l'entreprise : qualification RGE, procédures collectives, ancienneté. <a href="/verifier-un-artisan/">Les vérifications à faire</a>.</li>
      </ul></section>
    <section id="sources"><h2>Sources et méthode</h2>
      <p>Toutes les séries viennent de la banque de données macro-économiques de l'INSEE ; chaque ligne des tableaux renvoie vers sa série. « Depuis 2021 » compare à la moyenne de l'année 2021. Les chiffres de cet article sont figés au ${dateFr(A.fige)} : l'INSEE peut les réviser ensuite, l'article suivant intègre alors les nouvelles valeurs.</p>
      <p>Il n'existe pas de série publique pour certains produits, comme le parquet, la laine de verre ou les pompes à chaleur : pour ces travaux, regardez l'index du métier (plâtrerie, chauffage central).</p></section>
    <nav class="art-nav" aria-label="Autres mois">${prev ? `<a href="${prixUrl(prev)}" rel="prev">‹ ${cap(monthFr(prev))}</a>` : "<span></span>"}<a href="${prixUrl()}">Tous les mois</a>${next ? `<a href="${prixUrl(next)}" rel="next">${cap(monthFr(next))} ›</a>` : "<span></span>"}</nav>
  </article>
</div></section>`;
}

export function renderPrixHub() {
  const all = snapshots(), last = all[all.length - 1], A = article(last);
  const fig = (lab, s, x) => `<div class="kf"><span class="kf-v ${cls(x)}">${pv(x)}</span><span class="kf-l">${lab}</span></div>`;
  const up = A.mats.filter((s) => s.y1 != null).sort((a, b) => b.y1 - a.y1);
  const years = [...new Set(all.map((s) => s.mois.slice(0, 4)))].reverse();
  return `<section class="band"><div class="wrap">
  <p class="crumb"><a href="/">Accueil</a></p>
  <h1>Prix des matériaux de construction</h1>
  <p class="lede">Chaque mois, l'évolution du prix du bois, de la peinture, du ciment, du cuivre et des autres matériaux, et du coût des travaux par métier. D'après les indices officiels de l'INSEE.</p>
</div></section>
<section class="block"><div class="wrap">
  <article class="card latest">
    <p class="kick">Dernier mois publié : ${monthFr(A.mois)}</p>
    <h2><a href="${prixUrl(A.mois)}">${esc(A.title)}</a></h2>
    <div class="kfs">${fig("Coût des travaux de rénovation sur un an", A.reno, A.reno.y1)}${up[0] ? fig(`${cap(up[0].label)} sur un an`, up[0], up[0].y1) : ""}${up.length > 1 ? fig(`${cap(up[up.length - 1].label)} sur un an`, up[up.length - 1], up[up.length - 1].y1) : ""}</div>
    <p><a class="btn" href="${prixUrl(A.mois)}">Lire l'article de ${monthFr(A.mois)}</a></p>
  </article>
</div></section>
<section class="block"><div class="wrap">
  <h2>Tous les mois</h2>
  ${years.map((y) => `<h3 class="yr">${y}</h3><ul class="arts">${all.filter((s) => s.mois.startsWith(y)).reverse().map((s) => { const a = article(s); return `<li><a href="${prixUrl(s.mois)}">${cap(monthFr(s.mois))}</a><span>${esc(cap(a.hook))}</span></li>`; }).join("")}</ul>`).join("")}
</div></section>
<section class="block"><div class="wrap narrow">
  <h2>Comment lire ces chiffres</h2>
  <p>Ce sont des indices, pas des prix en euros : ils mesurent de combien un prix a évolué. Les matériaux sont suivis au prix de sortie d'usine, hors TVA (base 100 en 2021). Les index du bâtiment (BT) mesurent le coût complet d'un chantier par métier, main-d'œuvre comprise (base 100 en 2010). L'INSEE publie chaque mois avec environ deux mois de décalage.</p>
</div></section>`;
}

// Encadré des pages travaux : évolution de l'index du métier, avec un lien vers l'article du mois
export function travauxCost(slug) {
  const id = CFG.travaux[slug], all = snapshots();
  if (!id || !all.length) return "";
  const snap = all[all.length - 1], s = stats(snap, id), m = BY_ID[id];
  if (s.v == null) return "";
  const parts = [s.y1 != null ? `${pv(s.y1)} sur un an` : null, s.s21 != null ? `${pv(s.s21)} depuis 2021` : null, s.y1 == null && s.first && s.first !== snap.mois ? `${pv(s.f0)} depuis sa création en ${monthFr(s.first)}` : null].filter(Boolean);
  return `<section class="block"><div class="wrap"><div class="card cost">
  <h2>Le coût de ces travaux</h2>
  <p>Index ${m.code} de l'INSEE (${m.label.toLowerCase()}), en ${monthFr(snap.mois)} : <b>${parts.join(", ")}</b>. Il mesure le coût d'un chantier pour l'entreprise, matériaux et main-d'œuvre compris.</p>
  <p><a href="${prixUrl(snap.mois)}">Prix des matériaux en ${monthFr(snap.mois)}</a></p>
</div></div></section>`;
}
