// Rendu de toutes les pages : fonctions pures qui renvoient du HTML, utilisées à la construction (Astro).
// Une seule source pour les textes et la mise en page : on modifie ici.
import { esc, int, pct, plural, dateFr, year, inDep, inCity, ficheUrl, communeUrl, depUrl, travauxUrl } from "./fmt.js";
import { T, TRAVAUX } from "./data.js";
import { devisBlock, assuranceBlock } from "./partenaires.js";
import { ic, noEnd, villeOf, PROC, PROC_SHORT, renderFiche as ficheHtml } from "./fiche.js";

const ICON = {
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
};




// La fiche d'une entreprise est dans fiche.js (partagée avec la page /artisan/). Ici : le bloc partenaire de la fiche RGE.
export const renderFiche = ({ e, dep, near }) => ficheHtml({ e, dep, near, devis: devisBlock(e.t[0] ? T[e.t[0]].quoi : "vos travaux") });

// ---------- listes ----------
function flags(e) {
  const f = [];
  f.push([e.k_proc, e.proc ? PROC_SHORT[e.proc] : "Aucune procédure"]);
  if (e.si) f.push([e.k_ent, e.si.etat === "C" ? "Entreprise cessée" : e.si.cree ? `Créée en ${year(e.si.cree)}` : "Active"]);
  if (e.k_cpt !== "na") f.push([e.k_cpt, e.k_cpt === "ok" ? "Comptes positifs" : "Comptes négatifs"]);
  f.push([e.k_rge, noEnd(e.fin) ? "RGE sans échéance" : e.k_rge === "ok" ? `RGE jusqu'en ${year(e.fin)}` : `RGE jusqu'au ${dateFr(e.fin)}`]);
  return f.map(([k, t]) => `<span class="flag">${ic(k)}${t}</span>`).join("");
}

function listRow(e, i, { code = null, hideT = null } = {}) {
  const es = (code && e.est.find((x) => x.c === code)) || e.est[0];
  const ts = e.t.filter((t) => t !== hideT);
  const tags = ts.slice(0, 4).map((t) => `<span class="tag">${T[t].label}</span>`).join("") + (ts.length > 4 ? `<span class="tag more">+${ts.length - 4}</span>` : "");
  return `<li class="card row" data-i="${i}" data-t="${e.t.join(" ")}" data-v="${e.v}" data-rge="${e.since || "9"}" data-cre="${e.si?.cree || ""}" data-nom="${esc(e.nom)}">
<div><h3><a href="${ficheUrl(e)}">${esc(e.nom)}</a></h3><p class="meta">${esc(es.adr ? es.adr + ", " : "")}${es.cp} ${esc(es.v)}</p><div class="tags">${tags}</div></div>
<div class="flags">${flags(e)}</div></li>`;
}

// Liste filtrable : par travaux (si la liste en mélange plusieurs), sans point de vigilance, tri.
function entList(es, { code = null, travaux = true, hideT = null, label = "entreprises" } = {}) {
  if (!es.length) return '<p class="empty">Aucune entreprise RGE.</p>';
  const n = es.length, clean = es.filter((e) => e.v === 0).length;
  const tc = {};
  for (const e of es) for (const t of e.t) tc[t] = (tc[t] || 0) + 1;
  const opts = TRAVAUX.filter((t) => tc[t.slug]).map((t) => `<option value="${t.slug}">${t.label} (${tc[t.slug]})</option>`).join("");
  const tools = n > 1 ? `<div class="tools" role="group" aria-label="Filtres">
    ${travaux && Object.keys(tc).length > 1 ? `<label class="tsel">Travaux <select data-dom><option value="">Tous (${n})</option>${opts}</select></label>` : ""}
    ${clean && clean < n ? `<button type="button" class="chip" data-clean aria-pressed="false">Sans point de vigilance (${clean})</button>` : ""}
    <label>Trier <select data-sort><option value="def">Recommandé</option><option value="rge">RGE depuis le plus longtemps</option><option value="cre">Entreprise la plus ancienne</option><option value="nom">Nom</option></select></label>
  </div>
  <p class="hint"><b data-count>${n}</b> ${label}. Par défaut : d'abord celles sans point de vigilance, puis les plus anciennement qualifiées RGE.</p>` : "";
  return `<div data-list>${tools}<ul class="list">${es.map((e, i) => listRow(e, i, { code, hideT })).join("")}</ul>
  <p class="empty" hidden>Aucune entreprise ne correspond à ces filtres.</p>
  <p class="list-more" hidden><button type="button" class="btn ghost">Afficher les <b></b> suivantes</button></p></div>`;
}


