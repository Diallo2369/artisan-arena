// Fiche d'un artisan : les quatre vérifications et la page, en fonctions pures qui renvoient du HTML.
// Les données sont lues en direct dans le navigateur (src/scripts/fiche-page.js) auprès des services publics.
// Ce fichier ne dépend que de fmt.js et des fichiers JSON.
import { esc, eur, pct, plural, dateFr, year } from "./fmt.js";
import REF from "./referentiels.json" with { type: "json" };

export const MARK = { ok: "", warn: "!", bad: "!", na: "–" };
export const ic = (k) => `<i class="ic ${k}" aria-hidden="true">${MARK[k]}</i>`;
const ORG = { qualibat: "Qualibat", qualitenr: "Qualit'EnR", opqibi: "OPQIBI", cnoa: "Ordre des architectes", qualifelec: "Qualifelec", cerqual: "Cerqual Qualitel Certification", afnor: "AFNOR Certification", certibat: "Certibat", opqtecc: "OPQTECC", lne: "LNE" };
const org = (o) => ORG[o] || o;
export const noEnd = (d) => !d || d >= "2090";
const BODACC = "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:";
const ANNUAIRE = "https://annuaire-entreprises.data.gouv.fr/entreprise/";

// ---------- les quatre vérifications ----------
export const PROC = {
  sauv: "Procédure de sauvegarde en cours", rj: "Redressement judiciaire en cours", lj: "Liquidation judiciaire",
  cession: "Plan de cession", rp: "Rétablissement professionnel en cours", plan: "Plan de redressement ou de sauvegarde en cours", clos: "Procédure clôturée",
  ancien: "Ancienne procédure", appel: "Décision infirmée en appel",
};
export const PROC_SHORT = { sauv: "Sauvegarde en cours", rj: "Redressement en cours", lj: "Liquidation judiciaire", cession: "Plan de cession", rp: "Rétablissement en cours", plan: "Plan en cours", clos: "Procédure passée", ancien: "Procédure passée", appel: "Décision en appel" };
const EV_KIND = { sauv: "bad", rj: "bad", lj: "bad", cession: "bad", rp: "bad", plan: "warn", clos: "ok", retract: "ok", appel: "warn", autre: "na" };

// type du dernier jugement significatif (hors dépôts de créances et autres avis)
const lastKind = (e) => [...e.bod].reverse().find((b) => b.k !== "autre")?.k;

