#!/usr/bin/env python3
"""
Construit data/stocks.json et data/today.json à partir de l'export Inpulse
« Analyse des stocks passés » (CSV : produit,date,stock_theorique_kg,stock_reel_kg).

ATTENTION : malgré le nom des colonnes, les valeurs du CSV sont en EUROS
(le théorique est arrondi à l'euro). Elles sont converties en kg avec le prix
au kg de chaque produit (PRODUCTS ci-dessous). '-' = produit non compté.

Usage :
    python3 scripts/build_data.py                       # CSV par défaut
    python3 scripts/build_data.py --csv /chemin/export.csv
Pour ajouter un jour : ajouter les lignes du jour dans le CSV puis relancer.
"""
import argparse
import csv
import json
import os
from datetime import date, datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CSV = os.environ.get("PITAYA_CSV", os.path.join(ROOT, "data/source/stocks_quotidiens_bethune.csv"))

STORE = "Pitaya LILLE - BETHUNE"
PLAN_START = "2026-10-02"      # Début du plan d'action
THRESHOLD_PCT = 5.0             # |écart| <= 5 % => OK

# Prix au kg = valeur € / quantité kg relevées dans Inpulse.
PRODUCTS = [
    {"key": "crevettes", "inpulse": "CREVETTES CRUES (surg)", "name": "Crevettes crues",
     "price_kg": 301.47 / 29.60, "unit": "poche", "unit_plural": "poches", "unit_kg": 0.8},
    {"key": "crousty", "inpulse": "POULET CROUSTY (surg) -p", "name": "Poulet crousty",
     "price_kg": 294.28 / 36.25, "unit": "sachet", "unit_plural": "sachets", "unit_kg": 2.5},
    {"key": "poulet_cru", "inpulse": "POULET CRU PITAYA -p", "name": "Poulet cru (aiguillettes)",
     "price_kg": 143.07 / 18.73, "unit": "kg", "unit_plural": "kg", "unit_kg": 1.0},
    {"key": "boeuf", "inpulse": "BOEUF MARINE EMINCE -p", "name": "Bœuf mariné émincé",
     "price_kg": 395.67 / 28.26, "unit": "sachet", "unit_plural": "sachets", "unit_kg": 2.0},
    {"key": "riz", "inpulse": "RIZ PARFUME JASMIN PATHUMTANI - PITAYA", "name": "Riz jasmin",
     "price_kg": 395.89 / 289.36, "unit": "sac", "unit_plural": "sacs", "unit_kg": 20.0},
]


def r(x, n=2):
    return None if x is None else round(x, n)


def parse_num(s):
    s = (s or "").strip().replace(",", ".")
    if s in ("", "-"):
        return None
    return float(s)


def build_day(p, d, theo_eur, real_eur):
    pk = p["price_kg"]
    theo_kg = theo_eur / pk if theo_eur is not None else None
    real_kg = real_eur / pk if real_eur is not None else None
    day = {"date": d, "theo_eur": r(theo_eur), "real_eur": r(real_eur),
           "theo_kg": r(theo_kg), "real_kg": r(real_kg),
           "real_units": r(real_kg / p["unit_kg"], 1) if real_kg is not None else None,
           "gap_kg": None, "gap_eur": None, "gap_pct": None, "gap_units": None}
    if real_eur is None:
        day["status"] = "non_compte"
    elif theo_eur is None or theo_eur == 0:
        day["status"] = "anomalie"          # théorique à 0 : livraison non saisie ?
        day["gap_kg"] = r(real_kg - (theo_kg or 0))
        day["gap_eur"] = r(real_eur - (theo_eur or 0))
        day["gap_units"] = r(day["gap_kg"] / p["unit_kg"], 1)
    else:
        gap_kg = real_kg - theo_kg
        gap_pct = (real_eur - theo_eur) / theo_eur * 100
        day.update(gap_kg=r(gap_kg), gap_eur=r(real_eur - theo_eur), gap_pct=r(gap_pct, 1),
                   gap_units=r(gap_kg / p["unit_kg"], 1))
        day["status"] = "ok" if abs(gap_pct) <= THRESHOLD_PCT else "alerte"
    return day


