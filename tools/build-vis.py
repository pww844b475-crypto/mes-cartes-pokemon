#!/usr/bin/env python3
"""Empreintes visuelles des cartes pour le scanner : data/vis/<extension>.bin (120 octets par carte, dans l'ordre de data/names.json).
Empreinte = grille de couleurs 6×6 de la zone de l'illustration (centrée sur la moyenne, normalisée : 108 valeurs → octets) + histogramme de teintes (12 valeurs).
Doit rester identique à `visDesc` de app.js. Source : images TCGdex basse définition (calculées à la volée, rien n'est conservé).
Reprise possible ; usage : python3 tools/build-vis.py [extension ...]
"""
import io, json, os, sys, time, urllib.request, urllib.error
import numpy as np
from PIL import Image
from concurrent.futures import ThreadPoolExecutor

ART = (0.08, 0.11, 0.92, 0.54)
UA = {'User-Agent': 'Mozilla/5.0 (pijakollection-tools)'}

def fetch(url):
    for attempt in range(3):
        try: return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            time.sleep(1.5 * (attempt + 1))
        except Exception: time.sleep(1.5 * (attempt + 1))
    return None

def desc(data):
    im = Image.open(io.BytesIO(data)).convert('RGB'); w, h = im.size
    c = im.crop((int(ART[0] * w), int(ART[1] * h), int(ART[2] * w), int(ART[3] * h))).resize((24, 24), Image.BOX)
    a = np.asarray(c, dtype=np.float32) / 255.0
    g = a.reshape(6, 4, 6, 4, 3).mean(axis=(1, 3))
    g = g - g.mean(axis=(0, 1), keepdims=True); g = g / (np.linalg.norm(g) + 1e-6)
    hsv = np.asarray(c.convert('HSV'), dtype=np.float32).reshape(-1, 3) / 255.0
    # même pondération que le navigateur : chroma = max - min des composantes RVB
    rgb = a.reshape(-1, 3); mx = rgb.max(axis=1); df = mx - rgb.min(axis=1)
    mr, mg, mb = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    hue = np.where(df < 1e-6, 0, np.where(mx == mr, ((mg - mb) / np.maximum(df, 1e-6)) % 6, np.where(mx == mg, (mb - mr) / np.maximum(df, 1e-6) + 2, (mr - mg) / np.maximum(df, 1e-6) + 4))) / 6
    hue = hue % 1.0
    hb = np.zeros(12, dtype=np.float32); ok = (df > 1e-6) & (mx > 1e-6)
    np.add.at(hb, np.minimum(11, (hue[ok] * 12).astype(int)), df[ok]); hb /= hb.sum() + 1e-6
    q = np.concatenate([np.clip(np.round(g.ravel() * 127 + 128), 0, 255), np.clip(np.round(hb * 255), 0, 255)]).astype(np.uint8)
    return q.tobytes()

def main():
    meta = json.load(open('data/sets-meta.json'))['sets']; names = json.load(open('data/names.json'))
    want = sys.argv[1:] or [s for s in names if s in meta]
    os.makedirs('data/vis', exist_ok=True)
    for sid in want:
        out = f'data/vis/{sid}.bin'
        if os.path.exists(out) and not sys.argv[1:]: continue
        rows = names[sid]; serie = meta[sid][0]
        def one(r):
            odd = len(r) > 2 and isinstance(r[2], str); lid = r[1] if odd else r[0]; noimg = (len(r) > 3 and r[3] == 0) if odd else (len(r) > 2 and r[2] == 0)
            if noimg: return bytes(120)
            for lang in ('fr', 'en'):
                d = fetch(f'https://assets.tcgdex.net/{lang}/{serie}/{sid}/{lid}/low.webp')
                if d:
                    try: return desc(d)
                    except Exception: pass
            return bytes(120)
        with ThreadPoolExecutor(16) as ex: blobs = list(ex.map(one, rows))
        open(out, 'wb').write(b''.join(blobs))
        print(f'{sid} : {sum(1 for b in blobs if any(b))}/{len(rows)}', flush=True)
    merge(names, meta)

def merge(names, meta):
    """Assemble les fichiers par extension en un seul data/vis.bin + data/vis-index.json ({ extension: { o: rang de la 1re carte, n: nombre } })."""
    index, parts, off = {}, [], 0
    for sid in names:
        f = f'data/vis/{sid}.bin'
        if sid not in meta or not os.path.exists(f): continue
        b = open(f, 'rb').read(); n = len(b) // 120
        index[sid] = {'o': off, 'n': n}; parts.append(b); off += n
    open('data/vis.bin', 'wb').write(b''.join(parts)); json.dump(index, open('data/vis-index.json', 'w'), separators=(',', ':'))
    print(f'vis.bin : {off} cartes, {off * 120 // 1024} Ko')

if __name__ == '__main__':
    main()