export function checks(e) {
  const out = [];
  // procédures
  out.push({ k: e.k_proc, lab: "Procédures collectives", val: e.proc ? PROC[e.proc] : "Aucune publiée",
    sub: e.proc ? `${e.proc === "clos" ? "Clôturée le" : e.proc === "ancien" ? (lastKind(e) === "plan" ? "Plan arrêté il y a plus de 10 ans, le" : "Sans suite publiée depuis le jugement du") : "Dernier jugement le"} ${dateFr(e.proc_d)}, d'après le BODACC.` : "Ni sauvegarde, ni redressement, ni liquidation au BODACC depuis 2008." });
  // entreprise
  const si = e.si;
  if (!si) out.push({ k: "na", lab: "Entreprise", val: "Introuvable dans Sirene", sub: "Vérifiez le numéro SIREN avec l'entreprise." });
  else if (si.etat === "C") out.push({ k: "bad", lab: "Entreprise", val: "Cessée", sub: `Fermée au répertoire Sirene${si.cess ? ` depuis le ${dateFr(si.cess)}` : ""}${e.rge === false ? "." : ", alors qu'elle figure encore sur la liste RGE."}` });
  else {
    const y = si.cree ? new Date().getFullYear() - +si.cree.slice(0, 4) : null;
    out.push({ k: e.k_ent, lab: "Entreprise", val: si.cree ? `Créée en ${year(si.cree)}` : "Active",
      sub: `${e.k_ent === "warn" ? "Moins de 2 ans d'existence. " : y ? `Active depuis ${y < 1 ? "moins d'un an" : y + " " + plural(y, "an")}. ` : "Active. "}${si.cjl ? esc(si.cjl) + (si.eff ? ", " + si.eff : "") + "." : ""}` });
  }
  // comptes
  const c = e.cpt[0];
  if (!c) out.push({ k: "na", lab: "Comptes", val: "Non publiés", sub: si && si.pp ? "Un entrepreneur individuel ne publie pas de comptes." : "Aucun compte annuel diffusé par l'INPI." });
  else if (e.k_cpt === "na") out.push({ k: "na", lab: "Comptes", val: `Derniers en ${year(c.d)}`, sub: "Pas de comptes publiés depuis plus de 2 ans et demi." });
  else {
    const rn = c.rn, af = c.af;
    const val = rn != null && rn < 0 ? "Résultat négatif" : af != null && af < 0 ? "Capitaux propres négatifs" : rn != null ? "Résultat positif" : "Comptes publiés";
    const bits = [];
    if (rn != null) bits.push(`${rn >= 0 ? "Bénéfice" : "Perte"} de ${eur(Math.abs(rn))}`);
    if (c.ca) bits.push(`chiffre d'affaires ${eur(c.ca)}`);
    out.push({ k: e.k_cpt, lab: "Comptes", val, sub: `${bits.join(", ") || "Montants confidentiels"} (exercice clos le ${dateFr(c.d)}).${af != null && af < 0 ? " Capitaux propres négatifs." : ""}` });
  }
  // RGE (seulement utile pour les aides à la rénovation énergétique)
  {
    const h = e.rgeHist;
    if (e.rgeAnnuaire) out.push({ k: "ok", lab: "Qualification RGE", val: "RGE", sub: "Qualifiée RGE d'après l'annuaire des entreprises. Vérifiez que la qualification couvre vos travaux." });
    else if (e.rgeUnknown) out.push({ k: "na", lab: "Qualification RGE", val: "Vérification indisponible", sub: "La liste RGE n'a pas pu être consultée. Réessayez dans un instant." });
    else if (h && h.fin) out.push({ k: "na", lab: "Qualification RGE", val: "Plus RGE",
      sub: `Qualifiée RGE ${h.debut && year(h.debut) !== year(h.fin) ? `de ${year(h.debut)} à ${year(h.fin)}` : `en ${year(h.fin)}`}${h.org ? ` (${org(h.org)})` : ""}. Dernière qualification expirée le ${dateFr(h.fin)}, non renouvelée : pas d'aide publique avec cette entreprise.` });
    else out.push({ k: "na", lab: "Qualification RGE", val: "Non RGE", sub: "Jamais qualifiée RGE depuis 2014 d'après l'ADEME : pas d'aide publique à la rénovation énergétique avec cette entreprise." });
  }
  return out;
}

export function summary(e, cs) {
  const bad = cs.filter((c) => c.k === "bad"), warn = cs.filter((c) => c.k === "warn");
  if (bad.length) return `<b>Alerte :</b> ${bad.map((c) => c.val[0].toLowerCase() + c.val.slice(1)).join(", ")}. Ne versez pas d'acompte sans avoir obtenu d'explications écrites.`;
  if (warn.length) return `<b>${warn.length === 1 ? "Un point" : warn.length + " points"} à vérifier :</b> ${warn.map((c) => c.lab[0].toLowerCase() + c.lab.slice(1) + " (" + c.val[0].toLowerCase() + c.val.slice(1) + ")").join(", ")}. Le reste ne montre rien d'anormal dans les données publiques.`;
  return "<b>Rien d'anormal dans les données publiques :</b> aucune procédure collective, entreprise active" + (e.k_cpt === "ok" ? ", derniers comptes positifs" : "") + (e.rge === false ? "." : ", qualification RGE valide.");
}

export const checkTiles = (cs) => `<div class="checks">${cs.map((c, i) => `<div class="chk ${c.k}" style="--i:${i}"><span class="lab">${ic(c.k)}${c.lab}</span><span class="val">${c.val}</span><span class="sub">${c.sub}</span></div>`).join("")}</div>`;

const BEFORE = [
  ["Même nom, même SIRET que sur le devis", "un faux artisan emprunte souvent l'identité d'une vraie entreprise."],
  ["L'attestation d'assurance décennale", "obligatoire, avec le nom de l'assureur sur le devis."],
  ["Un acompte raisonnable", "et aucun paiement pendant 7 jours après un démarchage à domicile."],
  ["Une qualification RGE qui couvre vos travaux", "seulement si vous comptez sur une aide publique à la rénovation énergétique."],
];
export const beforeList = () => `<ol class="todo">${BEFORE.map(([b, s]) => `<li><b>${b}</b><span>${s}</span></li>`).join("")}</ol>`;

