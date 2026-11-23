// Comportements du navigateur : menu, recherche, filtres et tri des listes, filtre des départements.
// Les pages sont déjà complètes en HTML ; ce script n'ajoute que l'interactivité.
import { entSlug, artisanUrl, artisanSearchUrl } from "../lib/fmt.js";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-'’.&]/g, " ").replace(/\s+/g, " ").trim();

const cache = {};
const getJSON = (u) => (cache[u] ||= fetch(u).then((r) => { if (!r.ok) throw r; return r.json(); }).catch((e) => { delete cache[u]; throw e; }));

// ---------- menu mobile ----------
const menu = $("#menu"), burger = $("#burger");
const setMenu = (o) => { menu.hidden = !o; burger.setAttribute("aria-expanded", String(o)); burger.setAttribute("aria-label", o ? "Fermer le menu" : "Ouvrir le menu"); burger.classList.toggle("open", o); };
burger.addEventListener("click", () => setMenu(menu.hidden));
menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });

// ---------- fenêtre de recherche (même modèle que les autres sites Arena) ----------
const SEARCH_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const sov = document.createElement("div");
sov.className = "sov"; sov.id = "sov"; sov.hidden = true;
sov.innerHTML = `<div class="sov-box" role="dialog" aria-modal="true" aria-labelledby="sov-t"><div class="sov-head"><p class="sov-t" id="sov-t">Quel artisan ?</p><button type="button" class="sov-x" id="sovX">Fermer</button></div><form class="search" role="search" action="/" data-search>${SEARCH_SVG}<input id="q2" type="search" autocomplete="off" enterkeyhint="search" placeholder="Nom, SIRET ou commune" aria-label="Nom de l'entreprise, numéro SIRET ou commune" role="combobox" aria-expanded="false" aria-controls="q2-s" aria-autocomplete="list"><div id="q2-s" class="sugg" role="listbox" hidden></div></form><p class="sov-hint">Un nom ou un numéro SIRET ouvre la vérification de l'entreprise ; une commune ouvre la liste de ses artisans.</p></div>`;
document.body.append(sov);
const homeForm = $("#q")?.closest("form");
let lastFocus = null;
const openSearch = () => { lastFocus = document.activeElement; setMenu(false); sov.hidden = false; document.body.classList.add("noscroll"); const q = $("#q2"); q.value = ""; q.dispatchEvent(new Event("input")); setTimeout(() => q.focus(), 30); index().catch(() => {}); };
const closeSearch = () => { sov.hidden = true; document.body.classList.remove("noscroll"); (lastFocus?.isConnected ? lastFocus : $("#findBtn")).focus(); };
$("#findBtn").addEventListener("click", openSearch);
$("#menuFind").addEventListener("click", openSearch);
$("#sovX").addEventListener("click", closeSearch);
sov.addEventListener("click", (e) => { if (e.target === sov) closeSearch(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !sov.hidden) closeSearch();
  else if (e.key === "/" && sov.hidden && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); openSearch(); }
});
// bouton flottant (mobile) : masqué tant que la recherche de la page d'accueil est à l'écran ou plus bas
const fab = document.createElement("button");
fab.type = "button"; fab.id = "fab";
fab.innerHTML = `${SEARCH_SVG}Vérifier un artisan`;
fab.addEventListener("click", openSearch);
document.body.append(fab);
if (homeForm && "IntersectionObserver" in window) { fab.classList.add("off"); new IntersectionObserver((es) => es.forEach((en) => fab.classList.toggle("off", en.isIntersecting || en.boundingClientRect.top > 0))).observe(homeForm); }


