// Demande de devis (affiliation) : tout se règle ici. Éteint tant que le programme n'est pas signé.
// Le jour du lancement :
//   1. enabled: true, url : le lien de suivi fourni par la plateforme (Travaux.com ou autre) ;
//   2. partner : le nom affiché, tel quel ;
//   3. compléter les mentions légales (lien commercial) et la page Confidentialité si la plateforme dépose un cookie.
// Le bloc est toujours marqué « Lien partenaire » et n'influence jamais l'ordre des entreprises.
export const DEVIS = { enabled: false, partner: "", url: "" };

export function devisBlock(what = "vos travaux") {
  if (!DEVIS.enabled || !DEVIS.url) return "";
  return `<aside class="card devis" aria-label="Lien partenaire"><span class="ad-l">Lien partenaire</span>
    <div><b>Comparer plusieurs devis pour ${what}</b><p>Décrivez votre projet sur ${DEVIS.partner} : des artisans de votre secteur vous recontactent. Vérifiez ensuite chacun d'eux ici avant de signer.</p></div>
    <a class="btn" href="${DEVIS.url}" target="_blank" rel="sponsored noopener">Demander des devis</a></aside>`;
}
