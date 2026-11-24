// Mise en forme des nombres et des dates, partagée par toutes les pages.
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
export const year = (s) => (s ? s.slice(0, 4) : "");