export function searchBox(id = "q", label = "Nom de l'entreprise, SIRET ou commune") {
  return `<form class="search" role="search" action="/" data-search>
    ${ICON.search}<input id="${id}" type="search" autocomplete="off" enterkeyhint="search" placeholder="${label}" aria-label="${label}" role="combobox" aria-expanded="false" aria-controls="${id}-s" aria-autocomplete="list">
    <div id="${id}-s" class="sugg" role="listbox" hidden></div></form>`;
}


// ---------- pages ----------
export function renderHome({ nat, cities, regions, sample }) {
  const tl = TRAVAUX.filter((t) => nat.tc[t.slug]).sort((a, b) => nat.tc[b.slug] - nat.tc[a.slug]);
  return `<section class="band hero"><div class="wrap">
  <h1>Cet artisan est-il solide&nbsp;?</h1>
  <p class="lede">Avant de verser un acompte : ses éventuelles procédures collectives, son ancienneté et ses comptes. Pour tous les artisans du bâtiment, à partir de leur nom ou de leur numéro SIREN.</p>
  ${searchBox("q")}
  ${sample ? `<p class="eg">Par exemple : <a href="${ficheUrl(sample)}">${esc(sample.nom)}</a>, ou un numéro SIRET.</p>` : ""}
</div></section>
<section class="block"><div class="wrap">
  <h2>Quatre vérifications sur chaque entreprise</h2>
  <ul class="how">
    <li class="card"><b>${ic("ok")}Procédures collectives</b><p>Sauvegarde, redressement ou liquidation judiciaire. Source : BODACC.</p></li>
    <li class="card"><b>${ic("ok")}Entreprise active</b><p>Date de création, forme juridique, effectif. Source : Sirene, INSEE.</p></li>
    <li class="card"><b>${ic("ok")}Comptes</b><p>Résultat et capitaux propres du dernier exercice publié. Source : INPI.</p></li>
    <li class="card"><b>${ic("ok")}Qualification RGE</b><p>Utile seulement si vous demandez une aide publique, comme MaPrimeRénov'. Source : ADEME.</p></li>
  </ul>
</div></section>
<section class="block"><div class="wrap">
  <h2>Ce que montrent les données</h2>
  <div class="stats">
    <div class="card stat"><b class="num">${int(nat.proc_open)}</b><span>entreprises du bâtiment sont en procédure collective : ${[["lj", "liquidation", "liquidations"], ["rj", "redressement", "redressements"], ["sauv", "sauvegarde", "sauvegardes"], ["cession", "plan de cession", "plans de cession"]].filter(([k]) => nat.proc_k?.[k]).map(([k, a, b]) => `${int(nat.proc_k[k])} ${plural(nat.proc_k[k], a, b)}`).join(", ")}.</span></div>
    <div class="card stat"><b class="num">${pct((nat.difficulte / nat.n) * 100)}</b><span>montrent au moins un signal de difficulté (${int(nat.difficulte)} entreprises) : procédure ou plan en cours, entreprise fermée, derniers comptes négatifs.</span></div>
    <div class="card stat"><b class="num">${int(nat.cpt_neg)}</b><span>ont publié des derniers comptes en perte ou avec des capitaux propres négatifs, sur ${int(nat.cpt)} qui publient leurs comptes.</span></div>
  </div>
  <p class="src">Calcul Artisan Arena sur les ${int(nat.n)} entreprises du bâtiment suivies chaque semaine (celles de la liste RGE de l'ADEME), croisées avec le BODACC, Sirene et l'INPI. Pour les autres artisans, la vérification se fait à la demande.</p>
  ${devisBlock()}
</div></section>
<section class="block"><div class="wrap">
  <h2>Par type de travaux</h2>
  <p class="sect-sub">Les entreprises RGE qualifiées pour chaque type de travaux, département par département.</p>
  <ul class="trav">${tl.map((t) => `<li><a class="card" href="${travauxUrl(t.slug)}"><b>${t.label}</b><span class="num">${int(nat.tc[t.slug])}</span></a></li>`).join("")}</ul>
</div></section>
<section class="block"><div class="wrap">
  <h2>Les grandes villes</h2>
  <ul class="links">${cities.map((c) => `<li><a href="${communeUrl(c)}">${esc(c.nom)}</a><span>${int(c.n)} ${plural(c.n, "entreprise")}</span></li>`).join("")}</ul>
  <div class="dep-h"><h2>Par département</h2><label class="dep-f">${ICON.search}<input type="search" placeholder="Nom ou numéro" aria-label="Filtrer les départements" data-depfilter autocomplete="off"></label></div>
  <div class="regions">${regions.map(([r, ds]) => `<details class="reg" open><summary>${esc(r)}<span>${ds.length} ${plural(ds.length, "département")}</span></summary><ul>${ds.map((d) => `<li data-q="${esc(d.code + " " + d.nom)}"><a href="${depUrl(d)}"><i>${d.code}</i><span>${esc(d.nom)}</span><em class="num">${int(d.n)}</em></a></li>`).join("")}</ul></details>`).join("")}</div>
  <p class="dep-none empty" hidden>Aucun département ne correspond.</p>
</div></section>`;
}