def summarize(p, days):
    """Cumul et diagnostic sur une liste de jours."""
    counted = [d for d in days if d["status"] in ("ok", "alerte")]
    gaps = [d["gap_kg"] for d in counted]
    pos = sum(1 for g in gaps if g > 0)
    neg = sum(1 for g in gaps if g < 0)
    over = sum(1 for d in counted if d["status"] == "alerte")
    signs = [1 if g > 0 else -1 for g in gaps if g != 0]
    sign_changes = sum(1 for a, b in zip(signs, signs[1:]) if a != b)
    cum_kg = sum(gaps)
    cum_eur = sum(d["gap_eur"] for d in counted)
    n = len(counted)
    abs_sum = sum(abs(g) for g in gaps)
    # cohérence : 1 = tous les écarts dans le même sens, 0 = ils s'annulent
    consistency = abs(cum_kg) / abs_sum if abs_sum else 0
    if n == 0:
        diag, code = "Pas de comptage sur la période", "inconnu"
    elif over == 0:
        diag, code = "Stable : aucun écart de plus de 5 %", "stable"
    elif neg / n >= 0.6 and cum_kg < 0 and consistency >= 0.5:
        diag, code = "Vraie perte probable : écart négatif presque tous les jours", "perte"
    elif pos / n >= 0.6 and cum_kg > 0 and consistency >= 0.5:
        diag, code = "Surplus récurrent : livraisons ou transferts non saisis ?", "surplus"
    elif sign_changes >= 1:
        diag, code = "Erreur de comptage probable : l'écart alterne entre + et −", "comptage"
    else:
        diag, code = "À surveiller", "surveiller"
    return {
        "days_total": len(days), "days_counted": n,
        "days_not_counted": sum(1 for d in days if d["status"] == "non_compte"),
        "days_anomaly": sum(1 for d in days if d["status"] == "anomalie"),
        "days_over_threshold": over, "days_positive": pos, "days_negative": neg,
        "sign_changes": sign_changes, "consistency": r(consistency),
        "cum_gap_kg": r(cum_kg), "cum_gap_eur": r(cum_eur),
        "cum_gap_units": r(cum_kg / p["unit_kg"], 1),
        "diagnostic": diag, "diagnostic_code": code,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=DEFAULT_CSV)
    ap.add_argument("--out", default=os.path.join(ROOT, "data"))
    args = ap.parse_args()

    by_name = {p["inpulse"]: p for p in PRODUCTS}
    rows = {p["key"]: {} for p in PRODUCTS}
    with open(args.csv, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            p = by_name.get(row["produit"].strip())
            if not p:
                print(f"! produit ignoré : {row['produit']}")
                continue
            d = date.fromisoformat(row["date"].strip()).isoformat()
            rows[p["key"]][d] = (parse_num(row["stock_theorique_kg"]), parse_num(row["stock_reel_kg"]))

    all_dates = sorted({d for k in rows for d in rows[k]})
    if not all_dates:
        raise SystemExit("CSV vide")
    latest = all_dates[-1]

    products_out = []
    for p in PRODUCTS:
        days = [build_day(p, d, *rows[p["key"]][d]) for d in sorted(rows[p["key"]])]
        before = [d for d in days if d["date"] < PLAN_START]
        since = [d for d in days if d["date"] >= PLAN_START]
        products_out.append({
            "key": p["key"], "name": p["name"], "inpulse_name": p["inpulse"],
            "price_kg": r(p["price_kg"], 4), "unit": p["unit"], "unit_plural": p["unit_plural"],
            "unit_kg": p["unit_kg"], "days": days,
            "since_plan": summarize(p, since), "before_plan": summarize(p, before),
        })

    meta = {
        "store": STORE, "plan_start": PLAN_START, "threshold_pct": THRESHOLD_PCT,
        "first_date": all_dates[0], "latest_date": latest,
        "generated_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "source": "Inpulse – Analyse des stocks passés",
        "note": "Valeurs Inpulse en € converties en kg au prix moyen ; théorique arrondi à l'euro.",
    }
    stocks = {"meta": meta, "products": products_out}

    today_items = []
    for p in products_out:
        d = next((x for x in p["days"] if x["date"] == latest), None)
        today_items.append({"key": p["key"], "name": p["name"], "unit": p["unit"],
                            "unit_plural": p["unit_plural"], "unit_kg": p["unit_kg"],
                            **(d or {"date": latest, "status": "non_compte"})})
    to_check = [i["name"] for i in today_items if i["status"] != "ok"]
    today = {
        "meta": meta, "date": latest, "items": today_items,
        "summary": {
            "ok": sum(1 for i in today_items if i["status"] == "ok"),
            "alerte": sum(1 for i in today_items if i["status"] == "alerte"),
            "non_compte": sum(1 for i in today_items if i["status"] == "non_compte"),
            "anomalie": sum(1 for i in today_items if i["status"] == "anomalie"),
            "a_recompter": to_check,
        },
        "instruction": ("Recompter ces produits à la quantité près avant le service : si le "
                        "recomptage est bon, déclarer la perte ; sinon corriger l'inventaire dans Inpulse."),
    }

    os.makedirs(args.out, exist_ok=True)
    for name, obj in (("stocks.json", stocks), ("today.json", today)):
        with open(os.path.join(args.out, name), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
    print(f"OK : {len(all_dates)} jours ({all_dates[0]} → {latest}), {len(products_out)} produits")
    for p in products_out:
        s = p["since_plan"]
        print(f"  {p['name']:<28} depuis {PLAN_START} : {s['cum_gap_kg']:+.2f} kg / {s['cum_gap_eur']:+.2f} € "
              f"| >5 % : {s['days_over_threshold']}/{s['days_counted']} | {s['diagnostic_code']}")


if __name__ == "__main__":
    main()
