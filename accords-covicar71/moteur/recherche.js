import { norm, distance } from './normalise.js';

const STOP = new Set(['de','du','des','la','le','les','un','une','et','en','a','au','aux','ma','mon','mes','je','ai','est','que','quel','quelle','quels','quelles','combien','pour','sur','dans','par','il','y']);

function tokens(s) { return norm(s).split(' ').filter(t => t && !STOP.has(t)); }

// Étend une requête avec les synonymes (dictionnaire {mot: [équivalents...]}).
export function etendre(tokensReq, synonymes) {
  const set = new Set(tokensReq);
  const phrase = tokensReq.join(' ');
  for (const [cle, liste] of Object.entries(synonymes)) {
    const groupe = [cle, ...liste].map(norm);
    if (groupe.some(g => g === phrase || tokensReq.includes(g) || (g.includes(' ') && phrase.includes(g))))
      groupe.forEach(g => g.split(' ').forEach(t => t && !STOP.has(t) && set.add(t)));
  }
  return [...set];
}

function tokMatch(t, mots) {
  let meilleur = 0;
  for (const m of mots) {
    if (m === t) return 1;
    if (t.length >= 4 && (m.startsWith(t) || t.startsWith(m) && m.length >= 4)) meilleur = Math.max(meilleur, 0.8);
    else if (t.length >= 5 && m.length >= 5 && distance(t, m) <= (t.length >= 8 ? 2 : 1)) meilleur = Math.max(meilleur, 0.7);
  }
  return meilleur;
}

export function indexerFiche(f) {
  const motsQuestion = tokens(f.question);
  const motsSyn = tokens((f.synonymes || []).join(' '));
  const motsTheme = tokens(f.theme);
  return { f, motsQuestion, motsSyn, motsTheme };
}

// Retourne { mode: 'fiches' | 'theme' | 'aucune', fiches: [...], theme?: ... }
export function chercherFiches(requete, fiches, synonymes = {}) {
  const base = tokens(requete);
  if (!base.length) return { mode: 'aucune', fiches: [] };
  const req = etendre(base, synonymes);
  const scores = fiches.map(indexerFiche).map(ix => {
    let s = 0;
    for (const t of req) {
      const poids = base.includes(t) ? 1 : 0.4; // mots issus du dictionnaire de synonymes : poids réduit
      s += poids * (tokMatch(t, ix.motsQuestion) * 3 + tokMatch(t, ix.motsSyn) * 2 + tokMatch(t, ix.motsTheme));
    }
    // expression exacte déclarée dans la fiche (synonyme) retrouvée dans la question : forte priorité
    const nq = ' ' + norm(requete) + ' ';
    for (const syn of (ix.f.synonymes || [])) { const ns = norm(syn); if (ns.length >= 4 && nq.includes(' ' + ns + ' ')) s += (ns.split(' ').length >= 3 ? 2 * ns.split(' ').length + 2 : 2 + ns.split(' ').length); }
    // couverture : au-delà d'un mot, plus de la moitié des mots cherchés (ou leurs synonymes) doivent se retrouver dans la fiche
    const mots = [...ix.motsQuestion, ...ix.motsSyn, ...ix.motsTheme];
    const couverts = base.filter(t => etendre([t], synonymes).some(u => tokMatch(u, mots) > 0)).length;
    if (base.length === 2 ? couverts < 2 : base.length >= 3 && couverts < 2) s = 0;
    return { fiche: ix.f, score: s };
  }).filter(x => x.score >= 2).sort((a, b) => b.score - a.score);
  if (!scores.length) return { mode: 'aucune', fiches: [] };
  // Mot large : une seule requête courte qui touche plusieurs fiches de même thème → proposer les boutons.
  // Une fiche nettement devant les autres : on l'ouvre directement.
  if (scores.length === 1 || scores[0].score >= 1.2 * scores[1].score) return { mode: 'direct', fiches: [scores[0].fiche] };
  const top = scores.slice(0, 8).map(x => x.fiche);
  if (base.length <= 2 && top.length >= 2) return { mode: 'theme', fiches: top, theme: top[0].theme };
  return { mode: 'fiches', fiches: top };
}

// Normalise un texte en gardant la correspondance de chaque caractère avec sa position d'origine.
function normaliserAvecPositions(brut) {
  let n = '', pos = [], dernierEspace = true;
  for (let i = 0; i < brut.length; i++) {
    const c = brut[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace('œ', 'oe');
    for (const ch of c) {
      if (/[a-z0-9]/.test(ch)) { n += ch; pos.push(i); dernierEspace = false; }
      else if (!dernierEspace) { n += ' '; pos.push(i); dernierEspace = true; }
    }
  }
  return { n, pos };
}

// Recherche de texte exact (sans accents ni casse) dans le corpus ; ne rédige aucune réponse.
export function chercherTexte(requete, corpus, max = 30) {
  const q = norm(requete); if (q.length < 3) return [];
  const resultats = [];
  for (const [id, doc] of Object.entries(corpus)) {
    for (const [pdfPage, texte] of Object.entries(doc.pages)) {
      if (!norm(texte).includes(q)) continue;
      const { n, pos } = normaliserAvecPositions(texte);
      const i = n.indexOf(q);
      const centre = i >= 0 ? pos[i] : 0;
      const brut = texte.replace(/\s+/g, ' ');
      const debut = Math.max(0, texte.slice(0, centre).replace(/\s+/g, ' ').length - 90);
      const pageCitee = id === 'cc' ? Number(pdfPage) - doc.offset : Number(pdfPage);
      resultats.push({ doc: id, titre: doc.titre, page: pageCitee, scan: doc.scan, extrait: '…' + brut.slice(debut, debut + 240) + '…' });
      if (resultats.length >= max) return resultats;
    }
  }
  return resultats;
}
