// Bloque la construction si les données sont manifestement fausses ou incomplètes.
import fs from "node:fs";

const fail = (m) => { console.error("Données refusées : " + m); process.exit(1); };
if (!fs.existsSync("data/build/site.json")) fail("lancez d'abord npm run data:prepare");
const s = JSON.parse(fs.readFileSync("data/build/site.json", "utf-8"));
const E = Object.values(s.ent);
const n = (f) => E.filter(f).length;

if (E.length < 40000) fail(`seulement ${E.length} entreprises RGE (attendu : plus de 40 000)`);
if (n((e) => e.si) < E.length * 0.97) fail(`${E.length - n((e) => e.si)} entreprises absentes de Sirene (fichier Sirene manquant ?)`);
if (n((e) => e.since) < E.length * 0.95) fail("historique RGE manquant pour plus de 5 % des entreprises");
if (n((e) => e.bod.length) < 1000) fail(`seulement ${n((e) => e.bod.length)} entreprises avec un jugement au BODACC (téléchargement incomplet ?)`);
if (n((e) => e.cpt.length) < 10000) fail(`seulement ${n((e) => e.cpt.length)} entreprises avec des comptes (téléchargement incomplet ?)`);
if (s.meta.unknownLoc > 600) fail(`${s.meta.unknownLoc} établissements sans commune reconnue`);
const slugs = new Set();
for (const e of E) {
  if (!/^\d{9}$/.test(e.id)) fail(`SIREN invalide : ${e.id}`);
  if (/[�]|Ã/.test(e.nom + e.est.map((x) => x.adr).join(""))) fail(`texte mal encodé : ${e.nom}`);
  if (!e.slug || slugs.has(e.slug)) fail(`adresse en double ou vide : ${e.slug}`);
  slugs.add(e.slug);
  if (!e.q.length || !e.t.length) fail(`entreprise sans qualification ni travaux : ${e.nom}`);
  if (!e.fin || e.fin < s.meta.built) fail(`qualification expirée gardée : ${e.nom} ${e.fin}`);
  for (const k of ["k_rge", "k_proc", "k_ent", "k_cpt"]) if (!["ok", "warn", "bad", "na"].includes(e[k])) fail(`vérification ${k} invalide : ${e.nom}`);
}
for (const c of Object.values(s.communes)) if (!c.slug || !c.n) fail(`commune vide : ${c.nom}`);
// Les grandes villes doivent être là
for (const code of ["75056", "13055", "69123", "31555", "06088", "44109", "35238", "15014"]) if (!s.communes[code]?.n) fail(`grande ville sans entreprise RGE : ${code}`);
if (s.nat.proc_open > E.length * 0.05) fail(`trop de procédures en cours (${s.nat.proc_open}) : classement des jugements à revoir`);
console.log(`Données OK : ${E.length} entreprises, ${s.nat.nest} établissements, ${s.nat.proc_ever} avec un jugement, ${s.nat.proc_open} en cours, ${Object.keys(s.communes).length} communes.`);
