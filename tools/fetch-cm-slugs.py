#!/usr/bin/env python3
"""Relève l'adresse Cardmarket EXACTE de chaque carte (extension/nom-version-code) via les redirections publiques de pokemontcg.io :
    https://prices.pokemontcg.io/cardmarket/<idCarte>  →  302 vers la page Cardmarket du produit.
On lit seulement l'en-tête de redirection (aucune requête vers cardmarket.com). Résultat : data/cm/<extension>.json
    { "n": { "205": "Galarian-Perrserker-RCL205", ... }, "s": "Rebel-Clash" }   (n : numéro TCGdex sans zéros → fin d'adresse)
Reprise possible (cache dans le dossier de travail) ; peu de requêtes à la fois.

Usage : python3 tools/fetch-cm-slugs.py [extension ...]     (sans argument : toutes)
"""
import json, os, re, sys, time, urllib.request, urllib.error, difflib
from concurrent.futures import ThreadPoolExecutor

UA = {'User-Agent': 'Mozilla/5.0 (pijakollection-tools)'}
SKIP = {'rc', 'wp', 'jumbo'}               # sans cartes françaises
CACHE = os.environ.get('CM_CACHE', '/tmp/cm-slug-cache.json')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
opener = urllib.request.build_opener(NoRedirect)

def get(url):
    for attempt in range(6):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except Exception:
            if attempt == 5: raise
            time.sleep(3 * (attempt + 1))

def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower().replace('&', 'and').replace('é', 'e'))

def set_map(meta):
    pt = get('https://api.pokemontcg.io/v2/sets?pageSize=250&select=id,name,releaseDate')['data']
    en = {s['id']: s for s in get('https://api.tcgdex.net/v2/en/sets')}
    out = {}
    for sid, m in meta.items():
        s = en.get(sid)
        if not s or sid in SKIP: continue
        date = m[1].replace('-', '/')
        c = [p for p in pt if norm(p['name']) == norm(s['name'])]
        if not c: c = [p for p in pt if p['releaseDate'] == date and difflib.SequenceMatcher(None, norm(p['name']), norm(s['name'])).ratio() > 0.6]
        if not c:
            c = [p for p in pt if p['releaseDate'] == date]
            if len(c) != 1: c = []
        if len(c) > 1: c = [p for p in c if p['id'] == sid] or c[:1]
        if c: out[sid] = c[0]['id']
    return out

def redirect(pid):
    for attempt in range(4):
        try:
            opener.open(urllib.request.Request('https://prices.pokemontcg.io/cardmarket/' + pid, headers=UA), timeout=40)
            return None
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308): return e.headers.get('Location')
            if e.code == 404: return None
            time.sleep(3 * (attempt + 1))
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return None

def num_variants(lid):
    z = re.sub(r'^([A-Za-z]*)0*(\d+)$', r'\1\2', lid)
    return [z] if z == lid else [z, lid]

def main():
    meta = json.load(open('data/sets-meta.json'))['sets']
    names = json.load(open('data/names.json'))
    want = sys.argv[1:] or [s for s in meta if s in names]
    smap = {k: v for k, v in set_map(meta).items() if k in want}
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    os.makedirs('data/cm', exist_ok=True)
    for sid, pid in smap.items():
        rows = names.get(sid) or []
        lids = [(r[1] if len(r) > 2 and isinstance(r[2], str) else r[0]) for r in rows]
        todo = [l for l in lids if f'{sid}|{l}' not in cache or (os.environ.get('CM_RETRY') and not cache[f'{sid}|{l}'])]      # CM_RETRY=1 : retente les cartes sans adresse (erreurs passagères du service)
        def work(l):
            for v in num_variants(l):
                loc = redirect(f'{pid}-{v}')
                if loc: return l, loc
            return l, ''
        with ThreadPoolExecutor(int(os.environ.get('CM_WORKERS', '8'))) as ex:
            for l, loc in ex.map(work, todo): cache[f'{sid}|{l}'] = loc
        json.dump(cache, open(CACHE, 'w'))
        n, sslug = {}, None
        for l in lids:
            loc = cache.get(f'{sid}|{l}') or ''
            m = re.match(r'https://(?:www\.)?cardmarket\.com/\w+/Pokemon/Products/Singles/([^/]+)/([^?]+)', loc)
            if not m: continue
            sslug = sslug or m.group(1)
            if m.group(1) != sslug: n[l] = m.group(1) + '/' + m.group(2)      # extension différente chez Cardmarket (rare)
            else: n[l] = m.group(2)
        if n:
            json.dump({'s': sslug, 'n': n}, open(f'data/cm/{sid}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
        print(f'{sid} ({pid}) : {len(n)}/{len(lids)} adresses', flush=True)

main()
