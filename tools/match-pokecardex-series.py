# Appariement des cartes sans image avec les séries françaises de PokéCardex (par numéro et nom). Voir README, « Scans distants ».
# Apparie les cartes sans image (ou à image cassée) de TCGdex avec les séries françaises de PokéCardex.
# Usage : python3 -I match_series.py <dossier missing> <dossier pokecardex> <sortie.json> [id_extension ...]
import json,re,os,sys,time,html,unicodedata,difflib,urllib.request,urllib.parse,glob
MISS,PK,OUT=sys.argv[1],sys.argv[2],sys.argv[3]; ONLY=set(sys.argv[4:])
UA={'User-Agent':'Mozilla/5.0 (compatible; collection-app personal-use)'}
os.makedirs(PK+'/series',exist_ok=True)
def norm(s):
    s=unicodedata.normalize('NFD',(s or '').lower()); s=''.join(c for c in s if unicodedata.category(c)!='Mn')
    s=s.replace('&',' et ').replace('δ',' ').replace('’',"'"); return re.sub(r'[^a-z0-9]+',' ',s).strip()
def squash(s): return norm(s).replace(' ','')
idx=json.load(open(PK+'/series_index.json'))                       # code -> nom français PokéCardex
tcg_sets={s['id']:s['name'] for s in json.load(open('/tmp/s_fr.json'))}
def fetch_series(code):
    fn=f'{PK}/series/{code}.json'
    if os.path.exists(fn): return json.load(open(fn))
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(f'https://www.pokecardex.com/series/{code}',headers=UA),timeout=40) as r: raw=r.read().decode('utf-8','replace')
            break
        except Exception as e: err=e; time.sleep(2+2*i)
    else: raise RuntimeError(f'{code}: {err}')
    s=html.unescape(raw)
    entries=[]
    for pid,t in re.findall(r'<a[^>]+href="https://www\.pokecardex\.com/carte/(\d+)"[^>]*>\s*([^<]+?)\s*</a>',s):
        m=re.match(r'(\S+)\s+(.*)$',t.strip()); entries.append([int(pid),(m.group(1) if m else ''),(m.group(2) if m else t.strip())])
    seen=set(); entries=[e for e in entries if not (e[0] in seen or seen.add(e[0]))]
    json.dump(entries,open(fn,'w'),ensure_ascii=False); time.sleep(1.0); return entries
# alias identifiant TCGdex -> code PokéCardex (quand le nom ne suffit pas)
ALIAS={'tk-bw-e':'TK5-M','tk-bw-z':'TK5-Z','tk-dp-l':'TK3-L','tk-dp-m':'TK3-M','tk-ex-p':'TK2-P','tk-ex-m':'TK2-N','tk-ex-latia':'TK1-LA','tk-ex-latio':'TK1-LO',
 'tk-hs-g':'TK4-L','tk-hs-r':'TK4-R','tk-sm-l':'TK10-L','tk-sm-r':'TK10-R','tk-xy-b':'TK7-S','tk-xy-w':'TK7-G','tk-xy-latia':'TK8-LA','tk-xy-latio':'TK8-LO',
 'tk-xy-p':'TK9-P','tk-xy-su':'TK9-S','tk-xy-n':'TK6-B','tk-xy-sy':'TK6-N',
 '2011bw':'MC1','2012bw':'MC2','2013bw':'MC3','2014xy':'MC4','2015xy':'MC5','2016xy':'MC6','2017sm':'MC7','2018sm-fr':'MC8','2019sm-fr':'MC9','2021swsh':'MC10US','2022swsh':'MC11US','2023sv':'M23','2024sv':'M24',
 'hgss4':'TM','xya':'PRAL','smp':'PRSM','swshp':'PRSWSH','xyp':'PRXY','bwp':'PRBW','hgssp':'PRHS','dpp':'PRDP','svp':'SVP','mep':'MEP','basep':'PRWC','np':'PRNI',
 'sm3.5':'SLE','sm7.5':'SM75','swsh4.5':'SWSH45','swsh3.5':'SWSH35','dp1':'DP','dp2':'MT','dp3':'SW','dp4':'GE','dp5':'MD','dp6':'LA','dp7':'SF'}
def candidates(sid,name):
    c=[]
    if sid in ALIAS: return [ALIAS[sid]]
    nn=squash(name)
    for code,pn in idx.items():
        pnn=squash(pn); tail=squash(pn.split(':')[-1])
        if pnn==nn or tail==nn or (len(nn)>=8 and len(pnn)>=8 and (nn in pnn or pnn in nn)): c.append(code)
    guess=re.sub(r'[^A-Za-z0-9]','',sid).upper()
    if guess in idx: c.append(guess)
    return list(dict.fromkeys(c))
def numkey(n):
    n=urllib.parse.unquote(n).split('/')[0]; m=re.fullmatch(r'([A-Za-z]*)0*(\d+)',n)       # H01 = H1, 001 = 1, SM228 = SM228
    return (m.group(1).upper()+m.group(2)) if m else n.upper()
def sim(a,b):
    a,b=squash(a),squash(b)
    if not a or not b: return 0
    if a==b or a in b or b in a: return 1.0
    return difflib.SequenceMatcher(None,a,b).ratio()
SUBSET={'cel25cc':lambda e:'/025' not in e[1]}          # la Collection Classique des 25 ans est la 2e moitié de la série « Célébrations »
results={}; report=[]
for fn in sorted(glob.glob(MISS+'/*.json')):
    sid=os.path.basename(fn)[:-5]
    if ONLY and sid not in ONLY: continue
    d=json.load(open(fn)); prob=sorted(set(d['noimage'])|set(d['broken']))
    if not prob: continue
    cards={cid:d['cards'][cid] for cid in prob}                    # id -> [localId, nom]
    best=None
    for code in candidates(sid,d['name']):
        try: ent=fetch_series(code)
        except Exception as e: report.append((sid,code,'ERREUR '+str(e)[:60])); continue
        m={}; sub=SUBSET.get(sid,lambda e:True); pool=[(i,e) for i,e in enumerate(ent,1) if sub(e)]
        bynum={numkey(e[1]):(i,e) for i,e in pool}
        same_size=(len(pool)==d['total'])                     # série de même taille que l'extension : le numéro suffit (noms parfois traduits autrement)
        for cid,(lid,nm) in cards.items():
            hit=bynum.get(numkey(lid))
            if hit and (sim(nm,hit[1][2])>=0.7 or same_size): m[cid]=hit; continue
            cand=[(i,e) for i,e in pool if sim(nm,e[2])>=0.9]
            if len(cand)==1: m[cid]=cand[0]
        if best is None or len(m)>len(best[1]): best=(code,m,len(ent))
    if best is None: report.append((sid,d['name'],'AUCUNE SÉRIE CANDIDATE',len(cards))); continue
    code,m,n=best
    results[sid]={'code':code,'series_name':idx.get(code),'size':n,'need':len(cards),'matched':len(m),'cards':{cid:{'n':i,'num':e[1],'pk':e[0],'pn':e[2]} for cid,(i,e) in m.items()}}
    report.append((sid,d['name'],code,idx.get(code),f'{len(m)}/{len(cards)}'))
json.dump(results,open(OUT,'w'),ensure_ascii=False)
for r in report: print(' | '.join(str(x) for x in r))