const monthsSince = (iso, today = new Date()) => (iso ? monthsBetween(isoDate(iso), today) : null);
export const ageTxt = (m) => (m == null ? "" : m < 1 ? "moins d'un mois" : m < 24 ? `${m} mois` : `${Math.floor(m / 12)} ans`);

export function renderFiche({ e, devis = "", autres = "" }) {
  const cs = checks(e);
  const si = e.si || {};
  const age = monthsSince(si.cree);
  const est = e.est[0] || {};
  const acc = (t, hint, body, id, open = false) => `<details class="acc-i" id="${id}"${open ? " open" : ""}><summary><b>${t}</b><span>${hint}</span></summary><div class="in">${body}</div></details>`;

  const proc = e.bod.length ? `<ol class="tl">${e.bod.slice().reverse().map((b) => `<li class="${EV_KIND[b.k]}"><time datetime="${b.d}">${dateFr(b.d)}</time><p>${esc(b.n)}</p><small>${esc(b.tr)}${b.id ? ` · <a href="${BODACC}${encodeURIComponent(b.id)}" target="_blank" rel="noopener nofollow">voir l'annonce au BODACC</a>` : ""}</small></li>`).join("")}</ol>
    <p class="tx">${e.k_proc === "bad" ? "Pendant une procédure, l'entreprise peut continuer à travailler sous le contrôle du tribunal. Mais si elle disparaît, un acompte versé devient une créance à déclarer au mandataire, avec peu de chances d'être remboursée." : e.proc === "appel" ? "La cour d'appel a infirmé un jugement de la procédure. Demandez à l'entreprise où en est sa situation aujourd'hui." : e.proc === "ancien" && lastKind(e) === "plan" ? "Le plan a été arrêté il y a plus de 10 ans, la durée maximale d'un plan : il est probablement terminé. Demandez à l'entreprise s'il a été exécuté jusqu'au bout." : e.proc === "ancien" ? "Aucun jugement n'a été publié depuis plusieurs années : la procédure a pu se terminer sans publication retrouvée, ou concerner une activité antérieure du même entrepreneur. Demandez des explications à l'entreprise." : e.proc === "plan" ? "Un plan arrêté par le tribunal permet à l'entreprise de continuer son activité en remboursant ses dettes sur plusieurs années. Demandez où en est son exécution." : "La procédure est terminée. Demandez à l'entreprise comment elle en est sortie."}</p>`
    : `<p class="tx">Aucun jugement de procédure collective (sauvegarde, redressement ou liquidation judiciaire) n'a été publié au BODACC pour ce numéro SIREN depuis 2008.</p>`;

  const comptesHtml = e.cpt.length ? `<div class="tw"><table class="num"><thead><tr><th>Exercice clos le</th><th class="r">Chiffre d'affaires</th><th class="r">Résultat net</th><th class="r">Autonomie financière</th></tr></thead><tbody>
    ${e.cpt.map((c) => `<tr><td>${dateFr(c.d)}</td><td class="r">${c.ca ? eur(c.ca) : "–"}</td><td class="r${c.rn < 0 ? " neg" : ""}">${c.rn != null ? eur(c.rn) : "–"}</td><td class="r${c.af < 0 ? " neg" : ""}">${c.af != null ? pct(c.af) : "–"}</td></tr>`).join("")}</tbody></table></div>
    <p class="src">L'autonomie financière est la part des capitaux propres dans le bilan : négative, elle signifie que les dettes dépassent ce que possède l'entreprise. « – » : montant non publié ou confidentiel. Source : INPI.</p>`
    : `<p class="tx">${si.pp ? "C'est une entreprise individuelle : elle n'a pas à publier de comptes." : "Aucun compte annuel n'est diffusé pour cette entreprise : elle a pu demander la confidentialité, comme la loi le permet aux petites entreprises, ou ne pas les avoir déposés."} Vous pouvez lui demander son dernier bilan.</p>`;

  const entreprise = `<dl class="kv">
    <div><dt>Numéro SIREN</dt><dd class="num">${e.id.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")}</dd></div>
    ${est.siret ? `<div><dt>SIRET du siège</dt><dd class="num">${est.siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, "$1 $2 $3 $4")}</dd></div>` : ""}
    ${si.cjl ? `<div><dt>Forme juridique</dt><dd>${esc(si.cjl)}</dd></div>` : ""}
    ${si.cree ? `<div><dt>Date de création</dt><dd>${dateFr(si.cree)}</dd></div>` : ""}
    <div><dt>État</dt><dd>${si.etat === "C" ? `Cessée${si.cess ? " le " + dateFr(si.cess) : ""}` : "Active"}</dd></div>
    ${si.eff ? `<div><dt>Effectif${si.effy ? ` (${si.effy})` : ""}</dt><dd>${si.eff}</dd></div>` : ""}
    ${si.naf ? `<div><dt>Activité déclarée</dt><dd>${esc(si.nafl || si.naf)} (${esc(si.naf)})</dd></div>` : ""}
  </dl><p class="tx"><a href="${ANNUAIRE}${e.id}" target="_blank" rel="noopener">Dirigeants, établissements et documents sur l'Annuaire des entreprises (site officiel)</a></p>`;

  const rgeHtml = `${e.rgeHist?.fin ? `<p class="tx">Dernière qualification : ${esc(e.rgeHist.qual.replace(/[_"]/g, "").replace(/\s+/g, " "))}, ${e.rgeHist.org ? org(e.rgeHist.org) + ", " : ""}du ${dateFr(e.rgeHist.deb2)} au ${dateFr(e.rgeHist.fin)}. Si l'artisan se dit RGE, demandez-lui son certificat en cours de validité.</p>` : ""}<p class="tx">La qualification RGE n'est utile que pour des travaux de rénovation énergétique financés par MaPrimeRénov', l'éco-prêt à taux zéro ou les primes CEE. Pour d'autres travaux, elle n'est pas nécessaire.</p>`;

  // ancienneté, en très gros ; entreprise fermée, en rouge
  const ageBlock = si.etat === "C"
    ? `<div class="fh-age bad"><span>Entreprise</span><b>fermée</b><span>${si.cess ? "depuis le " + dateFr(si.cess) : "au répertoire Sirene"}</span></div>`
    : age != null ? `<div class="fh-age"><span>Créée il y a</span><b>${ageTxt(age)}</b><span>le ${dateFr(si.cree)}</span></div>` : "";
  const bad = cs.filter((c) => c.k === "bad");
  const notice = bad.length ? `<div class="fh-note bad"><b>Alerte.</b> ${summary(e, cs).replace(/^<b>Alerte :<\/b> /, "")}</div>`
    : age != null && age < 24 && si.etat !== "C" ? `<div class="fh-note"><b>Entreprise récente.</b> Elle a peu d'historique : peu de chantiers derrière elle${si.pp ? "" : ", et peu ou pas de comptes publiés"}. Demandez des références de chantiers récents.</div>`
    : `<p class="fh-verdict">${summary(e, cs)}</p>`;

  // coordonnées : absentes des registres publics, on renvoie vers une recherche web et PagesJaunes (sauf entreprise non diffusible)
  const ville = e.ville || "", ext = 'target="_blank" rel="noopener nofollow"';
  const contact = si.etat !== "C" && !e.nom.startsWith("Entrepreneur individuel")
    ? `<div class="fh-contact"><p>Téléphone et e-mail ne figurent pas dans les registres publics.</p><div><a class="btn" href="https://www.google.com/search?${new URLSearchParams({ q: `${e.nom} ${ville}` })}" ${ext}>Trouver ses coordonnées</a><a class="btn ghost" href="https://www.pagesjaunes.fr/annuaire/chercherlespros?${new URLSearchParams({ quoiqui: e.nom, ou: ville })}" ${ext}>Voir sur PagesJaunes</a></div></div>` : "";

  return `<section class="fh"><div class="wrap">
  <div class="fh-card">
    <div class="fh-id">
      ${si.nafl ? `<p class="fh-k">${esc(si.nafl)}</p>` : ""}
      <h1>${esc(e.nom)}</h1>
      <p class="fh-adr">${esc([est.adr, est.cp].filter(Boolean).join(", "))}</p>
      <p class="fh-sub">SIREN ${e.id.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")}${si.cjl ? ` · ${esc(si.cjl)}` : ""}${si.eff ? ` · ${esc(si.eff)}` : ""}</p>
      ${contact}
    </div>
    ${ageBlock}
  </div>
  ${notice}
  <div class="checks">${cs.map((c, i) => `<div class="chk ${c.k}" style="--i:${i}"><span class="lab">${ic(c.k)}${c.lab}</span><span class="val">${c.val}</span><span class="sub">${c.sub}</span></div>`).join("")}</div>
</div></section>
<section class="block"><div class="wrap">
  <div class="acc">
    ${acc("Les procédures collectives", e.bod.length ? `${e.bod.length} ${plural(e.bod.length, "jugement")} au BODACC` : "aucune publiée", proc, "procedures", e.k_proc !== "ok")}
    ${acc("L'entreprise", si.etat === "C" ? "cessée" : si.cree ? "créée en " + year(si.cree) : "active", entreprise, "entreprise")}
    ${acc("Les comptes", e.cpt.length ? `${e.cpt.length} ${plural(e.cpt.length, "exercice")} publié${e.cpt.length > 1 ? "s" : ""}` : "non publiés", comptesHtml, "comptes", e.k_cpt === "warn")}
    ${acc("La qualification RGE", e.rgeAnnuaire ? "RGE" : e.rgeHist?.fin ? `plus RGE depuis ${year(e.rgeHist.fin)}` : "non RGE", rgeHtml, "rge")}
  </div>
  ${autres}
  <div class="before"><h2>Avant de signer le devis</h2>${beforeList()}<p><a href="/avant-de-signer/">Les bons réflexes en détail</a></p></div>
  ${devis}
  <p class="src">Données lues en direct le ${dateFr(e.live)} auprès de l'Annuaire des entreprises, du BODACC, de l'INPI et de l'ADEME, reprises sans modification.</p>
</div></section>`;
}

// ---------- fiche construite dans le navigateur, à partir des services publics ----------
export const API = {
  annuaire: "https://recherche-entreprises.api.gouv.fr/search",
  near: "https://recherche-entreprises.api.gouv.fr/near_point",
  bodaccExport: "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/exports/json",
  historique: "https://data.ademe.fr/data-fair/api/v1/datasets/historique-rge/lines",
  bodacc: "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records",
  ratios: "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/ratios_inpi_bce/records",
};
const SMALL = new Set(REF.petits_mots), WORDS3 = new Set(REF.mots_courts), KEEP = new Set(REF.sigles);
const slug = (x) => String(x || "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const plain = (x) => slug(x).replace(/-/g, " ");
const monthsBetween = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
const isoDate = (x) => new Date(x + "T12:00:00");

// Nom écrit en majuscules remis en forme (même règle que nice() en Python)
export function nice(x, acronyms = true) {
  const t = String(x || "").trim().replace(/\s+/g, " ");
  if (!t || t !== t.toUpperCase()) return t;
  let first = true;
  const out = t.split(/(\s+|-|'|’|\/|\(|\)|&|\.|,|")/).map((w) => {
    if (!w || /^(\s+|-|'|’|\/|\(|\)|&|\.|,|")$/.test(w)) return w;
    const low = w.toLowerCase();
    let r;
    if (KEEP.has(w) || (acronyms && /^[A-Z]{2,3}$/.test(w) && !WORDS3.has(low) && !SMALL.has(low)) || !/[AEIOUYÉÈ]/.test(w)) r = w;
    else if (/^\d+$/.test(w) || /^\d+[A-Z]*$/.test(w)) r = w.length < 4 || /^\d+$/.test(w) ? w : w.toLowerCase();
    else if (!first && SMALL.has(low)) r = low === "a" ? REF.accents[low] || low : low;
    else { const a = REF.accents[low] || low; r = a.charAt(0).toUpperCase() + a.slice(1); }
    first = false;
    return r;
  }).join("").replace(/(?<![\p{L}\p{N}_])([LD])'(?=[\p{L}\p{N}_])/gu, (m, c) => c.toLowerCase() + "'"); // \b et \w de Python, lettres accentuées comprises
  return out.charAt(0).toUpperCase() + out.slice(1);
}
// Adresse (même règle que nice_addr() en Python) : types de voie en minuscules, ZA, ZAC et ZI en capitales
const VOIES = new Set(REF.voies);
export function niceAddr(x) {
  let a = nice(x, false);
  a = a.replace(/(?<![\p{L}\p{N}_])([A-Za-zÀ-ÿ-]+)(?![\p{L}\p{N}_])/gu, (m, w) => (VOIES.has(w.toLowerCase()) ? w.toLowerCase() : w));
  a = a.replace(/(?<![\p{L}\p{N}_])(z\.?a\.?c?|z\.?i\.?)(?![\p{L}\p{N}_])/giu, (m, w) => w.toUpperCase());
  return /^\p{L}/u.test(a) && !/^[a-z]+(?![\p{L}\p{N}_])/u.test(a) ? a.charAt(0).toUpperCase() + a.slice(1) : a;
}
const cjLabel = (c) => { c = String(c || ""); return REF.formes_juridiques[c] || REF.formes_juridiques_2[c.slice(0, 2)] || ""; };

// Jugements du BODACC
const MOIS = Object.fromEntries(["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"].map((m, i) => [m, i + 1]));
function jdate(x, fallback) {
  const m = String(x || "").toLowerCase().match(/(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/);
  if (m && MOIS[m[2]]) { const d = new Date(Date.UTC(+m[3], MOIS[m[2]] - 1, +m[1])); if (d.getUTCDate() === +m[1]) return d.toISOString().slice(0, 10); }
  return fallback;
}
function fix(x) { if (!x.includes("Ã")) return x; try { return decodeURIComponent(escape(x)); } catch { return x; } }
export function classify(nature, famille) {
  const t = plain(nature), f = plain(famille);
  if (f.startsWith("avis de depot")) return "autre";
  if (t.includes("retractation")) return "retract";
  if (f.includes("cour d appel")) return t.includes("infirmant") ? "appel" : "autre";
  if (t.includes("cloture") || t.includes("mettant fin")) return "clos";
  if (t.includes("resolution du plan") || t.includes("conversion")) return t.includes("liquidation") ? "lj" : t.includes("redressement") ? "rj" : "autre";
  if (t.includes("plan de cession")) return "cession";
  if (t.includes("plan")) return "plan";
  if (t.includes("ouverture") || t.includes("extension")) for (const [k, w] of [["sauv", "sauvegarde"], ["rj", "redressement"], ["lj", "liquidation"], ["rp", "retablissement"]]) if (t.includes(w)) return k;
  return "autre";
}
export const OPEN = { sauv: 24, rj: 24, rp: 24, lj: 36, cession: 36 };
export function procStatus(events, today) {
  let state = null, since = null;
  for (const e of events) {
    const k = e.k;
    if (k in OPEN) [state, since] = [k, e.d];
    else if (k === "plan") [state, since] = ["plan", e.d];
    else if (k === "clos" && state) [state, since] = ["clos", e.d];
    else if (k === "retract") [state, since] = [null, null];
    else if (k === "appel" && state) [state, since] = ["appel", e.d];
  }
  if (state && since) {
    const age = monthsBetween(isoDate(since), today);
    if ((state in OPEN && age > OPEN[state]) || (state === "plan" && age > 120)) state = "ancien";
  }
  return [state, since];
}
export function bodaccEvents(records, siren) {
  const seen = new Set(), out = [];
  for (const a of records) {
    let j = {};
    try { j = JSON.parse(a.jugement || "{}") || {}; } catch { j = {}; }
    if ((a.typeavis_lib || "").startsWith("Avis d")) continue; // avis d'annulation
    const nature = fix((j.nature || "").trim()), famille = fix((j.famille || "").trim());
    if (!nature && !famille) continue;
    const regs = new Set((a.registre || []).map((x) => String(x).replace(/\D/g, "")));
    if (!regs.has(siren)) continue;
    const d = jdate(j.date, a.dateparution || ""), key = d + "|" + plain(nature);
    if (seen.has(key)) continue; // avis rectificatifs et doublons
    seen.add(key);
    out.push({ d, p: a.dateparution || "", n: nature || famille, k: classify(nature, famille), tr: nice(a.tribunal || ""), id: a.id || "" });
  }
  return out.sort((x, y) => (x.d + x.p < y.d + y.p ? -1 : x.d + x.p > y.d + y.p ? 1 : 0));
}
// Comptes : un exercice peut apparaître en comptes sociaux et consolidés ; les montants masqués valent 0 dans la source
export function comptes(rows, today) {
  const byd = {};
  for (const r of rows) {
    if (!r.date_cloture_exercice) continue;
    const d = r.date_cloture_exercice.slice(0, 10);
    if (!byd[d] || (r.type_bilan === "C" && byd[d].type_bilan !== "C")) byd[d] = r;
  }
  const cs = Object.keys(byd).sort().reverse().slice(0, 5).map((d) => {
    const r = byd[d], conf = r.confidentiality || "", masked = conf !== "Public", ca = r.chiffre_d_affaires, rn = r.resultat_net;
    return { d, ca: ca && !masked ? ca : null, rn: masked && !rn ? null : rn ?? null, af: r.autonomie_financiere ?? null, conf };
  });
  const last = cs[0];
  const k = !last ? "na" : monthsBetween(isoDate(last.d), today) > 30 ? "na" : (last.rn != null && last.rn < 0) || (last.af != null && last.af < 0) ? "warn" : "ok";
  return [cs, k];
}

// Entreprise lue dans l'annuaire (recherche-entreprises.api.gouv.fr) + BODACC + INPI : même forme que les entreprises de site.json
// hist : la qualification qui finit le plus tard et la toute première, dans l'historique RGE de l'ADEME (depuis 2014)
export function fromLive(ue, bod, rat, today = new Date(), hist = null) {
  const sg = ue.siege || {}, siren = ue.siren;
  const ville = nice(sg.libelle_commune || "");
  const pp = String(ue.nature_juridique || "") === "1000";
  const hidden = ue.statut_diffusion && ue.statut_diffusion !== "O";
  const nom = hidden || !ue.nom_complet || /NON-DIFFUSIBLE/i.test(ue.nom_complet) ? "Entrepreneur individuel" + (ville ? ` à ${ville}` : "") : nice(ue.nom_complet);
  const ev = bodaccEvents(bod, siren);
  const [st, stD] = procStatus(ev, today);
  const cree = ue.date_creation || "";
  const etat = ue.etat_administratif || "";
  const age = cree ? monthsBetween(isoDate(cree), today) : null;
  const [cpt, kCpt] = comptes(rat, today);
  const cp = sg.code_postal || "";
  const adr = niceAddr((sg.adresse || "").replace(new RegExp("\\s*" + cp + "\\b.*$"), ""));
  const e = {
    id: siren, nom, ville, rge: false, rgeAnnuaire: !!ue.complements?.est_rge, live: today.toISOString().slice(0, 10),
    q: [], t: [], since: null, dep: sg.departement || "", c: null, cslug: null,
    est: [{ adr, cp: [cp, ville].filter(Boolean).join(" "), siret: sg.siret || "", tel: "", web: "" }],
    bod: ev.slice(-25), proc: st, proc_d: stD, k_proc: !st ? "ok" : st in OPEN ? "bad" : "warn",
    si: { etat, cree, cj: String(ue.nature_juridique || ""), cjl: cjLabel(ue.nature_juridique), eff: REF.effectifs[ue.tranche_effectif_salarie] || "",
      effy: String(ue.annee_tranche_effectif_salarie || ""), naf: ue.activite_principale || "", nafl: REF.activites[ue.activite_principale] || REF.sections[ue.section_activite_principale] || "",
      section: ue.section_activite_principale || "", pp, cess: etat === "C" ? ue.date_fermeture || "" : "" },
    k_ent: etat === "C" ? "bad" : age != null && age < 24 ? "warn" : "ok",
    cpt, k_cpt: kCpt,
    rgeUnknown: hist === "indisponible",
    rgeHist: hist && hist.last ? { fin: hist.last.lien_date_fin, deb2: hist.last.lien_date_debut, debut: hist.first?.lien_date_debut || hist.last.lien_date_debut,
      org: hist.last.organisme && hist.last.organisme !== "Non renseigné" ? hist.last.organisme : "", qual: hist.last.nom_qualification || "",
      recent: monthsBetween(isoDate(hist.last.lien_date_fin), today) <= 24 } : null,
  };
  e.v = [e.k_proc, e.k_ent, e.k_cpt].filter((k) => k === "warn" || k === "bad").length;
  return e;
}