export function renderCommune({ c, es, dep, kids = [] }) {
  const place = inCity(c);
  const kidsHtml = kids.length ? `<section class="block"><div class="wrap"><h2>Par arrondissement</h2><ul class="links">${kids.map((x) => `<li><a href="${communeUrl(x)}">${esc(x.nom)}</a><span>${x.n} ${plural(x.n, "entreprise")}</span></li>`).join("")}</ul></div></section>` : "";
  const clean = es.filter((e) => e.v === 0).length;
  const top = Object.entries(c.tc).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `<section class="band"><div class="wrap">
  <p class="crumb"><a href="/">Accueil</a><span>›</span><a href="${depUrl(dep)}">${esc(dep.nom)}</a>${c.parentRef ? `<span>›</span><a href="${communeUrl(c.parentRef)}">${esc(c.parentRef.nom)}</a>` : ""}</p>
  <h1>Artisans RGE ${place}</h1>
  <p class="lede">Les ${int(c.n)} ${plural(c.n, "entreprise")} RGE ${c.n > 1 ? "qui ont" : "qui a"} un établissement ${place}, avec leurs qualifications, leurs éventuelles procédures collectives et leurs comptes.</p>
  <div class="tiles">
    <div class="tile"><span class="lab">Entreprises RGE</span><span class="val num">${int(c.n)}</span><span class="sub">${esc(dep.nom)} : ${int(dep.n)}</span></div>
    <div class="tile"><span class="lab">Sans point de vigilance</span><span class="val num">${int(clean)}</span><span class="sub">ni procédure, ni comptes négatifs, ni qualification qui expire</span></div>
    <div class="tile"><span class="lab">Travaux les plus courants</span><span class="sub">${top.map(([t, n]) => `<b>${T[t].label}</b> : ${n}`).join("<br>")}</span></div>
  </div>
</div></section>
${kidsHtml}
<section class="block"><div class="wrap">
  ${kids.length ? `<p class="tx">Choisissez un arrondissement pour voir ses entreprises RGE, ou un <a href="/travaux/">type de travaux</a>.</p>` : entList(es, { code: c.c })}
  ${devisBlock("vos travaux " + place)}
</div></section>`;
}

