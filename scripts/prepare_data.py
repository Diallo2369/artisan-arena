"""Croise les sources et écrit les données du site.

Entrées (data/raw/) : rge.json (ADEME), hist.json (historique RGE), sirene-ul.parquet (INSEE),
bodacc.json (procédures collectives), ratios.json (comptes), manifest.json.
Sorties :
  data/build/site.json     tout ce qu'il faut pour construire les pages
  public/data/search.json  index léger pour la recherche (communes et entreprises)

Une entreprise = un SIREN. Ses établissements RGE (SIRET) et ses qualifications sont regroupés sur une seule fiche.
Quatre vérifications, chacune « ok », « warn » (point de vigilance), « bad » (alerte) ou « na » (pas de donnée) :
- rge   : qualification en cours de validité ; vigilance si toutes expirent dans moins de 90 jours ;
- proc  : procédures collectives publiées au BODACC (en cours = alerte, plan en cours ou procédure passée = vigilance) ;
- ent   : état au répertoire Sirene (cessée = alerte, créée depuis moins de 2 ans = vigilance) ;
- cpt   : derniers comptes publiés (moins de 30 mois) : résultat net négatif ou capitaux propres négatifs = vigilance.
"""
import datetime as dt, json, os, re, sys, unicodedata
from collections import Counter, defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
RAW = os.path.join(ROOT, "data", "raw")
NM = os.path.join(ROOT, "node_modules", "@etalab", "decoupage-administratif", "data")
TODAY = dt.date.today()
TODAY_S = TODAY.isoformat()
PLM = {"75056": "751", "13055": "132", "69123": "693"}  # villes à arrondissements : préfixe des codes


# ---------- outils ----------
def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def ent_slug(nom, ville, siren):
    """Adresse d'une fiche. Même règle dans src/scripts/app.js (entSlug) : l'index de recherche ne la stocke pas."""
    return "-".join(x for x in [slugify(nom)[:60].strip("-"), slugify(ville), siren] if x)


def plain(s):
    return re.sub(r"[^a-z0-9]+", " ", slugify(s)).strip()


def months_between(a, b):
    return (b.year - a.year) * 12 + b.month - a.month


SMALL = {"de", "du", "des", "la", "le", "les", "et", "a", "au", "aux", "en", "sur", "sous", "l", "d", "pour", "par", "chez"}
WORDS3 = {"sud", "est", "art", "eau", "air", "sol", "val", "mer", "bel", "bon", "neo", "eco", "pro", "duo", "top", "bio", "gaz",
          "fer", "box", "lux", "max", "net", "one", "the", "and", "vie", "feu", "ile", "mon", "ma", "mes", "nos", "son", "sa", "ses",
          "toi", "roi", "bas", "haut", "bois", "pin", "lac", "mas", "gex", "ain", "lot", "var", "cher", "eure", "oise", "orne",
          "nord", "fil", "or", "an", "ans", "vos", "tous", "une", "un", "les", "plus", "via", "oui", "zen", "eko", "go", "my", "new",
          "cie", "fils", "pere", "jean", "luc", "guy", "eric", "marc", "paul", "rene", "yves", "noel", "leo", "hugo", "theo", "tom"}
KEEP = {"SARL", "SAS", "SASU", "EURL", "SA", "SCOP", "EIRL", "EI", "GIE", "SNC", "SCI", "BTP", "ENR", "PAC", "CVC", "VMC", "RGE",
        "SCIC", "II", "III", "IV", "EDF", "ENGIE", "GDF", "SPIE", "ITE", "ITI", "MCM", "ACM", "TP", "SARLU", "SELARL", "SCP", "SEM"}
ACC = {"renovation": "rénovation", "energie": "énergie", "energies": "énergies", "energetique": "énergétique", "batiment": "bâtiment",
       "batiments": "bâtiments", "electricite": "électricité", "electrique": "électrique", "thermique": "thermique", "menuiserie": "menuiserie",
       "economie": "économie", "ecologie": "écologie", "ecologique": "écologique", "habitat": "habitat", "chauffage": "chauffage",
       "isolation": "isolation", "societe": "société", "etudes": "études", "etude": "étude", "freres": "frères", "metallerie": "métallerie",
       "amenagement": "aménagement", "amenagements": "aménagements", "systemes": "systèmes", "systeme": "système", "geothermie": "géothermie",
       "geothermique": "géothermique", "plomberie": "plomberie", "maconnerie": "maçonnerie", "cheminees": "cheminées", "cheminee": "cheminée",
       "fenetres": "fenêtres", "fenetre": "fenêtre", "entreprise": "entreprise", "general": "général", "generale": "générale",
       "electro": "électro", "climatisation": "climatisation", "facades": "façades", "facade": "façade", "solaire": "solaire",
       "ingenierie": "ingénierie", "reseau": "réseau", "reseaux": "réseaux", "securite": "sécurité", "region": "région", "regional": "régional",
       "isere": "Isère", "ardeche": "Ardèche", "drome": "Drôme", "lozere": "Lozère", "vendee": "Vendée", "correze": "Corrèze", "nievre": "Nièvre",
       "ariege": "Ariège", "herault": "Hérault", "pyrenees": "Pyrénées", "bearn": "Béarn", "comte": "comté", "cote": "côte", "cotes": "côtes",
       "a": "à", "ste": "Sté", "ets": "Éts", "etablissements": "établissements", "equipement": "équipement", "equipements": "équipements"}


