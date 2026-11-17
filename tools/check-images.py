# Contrôle des images TCGdex (cartes sans image / adresse qui ne répond pas). Voir README, « Scans distants ».
# Pour chaque extension française (hors Pocket) : cartes sans image, et cartes dont l'adresse d'image répond autre chose que 200.
# Usage : python3 -I check_images.py <dossier_sortie>
import json,os,sys,time,random,urllib.request,urllib.parse,concurrent.futures as cf
OUT=sys.argv[1]; B='https://api.tcgdex.net/v2/fr/'; UA={'User-Agent':'collection-data-builder'}
LOG=open(OUT+'/progress.log','a',buffering=1)
def log(*a): print(time.strftime('%H:%M:%S'),*a,file=LOG)
def get(path,tries=7):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(B+path,headers=UA),timeout=30) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code==404: return None
            time.sleep(min(30,1.5**i+random.random()))
        except Exception: time.sleep(min(30,1.5**i+random.random()))
    raise RuntimeError(path)
def head(u):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(u,method='HEAD',headers=UA),timeout=25) as r: return r.status
        except urllib.error.HTTPError as e:
            if e.code in (404,403,410): return e.code
            time.sleep(1+i)
        except Exception: time.sleep(1+i)
    return 0
pocket={x['id'] for x in get('series/tcgp')['sets']}
sets=[s for s in get('sets') if s['id'] not in pocket]; log('extensions',len(sets))
res={}; t0=time.time(); done=0
for s in sets:
    fn=OUT+'/'+s['id'].replace('/','_')+'.json'
    if os.path.exists(fn): res[s['id']]=json.load(open(fn)); continue
    d=get('sets/'+urllib.parse.quote(s['id'],safe='')); cards=d.get('cards',[]) if d else []
    noimg=[c['id'] for c in cards if 'image' not in c]
    withimg=[c for c in cards if 'image' in c]
    with cf.ThreadPoolExecutor(6) as ex: codes=list(ex.map(lambda c: head(c['image']+'/low.webp'),withimg))
    broken=[c['id'] for c,k in zip(withimg,codes) if k!=200]
    info={'name':d.get('name') if d else s['id'],'total':len(cards),'declared':(d or {}).get('cardCount',{}).get('total'),'noimage':noimg,'broken':broken,'codes':{c['id']:k for c,k in zip(withimg,codes) if k!=200},'cards':{c['id']:[c['localId'],c.get('name','')] for c in cards if c['id'] in set(noimg)|set(broken)}}
    json.dump(info,open(fn,'w'),ensure_ascii=False); res[s['id']]=info; done+=len(cards)
    log(f"{s['id']:12s} cartes {len(cards):4d} | sans image {len(noimg):4d} | cassées {len(broken):3d} | total traité {done} | {time.time()-t0:5.0f}s")
log('TERMINE')
