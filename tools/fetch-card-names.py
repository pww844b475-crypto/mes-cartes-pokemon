# Génère data/names.json : nom et numéro de chaque carte française (pour la recherche globale).
# Une requête par extension (~185). Usage : python3 -I tools/fetch-card-names.py data/cards data/names.json
import json, os, sys, time, random, urllib.request, urllib.parse, concurrent.futures as cf
SRC, OUT = sys.argv[1], sys.argv[2]; BASE = 'https://api.tcgdex.net/v2/fr/sets/'; UA = {'User-Agent': 'collection-data-builder'}
def get(sid, tries=8):
    err = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(BASE + urllib.parse.quote(sid, safe=''), headers=UA), timeout=30) as r: return json.load(r)
        except Exception as e: err = e; time.sleep(min(20, 1.5 ** i + random.random()))
    raise RuntimeError(f'{sid}: {err}')
ids = sorted(f[:-5] for f in os.listdir(SRC) if f.endswith('.json'))
def one(sid):
    d = get(sid); pre = sid + '-'; out = []
    for c in d.get('cards', []):
        cid = c['id']; lid = c.get('localId', cid[len(pre):] if cid.startswith(pre) else cid)
        row = [lid, c.get('name') or '']
        if not c.get('image'): row.append(0)          # pas d'image TCGdex
        out.append(row if cid == pre + str(lid) else [cid] + row)   # id atypique : on le garde en tête de ligne
    return sid, out
res = {}
with cf.ThreadPoolExecutor(5) as ex:
    for sid, rows in ex.map(one, ids): res[sid] = rows
json.dump(res, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(res), 'extensions,', sum(len(v) for v in res.values()), 'cartes,', os.path.getsize(OUT) // 1024, 'Ko')
