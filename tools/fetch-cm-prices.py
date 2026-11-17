#!/usr/bin/env python3
"""Corrige les prix des extensions où TCGdex rattache plusieurs versions d'une carte à un même produit Cardmarket
(ex. Règne Delta, me06 : l'Ultra Rare et l'Illustration spéciale d'un Pokémon héritent du prix de sa Double rare).

Source : fichiers publics de Cardmarket (liste des produits + guide des prix, toutes langues), téléchargeables sans compte.
Les produits d'une extension sont classés dans l'ordre des numéros de carte : on associe le N-ième produit à la N-ième carte
(contrôle des noms anglais ; les écarts de traduction sont signalés).

Usage : python3 tools/fetch-cm-prices.py          (écrit data/price-fix.json)
"""
import json, re, sys, time, urllib.request

FIX = {'me06': 6704}           # extension TCGdex → idExpansion Cardmarket (à compléter si une autre sortie présente le même défaut)
BASE = 'https://downloads.s3.cardmarket.com/productCatalog/'
UA = {'User-Agent': 'Mozilla/5.0'}

def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180))

def num(x):
    return x if isinstance(x, (int, float)) and x > 0 else None

def main():
    guide = {g['idProduct']: g for g in get(BASE + 'priceGuide/price_guide_6.json')['priceGuides']}
    products = get(BASE + 'productList/products_singles_6.json')['products']
    out = {'updated': time.strftime('%Y-%m-%d'), 'source': 'Cardmarket price guide (toutes langues)', 'cards': {}}
    for sid, exp in FIX.items():
        prods = sorted((p for p in products if p['idExpansion'] == exp), key=lambda p: p['idProduct'])
        cards = sorted(get(f'https://api.tcgdex.net/v2/en/sets/{sid}')['cards'], key=lambda c: c['localId'])
        if len(prods) != len(cards):
            sys.exit(f'{sid} : {len(prods)} produits pour {len(cards)} cartes, abandon')
        odd = 0
        for p, c in zip(prods, cards):
            a = re.sub(r'\s*\[.*$', '', p['name']).replace('’', "'").lower().strip(); b = c['name'].replace('’', "'").lower().strip()
            if a != b and a.replace('-', '') != b.replace('-', ''): odd += 1
            g = guide.get(p['idProduct']) or {}
            trend = num(g.get('trend')) or num(g.get('avg')) or num(g.get('low'))
            holo = num(g.get('trend-holo')) or num(g.get('avg-holo')) or num(g.get('low-holo'))
            out['cards'][c['id']] = [trend, holo, p['idProduct']]
        print(f'{sid} : {len(cards)} cartes, {odd} noms différents (traductions)')
    json.dump(out, open('data/price-fix.json', 'w'), separators=(',', ':'))

main()
