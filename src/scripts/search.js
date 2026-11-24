// Page /recherche/ : comprend la phrase tapée (src/lib/parse.js), interroge l'annuaire officiel des entreprises
// (recherche-entreprises.api.gouv.fr) depuis le navigateur, puis le BODACC pour signaler les procédures collectives.
// Deux façons de chercher :
//  - autour d'un lieu (commune, code postal ou position) sans nom : recherche géographique, triée par distance ;
//  - avec un nom : recherche par nom, filtrée par métier et par département.
import { parse, indexLieux, without, norm } from "../lib/parse.js";
import { METIERS, METIER } from "../lib/metiers.js";
import { API, nice, bodaccEvents, procStatus, OPEN, ageTxt } from "../lib/fiche.js";
import { esc, plural, int } from "../lib/fmt.js";
import REF from "../lib/referentiels.json" with { type: "json" };

const $ = (s, r = document) => r.querySelector(s);
const P = new URLSearchParams(location.search);
const Q = (P.get("q") || "").trim();
const RAYON = [5, 10, 20, 30, 50].includes(+P.get("r")) ? +P.get("r") : 10;
const RGE = P.get("rge") === "1";
const LAT = parseFloat(P.get("lat")), LON = parseFloat(P.get("lon"));
const HERE = Number.isFinite(LAT) && Number.isFinite(LON);
const out = $("#rs-out"), head = $("#rs-head");
const PAGE = 20, MAX_PAGES = 8;
let LIEUX = null; // index des communes (noms officiels) // recherche géographique : 8 pages de 25 au plus, triées ensuite par distance

$("#rs-q").value = Q;

async function get(url, ms = 15000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
}
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== "" && v != null && v !== false)).toString();
const url = (o) => "/recherche/?" + qs({ q: Q, r: RAYON === 10 ? "" : RAYON, rge: RGE ? 1 : "", ...(HERE ? { lat: LAT, lon: LON } : {}), ...o });
const msg = (html) => { out.innerHTML = `<div class="rs-msg">${html}</div>`; };
const fail = (t) => msg(`<p>${t}</p><p><button class="btn" type="button" onclick="location.reload()">Réessayer</button></p>`);