// ---------- index de recherche (chargé à la première frappe) ----------
let IDX = null;
async function index() {
  if (IDX) return IDX;
  const j = await getJSON("/data/search.json");
  IDX = {
    c: j.c.map((x) => ({ nom: x[0], dep: x[1], n: x[2], url: x[3] ? `/artisans-rge/${x[3]}/` : `/departement/${j.d[x[1]][1]}/`, k: norm(x[0]) })),
    e: j.e.map((x) => ({ nom: x[0], ville: x[1], siren: x[2], url: `/entreprise/${entSlug(x[0], x[1], x[2])}/`, k: norm(x[0]) })),
  };
  return IDX;
}
function match(q, I) {
  const digits = q.replace(/\s/g, "");
  if (/^\d{9,14}$/.test(digits)) { // SIREN ou SIRET : les 9 premiers chiffres désignent l'entreprise
    const s = digits.slice(0, 9);
    const f = I.e.filter((e) => e.siren === s).map((e) => ({ t: "e", ...e }));
    // pas de fiche : vérification en direct, pour tout artisan
    return f.length ? f : [{ t: "v", nom: `Vérifier l'entreprise ${s.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")}`, url: artisanUrl(s) }];
  }
  const n = norm(q);
  if (!n) return [];
  const cs = [], es = [];
  for (const c of I.c) { if (c.k.startsWith(n) || c.k.includes(" " + n)) { cs.push({ t: "c", ...c }); if (cs.length >= 4) break; } }
  if (n.length >= 2) {
    for (const e of I.e) { if (e.k.startsWith(n)) { es.push({ t: "e", ...e }); if (es.length >= 6) break; } }
    if (es.length < 6 && n.length >= 3) for (const e of I.e) { if (!e.k.startsWith(n) && e.k.includes(n)) { es.push({ t: "e", ...e }); if (es.length >= 6) break; } }
  }
  const all = n.length >= 2 ? [{ t: "q", nom: `Chercher « ${q.trim()} » parmi tous les artisans`, url: artisanSearchUrl(q.trim()) }] : [];
  return cs.slice(0, es.length ? 3 : 6).concat(es, all);
}
function wireSearch(form) {
  const input = $("input", form), box = $(".sugg", form);
  let items = [], cur = -1;
  const draw = () => {
    box.hidden = !items.length && !input.value.trim();
    input.setAttribute("aria-expanded", String(!box.hidden));
    box.innerHTML = items.length ? items.map((it, i) => `<a role="option" id="${input.id}-o${i}" href="${it.url}" class="${i === cur ? "cur" : ""}" aria-selected="${i === cur}"><span><b>${esc(it.nom)}</b> ${it.t === "c" ? `(${it.dep})` : it.t === "e" ? `· ${esc(it.ville)}` : ""}</span><small>${it.t === "c" ? (it.n ? `${it.n} entreprise${it.n > 1 ? "s" : ""}` : "Voir le département") : it.t === "e" ? "Fiche complète" : "En direct, services publics"}</small></a>`).join("")
      : input.value.trim() ? `<p class="none">${/^\d[\d\s]*$/.test(input.value.trim()) ? "Un numéro SIREN a 9 chiffres, un SIRET 14." : "Aucune commune ni entreprise trouvée."}</p>` : "";
    input.setAttribute("aria-activedescendant", cur >= 0 ? `${input.id}-o${cur}` : "");
  };
  input.addEventListener("focus", () => index().catch(() => {}));
  input.addEventListener("input", async () => {
    try { const I = await index(); items = match(input.value, I); cur = items.length ? 0 : -1; draw(); }
    catch { box.hidden = false; box.innerHTML = '<p class="none">La recherche est indisponible. Réessayez dans un instant.</p>'; }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && items.length) { cur = (cur + 1) % items.length; draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp" && items.length) { cur = (cur - 1 + items.length) % items.length; draw(); e.preventDefault(); }
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); const v = input.value.trim(); if (items[cur]) location.href = items[cur].url; else if (v.length >= 2) location.href = artisanSearchUrl(v); });
  document.addEventListener("click", (e) => { if (!form.contains(e.target)) { box.hidden = true; input.setAttribute("aria-expanded", "false"); } });
}
$$("[data-search]").forEach(wireSearch);

// ---------- listes : filtre par travaux, sans point de vigilance, tri ----------
$$("[data-list]").forEach((wrap) => {
  const ul = $("ul.list", wrap);
  const rows = $$("li.row", ul);
  const more = $(".list-more", wrap);
  const STEP = 60;
  let dom = "", clean = false, ordre = "def", shown = STEP;
  function apply() {
    const l = rows.filter((r) => (!dom || r.dataset.t.split(" ").includes(dom)) && (!clean || r.dataset.v === "0"));
    const by = { def: (a, b) => +a.dataset.i - +b.dataset.i, rge: (a, b) => a.dataset.rge.localeCompare(b.dataset.rge) || +a.dataset.i - +b.dataset.i,
      cre: (a, b) => (a.dataset.cre || "9").localeCompare(b.dataset.cre || "9") || +a.dataset.i - +b.dataset.i, nom: (a, b) => a.dataset.nom.localeCompare(b.dataset.nom, "fr") };
    l.sort(by[ordre]);
    rows.forEach((r) => (r.hidden = true));
    l.forEach((r, i) => { r.hidden = i >= shown; ul.append(r); });
    if (more) { more.hidden = l.length <= shown; $("b", more).textContent = l.length - shown; }
    const c = $("[data-count]", wrap); if (c) c.textContent = l.length;
    const none = $(".empty", wrap); if (none) none.hidden = l.length > 0;
  }
  const ds = $("[data-dom]", wrap); // liste déroulante des travaux
  if (ds) ds.addEventListener("change", () => { dom = ds.value; shown = STEP; apply(); });
  const cb = $("[data-clean]", wrap);
  if (cb) cb.addEventListener("click", () => { clean = !clean; shown = STEP; cb.setAttribute("aria-pressed", String(clean)); apply(); });
  const s = $("[data-sort]", wrap);
  if (s) s.addEventListener("change", () => { ordre = s.value; apply(); });
  if (more) $("button", more).addEventListener("click", () => { shown += STEP * 4; apply(); });
  // au retour sur la page, le navigateur peut avoir gardé les choix des listes déroulantes
  if (ds) dom = ds.value;
  if (s) ordre = s.value;
  apply();
});

// ---------- accueil : départements par région, repliés sur mobile, filtre par nom ou numéro ----------
{
  const f = $("[data-depfilter]");
  if (f) {
    const regs = $$(".reg");
    const none = $(".dep-none");
    if (matchMedia("(max-width:720px)").matches) regs.forEach((r) => r.removeAttribute("open"));
    const initial = regs.map((r) => r.open);
    f.addEventListener("input", () => {
      const q = norm(f.value);
      let any = false;
      regs.forEach((r, i) => {
        let hit = 0;
        $$("li", r).forEach((li) => {
          const ok = !q || norm(li.dataset.q).split(" ").some((w, k, a) => a.slice(k).join(" ").startsWith(q));
          li.hidden = !ok;
          if (ok) hit++;
        });
        r.hidden = !hit;
        r.open = q ? hit > 0 : initial[i];
        if (hit) any = true;
      });
      none.hidden = any;
    });
  }
}
