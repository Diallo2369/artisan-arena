"""Télécharge les sources officielles dans data/raw/ (hors du dépôt).

- ADEME : liste des entreprises RGE (une ligne par établissement, qualification et domaine de travaux).
- ADEME : historique RGE depuis 2014, résumé par établissement (date de la première qualification).
- INSEE : base Sirene des unités légales (état, date de création, forme juridique, effectif).
- DILA : BODACC, avis de procédures collectives des entreprises RGE.
- INPI / BCE : ratios financiers des comptes déposés par les entreprises RGE.

Le BODACC et les ratios sont interrogés par lots de SIREN : seules les entreprises RGE sont téléchargées.
En cas d'échec d'un service, le fichier de la publication précédente (cache) est conservé.
"""
import json, os, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
ADEME = "https://data.ademe.fr/data-fair/api/v1/datasets/"
RGE = ADEME + "eo1n335dwa-ul7glxa7lm1ho"  # « Liste des entreprises RGE - New »
HIST = ADEME + "historique-rge"
SIRENE = "https://www.data.gouv.fr/api/1/datasets/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/"
BODACC = "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/exports/json"
RATIOS = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/ratios_inpi_bce/exports/json"
UA = {"User-Agent": "artisan-arena (site d'information, données publiques)"}

RGE_FIELDS = ["siret", "nom_entreprise", "adresse", "code_postal", "commune", "latitude", "longitude", "telephone",
              "email", "site_internet", "code_qualification", "nom_qualification", "url_qualification", "nom_certificat",
              "domaine", "meta_domaine", "organisme", "particulier", "lien_date_debut", "lien_date_fin"]


def get(url, tries=6, timeout=180):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:  # services publics parfois instables : on réessaie, de plus en plus lentement
            print(f"  essai {i + 1} échoué : {e} ({url[:110]})", file=sys.stderr)
            time.sleep(8 * (i + 1))
    raise RuntimeError(f"Impossible de télécharger {url}")


def getj(url, **kw):
    return json.loads(get(url, **kw))


def download(url, dest, size=None, tries=5):
    if os.path.exists(dest) and size and os.path.getsize(dest) == size:
        print(f"{os.path.basename(dest)} déjà à jour")
        return
    print(f"Téléchargement de {os.path.basename(dest)}…")
    for i in range(tries):
        try:
            tmp = dest + ".part"
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as r, open(tmp, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            os.replace(tmp, dest)
            return
        except Exception as e:
            print(f"  essai {i + 1} échoué : {e}", file=sys.stderr)
            time.sleep(15 * (i + 1))
    raise RuntimeError(f"Impossible de télécharger {url}")


def save(name, data):
    tmp = os.path.join(OUT, name + ".part")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, os.path.join(OUT, name))


def keep_previous(name, step):
    """Un service est indisponible : on garde le fichier de la publication précédente s'il existe."""
    if os.path.exists(os.path.join(OUT, name)):
        print(f"  {step} indisponible : fichier précédent conservé", file=sys.stderr)
        return True
    return False


# ---------- RGE : liste actuelle ----------
def fetch_rge():
    meta = getj(RGE)
    url = f"{RGE}/lines?size=10000&select={','.join(RGE_FIELDS)}"
    rows, total = [], None
    while url:
        j = getj(url)
        total = j.get("total", total)  # donné par la première page seulement
        rows += j["results"]
        url = j.get("next") if j["results"] else None
        print(f"  RGE : {len(rows)} lignes sur {total}", flush=True)
    if total and len(rows) < total:
        raise RuntimeError(f"liste RGE incomplète : {len(rows)} lignes sur {total}")
    for r in rows:
        r.pop("_score", None)
    save("rge.json", rows)
    return {"updated": (meta.get("dataUpdatedAt") or meta.get("updatedAt") or "")[:10], "lines": len(rows)}


