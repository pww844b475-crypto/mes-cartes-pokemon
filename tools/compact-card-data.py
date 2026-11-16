# Transforme la collecte brute (un fichier par extension) en fichiers compacts chargés par l'application.
# Usage : python3 -I tools/compact-card-data.py <dossier_brut> <dossier_sortie>
# Format : { "rar":[raretés], "var":[[type, taille, foil, sous-type, [tampons]]…], "c":{ idCarte:[indexRareté (-1 = inconnue), [indexVersions]] } }
import json, os, sys, glob
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
def from_flags(f):
    r = []
    if not f: return r
    if f.get('normal'): r.append({'type': 'Normal'})
    if f.get('reverse'): r.append({'type': 'Reverse'})
    if f.get('holo'): r.append({'type': 'Holo'})
    if f.get('firstEdition'): r.append({'type': 'Normal', 'stamp': ['1re Édition']})
    if f.get('wPromo'): r.append({'type': 'Normal', 'stamp': ['Promo W']})
    return r
total = cards_n = 0
for fn in sorted(glob.glob(os.path.join(src, '*.json'))):
    d = json.load(open(fn, encoding='utf-8')); rar, var, c = [], [], {}
    for cid, info in d['cards'].items():
        vs = info.get('v') or from_flags(info.get('f'))
        idx = []
        for v in vs:
            desc = [v.get('type') or 'Normal', v.get('size') or 'Standard', v.get('foil') or '', v.get('subtype') or '', list(v.get('stamp') or [])]
            if desc not in var: var.append(desc)
            idx.append(var.index(desc))
        r = info.get('r')
        if r and r not in rar: rar.append(r)
        c[cid] = [rar.index(r) if r else -1, idx]
    if not c: continue
    json.dump({'rar': rar, 'var': var, 'c': c}, open(os.path.join(out, d['set'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    total += 1; cards_n += len(c)
print('extensions:', total, '| cartes:', cards_n)
