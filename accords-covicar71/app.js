import { EMPREINTE_MDP } from './config.js';
import { CALCULS } from './moteur/calculs.js';
import { chercherFiches, chercherTexte } from './moteur/recherche.js';

const $ = s => document.querySelector(s);
const vue = $('#vue');
let FICHES = [], SYN = {}, CORPUS = null, DOCS_TITRES = {};
const NIVEAU = { accord: 'Accord', convention: 'Convention', nao: 'NAO 2026', code: 'Code du travail' };

function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat()) if (e != null) el.append(e.nodeType ? e : document.createTextNode(e));
  return el;
}
const remplir = (el, ...xs) => el.replaceChildren(...xs.flat(Infinity).filter(x => x != null));
const tags = (liste = []) => h('div', {}, liste.map(t => h('span', { class: 'tag' + (t.startsWith('✓') ? ' ok' : '') }, t)));

// ---- Accès (mot de passe côté navigateur : pas une vraie sécurité) ----
async function empreinte(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
$('#formPorte').addEventListener('submit', async e => {
  e.preventDefault();
  if (await empreinte($('#mdp').value) === EMPREINTE_MDP) {
    $('#porte').hidden = true; $('#appli').hidden = false; $('#mdp').value = ''; accueil();
  } else $('#erreurMdp').hidden = false;
});

// ---- Écrans ----
function accueil() {
  $('#q').value = '';
  const parTheme = new Map();
  for (const f of FICHES) { if (!parTheme.has(f.theme)) parTheme.set(f.theme, []); parTheme.get(f.theme).push(f); }
  remplir(vue, ...[...parTheme].flatMap(([theme, fs]) => [h('div', { class: 'theme' }, theme), h('div', { class: 'liste' }, fs.map(boutonFiche))]));
}
const boutonFiche = f => h('button', { class: 'sec', type: 'button', onclick: () => ouvrirFiche(f) }, f.question);

function recherche(q) {
  const r = chercherFiches(q, FICHES, SYN);
  if (r.mode === 'direct') ouvrirFiche(r.fiches[0]);
  else if (r.mode === 'theme') remplir(vue, h('h2', {}, 'Qu\'est-ce que vous cherchez ?'), h('div', { class: 'liste' }, r.fiches.map(boutonFiche)));
  else if (r.mode === 'fiches') remplir(vue, h('div', { class: 'liste' }, r.fiches.map(boutonFiche)));
  else rechercheTexte(q);
}

async function rechercheTexte(q) {
  remplir(vue, h('p', {}, 'Recherche dans les textes…'));
  try { if (!CORPUS) CORPUS = await (await fetch('data/corpus.json')).json(); }
  catch { remplir(vue, h('p', { class: 'erreur' }, 'Textes indisponibles hors ligne pour le moment.')); return; }
  const res = chercherTexte(q, CORPUS);
  remplir(vue, 
    h('h2', {}, 'Pas de fiche prévue pour cette question'),
    res.length ? h('p', {}, 'Passages trouvés (texte exact, aucune réponse rédigée) :') : h('p', {}, 'Aucun passage ne contient exactement ces mots.'),
    ...res.map(r => h('div', { class: 'carte' }, h('b', {}, `${r.titre}, p.${r.page}`), r.scan ? tags(['Vérifier le chiffre sur l\'image']) : null, h('div', { class: 'cite' }, r.extrait))));
}

function ouvrirFiche(f) {
  const valeurs = {};
  const champsEl = f.champs.map(c => {
    let ctl;
    if (c.type === 'select') { ctl = h('select', { id: 'c_' + c.id }, c.options.map(([v, l]) => h('option', { value: v }, l))); valeurs[c.id] = c.options[0][0]; }
    else if (c.type === 'checkbox') { ctl = h('input', { id: 'c_' + c.id, type: 'checkbox' }); valeurs[c.id] = false; }
    else if (c.type === 'date') { ctl = h('input', { id: 'c_' + c.id, type: 'date' }); valeurs[c.id] = ''; }
    else { ctl = h('input', { id: 'c_' + c.id, type: 'number', inputmode: 'decimal', step: c.step || '1', min: c.min, max: c.max, value: c.defaut }); valeurs[c.id] = c.defaut ?? 0; }
    ctl.addEventListener('input', () => {
      valeurs[c.id] = c.type === 'checkbox' ? ctl.checked : c.type === 'number' ? Number(ctl.value) || 0 : ctl.value;
      calculer();
    });
    return h('label', { class: c.type === 'checkbox' ? 'case' : '' }, c.type === 'checkbox' ? [ctl, c.label] : [c.label, ctl]);
  });
  const resultat = h('div', { class: 'carte' });
  function calculer() {
    const r = CALCULS[f.calcul](valeurs);
    remplir(resultat, 
      h('h3', {}, 'Calcul avec les valeurs saisies plus bas'),
      r.erreur ? h('p', { class: 'note' }, r.erreur) : null,
      r.info ? h('p', { class: 'note' }, r.info) : null,
      ...(r.lignes || []).map(l => h('div', {},
        h('div', { class: 'ligne' }, h('span', {}, h('span', { class: 'badge' }, NIVEAU[l.niveau] || l.niveau), l.label), h('b', {}, l.valeur)),
        l.note ? h('div', { class: 'note' }, l.note) : null)));
  }
  const niveaux = h('div', { class: 'niveaux' }, f.niveaux.map(n => h('div', { class: 'carte' },
    h('h3', {}, n.titre),
    h('ul', {}, n.regles.map(r => h('li', {}, r))),
    n.sources.map(s => h('div', { class: 'cite' },
      h('b', {}, `${DOCS_TITRES[s.doc]?.titre || s.doc} — ${s.article}, p.${s.page}`),
      h('em', {}, `« ${s.extrait} »`),
      s.note_ocr ? h('div', { class: 'note' }, s.note_ocr) : null,
      DOCS_TITRES[s.doc]?.scan ? tags([n.verifie_image || s.verifie_image ? '✓ Chiffre vérifié sur l\'image' : 'Vérifier le chiffre sur l\'image']) : null)))));
  remplir(vue,
    h('button', { class: 'sec', type: 'button', onclick: () => { accueil(); window.scrollTo(0, 0); } }, '← Retour'),
    h('h2', { style: 'margin-top:12px' }, f.question),
    tags(f.etiquettes),
    h('div', { class: 'carte reponse' }, h('h3', {}, 'La réponse en bref'), h('p', {}, f.reponse)),
    resultat,
    h('div', { class: 'carte' }, h('h3', {}, 'Précisez le cas du salarié (le calcul ci-dessus se met à jour)'), h('div', { class: 'champs' }, champsEl)),
    niveaux,
    f.notes?.length ? h('div', { class: 'carte' }, h('h3', {}, 'À savoir'), h('ul', {}, f.notes.map(n => h('li', {}, n)))) : null);
  calculer(); window.scrollTo(0, 0);
}

$('#formRecherche').addEventListener('submit', e => { e.preventDefault(); const q = $('#q').value.trim(); q ? recherche(q) : accueil(); });
$('#titre').addEventListener('click', accueil);

// ---- Démarrage ----
(async () => {
  const [f, s] = await Promise.all([fetch('fiches/fiches.json').then(r => r.json()), fetch('fiches/synonymes.json').then(r => r.json())]);
  FICHES = f.fiches; SYN = s;
  DOCS_TITRES = {
    subst: { titre: 'Accord de substitution', scan: true }, nao: { titre: 'NAO 2026', scan: true },
    cc: { titre: 'Convention collective IDCC 2216 (28 août 2025)', scan: false },
    avenant: { titre: 'Avenant intéressement 2026 (non signé)', scan: false }, interess: { titre: 'Accord d\'intéressement 2025', scan: true },
    pee: { titre: 'Règlement PEE', scan: true }, percol: { titre: 'Règlement PERCOL', scan: true }, livret: { titre: 'Livret CGT', scan: false },
  };
  $('#porte').hidden = false;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
