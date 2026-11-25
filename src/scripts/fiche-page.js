// Page /artisan/?siren=123456789 : la fiche d'un artisan, lue en direct auprès des services publics, gratuits et ouverts :
// Annuaire des entreprises (identité, état, création, activité), BODACC (procédures collectives), INPI (comptes),
// ADEME (historique RGE, facultatif). Règles et mise en page : src/lib/fiche.js.
import { fromLive, renderFiche, API } from "../lib/fiche.js";
import { METIERS } from "../lib/metiers.js";
import { esc } from "../lib/fmt.js";

const $ = (s) => document.querySelector(s);
const out = $("#fp-out");
const siren = (new URLSearchParams(location.search).get("siren") || "").replace(/\D/g, "").slice(0, 9);

async function get(url, ms = 15000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
}
const qs = (o) => new URLSearchParams(o).toString();
const msg = (html) => { out.innerHTML = `<section class="block"><div class="wrap"><div class="rs-msg">${html}</div></div></section>`; };

async function main() {
  if (!/^\d{9}$/.test(siren)) return msg(`<h1 class="rs-h">Fiche introuvable</h1><p>Cette adresse ne contient pas de numéro SIREN valide (9 chiffres). <a href="/">Faire une recherche</a>.</p>`);
  // historique RGE : facultatif, la fiche s'affiche même si l'ADEME ne répond pas
  const hq = (sort) => get(`${API.historique}?${qs({ qs: `siret:${siren}*`, size: 1, sort, select: "siret,nom_qualification,lien_date_debut,lien_date_fin,organisme" })}`).then((j) => (j.results || [])[0] || null);
  const histP = Promise.all([hq("-lien_date_fin"), hq("lien_date_debut")]).then(([last, first]) => ({ last, first })).catch(() => "indisponible");
  // coordonnées publiées par l'annuaire RGE (ADEME) : facultatif, et seulement s'il y a un téléphone
  const coordP = get(`${API.rge}?${qs({ qs: `siret:${siren}*`, size: 50, select: "siret,telephone,email,site_internet" })}`)
    .then((j) => (j.results || []).filter((r) => r.telephone)).catch(() => []);
  let ue, bod, rat;
  try {
    [ue, bod, rat] = await Promise.all([
      get(`${API.annuaire}?${qs({ q: siren, per_page: 1 })}`).then((j) => (j.results || []).find((x) => x.siren === siren && (x.etat_administratif || x.date_creation))),
      get(`${API.bodacc}?${qs({ where: `familleavis="collective" and registre="${siren}"`, select: "id,registre,dateparution,tribunal,jugement,typeavis_lib", limit: 100 })}`).then((j) => j.results || []),
      get(`${API.ratios}?${qs({ where: `siren="${siren}"`, select: "siren,date_cloture_exercice,chiffre_d_affaires,resultat_net,autonomie_financiere,confidentiality,type_bilan", limit: 50 })}`).then((j) => j.results || []),
    ]);
  } catch {
    return msg(`<p>Un des services publics ne répond pas pour le moment.</p><p><button class="btn" type="button" onclick="location.reload()">Réessayer</button></p>`);
  }
  if (!ue) return msg(`<h1 class="rs-h">Entreprise introuvable</h1><p>Aucune entreprise ne porte le numéro SIREN ${siren.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")} au répertoire Sirene. Vérifiez le numéro inscrit sur le devis.</p>`);
  const e = fromLive(ue, bod, rat, new Date(), await histP);
  const rs = await coordP, r = rs.find((x) => x.siret === ue.siege?.siret) || rs[0];
  const coord = r ? { tel: r.telephone, email: r.email || "", site: r.site_internet || "" } : null;
  document.title = `${e.nom}${e.ville ? ` (${e.ville})` : ""} | Artisan Arena`;
  // lien vers les autres artisans du même métier autour
  const m = METIERS.find((x) => x.codes.includes(e.si.naf));
  const autres = m && e.ville ? `<p class="autres"><a class="btn ghost" href="/recherche/?${qs({ q: `${m.mots[0]} ${e.ville}` })}">Voir d'autres ${esc(m.qui)} près ${/^[AEIOUYÉÈH]/i.test(e.ville) ? "d'" : "de "}${esc(e.ville)}</a></p>` : "";
  const other = e.si.section && !["F", "N"].includes(e.si.section) ? `<p class="fh-other">Activité principale déclarée : ${esc(e.si.nafl || e.si.naf)}. Ce n'est pas une entreprise du bâtiment.</p>` : "";
  out.innerHTML = renderFiche({ e, devis: $("#fp-devis").innerHTML, autres, coord }).replace('<div class="checks">', other + '<div class="checks">');
}
main();
