# Artisan Arena

« Cet artisan est-il solide ? » Site statique : une fiche permanente par entreprise RGE (SIREN), pour le référencement, et une vérification à la demande pour tous les autres artisans (page `/artisan/`, données lues en direct). Quatre vérifications : procédures collectives, état de l'entreprise, comptes, qualification RGE, des pages par commune, par département et par type de travaux.

## Chaîne de données

```
npm run data:fetch    → scripts/fetch_data.py    télécharge dans data/raw/ (hors dépôt)
npm run data:prepare  → scripts/prepare_data.py  produit data/build/site.json et public/data/search.json
                        scripts/prix_snapshots.py fige les chiffres du mois dans data/prix/AAAA-MM.json
npm run build         → scripts/ensure_data.mjs (sans data/build/site.json : crée .venv avec pyarrow, télécharge et prépare tout),
                        scripts/check_data.mjs (bloque si les volumes sont anormaux), scripts/check_live.mjs (règles JavaScript = règles Python),
                        astro build, scripts/postbuild.mjs
```

Pour relancer une seule étape du téléchargement : `python3 scripts/fetch_data.py bodacc ratios` (étapes : `rge`, `hist`, `sirene`, `bodacc`, `ratios`, `prix`). Si un service est indisponible, le fichier de la publication précédente est conservé.

Pour une construction rapide en local : `LIMIT_PAGES=200 npm run build` (200 communes, 800 fiches).

Sources (toutes publiques, Licence Ouverte) :

| Donnée | Source | Usage |
| --- | --- | --- |
| Entreprises RGE | ADEME, « Liste des entreprises RGE - New » (data-fair, `eo1n335dwa-ul7glxa7lm1ho`) | fiches, qualifications, domaines, coordonnées |
| Historique RGE | ADEME, « Historique des entreprises RGE depuis 2014 » (`historique-rge`), agrégé par SIRET | « RGE depuis » |
| Entreprises | INSEE, base Sirene, fichier StockUniteLegale (parquet, data.gouv.fr) | état, création, forme juridique, effectif |
| Procédures collectives | DILA, BODACC (`annonces-commerciales`, famille `collective`), par lots de SIREN | vérification « procédures » |
| Comptes | INPI / BCE, « Ratios financiers » (data.economie.gouv.fr), par lots de SIREN | vérification « comptes » |
| Prix des matériaux | INSEE, indices de prix de production de l'industrie (IPPI) et index du bâtiment (BT), service SDMX de la BDM | articles mensuels « Prix des matériaux », encadré des pages travaux |
| Communes | `@etalab/decoupage-administratif` | rattachement des établissements, pages communes |

## Où modifier quoi

| Fichier | Rôle |
| --- | --- |
| `src/lib/core.js` | Les pages en fonctions qui renvoient du HTML : accueil, commune, département, travaux, « Avant de signer », à propos. Titres et descriptions. |
| `src/lib/fiche.js` | La fiche d'une entreprise et les textes des quatre vérifications, partagés entre les fiches construites et la page `/artisan/` (navigateur). Contient aussi la version JavaScript des règles de `prepare_data.py` pour les artisans lus en direct. |
| `src/lib/referentiels.json` | Mots et sigles pour remettre en forme les noms, formes juridiques, tranches d'effectif, intitulés d'activité : lus par le Python et par le navigateur. |
| `src/scripts/live.js` | Page `/artisan/` : interroge l'Annuaire des entreprises, le BODACC et l'INPI depuis le navigateur ; redirige vers la fiche complète si l'entreprise en a une. |
| `src/lib/travaux.json` | Les familles de travaux et les domaines RGE de l'ADEME qu'elles regroupent (lu aussi par la préparation des données). |
| `scripts/prepare_data.py` | Regroupement par SIREN, rattachement aux communes, règles des quatre vérifications, lecture des jugements du BODACC. |
| `src/lib/prix.json` | Séries INSEE suivies (matériaux par famille, index BT par métier), index affiché sur chaque page travaux, premier mois des articles. |
| `src/lib/prix.js` | Articles « Prix des matériaux » : calcul des variations, règles d'écriture des titres et des textes, page de la rubrique. |
| `src/lib/partenaires.js` | Tous les encarts d'affiliation, éteints par défaut : demande de devis (fiches, listes, accueil, guide, prix), vente de matériaux par famille (articles de prix), assurance des travaux (guide). `PUB_APERCU=1 npm run build` montre les emplacements vides. |
| `src/lib/site.js` | Adresse du site, ouverture à Google, contact, mesure d'audience. |
| `src/scripts/app.js` | Menu, recherche (nom, SIREN, SIRET, commune), filtres et tri des listes. |
| `src/styles/site.css` | Tout le style, variables de couleur en tête. |
| `src/layouts/Base.astro` | En-tête, recherche plein écran, famille Arena, pied de page, balises de référencement. |