// « d'Aurillac », « du Puy-en-Velay », « de Saint-Flour »
const de = (nom) => /^Le /.test(nom) ? "du " + nom.slice(3) : /^Les /.test(nom) ? "des " + nom.slice(4) : /^[AEIOUYÉÈH]/i.test(nom) ? "d'" + nom : "de " + nom;
const km = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * R; };
const months = (iso) => { if (!iso) return null; const d = new Date(iso + "T12:00:00"), n = new Date(); return (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth(); };

// ---------- une entreprise de l'annuaire → une ligne de résultat ----------
function card(r, centre) {
  const hidden = r.statut_diffusion && r.statut_diffusion !== "O";
  // seulement les établissements ouverts (un établissement fermé donnerait une ancienne adresse)
  const open = (r.matching_etablissements || []).filter((x) => x.etat_administratif === "A");
  const etabs = open.length ? open : [r.siege || {}];
  let et = etabs[0], dist = null;
  if (centre) for (const x of etabs) {
    const d = x.latitude && x.longitude ? km(centre[0], centre[1], +x.latitude, +x.longitude) : null;
    if (d != null && (dist == null || d < dist)) { dist = d; et = x; }
  }
  const ville = LIEUX?.byCode.get(et.commune)?.nom || nice(et.libelle_commune || r.siege?.libelle_commune || "");
  const nom = hidden || /NON-DIFFUSIBLE/i.test(r.nom_complet || "") ? `Entrepreneur individuel${ville ? " à " + ville : ""}` : nice(r.nom_complet || "");
  const enseigne = !hidden && et.liste_enseignes?.[0] && norm(et.liste_enseignes[0]) !== norm(r.nom_complet) ? nice(et.liste_enseignes[0]) : "";
  // l'activité de l'établissement, sauf code ancien ou absent : alors celle de l'entreprise
  const naf = REF.activites[et.activite_principale] ? et.activite_principale : r.activite_principale || "";
  return { siren: r.siren, nom, enseigne, ville, cp: et.code_postal || "", dist, metier: METIERS.find((m) => m.codes[0] === naf)?.label || REF.activites[naf] || REF.sections[r.section_activite_principale] || "",
    age: months(r.date_creation), rge: !!r.complements?.est_rge, proc: null };
}
// entreprises ouvertes seulement (l'annuaire est déjà filtré, ceci est une sécurité)
const active = (rs) => (rs || []).filter((r) => r.etat_administratif === "A");
const COLORS = ["c1", "c2", "c3"];
function row(c, i) {
  const ini = (c.nom.replace(/^(Entreprise|Ets|Sarl|Sas|Eurl|Sasu)\s+/i, "").match(/[A-Za-zÀ-ÿ0-9]/) || ["?"])[0].toUpperCase();
  return `<li><a class="res" href="/artisan/?siren=${c.siren}">
    <span class="res-i ${COLORS[i % 3]}" aria-hidden="true">${esc(ini)}</span>
    <span class="res-main"><b>${esc(c.nom)}</b><span>${[c.enseigne && `« ${esc(c.enseigne)} »`, esc(c.metier), esc([c.ville, c.dist != null ? `à ${c.dist < 1 ? "moins d'1" : c.dist.toFixed(0)} km` : ""].filter(Boolean).join(", "))].filter(Boolean).join(" · ")}</span></span>
    <span class="res-tags" data-siren="${c.siren}">${c.age != null ? `<span class="tag">Créée il y a ${ageTxt(c.age)}</span>` : ""}${c.rge ? '<span class="tag rge">RGE</span>' : ""}${c.age != null && c.age < 24 ? '<span class="tag warn">Entreprise récente</span>' : ""}</span>
    <svg class="res-go" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
  </a></li>`;
}

// procédures collectives des entreprises affichées : une seule requête au BODACC pour toute la page
async function procs(cards) {
  if (!cards.length) return;
  try {
    const where = `familleavis="collective" and registre in (${cards.map((c) => `"${c.siren}"`).join(",")})`;
    const recs = await get(`${API.bodaccExport}?${qs({ where, select: "id,registre,dateparution,tribunal,jugement,typeavis_lib" })}`);
    const today = new Date();
    for (const c of cards) {
      const [st] = procStatus(bodaccEvents(recs, c.siren), today);
      const tags = document.querySelector(`.res-tags[data-siren="${c.siren}"]`);
      if (!tags || !st) continue;
      if (st in OPEN) tags.insertAdjacentHTML("beforeend", '<span class="tag bad">Procédure collective en cours</span>');
      else if (st === "plan") tags.insertAdjacentHTML("beforeend", '<span class="tag warn">Plan de redressement</span>');
    }
  } catch { /* les étiquettes de procédure sont un plus : la liste reste affichée sans elles */ }
}

// ---------- étiquettes « compris » et filtres ----------
function chips(p, place) {
  const x = (key, label) => `<a class="chip" href="${url({ q: without(p, key) })}" aria-label="Retirer : ${esc(label)}">${esc(label)}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></a>`;
  const bits = [];
  if (p.metier) bits.push(x("metier", `Métier : ${p.metier.label.toLowerCase()}`));
  if (p.commune) bits.push(x("lieu", `Ville : ${p.commune.nom} (${p.commune.dep})`));
  if (p.cp) bits.push(x("lieu", `Code postal : ${p.cp}`));
  if (p.dep) bits.push(x("dep", `Département : ${p.dep.nom} (${p.dep.code})`));
  if (HERE) bits.push(`<a class="chip" href="/recherche/?${qs({ q: Q, rge: RGE ? 1 : "" })}" aria-label="Retirer : autour de ma position">Autour de ma position<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></a>`);
  const metierSel = `<label class="fsel"><span class="sr">Métier</span><select id="f-metier"><option value="">${p.metier ? "Changer de métier" : "Choisir un métier"}</option>${METIERS.map((m) => `<option value="${m.k}"${p.metier?.k === m.k ? " selected" : ""}>${m.label}</option>`).join("")}</select></label>`;
  const rayon = place ? `<label class="fsel"><span class="sr">Distance</span><select id="f-rayon">${[5, 10, 20, 30, 50].map((r) => `<option value="${r}"${r === RAYON ? " selected" : ""}>à moins de ${r} km</option>`).join("")}</select></label>` : "";
  const rge = `<label class="fchk"><input type="checkbox" id="f-rge"${RGE ? " checked" : ""}> RGE seulement</label>`;
  head.innerHTML = `<div class="rs-chips">${bits.length ? '<span class="rs-k">Compris :</span>' : ""}${bits.join("")}${metierSel}${rayon}${rge}</div>`;
  $("#f-metier").onchange = (ev) => { const m = METIER[ev.target.value]; if (m) location.href = url({ q: [without(p, "metier"), m.mots[0]].filter(Boolean).join(" ") }); };
  $("#f-rayon")?.addEventListener("change", (ev) => { location.href = url({ r: +ev.target.value === 10 ? "" : ev.target.value }); });
  $("#f-rge").onchange = (ev) => { location.href = url({ rge: ev.target.checked ? 1 : "" }); };
}

// ---------- liste, avec « Voir les suivants » ----------
function list(title, sub, more) {
  out.innerHTML = `<h1 class="rs-h">${title}</h1>${sub ? `<p class="rs-sub">${sub}</p>` : ""}<ul class="rs-list" id="rs-list"></ul><p class="rs-more" hidden><button class="btn ghost" type="button" id="rs-more">Voir les suivants</button></p>`;
  const ul = $("#rs-list"), btn = $("#rs-more");
  let n = 0;
  const add = (cards) => { ul.insertAdjacentHTML("beforeend", cards.map((c, i) => row(c, n + i)).join("")); n += cards.length; procs(cards); };
  btn.onclick = async () => { btn.disabled = true; const r = await more(); add(r.cards); btn.disabled = false; btn.parentElement.hidden = !r.left; };
  return { add, left: (b) => { btn.parentElement.hidden = !b; } };
}

// recherche géographique : toutes les pages (8 au plus), triées par distance
async function nearby(p, centre, lieu) {
  const base = { lat: centre[0], long: centre[1], radius: RAYON, per_page: 25, etat_administratif: "A", ...(p.metier ? { activite_principale: p.metier.codes.join(",") } : { section_activite_principale: "F" }) };
  msg(`<p class="rs-wait">Recherche des ${p.metier ? p.metier.qui : "artisans"} autour ${lieu}…</p>`);
  let first;
  try { first = await get(`${API.near}?${qs({ ...base, page: 1 })}`); } catch { return fail("L'annuaire des entreprises ne répond pas pour le moment."); }
  const pages = Math.min(first.total_pages || 1, MAX_PAGES);
  let rs = first.results || [];
  for (let pg = 2; pg <= pages; pg += 3) {
    const batch = await Promise.all([pg, pg + 1, pg + 2].filter((x) => x <= pages).map((x) => get(`${API.near}?${qs({ ...base, page: x })}`).then((j) => j.results || []).catch(() => [])));
    rs = rs.concat(...batch);
  }
  const seen = new Set();
  // jamais d'entreprise fermée, ni d'entreprise dont aucun établissement n'est ouvert dans le rayon
  rs = rs.filter((r) => r.etat_administratif === "A" && (r.matching_etablissements || []).some((x) => x.etat_administratif === "A"));
  let cards = rs.filter((r) => !seen.has(r.siren) && seen.add(r.siren)).map((r) => card(r, centre)).sort((a, b) => (a.dist ?? 99) - (b.dist ?? 99));
  if (RGE) cards = cards.filter((c) => c.rge);
  const total = cards.length, capped = (first.total_results || 0) > MAX_PAGES * 25;
  const qui = p.metier ? p.metier.qui : "artisans du bâtiment";
  if (!total) return msg(`<p>Aucun ${RGE ? "artisan RGE" : p.metier ? p.metier.qui.replace(/s$/, "") : "artisan"} à moins de ${RAYON} km ${lieu.replace(/^autour /, "")}.</p>${RAYON < 50 ? `<p><a class="btn" href="${url({ r: RAYON < 20 ? 20 : 50 })}">Chercher plus loin</a></p>` : ""}`);
  const L = list(`${int(total)} ${plural(total, qui.replace(/s$/, ""), qui)}${RGE ? " RGE" : ""} à moins de ${RAYON} km ${lieu.replace(/^autour /, "")}`,
    `Du plus proche au plus loin.${capped ? ` Les ${MAX_PAGES * 25} premiers trouvés : précisez le métier ou réduisez la distance pour tout voir.` : ""}`,
    async () => { const r = cards.slice(shown, shown + PAGE); shown += r.length; return { cards: r, left: shown < cards.length }; });
  let shown = Math.min(PAGE, cards.length);
  L.add(cards.slice(0, shown)); L.left(shown < cards.length);
}

// recherche par nom (et métier, département)
async function byName(p, filt, where) {
  const params = { q: p.name, per_page: PAGE, etat_administratif: "A", est_rge: RGE ? "true" : "", ...(p.metier ? { activite_principale: p.metier.codes.join(",") } : { section_activite_principale: "F" }), ...filt };
  msg(`<p class="rs-wait">Recherche dans l'annuaire des entreprises…</p>`);
  let j;
  try { j = await get(`${API.annuaire}?${qs({ ...params, page: 1 })}`); } catch { return fail("L'annuaire des entreprises ne répond pas pour le moment."); }
  const total = j.total_results || 0;
  const what = p.name ? `« ${esc(p.name)} »` : p.metier ? p.metier.qui : "artisans du bâtiment";
  if (!total) return msg(`<p>Aucune entreprise ${p.name ? `pour ${what}` : ""}${p.metier ? ` en ${p.metier.label.toLowerCase()}` : " du bâtiment"}${where ? " " + where : ""}${RGE ? " qualifiée RGE" : ""}.</p><p>Vérifiez l'orthographe ou essayez avec moins de mots : le nom inscrit sur le devis suffit souvent.</p>`);
  const title = p.name ? `${total > 10000 ? "Plus de 10 000" : int(total)} ${plural(total, "résultat")} pour ${what}` : `${total > 10000 ? "Plus de 10 000" : int(total)} ${plural(total, what.replace(/s$/, ""), what)}`;
  let page = 1;
  const L = list(`${title}${p.name && p.metier ? `, ${p.metier.label.toLowerCase()}` : ""}${where ? " " + where : ""}${RGE ? ", RGE" : ""}`, "Classés par pertinence, d'après l'annuaire officiel des entreprises.",
    async () => { page++; const k = await get(`${API.annuaire}?${qs({ ...params, page })}`).catch(() => ({ results: [] })); return { cards: active(k.results).map((r) => card(r)), left: page < (k.total_pages || 0) }; });
  L.add(active(j.results).map((r) => card(r))); L.left((j.total_pages || 0) > 1);
}

// ---------- point d'entrée ----------
async function main() {
  if (!Q && !HERE) return msg(`<h1 class="rs-h">Que cherchez-vous ?</h1><p>Un nom, un métier, une ville, ou les trois : « plombier Aurillac », « Martin couvreur », « électricien 15 ».</p>`);
  let L;
  try { L = LIEUX = indexLieux(await get("/data/lieux.json", 20000)); } catch { return fail("La recherche n'a pas pu démarrer."); }
  const p = parse(Q, L, { lieu: P.get("lieu") === "1", nom: P.get("nom") || "" });
  if (p.siren) { location.replace(`/artisan/?siren=${p.siren}`); return; }
  const place = !p.name && (p.commune || p.cp || HERE);
  chips(p, place);
  document.title = `${Q || "Autour de moi"} | Artisan Arena`;
  // autre lecture possible d'un mot seul : nom d'entreprise ou commune
  const alt = p.altLieu ? `<p class="rs-alt">« ${esc(p.altLieu.nom)} » est aussi une commune : <a href="${url({ lieu: 1 })}">voir les artisans près ${de(p.altLieu.nom)} (${p.altLieu.dep})</a>.</p>`
    : p.altNom && p.metier && p.commune.pop < 10000 ? `<p class="rs-alt">Vous cherchiez l'entreprise « ${esc(p.commune.nom)} » ? <a href="${url({ q: without(p, "lieu"), nom: p.altNom })}">Chercher ce nom</a>.</p>` : "";
  if (place) {
    let centre, lieu;
    if (HERE) { centre = [LAT, LON]; lieu = "de votre position"; }
    else {
      const c = p.commune || p.cpCommune;
      try { const g = await get(`https://geo.api.gouv.fr/communes/${c.code}?fields=centre`); centre = [g.centre.coordinates[1], g.centre.coordinates[0]]; }
      catch { return fail("Impossible de situer cette commune pour le moment."); }
      lieu = p.cp ? `du ${p.cp}` : de(c.nom);
    }
    await nearby(p, centre, lieu);
  } else if (p.name || p.dep || p.metier) {
    if (p.metier && !p.name && !p.dep) return msg(`<h1 class="rs-h">Des ${p.metier.qui}, mais où ?</h1><p>Ajoutez une ville, un code postal ou un département, par exemple « ${esc(Q)} Aurillac », ou cherchez autour de vous.</p><p><button class="btn" type="button" id="rs-geo">Autour de ma position</button></p>`), geo();
    const c = p.commune || p.cpCommune;
    const filt = p.dep ? { departement: p.dep.code } : c ? { departement: c.dep } : {};
    const where = p.dep ? `(${p.dep.nom})` : c ? `(${c.nom === "Paris" ? "Paris" : "département " + c.dep})` : "";
    await byName(p, filt, where);
  } else return msg(`<p>Tapez au moins un nom, un métier ou une ville.</p>`);
  if (alt) out.insertAdjacentHTML("afterbegin", alt);
}

// « Autour de ma position » (accueil et résultats)
export function geo(btn = $("#rs-geo")) {
  if (!btn) return;
  btn.onclick = () => {
    if (!navigator.geolocation) { btn.textContent = "Position indisponible sur cet appareil"; return; }
    btn.disabled = true; btn.textContent = "Recherche de votre position…";
    navigator.geolocation.getCurrentPosition((pos) => {
      location.href = "/recherche/?" + qs({ q: P.get("q") || $("#rs-q")?.value || "", lat: pos.coords.latitude.toFixed(4), lon: pos.coords.longitude.toFixed(4), rge: RGE ? 1 : "" });
    }, () => { btn.disabled = false; btn.textContent = "Position refusée : tapez une ville"; }, { timeout: 10000 });
  };
}
main();
