# Collecte (une fois) la rareté et les versions de chaque carte française de TCGdex.
# Reprise possible : un fichier par extension. Environ 21 000 requêtes, à un rythme poli (5 en parallèle).
# Usage : python3 -I tools/fetch-card-data.py <dossier_brut>
# Puis  : python3 -I tools/compact-card-data.py <dossier_brut> data/cards
import json, os, sys, time, random, threading, urllib.request, urllib.parse, concurrent.futures as cf
OUT = sys.argv[1]; BASE = 'https://api.tcgdex.net/v2/fr/'; UA = {'User-Agent': 'collection-data-builder'}
LOG = open(os.path.join(OUT, 'progress.log'), 'a', buffering=1)
def log(*a): print(time.strftime('%H:%M:%S'), *a, file=LOG)
def get(path, tries=7):
    err = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=UA), timeout=30) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            err = e; time.sleep(min(30, 1.5 ** i + random.random()))      # 503 « no available server », 429…
        except Exception as e: err = e; time.sleep(min(30, 1.5 ** i + random.random()))
    raise RuntimeError(f'{path}: {err}')
sets = get('sets'); pocket = {x['id'] for x in get('series/tcgp')['sets']}
sets = [s for s in sets if s['id'] not in pocket]
log('extensions hors Pocket:', len(sets))
KEEP = ('type', 'size', 'foil', 'stamp', 'subtype')
def one(cid):
    d = get('cards/' + urllib.parse.quote(cid, safe=''))
    if d is None: return cid, None
    vd = [{k: v for k, v in x.items() if k in KEEP and v not in (None, [], '')} for x in (d.get('variants_detailed') or [])]
    return cid, {'r': d.get('rarity'), 'f': d.get('variants'), 'v': vd}
done_cards = 0; t0 = time.time(); fails = []
for s in sets:
    fn = os.path.join(OUT, s['id'].replace('/', '_') + '.json')
    if os.path.exists(fn): continue
    try: det = get('sets/' + urllib.parse.quote(s['id'], safe=''))
    except Exception as e: log('ECHEC extension', s['id'], e); fails.append(s['id']); continue
    ids = [c['id'] for c in (det or {}).get('cards', [])]
    res = {}
    with cf.ThreadPoolExecutor(5) as ex:
        for cid, info in ex.map(lambda c: (lambda: one(c))() if True else None, ids):
            res[cid] = info
    ok = {k: v for k, v in res.items() if v is not None}
    json.dump({'set': s['id'], 'n': len(ids), 'cards': ok}, open(fn + '.tmp', 'w'), ensure_ascii=False, separators=(',', ':')); os.replace(fn + '.tmp', fn)
    done_cards += len(ok); log(f"{s['id']:12s} {len(ok):4d}/{len(ids):4d} cartes | total {done_cards} | {time.time()-t0:6.0f}s")
log('TERMINE', done_cards, 'cartes', 'échecs:', fails)
