#!/usr/bin/env python3
"""Captures mobiles 390x844 des 3 écrans + contrôle des erreurs console.
Usage : python3 scripts/screenshots.py [URL]   (défaut http://localhost:8765/)"""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
OUT = os.path.join(ROOT, "screenshots")
os.makedirs(OUT, exist_ok=True)
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True,
                        has_touch=True, locale="fr-FR", timezone_id="Europe/Paris")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("requestfailed", lambda r: errors.append(f"requestfailed: {r.url}"))
    for name, h in [("1-alerte", "#/alerte"), ("2-produits", "#/produits/crevettes"), ("2b-produits-poulet-cru", "#/produits/poulet_cru"), ("3-suivi", "#/suivi")]:
        page.goto(URL + "index.html" + h, wait_until="networkidle")
        page.wait_for_timeout(700)
        page.screenshot(path=os.path.join(OUT, f"{name}.png"))
        page.screenshot(path=os.path.join(OUT, f"{name}-full.png"), full_page=True)
    sw = page.evaluate("navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))")
    # test hors ligne
    ctx.set_offline(True)
    page.goto(URL + "index.html#/suivi", wait_until="load")
    page.wait_for_timeout(500)
    offline_ok = "Depuis le" in page.inner_text("main")
    b.close()
print("service worker actif :", sw)
print("hors ligne OK :", offline_ok)
print("erreurs console :", errors or "aucune")