export function renderDep({ d, communes }) {
  const place = inDep(d);
  const tl = TRAVAUX.filter((t) => d.tc[t.slug]).sort((a, b) => d.tc[b.slug] - d.tc[a.slug]);
  return `<section class="band"><div class="wrap">
  <p class="crumb"><a href="/">Accueil</a></p>
  <h1>Artisans RGE ${place}</h1>
  <p class="lede">${int(d.n)} entreprises RGE ont au moins un établissement ${place}. Choisissez le type de travaux ou votre commune.</p>
</div></section>
<section class="block"><div class="wrap">
  <h2>Par type de travaux</h2>
  <ul class="trav">${tl.map((t) => `<li><a class="card" href="${travauxUrl(t.slug, d)}"><b>${t.label}</b><span class="num">${int(d.tc[t.slug])}</span></a></li>`).join("")}</ul>
</div></section>
<section class="block"><div class="wrap">
  <h2>Par commune</h2>
  <ul class="links">${communes.map((c) => `<li><a href="${communeUrl(c)}">${esc(c.nom)}</a><span>${c.n} ${plural(c.n, "entreprise")}</span></li>`).join("")}</ul>
  ${devisBlock("vos travaux " + place)}
</div></section>`;
}

export function renderTravauxHub({ nat }) {
  const tl = TRAVAUX.filter((t) => nat.tc[t.slug]).sort((a, b) => nat.tc[b.slug] - nat.tc[a.slug]);
  return `<section class="band"><div class="wrap">
  <p class="crumb"><a href="/">Accueil</a></p>
  <h1>Les entreprises RGE par type de travaux</h1>
  <p class="lede">Une qualification RGE porte sur un type de travaux précis. Pour obtenir les aides publiques à la rénovation énergétique, l'entreprise doit être qualifiée pour les travaux qu'elle réalise chez vous.</p>
</div></section>
<section class="block"><div class="wrap">
  <ul class="trav">${tl.map((t) => `<li><a class="card" href="${travauxUrl(t.slug)}"><b>${t.label}</b><span class="num">${int(nat.tc[t.slug])}</span></a></li>`).join("")}</ul>
  ${devisBlock()}
</div></section>`;
}

export function renderTravaux({ t, deps, n }) {
  return `<section class="band"><div class="wrap">
  <p class="crumb"><a href="/">Accueil</a><span>›</span><a href="/travaux/">Travaux</a></p>
  <h1>${t.titre}</h1>
  <p class="lede">${int(n)} entreprises sont qualifiées RGE pour ${t.quoi} en France. Choisissez votre département pour les voir, avec leurs procédures collectives et leurs comptes.</p>
</div></section>
<section class="block"><div class="wrap">
  <h2>Par département</h2>
  <ul class="links">${deps.map((d) => `<li><a href="${travauxUrl(t.slug, d)}">${esc(d.nom)} (${d.code})</a><span>${int(d.tc[t.slug])}</span></li>`).join("")}</ul>
  <p class="src">La mention RGE conditionne la plupart des aides publiques à la rénovation énergétique, comme MaPrimeRénov', l'éco-prêt à taux zéro ou les primes CEE. Vérifiez les conditions de chaque aide sur france-renov.gouv.fr.</p>
  ${devisBlock(t.quoi)}
</div></section>`;
}

export function renderTravauxDep({ t, d, es }) {
  const place = inDep(d);
  return `<section class="band"><div class="wrap">
  <p class="crumb"><a href="/">Accueil</a><span>›</span><a href="${travauxUrl(t.slug)}">${t.label}</a><span>›</span><a href="${depUrl(d)}">${esc(d.nom)}</a></p>
  <h1>${t.titre} ${place}</h1>
  <p class="lede">${int(es.length)} ${plural(es.length, "entreprise")} ${es.length > 1 ? "sont qualifiées" : "est qualifiée"} RGE pour ${t.quoi} ${place}. Pour chacune : la validité de la qualification, les procédures collectives et les derniers comptes.</p>
</div></section>
<section class="block"><div class="wrap">
  ${entList(es, { travaux: false, hideT: t.slug })}
  ${devisBlock(t.quoi + " " + place)}
</div></section>`;
}