def nice(s, lower_first=False, acronyms=True):
    """Remet en forme un nom écrit en majuscules (sigles et formes juridiques gardés en capitales)."""
    s = re.sub(r"\s+", " ", (s or "").strip())
    if not s or s != s.upper():
        return s
    out = []
    parts = re.split(r"(\s+|-|'|’|/|\(|\)|&|\.|,|\")", s)
    first = True
    for w in parts:
        if not w or re.fullmatch(r"\s+|-|'|’|/|\(|\)|&|\.|,|\"", w):
            out.append(w)
            continue
        low = w.lower()
        if w in KEEP or (acronyms and re.fullmatch(r"[A-Z]{2,3}", w) and low not in WORDS3 and low not in SMALL) or not re.search(r"[AEIOUYÉÈ]", w):
            out.append(w)
        elif w.isdigit() or re.fullmatch(r"\d+[A-Z]*", w):
            out.append(w if len(w) < 4 or w.isdigit() else w.lower())
        elif not first and low in SMALL:
            out.append(ACC.get(low, low) if low == "a" else low)
        else:
            low = ACC.get(low, low)
            out.append(low if (first and lower_first) else low[:1].upper() + low[1:])
        first = False
    r = "".join(out)
    r = re.sub(r"\b([LD])'(?=\w)", lambda m: m.group(1).lower() + "'", r)
    return r[:1].upper() + r[1:] if not lower_first else r


VOIES = {"rue", "avenue", "boulevard", "chemin", "route", "place", "allee", "allée", "impasse", "quai", "cours", "square", "passage",
         "lieu", "dit", "lieu-dit", "faubourg", "promenade", "montee", "montée", "chaussee", "chaussée", "esplanade", "hameau", "residence",
         "résidence", "cite", "cité", "sentier", "traverse", "villa", "domaine", "parc", "lotissement", "zone", "voie", "rond-point", "bis", "ter",
         "quater", "bd", "av", "rte", "che", "imp", "all", "bat", "bât", "batiment", "bâtiment", "et", "centre", "parking", "pole", "pôle"}


def nice_addr(s):
    a = nice(s, acronyms=False)
    a = re.sub(r"\b([A-Za-zÀ-ÿ-]+)\b", lambda m: m.group(1).lower() if m.group(1).lower() in VOIES else m.group(1), a)
    a = re.sub(r"\b(z\.?a\.?c?|z\.?i\.?)\b", lambda m: m.group(1).upper(), a, flags=re.I)
    return a[:1].upper() + a[1:] if a[:1].isalpha() and not re.match(r"[a-z]+\b", a) else a


def phone(t):
    t = re.sub(r"\D", "", t or "")
    if t.startswith("33") and len(t) == 11:
        t = "0" + t[2:]
    return " ".join(t[i:i + 2] for i in range(0, 10, 2)) if len(t) == 10 and t[0] == "0" else ""


def website(u):
    u = (u or "").strip()
    if not u or " " in u or "." not in u or "@" in u:
        return ""
    if not re.match(r"https?://", u, re.I):
        u = "https://" + u
    return u if len(u) < 120 else ""


# ---------- référentiels ----------
TRAVAUX = json.load(open(os.path.join(ROOT, "src", "lib", "travaux.json"), encoding="utf-8"))
DOM2T = {d: t["slug"] for t in TRAVAUX for d in t["domaines"]}

EFFECTIFS = {"00": "0 salarié", "01": "1 ou 2 salariés", "02": "3 à 5 salariés", "03": "6 à 9 salariés", "11": "10 à 19 salariés",
             "12": "20 à 49 salariés", "21": "50 à 99 salariés", "22": "100 à 199 salariés", "31": "200 à 249 salariés",
             "32": "250 à 499 salariés", "41": "500 à 999 salariés", "42": "1 000 à 1 999 salariés", "51": "2 000 à 4 999 salariés",
             "52": "5 000 à 9 999 salariés", "53": "10 000 salariés et plus"}
