// Mise en forme des nombres, des dates et des lieux, partagée par toutes les pages.
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nb = (s) => s.replace(/[   ]/g, " ");
export const int = (v) => nb(Math.round(v).toLocaleString("fr-FR"));
export const pct = (v) => nb(v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })) + " %";
// Montants : « 1,2 M€ », « 450 k€ » au-delà de 100 000 €, sinon à l'euro près
export function eur(v) {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e6) return s + nb((a / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })) + " M€";
  if (a >= 1e5) return s + nb(Math.round(a / 1e3).toLocaleString("fr-FR")) + " k€";
  return s + int(a) + " €";
}
export const plural = (n, s, p = s + "s") => (n > 1 ? p : s);
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const dateFr = (s) => { if (!s) return ""; const [y, m, d] = s.split("-").map(Number); return `${d === 1 ? "1er" : d} ${MONTHS[m - 1]} ${y}`; };
export const monthFr = (s) => { if (!s) return ""; const [y, m] = s.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
export const year = (s) => (s ? s.slice(0, 4) : "");

// « dans le Cantal », « en Ille-et-Vilaine », « à Paris »
const A_DEPS = new Set(["75", "974", "976", "975", "977", "978"]);
export function inDep(d) {
  if (A_DEPS.has(d.code)) return "à " + d.nom;
  return ({ 2: "dans le ", 4: "dans les ", 5: "dans l'" }[d.tl] ?? "en ") + d.nom;
}
// « à Aurillac », « dans le 15e arrondissement de Paris »
export function inCity(c) {
  const m = c.nom.match(/^(Paris|Lyon|Marseille) (\d+)(e|er)$/);
  return m ? `dans le ${m[2]}${m[3]} arrondissement de ${m[1]}` : "à " + c.nom;
}

export const ficheUrl = (e) => `/entreprise/${e.slug}/`;
export const communeUrl = (c) => `/artisans-rge/${c.slug}/`;
export const depUrl = (d) => `/departement/${d.slug}/`;
export const travauxUrl = (t, d) => (d ? `/travaux/${t}/${d.slug}/` : `/travaux/${t}/`);