export function renderVerifier({ nat }) {
  return `<section class="band"><div class="wrap">
  <h1>Vérifier un artisan avant de signer</h1>
  <p class="lede">Cinq vérifications, dans l'ordre. Les quatre premières se font en une recherche sur ce site ; la dernière, en une question à l'artisan.</p>
  ${searchBox("q")}
</div></section>
<section class="block"><div class="wrap"><div class="prose">
  <h2>1. Les procédures collectives</h2>
  <p>Une entreprise en difficulté peut être placée par le tribunal en sauvegarde, en redressement ou en liquidation judiciaire. Chaque jugement est publié au Bulletin officiel des annonces civiles et commerciales (BODACC). Une entreprise en redressement peut continuer à travailler ; mais si elle disparaît, l'acompte versé devient une créance à déclarer, rarement remboursée en entier.</p>
  <p>Aujourd'hui, ${int(nat.proc_open)} entreprises de la liste RGE ont une procédure en cours d'après le BODACC.</p>
  <h2>2. L'entreprise est-elle active, et depuis quand&nbsp;?</h2>
  <p>Le répertoire Sirene de l'INSEE indique si l'entreprise est active, sa date de création, sa forme juridique et sa tranche d'effectif. Une entreprise très récente n'est pas suspecte en soi, mais elle n'a pas encore d'historique.</p>
  <h2>3. Les comptes</h2>
  <p>Les sociétés déposent leurs comptes au greffe ; les plus petites peuvent demander qu'ils restent confidentiels. Quand ils sont publiés, le résultat net et les capitaux propres donnent une idée de la solidité : des capitaux propres négatifs signifient que les dettes dépassent ce que possède l'entreprise. Les entrepreneurs individuels ne publient pas de comptes.</p>
  <h2>4. La qualification RGE</h2>
  <p>RGE signifie « Reconnu garant de l'environnement ». La mention est délivrée par un organisme de qualification (Qualibat, Qualit'EnR, Qualifelec…) pour un type de travaux précis et pour une durée limitée, en général quatre ans avec un contrôle de chantier. Elle conditionne la plupart des aides à la rénovation énergétique.</p>
  <ul><li>Vérifiez que l'entreprise figure sur la liste officielle, avec le même numéro SIRET que sur le devis.</li><li>Vérifiez que la qualification couvre vos travaux et qu'elle sera encore valide à la signature du devis.</li><li>Ouvrez le certificat : chaque fiche du site renvoie vers celui que l'organisme a publié.</li></ul>
  <h2>5. L'assurance décennale</h2>
  <p>Elle couvre pendant dix ans les dommages qui compromettent la solidité de l'ouvrage. Elle est obligatoire pour les travaux de construction, et le devis comme la facture doivent indiquer l'assureur et la zone couverte. Aucune base publique ne la recense : demandez l'attestation, et appelez l'assureur en cas de doute.</p>
  ${assuranceBlock()}
  <h2>Et l'acompte&nbsp;?</h2>
  <p>Aucun texte ne fixe de plafond général à l'acompte d'un chantier : c'est le devis signé qui fait foi. Après un démarchage à domicile ou un contrat signé hors de l'entreprise, vous disposez de 14 jours pour vous rétracter, et aucun paiement ne peut être exigé avant 7 jours. Une demande d'acompte élevée, surtout de la part d'une entreprise qui présente un point de vigilance, mérite une explication écrite.</p>
  ${devisBlock()}
  <p class="src">Pour un litige : la direction départementale de la protection des populations (DDPP) et le site signal.conso.gouv.fr. Pour les aides et un conseil gratuit : france-renov.gouv.fr.</p>
</div></div></section>`;
}