## Publication (GitHub Pages)

`.github/workflows/deploy.yml` construit et publie à chaque envoi sur `main`, chaque lundi à 5 h 37 UTC et à la demande.

Variables du dépôt (Settings › Secrets and variables › Actions › Variables) :

- `SITE_URL` : `https://artisanarena.fr` par défaut.
- `NOINDEX` : `1` par défaut, le site reste fermé à Google ; mettre `0` après relecture.
- `CF_BEACON` : jeton Cloudflare Web Analytics (sans cookie), facultatif.

Réglages : Settings › Pages › Source : « GitHub Actions ». Domaine personnalisé, puis « Enforce HTTPS ». DNS : quatre enregistrements A vers 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153 et un CNAME `www` vers `<compte>.github.io`.

## Artisans sans fiche (vérification à la demande)

Les fiches pré-générées ne concernent que les entreprises de la liste RGE (56 000 pages, pour le référencement). Pour tous les autres artisans, la recherche propose « Vérifier l'entreprise » (numéro SIREN ou SIRET) ou « Chercher parmi tous les artisans » (nom) : la page `/artisan/?siren=…` ou `/artisan/?q=…` interroge en direct, depuis le navigateur du visiteur, trois services publics gratuits et sans clé :

- l'Annuaire des entreprises (recherche-entreprises.api.gouv.fr) : identité, état, création, activité ;
- le BODACC (bodacc-datadila.opendatasoft.com) : procédures collectives ;
- l'INPI, ratios financiers (data.economie.gouv.fr) : comptes.

Les verdicts suivent exactement les règles des fiches : `scripts/check_live.mjs` rejoue la version JavaScript sur toutes les entreprises RGE et bloque la construction à la moindre différence avec le Python. Une modification de règle se fait donc dans `prepare_data.py` et dans `src/lib/fiche.js`. La page `/artisan/` est fermée à Google.

## Prix des matériaux

Un article par mois depuis janvier 2024, à l'adresse `/prix-des-materiaux/<mois>-<année>/`. L'INSEE publie chaque mois avec environ deux mois de décalage et révise ensuite ses chiffres : chaque article est donc construit à partir d'un instantané figé, `data/prix/AAAA-MM.json`, écrit une seule fois puis gardé dans le dépôt. La publication du lundi commite elle-même les nouveaux instantanés (d'où `contents: write` dans le workflow) : pensez à `git pull` avant de travailler en local.

Pour réécrire un mois avec les chiffres révisés : supprimer son fichier dans `data/prix/` puis relancer `npm run data:prepare`. Les titres et les textes sont écrits par des règles fixes, sans rédaction manuelle.

## Points d'attention

- Le fichier Sirene pèse environ 720 Mo ; il est gardé dans le cache des Actions et retéléchargé seulement s'il change.
- Taille du site : 73 700 pages (56 400 fiches, 15 200 communes, 1 900 pages travaux × département), environ 915 Mo. La limite de GitHub Pages est 1 Go : surveiller la taille à chaque ajout dans les fiches.
- En local, Astro 7 demande Node 22 ou plus. Le verrou npm vient d'ehpad-arena (Linux) : sur Mac, ajouter les modules natifs `darwin-arm64` d'Astro, rolldown, lightningcss et satteri avec `npm i --no-save`.
- Python : `pyarrow` est nécessaire pour lire Sirene (`python3 -m venv .venv && .venv/bin/pip install pyarrow`).
- `npm run build` sans données (dépôt fraîchement cloné) : `scripts/ensure_data.mjs` crée `.venv` avec pyarrow (`requirements.txt`), télécharge et prépare tout ; `DATA_REFRESH=1 npm run build` force un nouveau téléchargement. Sur GitHub Actions, les données sont prêtes avant le build : rien n'est refait.
- Liste RGE tronquée par l'ADEME (aucune ligne Qualibat, ou moins de 80 % des lignes de la publication précédente) : elle est refusée et la dernière liste valide du cache est gardée ; le site affiche la date de cette liste.
- Pages « noindex » : entrepreneurs individuels en diffusion partielle au répertoire Sirene, communes et pages travaux × département d'une seule entreprise.
- Données personnelles : les adresses e-mail de la liste RGE ne sont pas reprises. Les jugements du BODACC sont affichés tels que publiés, avec un lien vers l'annonce.
