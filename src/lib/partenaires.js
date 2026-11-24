// Encarts partenaires (affiliation) : tous les emplacements du site se règlent ici.
// Un encart n'apparaît que si enabled est vrai et url remplie. Pour lancer un partenaire :
//   1. enabled: true, partner : le nom affiché tel quel, url : le lien de suivi fourni par le programme ;
//   2. vérifier les mentions légales et la page Confidentialité (elles listent les partenaires actifs automatiquement).
// Règles : toujours marqué « Lien partenaire », lien rel="sponsored", aucune influence sur les vérifications ni sur l'ordre
// des entreprises, et pas de script ni de bannière d'une régie : un simple lien, pour garder la promesse « aucun cookie ».
// Aperçu : PUB_APERCU=1 npm run build affiche les emplacements vides en pointillé, pour juger de leur place.
import { esc } from "./fmt.js";

export const PARTENAIRES = {
  // Demande de devis (rémunéré au contact transmis) : fiches et guide « Avant de signer »
  devis: { enabled: false, partner: "", url: "" },
  // Assurance des travaux (dommages-ouvrage, protection juridique) : guide « Avant de signer », après l'assurance décennale
  assurance: { enabled: false, partner: "", url: "" },
};

const APERCU = process.env.PUB_APERCU === "1";
const on = (p) => p && p.enabled && p.url;

// Partenaires actifs, pour les mentions légales et la page Confidentialité
export function actifs() {
  const l = [];
  if (on(PARTENAIRES.devis)) l.push([PARTENAIRES.devis.partner, "les demandes de devis transmises"]);
  if (on(PARTENAIRES.assurance)) l.push([PARTENAIRES.assurance.partner, "les souscriptions d'assurance"]);
  return l.filter((x, i) => l.findIndex((y) => y[0] === x[0] && y[1] === x[1]) === i);
}

function encart(p, { titre, texte, bouton, emplacement }) {
  if (on(p)) return `<aside class="card devis" aria-label="Lien partenaire"><span class="ad-l">Lien partenaire</span>
    <div><b>${titre}</b><p>${texte}</p></div>
    <a class="btn" href="${esc(p.url)}" target="_blank" rel="sponsored noopener">${bouton}</a></aside>`;
  if (APERCU) return `<aside class="card devis apercu" aria-label="Emplacement partenaire"><span class="ad-l">Emplacement partenaire</span>
    <div><b>${titre}</b><p>${emplacement}. Éteint : réglage dans src/lib/partenaires.js.</p></div><span class="btn">${bouton}</span></aside>`;
  return "";
}

export function devisBlock(what = "vos travaux") {
  const p = PARTENAIRES.devis;
  return encart(p, {
    titre: `Comparer plusieurs devis pour ${what}`,
    texte: `Décrivez votre projet sur ${esc(p.partner)} : des artisans de votre secteur vous recontactent. Vérifiez ensuite chacun d'eux ici avant de signer.`,
    bouton: "Demander des devis", emplacement: "Demande de devis",
  });
}

export function assuranceBlock() {
  const p = PARTENAIRES.assurance;
  return encart(p, {
    titre: "Assurer vos travaux",
    texte: `Assurance dommages-ouvrage, protection juridique en cas de litige avec l'artisan : comparez les offres sur ${esc(p.partner)}.`,
    bouton: "Comparer les assurances", emplacement: "Assurance des travaux",
  });
}