CJ = {"1000": "Entrepreneur individuel", "5499": "SARL", "5498": "EURL (SARL à associé unique)", "5710": "SAS", "5720": "SASU (SAS à associé unique)",
      "5599": "SA à conseil d'administration", "5699": "SA à directoire", "5202": "Société en nom collectif", "5306": "Société en commandite simple",
      "5458": "SARL coopérative ouvrière de production (SCOP)", "5460": "SARL coopérative", "5560": "SA coopérative", "5785": "Société d'exercice libéral par actions simplifiée",
      "5485": "Société d'exercice libéral à responsabilité limitée", "6540": "Société civile immobilière", "6599": "Autre société civile", "6589": "Société civile de moyens",
      "9220": "Association déclarée", "6220": "GIE", "5800": "Société européenne", "5510": "SA à conseil d'administration", "5308": "Société en commandite par actions",
      "7389": "Établissement public", "5385": "Société d'exercice libéral en commandite par actions", "5770": "SAS coopérative"}


def cj_label(c):
    c = str(c or "")
    if c in CJ:
        return CJ[c]
    return {"10": "Entrepreneur individuel", "54": "SARL", "57": "SAS", "55": "Société anonyme", "56": "Société anonyme", "52": "Société en nom collectif",
            "65": "Société civile", "92": "Association", "53": "Société en commandite", "62": "Groupement d'intérêt économique"}.get(c[:2], "")


def load_communes():
    com = json.load(open(os.path.join(NM, "communes.json"), encoding="utf-8"))
    deps = {d["code"]: (d["nom"], d.get("typeLiaison", 1)) for d in json.load(open(os.path.join(NM, "departements.json"), encoding="utf-8"))}
    cur, by_cp, arr_by_cp = {}, defaultdict(list), {}
    for c in com:
        if c["type"] == "commune-actuelle":
            cur[c["code"]] = c
            for cp in c.get("codesPostaux", []):
                by_cp[cp].append(c)
        elif c["type"] == "arrondissement-municipal":
            cur[c["code"]] = c
            for cp in c.get("codesPostaux", []):
                arr_by_cp[cp] = c
    # anciennes communes (déléguées, associées) : leur nom reste souvent dans les adresses
    old = defaultdict(list)
    for c in com:
        if c["type"] in ("commune-deleguee", "commune-associee") and c.get("chefLieu") in cur:
            for cp in c.get("codesPostaux", []) or cur[c["chefLieu"]].get("codesPostaux", []):
                old[cp].append((plain(c["nom"]), cur[c["chefLieu"]]))
    return cur, by_cp, arr_by_cp, old, deps


CEDEX = re.compile(r"\s+(cedex|cédex|cdx)(\s*\d+)?$", re.I)


def locate(cp, ville, ctx):
    """Code INSEE à partir du code postal et du nom de commune donnés par l'ADEME."""
    cur, by_cp, arr_by_cp, old, _ = ctx
    v = plain(CEDEX.sub("", ville or ""))
    if not re.fullmatch(r"\d{4,5}", (cp or "").strip()):  # code postal non diffusé (« [ND] ») : par le nom seul
        v2 = re.sub(r"^(st|ste) ", lambda m: "saint " if m.group(1) == "st" else "sainte ", v)
        same = [c for c in cur.values() if c["type"] == "commune-actuelle" and plain(c["nom"]) == v2]
        return max(same, key=lambda c: c.get("population") or 0)["code"] if same else None
    cp = cp.strip().zfill(5)[:5]
    v = re.sub(r"^(st|ste) ", lambda m: "saint " if m.group(1) == "st" else "sainte ", v)
    v = re.sub(r" (st|ste) ", lambda m: " saint " if m.group(1) == "st" else " sainte ", v)
    if cp in arr_by_cp:
        return arr_by_cp[cp]["code"]
    cands = by_cp.get(cp, [])
    for c in cands:
        if plain(c["nom"]) == v:
            return c["code"]
    for n, c in old.get(cp, []):
        if n == v:
            return c["code"]
    for c in cands:  # « Saint-Étienne-de-X » écrit « St Etienne », nom tronqué…
        n = plain(c["nom"])
        if v and (n.startswith(v) or v.startswith(n)):
            return c["code"]
    dep = cp[:3] if cp.startswith("97") else cp[:2]
    if v:  # code postal faux : même nom dans le département
        same = [c for c in cur.values() if c["type"] == "commune-actuelle" and plain(c["nom"]) == v and c["departement"].startswith(dep[:2])]
        if len(same) == 1:
            return same[0]["code"]
    if len(cands) == 1:
        return cands[0]["code"]
    if cands:  # plusieurs communes sous ce code postal et nom illisible : la plus peuplée
        return max(cands, key=lambda c: c.get("population") or 0)["code"]
    return None


