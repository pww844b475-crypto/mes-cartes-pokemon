"""Construit data/corpus.json à partir de extraits/<doc>/pN.txt (lancer : python3 -I tools/build_corpus.py)."""
import json, os, re
DOCS = {
 "subst": ("Accord de substitution Covicar 71", "02_Accord_de_substitution_Covicar71", 0, True),
 "nao": ("Accord NAO 2026", "03_Accord_NAO_2026", 0, True),
 "livret": ("Livret d'accueil CGT", "04_Livret_accueil_CGT", 0, False),
 "cc": ("Convention collective IDCC 2216 (version du 28 août 2025)", "05_Convention_collective_IDCC2216_sans_pub", 12, False),
 "interess": ("Accord d'intéressement du 30 juin 2025", "06_Accord_interessement_2025-06-30", 0, True),
 "avenant": ("Avenant d'intéressement 2026 (copie pour signature, non signée)", "07_Avenant_interessement_2026_version_pour_signature", 0, False),
 "syndical": ("Accord droit syndical et CSE central du 1er juin 2025", "08_Accord_droit_syndical_CSEC_2025-06-01", 0, True),
 "pee": ("Règlement du PEE du 9 octobre 2025", "09_Reglement_PEE_2025-10-09", 0, True),
 "percol": ("Règlement du PERCOL du 9 octobre 2025", "10_Reglement_PERCOL_2025-10-09", 0, True),
 "ct": ("Code du travail (articles L3133-7, L3133-8, L3133-10, L3133-11 glossaire jour ouvrable / jour ouvré, articles L3141-x et L1225-x ; page = ordre des textes)", "CT_Code_du_travail_extraits", 0, False),
 "particip": ("Projet d'accord de participation (non signé)", "11_Projet_accord_participation_NON_SIGNE", 0, False),
}
out = {}
for k, (titre, d, off, scan) in DOCS.items():
    pages = {}
    base = os.path.join("extraits", d)
    n = len([f for f in os.listdir(base) if f.endswith(".txt")])
    for i in range(1, n + 1):
        t = open(os.path.join(base, f"p{i}.txt"), encoding="utf-8", errors="replace").read()
        pages[str(i)] = re.sub(r"[ \t]+", " ", t).strip()
    out[k] = {"titre": titre, "offset": off, "scan": scan, "pages": pages}
# Corpus complet : usage local (tests de citations), jamais publié.
json.dump(out, open("data/corpus-complet.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
# Corpus public : sans le projet de participation non signé, la copie non signée de l'avenant, le livret CGT et la brochure de la convention collective.
EXCLUS_PUBLIC = {"particip", "avenant", "livret", "cc"}
json.dump({k: v for k, v in out.items() if k not in EXCLUS_PUBLIC}, open("data/corpus.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print({k: len(v["pages"]) for k, v in out.items()})
