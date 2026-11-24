# Artisan Arena

« Juste le bon artisan près de chez vous. » Une barre de recherche sur tous les artisans du bâtiment, d'après l'annuaire officiel des entreprises, et une fiche par artisan avec son ancienneté, ses procédures collectives, ses comptes et sa qualification RGE. Tout est lu en direct, depuis le navigateur du visiteur, auprès de services publics gratuits et sans clé : le site lui-même ne contient que quelques pages statiques.

## Commandes

```
npm run dev     → écrit public/data/lieux.json puis lance Astro en local
npm run test    → vérifie le découpage des recherches (scripts/test_parse.mjs)
npm run build   → lieux.json, test de la recherche, astro build, robots.txt (scripts/postbuild.mjs)
```

Astro 7 demande Node 22 ou plus. Le verrou npm a été fait sous Linux : sur Mac, ajouter les modules natifs `darwin-arm64` d'Astro, rolldown, lightningcss et satteri avec `npm i --no-save`.

## Comment marche la recherche

`src/lib/parse.js` découpe la phrase tapée en métier, lieu et nom : « Martin couvreur Saint-Flour » donne le nom « martin », le métier couverture (codes NAF 43.91B) et la commune de Saint-Flour. Les métiers et leurs mots sont dans `src/lib/metiers.js`, les communes et départements dans `public/data/lieux.json` (écrit à chaque construction par `scripts/communes.mjs`, à partir de `@etalab/decoupage-administratif`).

Puis `src/scripts/search.js` interroge l'annuaire (recherche-entreprises.api.gouv.fr) :

- **un lieu, sans nom** : recherche géographique (`/near_point`) autour du centre de la commune (geo.api.gouv.fr) ou de la position du visiteur, 10 km par défaut ; jusqu'à 8 pages de 25, triées par distance dans le navigateur (l'annuaire ne les trie pas). Le filtre RGE est appliqué dans le navigateur, l'annuaire ne l'acceptant pas en recherche géographique ;
- **un nom** : recherche par nom (`/search`), filtrée par métier (sinon tout le bâtiment, section F), par département et par RGE.

Un mot seul qui est aussi une commune de moins de 10 000 habitants (« Lavergne ») est cherché comme un nom, avec un lien pour basculer sur la commune ; avec un métier, il est lu comme une commune, avec un lien pour le chercher comme un nom. Les procédures collectives des entreprises affichées sont demandées au BODACC en une seule requête par page de résultats.

Pour ajouter un métier ou un synonyme : `src/lib/metiers.js`, puis un cas dans `scripts/test_parse.mjs` (la construction échoue si un cas ne passe plus).

## La fiche d'un artisan

`/artisan/?siren=123456789` (`src/scripts/fiche-page.js`) lit en direct :

- l'Annuaire des entreprises : identité, adresse, activité, création, état ;
- le BODACC (bodacc-datadila.opendatasoft.com) : procédures collectives ;
- l'INPI, ratios financiers (data.economie.gouv.fr) : comptes ;
- l'ADEME, historique RGE depuis 2014 (facultatif : la fiche s'affiche sans).

Les règles des vérifications et la mise en page sont dans `src/lib/fiche.js`. Les pages de recherche et les fiches sont fermées aux moteurs de recherche.

## Où modifier quoi

| Fichier | Rôle |
| --- | --- |
| `src/pages/index.astro` | Accueil : slogan, barre de recherche, exemples. |
| `src/lib/metiers.js` | Métiers reconnus, leurs mots et leurs codes NAF. |
| `src/lib/parse.js` | Découpage de la phrase tapée (métier, commune, code postal, département, nom). |
| `src/scripts/search.js` | Page `/recherche/` : requêtes à l'annuaire, liste, étiquettes, filtres. |
| `src/lib/fiche.js` | Règles et textes des vérifications, mise en page de la fiche. |
| `src/scripts/fiche-page.js` | Page `/artisan/` : requêtes aux services publics. |
| `src/lib/referentiels.json` | Mots et sigles pour remettre en forme les noms, formes juridiques, tranches d'effectif, intitulés d'activité. |
| `src/lib/partenaires.js` | Encarts d'affiliation, éteints par défaut : demande de devis (fiche, guide), assurance des travaux (guide). `PUB_APERCU=1 npm run build` montre les emplacements vides. |
| `src/lib/site.js` | Adresse du site, ouverture à Google, contact, mesure d'audience. |
| `src/styles/site.css` | Tout le style, variables de couleur en tête (« Outremer et soleil »). |
| `src/layouts/Base.astro` | En-tête (avec la barre de recherche compacte hors accueil), pied de page, balises de référencement. |

## Publication (GitHub Pages)

`.github/workflows/deploy.yml` construit et publie à chaque envoi sur `main` et à la demande. Pas de reconstruction programmée : les données sont lues en direct.

Variables du dépôt (Settings › Secrets and variables › Actions › Variables) :

- `SITE_URL` : `https://artisanarena.fr` par défaut.
- `NOINDEX` : `1` par défaut, le site reste fermé à Google ; mettre `0` après relecture.
- `CF_BEACON` : jeton Cloudflare Web Analytics (sans cookie), facultatif. La mesure n'est chargée que si le site est ouvert à Google.

Réglages : Settings › Pages › Source : « GitHub Actions », domaine personnalisé `artisanarena.fr`, « Enforce HTTPS ». DNS chez Cloudflare (en DNS uniquement) : quatre A vers 185.199.108.153 à 185.199.111.153 et un CNAME `www` vers `diallo2369.github.io`.