export function renderAbout({ contact, nat, meta }) {
  const DG = "https://www.data.gouv.fr/fr/datasets/";
  const SRC = [
    ["Qualifications", "ADEME", "Agence de la transition écologique", "La liste des entreprises RGE, transmise par les organismes de qualification, et l'historique des qualifications depuis 2014.", `Mise à jour du ${dateFr(meta.rge)}`, "https://data.ademe.fr/datasets/liste-des-entreprises-rge-2"],
    ["Procédures", "BODACC", "Direction de l'information légale et administrative", "Les jugements de sauvegarde, de redressement, de liquidation judiciaire et de clôture, publiés depuis 2008.", `Consulté le ${dateFr(meta.bodacc)}`, DG + "bodacc/"],
    ["Entreprises", "Sirene", "INSEE", "L'état de l'entreprise, sa date de création, sa forme juridique et sa tranche d'effectif.", esc(meta.sirene), DG + "base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/"],
    ["Comptes", "INPI", "Institut national de la propriété industrielle", "Les ratios financiers calculés sur les comptes annuels déposés et publiés.", `Consulté le ${dateFr(meta.ratios)}`, DG + "ratios-financiers-bce-inpi/"],
    ["Prix", "INSEE", "Institut national de la statistique et des études économiques", "Les indices de prix de production des matériaux et les index du bâtiment (BT), pour les articles « Prix des matériaux ».", "Publiés chaque mois", "https://www.insee.fr/fr/information/2868055"],
  ];
  const TOC = [["pourquoi", "Pourquoi ce site"], ["sources", "D'où viennent les données"], ["verifications", "Les quatre vérifications"], ["limites", "Ce que le site ne dit pas"], ["engagements", "Nos engagements"], ["erreur", "Signaler une erreur"]];
  return `<section class="band"><div class="wrap"><h1>À propos d'Artisan Arena</h1><p class="lede">Pourquoi ce site, d'où viennent les données et comment les vérifications sont faites.</p></div></section>
<section class="block"><div class="wrap doc">
  <aside><nav class="toc" aria-label="Sur cette page"><b>Sur cette page</b>${TOC.map((t) => `<a href="#${t[0]}">${t[1]}</a>`).join("")}</nav></aside>
  <article class="doc-main">
    <section id="pourquoi"><h2>Pourquoi ce site</h2>
      <p>Avant de verser un acompte, on vérifie presque jamais si l'artisan fait l'objet d'une procédure collective, depuis quand il existe ou ce que disent ses comptes. Ces informations sont publiques, mais sur des sites différents, sous des numéros différents.</p>
      <p>Artisan Arena les réunit pour tous les artisans du bâtiment : sur une fiche permanente pour les ${int(nat.n)} entreprises suivies chaque semaine (celles de la liste RGE), et à la demande, lues en direct auprès des services publics, pour toutes les autres. Le site fait partie de la famille Arena, avec EHPAD Arena, Argile Arena, Eau Arena et Scol Arena.</p></section>
    <section id="sources"><h2>D'où viennent les données</h2>
      <ul class="srcs">${SRC.map((x) => `<li><span class="s-k">${x[0]}</span><div><b>${x[1]}</b> <small>${x[2]}</small><p>${x[3]}</p><p>${x[4]} · <a href="${x[5]}" target="_blank" rel="noopener">voir les données ↗</a></p></div></li>`).join("")}</ul>
      <p class="src">Données publiques réutilisées sous Licence Ouverte. Le site est recalculé chaque semaine ; dernier calcul le ${dateFr(meta.built)}.</p></section>
    <section id="verifications"><h2>Les quatre vérifications</h2>
      <p>Chaque vérification est verte, orange (point de vigilance), rouge (alerte) ou grise (pas de donnée).</p>
      <ul>
        <li><b>Procédures collectives</b> : rouge si une sauvegarde, un redressement ou une liquidation judiciaire est en cours ; orange si un plan est en cours d'exécution ou si une procédure passée a été clôturée. Nous suivons les jugements publiés dans l'ordre : ouverture, plan, conversion, clôture.</li>
        <li><b>Entreprise</b> : rouge si elle est cessée au répertoire Sirene ; orange si elle a été créée il y a moins de deux ans.</li>
        <li><b>Comptes</b> : orange si le dernier exercice publié, clos il y a moins de 30 mois, montre une perte ou des capitaux propres négatifs ; gris si les comptes sont confidentiels, anciens ou absents.</li>
        <li><b>Qualification RGE</b> : orange si toutes les qualifications de l'entreprise expirent dans moins de 90 jours.</li>
      </ul>
      <p>Les listes sont classées ainsi : d'abord les entreprises sans point de vigilance, puis par ancienneté de la qualification RGE.</p></section>
    <section id="limites"><h2>Ce que le site ne dit pas</h2>
      <ul>
        <li>La qualité du travail : aucune base publique ne la mesure. Demandez des références de chantiers.</li>
        <li>L'assurance décennale : aucune base publique ne la recense. Demandez l'attestation.</li>
        <li>Les difficultés non publiées : une entreprise peut être en difficulté sans procédure collective. Un point vert n'est pas une garantie.</li>
        <li>Les artisans hors liste RGE n'ont pas de fiche permanente : leur vérification se fait à la demande, en direct, sur la page <a href="/artisan/">Vérifier un artisan</a>.</li>
      </ul></section>
    <section id="engagements"><h2>Nos engagements</h2>
      <ul>
        <li>Gratuit et sans inscription.</li>
        <li>Indépendant : aucune entreprise ne peut payer pour être mise en avant, modifier sa fiche ou effacer une procédure publiée.</li>
        <li>Sans cookie.</li>
        <li>Les pages des entrepreneurs individuels qui ont demandé à ne pas diffuser leurs informations au répertoire Sirene ne sont pas proposées aux moteurs de recherche.</li>
      </ul></section>
    <section id="erreur"><h2>Signaler une erreur</h2>
      <p>Écrivez-nous en précisant le numéro SIREN. Nous comparons avec la source officielle et corrigeons sous quelques jours. Si l'erreur vient de la source (une qualification, un jugement, une adresse), nous vous indiquons à qui vous adresser : l'organisme de qualification, le greffe du tribunal ou l'INSEE.</p>
      <p><a class="btn" href="mailto:${esc(contact)}?subject=${encodeURIComponent("Erreur sur une fiche Artisan Arena")}">Écrire à ${esc(contact)}</a></p></section>
  </article>
</div></section>`;
}

