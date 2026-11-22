// Page /artisan/ : vérifie en direct un artisan qui n'a pas de fiche sur le site.
// Annuaire des entreprises (état, création, activité), BODACC (procédures collectives), INPI (comptes) : services publics
// gratuits, interrogés depuis le navigateur du visiteur. Les règles et la mise en page sont celles des fiches (src/lib/fiche.js).
import { fromLive, renderFiche, API, nice } from "../lib/fiche.js";
import { esc, entSlug, artisanUrl, year, plural } from "../lib/fmt.js";

const $ = (s) => document.querySelector(s);
const out = $("#lv-out"), band = $("#lv-search"), form = $("#lv-form");
const params = new URLSearchParams(location.search);

// les entreprises qui ont une fiche complète sur le site (index de la recherche)
const index = fetch("/data/search.json").then((r) => r.json()).then((j) => ({ e: new Map(j.e.map((x) => [x[2], x])), d: j.d })).catch(() => ({ e: new Map(), d: {} }));
const fiche = (x) => `/entreprise/${entSlug(x[0], x[1], x[2])}/`;

async function get(url, ms = 15000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); }
}
const qs = (o) => new URLSearchParams(o).toString();
const block = (html) => `<section class="block"><div class="wrap">${html}</div></section>`;
const wait = (t) => { out.innerHTML = block(`<p class="lv-wait">${t}</p>`); };
const fail = (t, retry = true) => { out.innerHTML = block(`<p class="empty">${t}</p>${retry ? '<p><button class="btn" type="button" id="lv-retry">Réessayer</button></p>' : ""}`); $("#lv-retry")?.addEventListener("click", () => location.reload()); };

// ---------- une entreprise ----------
async function showSiren(raw) {
  const siren = raw.replace(/\D/g, "").slice(0, 9);
  if (!/^\d{9}$/.test(siren)) return fail("Un numéro SIREN a 9 chiffres (les 9 premiers chiffres du SIRET).", false);
  const I = await index;
  const known = I.e.get(siren);
  if (known) return location.replace(fiche(known)); // l'entreprise a déjà sa fiche complète
  band.hidden = true;
  wait("Interrogation de l'Annuaire des entreprises, du BODACC et de l'INPI…");
  let ue, bod, rat;
  try {
    [ue, bod, rat] = await Promise.all([
      get(`${API.annuaire}?${qs({ q: siren, per_page: 1 })}`).then((j) => (j.results || []).find((x) => x.siren === siren && (x.etat_administratif || x.date_creation))), // numéro inconnu : l'annuaire renvoie une fiche vide
      get(`${API.bodacc}?${qs({ where: `familleavis="collective" and registre="${siren}"`, select: "id,registre,dateparution,tribunal,jugement,typeavis_lib", limit: 100 })}`).then((j) => j.results || []),
      get(`${API.ratios}?${qs({ where: `siren="${siren}"`, select: "siren,date_cloture_exercice,chiffre_d_affaires,resultat_net,autonomie_financiere,confidentiality,type_bilan", limit: 50 })}`).then((j) => j.results || []),
    ]);
  } catch {
    band.hidden = false;
    return fail("Un des services publics ne répond pas pour le moment. Réessayez dans un instant.");
  }
  if (!ue) { band.hidden = false; return fail(`Aucune entreprise ne porte le numéro SIREN ${siren.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")} au répertoire Sirene. Vérifiez le numéro inscrit sur le devis.`, false); }
  const e = fromLive(ue, bod, rat);
  const dd = I.d[e.dep];
  document.title = `${e.nom} : procédures, comptes | Artisan Arena`;
  const other = e.si.section && e.si.section !== "F" && !e.si.nafl.startsWith("Travaux") ? `<p class="lv-note">Activité principale déclarée : ${esc(e.si.nafl || e.si.naf)}. Ce n'est pas une entreprise du bâtiment.</p>` : "";
  out.innerHTML = renderFiche({ e, dep: dd ? { nom: dd[0], slug: dd[1] } : null, devis: $("#lv-devis").innerHTML }).replace('<p class="verdict">', other + '<p class="verdict">');
  window.scrollTo(0, 0);
}

// ---------- recherche parmi tous les artisans ----------
async function showSearch(q, dep, bat, page = 1) {
  if (page === 1) wait("Recherche dans l'Annuaire des entreprises…");
  const I = await index;
  let j;
  try {
    j = await get(`${API.annuaire}?${qs({ q, per_page: 20, page, ...(dep ? { departement: dep } : {}), ...(bat ? { section_activite_principale: "F" } : {}) })}`);
  } catch { return fail("L'Annuaire des entreprises ne répond pas pour le moment. Réessayez dans un instant."); }
  const rs = j.results || [];
  const row = (r) => {
    const k = I.e.get(r.siren), sg = r.siege || {}, ville = nice(sg.libelle_commune || "");
    const shut = r.etat_administratif === "C";
    return `<li class="card row"><div><h3><a href="${k ? fiche(k) : artisanUrl(r.siren)}">${esc(k ? k[0] : nice(r.nom_complet))}</a></h3>
      <p class="meta">${[ville, sg.code_postal, r.date_creation ? `créée en ${year(r.date_creation)}` : ""].filter(Boolean).map(esc).join(" · ")}</p></div>
      <div class="flags">${shut ? '<span class="flag"><i class="ic bad" aria-hidden="true">!</i>Fermée</span>' : ""}<span class="flag">${k ? "Fiche complète" : "Vérifier"}</span></div></li>`;
  };
  const list = rs.map(row).join("");
  if (page === 1) {
    out.innerHTML = block(rs.length
      ? `<p class="hint"><b>${j.total_results > 10000 ? "Plus de 10 000" : j.total_results.toLocaleString("fr-FR")}</b> ${plural(j.total_results, "entreprise")} pour « ${esc(q)} »${bat ? " dans le bâtiment" : ""}. Ouvrez une entreprise pour voir ses procédures collectives et ses comptes.</p><ul class="list" id="lv-list">${list}</ul>${j.total_pages > 1 ? '<p class="list-more"><button class="btn ghost" type="button" id="lv-more">Plus de résultats</button></p>' : ""}`
      : `<p class="empty">Aucune entreprise trouvée pour « ${esc(q)} »${bat ? " dans le bâtiment" : ""}${dep ? " dans ce département" : ""}. ${bat || dep ? "Essayez sans filtre, " : "Essayez "}avec le nom inscrit sur le devis ou son numéro SIREN.</p>`);
  } else $("#lv-list").insertAdjacentHTML("beforeend", list);
  const more = $("#lv-more");
  if (more) { if (page >= j.total_pages) more.parentElement.remove(); else more.onclick = () => { more.disabled = true; showSearch(q, dep, bat, page + 1).then(() => (more.disabled = false)); }; }
}

// ---------- formulaire ----------
const q = params.get("q") || "", dep = params.get("dep") || "", bat = params.get("bat") !== "0";
$("#lv-q").value = q; $("#lv-dep").value = dep; $("#lv-bat").checked = bat;
form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const v = $("#lv-q").value.trim();
  if (/^\d[\d\s]{8,}$/.test(v)) { location.href = artisanUrl(v.replace(/\D/g, "").slice(0, 9)); return; }
  location.search = qs({ q: v, ...($("#lv-dep").value ? { dep: $("#lv-dep").value } : {}), ...($("#lv-bat").checked ? {} : { bat: "0" }) });
});
if (params.get("siren")) showSiren(params.get("siren"));
else if (/^\d[\d\s]{8,}$/.test(q)) showSiren(q);
else if (q.length >= 2) showSearch(q, dep, bat);
