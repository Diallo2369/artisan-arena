"""Fige les chiffres de chaque mois pour les articles « Prix des matériaux ».

L'INSEE révise ses indices après coup : l'article d'un mois doit garder les chiffres connus quand il a été publié.
Pour chaque mois depuis prix.json["debut"] jusqu'au dernier mois publié par l'INSEE, ce script écrit
data/prix/AAAA-MM.json s'il n'existe pas encore. Un fichier existant n'est jamais réécrit.

Ces fichiers sont gardés dans le dépôt : la publication automatique commite les nouveaux.
"""
import json, os, sys, time

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "data", "prix")
START = "2020-01"  # premier mois gardé dans chaque instantané (moyenne 2021 et courbe sur 24 mois)


def months(a, b):
    y, m = map(int, a.split("-"))
    while f"{y}-{m:02d}" <= b:
        yield f"{y}-{m:02d}"
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def main():
    cfg = json.load(open(os.path.join(ROOT, "src", "lib", "prix.json"), encoding="utf-8"))
    raw_path = os.path.join(ROOT, "data", "raw", "prix.json")
    if not os.path.exists(raw_path):
        print("prix.json absent : lancez python3 scripts/fetch_data.py prix", file=sys.stderr)
        sys.exit(1)
    raw = json.load(open(raw_path, encoding="utf-8"))
    ids = [s["id"] for f in cfg["familles"] for s in f["series"]] + [m["id"] for m in cfg["metiers"]]

    # Dernier mois publié : au moins 90 % des séries ont une valeur (une série peut être retardée ou secrète)
    last = None
    for p in months(cfg["debut"], time.strftime("%Y-%m")):
        if sum(1 for i in ids if p in raw.get(i, {}).get("obs", {})) >= 0.9 * len(ids):
            last = p
    if not last:
        print("aucun mois complet dans les données INSEE", file=sys.stderr)
        sys.exit(1)

    os.makedirs(OUT, exist_ok=True)
    made = []
    for p in months(cfg["debut"], last):
        dest = os.path.join(OUT, p + ".json")
        if os.path.exists(dest):
            continue
        series = {}
        for i in ids:
            obs = raw.get(i, {}).get("obs", {})
            series[i] = {"v": [obs[q][0] if q in obs else None for q in months(START, p)],
                         "p": obs[p][1] == "P" if p in obs else False}
        snap = {"mois": p, "debut": START, "fige": time.strftime("%Y-%m-%d"), "s": series}
        with open(dest, "w", encoding="utf-8") as f:
            json.dump(snap, f, ensure_ascii=False, separators=(",", ":"))
        made.append(p)
    print(f"Prix des matériaux : dernier mois {last} ; nouveaux instantanés : {', '.join(made) or 'aucun'}.")


if __name__ == "__main__":
    main()