# ---------- BODACC : état de la procédure ----------
MOIS = {m: i + 1 for i, m in enumerate(["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"])}


def jdate(s, fallback):
    m = re.search(r"(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})", (s or "").lower())
    if m and m.group(2) in MOIS:
        try:
            return dt.date(int(m.group(3)), MOIS[m.group(2)], int(m.group(1))).isoformat()
        except ValueError:
            pass
    return fallback


def fix(s):
    """Répare les textes mal encodés (« procÃ©dure »)."""
    if "Ã" in s:
        try:
            return s.encode("latin-1").decode("utf-8")
        except (UnicodeDecodeError, UnicodeEncodeError):
            return s
    return s


def classify(nature, famille):
    """Type d'un jugement : sauv, rj, lj, rp (ouvertures), plan, cession, clos, retract, autre."""
    t, f = plain(nature), plain(famille)
    if f.startswith("avis de depot"):
        return "autre"  # état des créances, liste des créances : ne change pas l'état de la procédure
    if "retractation" in t:
        return "retract"
    if "cour d appel" in f:
        return "appel" if "infirmant" in t else "autre"
    if "cloture" in t or "mettant fin" in t:
        return "clos"
    if "resolution du plan" in t or "conversion" in t:
        return "lj" if "liquidation" in t else "rj" if "redressement" in t else "autre"
    if "plan de cession" in t:
        return "cession"
    if "plan" in t:
        return "plan"
    if "ouverture" in t or "extension" in t:
        for k, w in (("sauv", "sauvegarde"), ("rj", "redressement"), ("lj", "liquidation"), ("rp", "retablissement")):
            if w in t:
                return k
    return "autre"


OPEN = {"sauv": 24, "rj": 24, "rp": 24, "lj": 36, "cession": 36}  # mois au-delà desquels une ouverture sans suite publiée est ancienne


def proc_status(events):
    """Dernier état connu, en suivant les jugements dans l'ordre. « ancien » : procédure sans suite publiée depuis longtemps,
    ou plan arrêté il y a plus de 10 ans (durée maximale d'un plan)."""
    state, since = None, None
    for e in events:
        k = e["k"]
        if k in OPEN:
            state, since = k, e["d"]
        elif k == "plan":
            state, since = "plan", e["d"]
        elif k == "clos" and state:
            state, since = "clos", e["d"]
        elif k == "retract":
            state, since = None, None
        elif k == "appel" and state:
            state, since = "appel", e["d"]
    if state and since:
        age = months_between(dt.date.fromisoformat(since), TODAY)
        if (state in OPEN and age > OPEN[state]) or (state == "plan" and age > 120):
            state = "ancien"
    return state, since