// ---------- titres et descriptions ----------
export function seo(kind, a = {}) {
  const y = new Date().getFullYear();
  if (kind === "home") return { title: "Artisan Arena : cet artisan est-il solide ?", desc: "Procédures collectives au BODACC, ancienneté, comptes publiés et qualification RGE de chaque entreprise RGE de France, avant de verser un acompte. Gratuit, sans inscription." };
  if (kind === "commune") return { title: `Artisans RGE ${inCity(a.c)} : les ${a.c.n} entreprises vérifiées (${y})`, desc: `Les ${a.c.n} ${plural(a.c.n, "entreprise")} RGE ${inCity(a.c)} : qualification en cours, procédures collectives, ancienneté et comptes publiés.` };
  if (kind === "dep") return { title: `Artisans RGE ${inDep(a.d)} : ${a.d.n} entreprises vérifiées (${y})`, desc: `Les ${a.d.n} entreprises RGE ${inDep(a.d)}, par type de travaux et par commune : qualification, procédures collectives et comptes.` };
  if (kind === "travaux") return { title: `${a.t.titre} : la liste vérifiée par département`, desc: `${a.n} entreprises qualifiées RGE pour ${a.t.quoi}, département par département, avec leurs procédures collectives et leurs comptes.` };
  if (kind === "travauxDep") return { title: `${a.t.label} : artisans RGE ${inDep(a.d)} (${a.n})`, desc: `Les ${a.n} ${plural(a.n, "entreprise")} RGE pour ${a.t.quoi} ${inDep(a.d)} : validité de la qualification, procédures collectives et comptes.` };
  if (kind === "fiche") {
    const e = a.e;
    const st = e.k_proc === "bad" ? PROC[e.proc].toLowerCase() : e.v ? "points de vigilance" : "aucune procédure";
    return { title: `${e.nom}${e.ville ? ` (${villeOf(e)})` : ""} : procédures, comptes, RGE`, desc: `${e.nom}, SIREN ${e.id} : ${st} ; RGE ${noEnd(e.fin) ? "sans échéance" : `jusqu'au ${dateFr(e.fin)}`} pour ${e.t.slice(0, 3).map((t) => T[t].label.toLowerCase()).join(", ")}. Vérifications avant de signer un devis.` };
  }
  return { title: a.title, desc: a.desc };
}
