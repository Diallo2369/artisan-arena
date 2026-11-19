# Artisan Arena

« Cet artisan est-il RGE et solide financièrement ? » Site statique : une fiche par entreprise RGE (SIREN), avec quatre vérifications (qualification RGE, procédures collectives, état de l'entreprise, comptes), des pages par commune, par département et par type de travaux.

## Chaîne de données

```
npm run data:fetch    → scripts/fetch_data.py    télécharge dans data/raw/ (hors dépôt)
npm run data:prepare  → scripts/prepare_data.py  produit data/build/site.json et public/data/search.json
npm run build         → scripts/check_data.mjs (bloque si les volumes sont anormaux), astro build, scripts/postbuild.mjs
```

Pour relancer une seule étape du téléchargement : `python3 scripts/fetch_data.py bodacc ratios` (étapes : `rge`, `hist`, `sirene`, `bodacc`, `ratios`). Si un service est indisponible, le fichier de la publication précédente est conservé.

Pour une construction rapide en local : `LIMIT_PAGES=200 npm run build` (200 communes, 800 fiches).

Sources (toutes publiques, Licence Ouverte) :

| Donnée | Source | Usage |
| --- | --- | --- |
| Entreprises RGE | ADEME, « Liste des entreprises RGE - New » (data-fair, `eo1n335dwa-ul7glxa7lm1ho`) | fiches, qualifications, domaines, coordonnées |
| Historique RGE | ADEME, « Historique des entreprises RGE depuis 2014 » (`historique-rge`), agrégé par SIRET | « RGE depuis » |
| Entreprises | INSEE, base Sirene, fichier StockUniteLegale (parquet, data.gouv.fr) | état, création, forme juridique, effectif |
| Procédures collectives | DILA, BODACC (`annonces-commerciales`, famille `collective`), par lots de SIREN | vérification « procédures » |
| Comptes | INPI / BCE, « Ratios financiers » (data.economie.gouv.fr), par lots de SIREN | vérification « comptes » |
| Communes | `@etalab/decoupage-administratif` | rattachement des établissements, pages communes |

## Où modifier quoi

| Fichier | Rôle |
| --- | --- |
| `src/lib/core.js` | Toutes les pages en fonctions qui renvoient du HTML : accueil, fiche, commune, département, travaux, « Avant de signer », à propos. Textes des vérifications, titres et descriptions. |
| `src/lib/travaux.json` | Les familles de travaux et les domaines RGE de l'ADEME qu'elles regroupent (lu aussi par la préparation des données). |
| `scripts/prepare_data.py` | Regroupement par SIREN, rattachement aux communes, règles des quatre vérifications, lecture des jugements du BODACC. |
| `src/lib/devis.js` | Bloc d'affiliation « Demander des devis », éteint par défaut. |
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

## Points d'attention

- Le fichier Sirene pèse environ 720 Mo ; il est gardé dans le cache des Actions et retéléchargé seulement s'il change.
- Taille du site : 73 700 pages (56 400 fiches, 15 200 communes, 1 900 pages travaux × département), environ 900 Mo. La limite de GitHub Pages est 1 Go : surveiller la taille à chaque ajout dans les fiches.
- En local, Astro 7 demande Node 22 ou plus. Le verrou npm vient d'ehpad-arena (Linux) : sur Mac, ajouter les modules natifs `darwin-arm64` d'Astro, rolldown, lightningcss et satteri avec `npm i --no-save`.
- Python : `pyarrow` est nécessaire pour lire Sirene (`python3 -m venv .venv && .venv/bin/pip install pyarrow`).
- Pages « noindex » : entrepreneurs individuels en diffusion partielle au répertoire Sirene, communes et pages travaux × département d'une seule entreprise.
- Données personnelles : les adresses e-mail de la liste RGE ne sont pas reprises. Les jugements du BODACC sont affichés tels que publiés, avec un lien vers l'annonce.