# ---------- assemblage ----------
def main():
    ctx = load_communes()
    cur, _, _, _, depnames = ctx
    manifest = json.load(open(os.path.join(RAW, "manifest.json"))) if os.path.exists(os.path.join(RAW, "manifest.json")) else {}
    rge = json.load(open(os.path.join(RAW, "rge.json"), encoding="utf-8"))
    hist = json.load(open(os.path.join(RAW, "hist.json"), encoding="utf-8")) if os.path.exists(os.path.join(RAW, "hist.json")) else {}

    # 1. lignes RGE -> entreprises, établissements, qualifications
    E = {}
    unknown_dom, unknown_loc, expired = Counter(), [], 0
    for r in rge:
        siret = re.sub(r"\D", "", r.get("siret") or "")
        if len(siret) != 14:
            continue
        fin = (r.get("lien_date_fin") or "")[:10]
        if fin and fin < TODAY_S:
            expired += 1
            continue
        siren = siret[:9]
        e = E.setdefault(siren, {"id": siren, "est": {}, "q": {}, "names": Counter(), "part": False})
        e["names"][r.get("nom_entreprise") or ""] += 1
        e["part"] = e["part"] or bool(r.get("particulier"))
        if siret not in e["est"]:
            c = locate(r.get("code_postal"), r.get("commune"), ctx)
            if not c:
                unknown_loc.append((siret, r.get("code_postal"), r.get("commune")))
            lat, lon = r.get("latitude"), r.get("longitude")
            e["est"][siret] = {"siret": siret, "adr": nice_addr(r.get("adresse") or ""), "cp": (r.get("code_postal") or "").zfill(5)[:5] if re.fullmatch(r"\d{4,5}", (r.get("code_postal") or "").strip()) else "", "c": c,
                               "tel": phone(r.get("telephone")), "web": website(r.get("site_internet")),
                               "geo": [round(lat, 5), round(lon, 5)] if isinstance(lat, (int, float)) and isinstance(lon, (int, float)) and lat and lon else None}
        est = e["est"][siret]
        if not est["tel"]:
            est["tel"] = phone(r.get("telephone"))
        if not est["web"]:
            est["web"] = website(r.get("site_internet"))
        doms = [d.strip() for d in (r.get("domaine") or "").split(";") if d.strip()]
        ts = []
        for d in doms:
            if d in DOM2T:
                ts.append(DOM2T[d])
            else:
                unknown_dom[d] += 1
        key = (r.get("code_qualification") or r.get("nom_qualification") or "", r.get("organisme") or "")
        q = e["q"].setdefault(key, {"nom": (r.get("nom_qualification") or "").strip(), "code": r.get("code_qualification") or "",
                                    "org": r.get("organisme") or "", "cert": (r.get("nom_certificat") or "").strip(), "url": "",
                                    "deb": "", "fin": "", "dom": [], "t": [], "est": []})
        u = (r.get("url_qualification") or "").strip().replace("\\", "/")
        if u.startswith("http") and not q["url"]:
            q["url"] = u
        q["deb"] = min(filter(None, [q["deb"], (r.get("lien_date_debut") or "")[:10]]), default="")
        q["fin"] = max(filter(None, [q["fin"], fin]), default="")
        for d in doms:
            if d not in q["dom"]:
                q["dom"].append(d)
        for t in ts:
            if t not in q["t"]:
                q["t"].append(t)
        if siret not in q["est"]:
            q["est"].append(siret)

    # 2. Sirene (unités légales des entreprises RGE)
    sirene = {}
    pq_path = os.path.join(RAW, "sirene-ul.parquet")
    if os.path.exists(pq_path):
        import pyarrow.compute as pc, pyarrow.parquet as pq
        cols = ["siren", "statutDiffusionUniteLegale", "dateCreationUniteLegale", "etatAdministratifUniteLegale", "dateDebut",
                "categorieJuridiqueUniteLegale", "trancheEffectifsUniteLegale", "anneeEffectifsUniteLegale", "activitePrincipaleUniteLegale",
                "denominationUniteLegale", "nomUniteLegale", "nomUsageUniteLegale", "prenomUsuelUniteLegale", "nicSiegeUniteLegale",
                "categorieEntreprise", "societeMissionUniteLegale", "economieSocialeSolidaireUniteLegale"]
        f = pq.ParquetFile(pq_path)
        have = [c for c in cols if c in f.schema_arrow.names]
        want = __import__("pyarrow").array(sorted(E))
        for b in f.iter_batches(columns=have, batch_size=500_000):
            b = b.filter(pc.is_in(b.column("siren"), value_set=want))
            for row in b.to_pylist():
                sirene[row["siren"]] = row
    print(f"Sirene : {len(sirene)} entreprises retrouvées sur {len(E)}")

    # 3. BODACC
    bod = defaultdict(list)
    if os.path.exists(os.path.join(RAW, "bodacc.json")):
        seen = set()
        for a in json.load(open(os.path.join(RAW, "bodacc.json"), encoding="utf-8")):
            try:
                j = json.loads(a.get("jugement") or "{}")
            except ValueError:
                j = {}
            if (a.get("typeavis_lib") or "").startswith("Avis d"):  # « Avis d'annulation » : la publication est annulée
                continue
            nature, famille = fix((j.get("nature") or "").strip()), fix((j.get("famille") or "").strip())
            if not nature and not famille:
                continue
            for s in {re.sub(r"\D", "", x) for x in (a.get("registre") or [])}:
                if s not in E:
                    continue
                d = jdate(j.get("date"), a.get("dateparution") or "")
                k = (s, d, plain(nature))
                if k in seen:  # avis rectificatifs et doublons
                    continue
                seen.add(k)
                bod[s].append({"d": d, "p": a.get("dateparution") or "", "n": nature or famille, "k": classify(nature, famille),
                               "tr": nice(a.get("tribunal") or ""), "id": a.get("id") or "", "rect": (a.get("typeavis_lib") or "").startswith("Avis rectificatif")})
        for s in bod:
            bod[s].sort(key=lambda e: (e["d"], e["p"]))
    print(f"BODACC : {sum(len(v) for v in bod.values())} jugements pour {len(bod)} entreprises")

    # 4. Comptes
    cpt = defaultdict(list)
    if os.path.exists(os.path.join(RAW, "ratios.json")):
        for r in json.load(open(os.path.join(RAW, "ratios.json"), encoding="utf-8")):
            s = r.get("siren")
            if s in E and r.get("date_cloture_exercice"):
                cpt[s].append(r)
    for s in cpt:
        byd = {}
        for r in cpt[s]:  # un exercice peut apparaître en comptes sociaux et consolidés : on garde les comptes sociaux
            d = r["date_cloture_exercice"][:10]
            if d not in byd or (r.get("type_bilan") == "C" and byd[d].get("type_bilan") != "C"):
                byd[d] = r
        cpt[s] = [byd[d] for d in sorted(byd, reverse=True)][:5]

    # 5. fiches
    def pick_name(e, si, ville):
        n = e["names"].most_common(1)[0][0]
        if n and "[ND]" not in n:
            return nice(n)
        si = si or {}
        if si.get("denominationUniteLegale") and "[ND]" not in si["denominationUniteLegale"]:
            return nice(si["denominationUniteLegale"])
        if si.get("statutDiffusionUniteLegale") == "O" and si.get("nomUniteLegale") and "[ND]" not in si["nomUniteLegale"]:  # entrepreneur en diffusion complète
            return nice(" ".join(x for x in [si.get("prenomUsuelUniteLegale"), si.get("nomUsageUniteLegale") or si["nomUniteLegale"]] if x))
        return "Entrepreneur individuel" + (f" à {ville}" if ville else "")  # nom non diffusé par l'ADEME ni par l'INSEE

    ent = {}
    for s, e in E.items():
        si = sirene.get(s)
        ests = list(e["est"].values())
        siege = s + (si.get("nicSiegeUniteLegale") or "") if si else ""
        ests.sort(key=lambda x: (x["siret"] != siege, -sum(1 for q in e["q"].values() if x["siret"] in q["est"]), x["siret"]))
        quals = sorted(e["q"].values(), key=lambda q: (q["t"][0] if q["t"] else "zz", q["nom"]))
        for q in quals:
            q["est"] = len(q["est"])
        t = []
        for q in quals:
            for x in q["t"]:
                if x not in t:
                    t.append(x)
        t.sort(key=lambda x: [tt["slug"] for tt in TRAVAUX].index(x))
        fins = [q["fin"] for q in quals if q["fin"]]
        first = min([hist[x] for x in e["est"] if x in hist] + [q["deb"] for q in quals if q["deb"]], default="")
        main_est = ests[0]
        c = cur.get(main_est["c"]) if main_est["c"] else None
        x = {"id": s, "nom": pick_name(e, si, re.sub(r" (\d+)(e|er) Arrondissement$", r" \1\2", c["nom"]) if c else ""), "est": ests, "q": quals, "t": t, "part": e["part"],
             "fin": max(fins) if fins else "", "since": first, "c": main_est["c"], "dep": c["departement"] if c else None,
             "ville": c["nom"] if c else ""}

        # vérification 1 : RGE
        days = (dt.date.fromisoformat(x["fin"]) - TODAY).days if x["fin"] else 0
        x["k_rge"] = "warn" if days < 90 else "ok"

        # vérification 2 : procédures collectives
        ev = bod.get(s, [])
        st, st_d = proc_status(ev)
        x["bod"] = [{k: v for k, v in b.items() if k != "rect"} for b in ev][-25:]
        x["proc"] = st
        x["proc_d"] = st_d
        x["k_proc"] = "ok" if not st else "bad" if st in OPEN else "warn"

        # vérification 3 : l'entreprise au répertoire Sirene
        if si:
            pp = str(si.get("categorieJuridiqueUniteLegale") or "") == "1000"
            diff = si.get("statutDiffusionUniteLegale") or "O"
            cree = si.get("dateCreationUniteLegale")
            cree = cree.isoformat() if hasattr(cree, "isoformat") else (str(cree)[:10] if cree else "")
            dd = si.get("dateDebut")
            dd = dd.isoformat() if hasattr(dd, "isoformat") else (str(dd)[:10] if dd else "")
            x["si"] = {"etat": si.get("etatAdministratifUniteLegale") or "", "cree": cree, "cj": str(si.get("categorieJuridiqueUniteLegale") or ""),
                       "cjl": cj_label(si.get("categorieJuridiqueUniteLegale")), "eff": EFFECTIFS.get(str(si.get("trancheEffectifsUniteLegale") or ""), ""),
                       "effy": str(si.get("anneeEffectifsUniteLegale") or ""), "naf": si.get("activitePrincipaleUniteLegale") or "",
                       "cat": si.get("categorieEntreprise") or "", "pp": pp, "diff": diff,
                       "cess": dd if si.get("etatAdministratifUniteLegale") == "C" else ""}
            age = months_between(dt.date.fromisoformat(cree), TODAY) if cree else None
            x["k_ent"] = "bad" if x["si"]["etat"] == "C" else "warn" if age is not None and age < 24 else "ok"
            x["ni"] = (pp and diff != "O") or x["nom"].startswith("Entrepreneur individuel")  # entrepreneur ayant demandé la non-diffusion : page fermée aux moteurs
        else:
            x["si"] = None
            x["k_ent"] = "na"
            x["ni"] = False

        # vérification 4 : les comptes
        cs = []
        for r in cpt.get(s, []):
            ca = r.get("chiffre_d_affaires")
            conf = r.get("confidentiality") or ""
            masked = conf != "Public"  # comptes (partiellement) confidentiels : les montants masqués valent 0 dans la source
            rn = r.get("resultat_net")
            cs.append({"d": r["date_cloture_exercice"][:10], "ca": ca if ca and not masked else None,
                       "rn": None if masked and not rn else rn, "af": r.get("autonomie_financiere"), "conf": conf})
        x["cpt"] = cs
        last = cs[0] if cs else None
        if not last:
            x["k_cpt"] = "na"
        else:
            recent = months_between(dt.date.fromisoformat(last["d"]), TODAY) <= 30
            neg = (last["rn"] is not None and last["rn"] < 0) or (last["af"] is not None and last["af"] < 0)
            x["k_cpt"] = "na" if not recent else "warn" if neg else "ok"

        ks = [x["k_rge"], x["k_proc"], x["k_ent"], x["k_cpt"]]
        x["v"] = sum(1 for k in ks if k in ("warn", "bad"))
        x["bad"] = any(k == "bad" for k in ks)
        base_city = re.sub(r" \d+(e|er) Arrondissement$", "", x["ville"])
        x["slug"] = ent_slug(x["nom"], base_city, s)
        ent[s] = x

    # 6. communes, départements, travaux
    by_c = defaultdict(set)
    for x in ent.values():
        for es in x["est"]:
            if es["c"]:
                by_c[es["c"]].add(x["id"])

    def order(ids):
        # sans point de vigilance d'abord, puis par ancienneté RGE, puis par nom
        return sorted(ids, key=lambda i: (ent[i]["bad"], ent[i]["v"], ent[i]["since"] or "9999", ent[i]["nom"]))

    C = {}
    for code, ids in by_c.items():
        c = cur[code]
        nom = re.sub(r" (\d+)(e|er) Arrondissement$", r" \1\2", c["nom"])
        C[code] = {"c": code, "nom": nom, "dep": c["departement"], "pop": c.get("population") or 0, "ids": order(ids),
                   "parent": c.get("commune"), "slug": f"{slugify(nom)}-{code}"}
    for city, pre in PLM.items():
        kids = sorted(k for k in C if k.startswith(pre) and k != city)
        if kids:
            c = cur[city]
            C[city] = {"c": city, "nom": c["nom"], "dep": c["departement"], "pop": c.get("population") or 0,
                       "ids": order({i for k in kids for i in C[k]["ids"]}), "kids": kids, "slug": f"{slugify(c['nom'])}-{city}"}
    for c in C.values():
        c["n"] = len(c["ids"])
    for x in ent.values():
        x["cslug"] = C[x["c"]]["slug"] if x["c"] in C else ""
        for es in x["est"]:
            es["v"] = re.sub(r" (\d+)(e|er) Arrondissement$", r" \1\2", cur[es["c"]]["nom"]) if es["c"] else ""
    for c in C.values():
        c["tc"] = dict(Counter(t for i in c["ids"] for t in ent[i]["t"]))

    D = {}
    by_d = defaultdict(set)
    for x in ent.values():
        for es in x["est"]:
            if es["c"]:
                by_d[cur[es["c"]]["departement"]].add(x["id"])
    for code, ids in by_d.items():
        nom, tl = depnames.get(code, (code, 1))
        D[code] = {"code": code, "nom": nom, "tl": tl, "n": len(ids), "slug": f"{slugify(nom)}-{code}",
                   "communes": sorted([k for k, c in C.items() if c["dep"] == code and "kids" not in c], key=lambda k: (-C[k]["n"], C[k]["nom"])),
                   "tc": dict(Counter(t for i in ids for t in ent[i]["t"])),
                   "tv": {t["slug"]: order(i for i in ids if t["slug"] in ent[i]["t"]) for t in TRAVAUX}}
        D[code]["tv"] = {k: v for k, v in D[code]["tv"].items() if v}

    # 7. chiffres nationaux
    N = len(ent)
    nat = {
        "n": N, "nest": sum(len(x["est"]) for x in ent.values()),
        "proc_ever": sum(1 for x in ent.values() if x["proc"]), "proc_open": sum(1 for x in ent.values() if x["k_proc"] == "bad"),
        "proc_plan": sum(1 for x in ent.values() if x["proc"] == "plan"),
        "exp90": sum(1 for x in ent.values() if x["k_rge"] == "warn"), "young": sum(1 for x in ent.values() if x["k_ent"] == "warn"),
        "cessee": sum(1 for x in ent.values() if x["k_ent"] == "bad"),
        "cpt": sum(1 for x in ent.values() if x["k_cpt"] in ("ok", "warn")), "cpt_neg": sum(1 for x in ent.values() if x["k_cpt"] == "warn"),
        "clean": sum(1 for x in ent.values() if x["v"] == 0), "part": sum(1 for x in ent.values() if x["part"]),
        "tc": dict(Counter(t for x in ent.values() for t in x["t"])),
        "since": dict(sorted(Counter((x["since"] or "")[:4] for x in ent.values() if x["since"]).items())),
    }

    meta = {
        "built": TODAY_S, "rge": manifest.get("rge", {}).get("updated", ""), "sirene": manifest.get("sirene", {}).get("title", ""),
        "sireneUpdated": manifest.get("sirene", {}).get("updated", ""), "bodacc": manifest.get("bodacc", {}).get("fetched", ""),
        "ratios": manifest.get("ratios", {}).get("fetched", ""), "expiredRows": expired, "unknownLoc": len(unknown_loc),
        "noSirene": N - len([s for s in ent if ent[s]["si"]]),
    }
    os.makedirs(os.path.join(ROOT, "data", "build"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "public", "data"), exist_ok=True)
    json.dump({"meta": meta, "nat": nat, "ent": ent, "communes": C, "deps": D},
              open(os.path.join(ROOT, "data", "build", "site.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    # recherche : toutes les communes (celles sans entreprise RGE renvoient au département) + entreprises
    sc = []
    for code, c in cur.items():
        if c["type"] == "arrondissement-municipal" and code not in C:
            continue
        if code not in C and c["departement"] not in D:
            continue
        sc.append((c.get("population") or 0, [C[code]["nom"] if code in C else c["nom"], c["departement"], C[code]["n"] if code in C else 0, C[code]["slug"] if code in C else 0]))
    sc.sort(key=lambda x: -x[0])
    se = []
    for x in sorted(ent.values(), key=lambda x: (-len(x["est"]), x["nom"])):
        v = re.sub(r" \d+(e|er) Arrondissement$", "", x["ville"])
        se.append([x["nom"], v, x["id"]])
        assert ent_slug(x["nom"], v, x["id"]) == x["slug"]
    json.dump({"d": {k: [d["nom"], d["slug"]] for k, d in D.items()}, "c": [x[1] for x in sc], "e": se},
              open(os.path.join(ROOT, "public", "data", "search.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    print(f"{N} entreprises RGE, {nat['nest']} établissements ; {len(C)} communes, {len(D)} départements.")
    print(f"Procédures : {nat['proc_ever']} entreprises concernées, {nat['proc_open']} en cours, {nat['proc_plan']} sous plan.")
    print(f"Expirent sous 90 jours : {nat['exp90']} ; créées depuis moins de 2 ans : {nat['young']} ; cessées : {nat['cessee']}.")
    print(f"Comptes récents : {nat['cpt']} (dont {nat['cpt_neg']} avec résultat ou capitaux propres négatifs) ; sans point de vigilance : {nat['clean']}.")
    print(f"Lignes expirées écartées : {expired} ; établissements sans commune : {len(unknown_loc)} ; hors Sirene : {meta['noSirene']}.")
    for d, n in unknown_dom.most_common(10):
        print(f"  domaine inconnu : {d} ({n})", file=sys.stderr)
    for u in unknown_loc[:15]:
        print("  commune inconnue :", u, file=sys.stderr)


if __name__ == "__main__":
    main()
