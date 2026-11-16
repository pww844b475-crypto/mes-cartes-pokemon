# Série + date de sortie de chaque extension française (hors Pocket). Usage : python3 -I build_meta.py <sortie.json>
import json, sys, time, random, urllib.request, urllib.parse, concurrent.futures as cf
BASE = 'https://api.tcgdex.net/v2/fr/'; UA = {'User-Agent': 'collection-data-builder'}
def get(path):
    err = None
    for i in range(7):
        try:
            with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=UA), timeout=30) as r: return json.load(r)
        except Exception as e: err = e; time.sleep(min(20, 1.5 ** i + random.random()))
    raise RuntimeError(f'{path}: {err}')
sets = get('sets'); pocket = {x['id'] for x in get('series/tcgp')['sets']}
sets = [s for s in sets if s['id'] not in pocket]
series = get('series')
def det(s):
    d = get('sets/' + urllib.parse.quote(s['id'], safe=''))
    return s['id'], [d['serie']['id'], d.get('releaseDate') or '', (d.get('abbreviation') or {}).get('official') or '']
with cf.ThreadPoolExecutor(3) as ex: res = dict(ex.map(det, sets))
out = {'_date': time.strftime('%Y-%m-%d'), 'series': {s['id']: s['name'] for s in series if s['id'] != 'tcgp'}, 'sets': res}
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(res), 'extensions,', len(out['series']), 'séries')