# ---------- RGE : première qualification de chaque établissement (historique depuis 2014) ----------
# Interrogé par lots de SIREN avec un joker (« 123456789* ») : on retrouve aussi les anciens établissements
# d'une entreprise qui a déménagé. L'API limite une agrégation à 1 000 valeurs : un lot trop gros est coupé en deux.
def hist_agg(sirens):
    q = urllib.parse.quote("siret:(" + " OR ".join(s + "*" for s in sirens) + ")")
    j = getj(f"{HIST}/values_agg?field=siret&agg_size=1000&metric=min&metric_field=lien_date_debut&qs={q}")
    if j.get("total_other") and len(sirens) > 1:
        h = len(sirens) // 2
        return {**hist_agg(sirens[:h]), **hist_agg(sirens[h:])}
    return {a["value"]: a["metric"] for a in j["aggs"] if a.get("metric")}


def fetch_hist(sirens):
    chunks = [sirens[i:i + 150] for i in range(0, len(sirens), 150)]
    first = {}
    with ThreadPoolExecutor(4) as ex:
        for n, part in enumerate(ex.map(hist_agg, chunks), 1):
            for siret, ms in part.items():
                first[siret] = time.strftime("%Y-%m-%d", time.gmtime(ms / 1000))
            if n % 50 == 0:
                print(f"  historique : {n}/{len(chunks)} lots", flush=True)
    save("hist.json", first)
    print(f"  historique : {len(first)} établissements")
    return {"siret": len(first)}


# ---------- Sirene ----------
def fetch_sirene():
    meta = getj(SIRENE)
    r = next(x for x in meta["resources"] if "StockUniteLegale" in x["title"] and "Historique" not in x["title"] and x["format"] == "parquet")
    download(r["url"], os.path.join(OUT, "sirene-ul.parquet"), r.get("filesize"))
    return {"title": r["title"].replace(" (format parquet)", ""), "updated": r["last_modified"][:10]}


# ---------- requêtes par lots de SIREN (BODACC, ratios) ----------
def by_siren(base, field, sirens, select, extra="", size=350):
    chunks = [sirens[i:i + size] for i in range(0, len(sirens), size)]

    def one(ch):
        where = (extra + " and " if extra else "") + f"{field} in (" + ",".join(f'"{s}"' for s in ch) + ")"
        return getj(base + "?" + urllib.parse.urlencode({"where": where, "select": select}), timeout=300)

    out, done = [], 0
    with ThreadPoolExecutor(3) as ex:
        for res in ex.map(one, chunks):
            out += res
            done += 1
            if done % 25 == 0 or done == len(chunks):
                print(f"  {done}/{len(chunks)} lots, {len(out)} lignes", flush=True)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    mf = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(mf)) if os.path.exists(mf) else {}
    only = set(sys.argv[1:])  # ex. : python3 scripts/fetch_data.py bodacc ratios
    run = lambda k: not only or k in only

    if run("rge"):
        print("ADEME : entreprises RGE")
        try:
            manifest["rge"] = fetch_rge()
        except RuntimeError:
            if not keep_previous("rge.json", "ADEME"):
                raise
    sirens = sorted({r["siret"][:9] for r in json.load(open(os.path.join(OUT, "rge.json"), encoding="utf-8")) if r.get("siret")})

    steps = [
        ("hist", "hist.json", "historique RGE", lambda: fetch_hist(sirens)),
        ("sirene", "sirene-ul.parquet", "Sirene", fetch_sirene),
        ("bodacc", "bodacc.json", "BODACC", lambda: (save("bodacc.json", by_siren(
            BODACC, "registre", sirens, "id,registre,dateparution,tribunal,jugement,typeavis_lib,parutionavisprecedent",
            extra='familleavis="collective"')), {"siren": len(sirens)})[1]),
        ("ratios", "ratios.json", "ratios financiers", lambda: (save("ratios.json", by_siren(
            RATIOS, "siren", sirens, "siren,date_cloture_exercice,chiffre_d_affaires,resultat_net,autonomie_financiere,taux_d_endettement,ratio_de_liquidite,confidentiality,type_bilan")),
            {"siren": len(sirens)})[1]),
    ]
    for key, fname, label, fn in steps:
        if not run(key):
            continue
        print(label)
        try:
            m = fn()
            m.setdefault("fetched", time.strftime("%Y-%m-%d"))
            manifest[key] = m
        except RuntimeError:
            if not keep_previous(fname, label):
                raise

    with open(mf, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
