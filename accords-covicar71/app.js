import { EMPREINTE_MDP } from './config.js';
import { CALCULS } from './moteur/calculs.js';
import { chercherFiches, chercherTexte } from './moteur/recherche.js';

const $ = s => document.querySelector(s);
const vue = $('#vue');
let FICHES = [], SYN = {}, CORPUS = null, DOCS_TITRES = {}, CATS = [], FREQ = [];
let precedent = () => accueil(); // page à laquelle « Retour » ramène
const catDe = f => CATS.find(c => c.id === f.categorie) || { nom: '', icone: '📄', couleur: '#777' };
const NIVEAU = { accord: 'Accord', convention: 'Convention', nao: 'NAO 2026', code: 'Code du travail', pratique: 'Pratique RH' };

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
const fr = s => String(s).replace(/(\d)\.(\d)/g, '$1,$2'); // décimales à la française
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
function onglets(actif) {
  const nav = $('#onglets');
  nav.replaceChildren(...[{ id: 'accueil', nom: 'Accueil', icone: '🏠' }, ...CATS].map(c => h('button', {
    type: 'button', class: 'onglet' + (c.id === actif ? ' actif' : ''), style: c.couleur ? `--c:${c.couleur}` : '',
    onclick: () => { $('#q').value = ''; c.id === 'accueil' ? accueil() : vueCategorie(c.id); window.scrollTo(0, 0); }
  }, `${c.icone} ${c.nom}`)));
  const el = nav.querySelector('.actif'); if (el) el.scrollIntoView({ inline: 'center', block: 'nearest' });
}
const carteFiche = f => { const c = catDe(f); return h('button', { class: 'fiche-btn', type: 'button', style: `--c:${c.couleur}`, onclick: () => ouvrirFiche(f) },
  h('span', { class: 'fb-icone' }, c.icone), h('span', { class: 'fb-texte' }, f.question), h('span', { class: 'fb-fleche' }, '›')); };

function accueil() {
  $('#q').value = ''; precedent = accueil; onglets('accueil');
  const freq = FREQ.map(id => FICHES.find(f => f.id === id)).filter(Boolean);
  remplir(vue,
    h('h2', { class: 'accueil-titre' }, 'Que voulez-vous savoir ?'),
    h('p', { class: 'accueil-sous' }, 'Tapez votre question en haut, ou choisissez un sujet.'),
    h('div', { class: 'tuiles' }, CATS.map(c => h('button', { class: 'tuile', type: 'button', style: `--c:${c.couleur}`, onclick: () => { vueCategorie(c.id); window.scrollTo(0, 0); } },
      h('span', { class: 'tuile-icone' }, c.icone), h('span', { class: 'tuile-nom' }, c.nom), h('span', { class: 'tuile-desc' }, c.description),
      h('span', { class: 'tuile-nb' }, `${FICHES.filter(f => f.categorie === c.id).length} réponses`)))),
    h('h3', { class: 'section' }, '⭐ Questions fréquentes'),
    h('div', { class: 'liste' }, freq.map(carteFiche)));
}

function vueCategorie(id) {
  const c = CATS.find(x => x.id === id); precedent = () => vueCategorie(id); onglets(id);
  remplir(vue,
    h('div', { class: 'cat-entete', style: `--c:${c.couleur}` }, h('span', { class: 'cat-icone' }, c.icone), h('div', {}, h('h2', {}, c.nom), h('p', {}, c.description))),
    h('div', { class: 'liste' }, FICHES.filter(f => f.categorie === id).map(carteFiche)));
}

function recherche(q) {
  const r = chercherFiches(q, FICHES, SYN);
  const liste = fs => { precedent = () => { $('#q').value = q; recherche(q); }; onglets(null); return h('div', { class: 'liste' }, fs.map(carteFiche)); };
  if (r.mode === 'direct') { precedent = accueil; ouvrirFiche(r.fiches[0]); }
  else if (r.mode === 'theme') remplir(vue, h('h2', {}, 'Qu\'est-ce que vous cherchez ?'), liste(r.fiches));
  else if (r.mode === 'fiches') remplir(vue, h('h2', {}, 'Réponses possibles'), liste(r.fiches));
  else { precedent = accueil; rechercheTexte(q); }
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
  const champsEl = (f.champs || []).map(c => {
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
  const resultat = h('div', { class: 'carte reponse-finale' });
  function calculer() {
    if (!f.calcul) return;
    const r = CALCULS[f.calcul](valeurs);
    remplir(resultat,
      h('div', { class: 'rf-titre' }, 'Réponse pour ce salarié'),
      r.erreur ? h('p', { class: 'note' }, r.erreur) : null,
      r.info ? h('p', { class: 'note' }, r.info) : null,
      ...(r.lignes || []).map(l => h('div', { class: 'rf-ligne' },
        h('div', { class: 'rf-label' }, h('span', { class: 'badge' }, NIVEAU[l.niveau] || l.niveau), l.label),
        h('div', { class: 'rf-valeur' }, fr(l.valeur)),
        l.note ? h('div', { class: 'note' }, l.note) : null)));
  }
  const niveaux = h('div', { class: 'niveaux' }, f.niveaux.map(n => h('div', { class: 'carte' },
    h('h3', {}, n.titre),
    h('ul', {}, n.regles.map(r => h('li', {}, r))),
    n.sources.map(s => h('div', { class: 'cite' },
      h('b', {}, `${DOCS_TITRES[s.doc]?.titre || s.doc} — ${s.article}${s.doc === 'ct' ? '' : ', p.' + s.page}`),
      h('em', {}, `« ${s.extrait} »`),
      s.note_ocr ? h('div', { class: 'note' }, s.note_ocr) : null,
      DOCS_TITRES[s.doc]?.scan ? tags([n.verifie_image || s.verifie_image ? '✓ Chiffre vérifié sur l\'image' : 'Vérifier le chiffre sur l\'image']) : null)))));
  const notes = f.notes?.length ? h('div', { class: 'carte' }, h('h3', {}, 'À savoir'), h('ul', {}, f.notes.map(n => h('li', {}, n)))) : null;
  const textes = h('details', { class: 'textes' }, h('summary', {}, 'Voir les textes, les sources et les détails'), niveaux, notes);
  remplir(vue,
    h('button', { class: 'sec', type: 'button', onclick: () => { precedent(); window.scrollTo(0, 0); } }, '← Retour'),
    h('button', { class: 'puce-cat', type: 'button', style: `--c:${catDe(f).couleur}`, onclick: () => { vueCategorie(f.categorie); window.scrollTo(0, 0); } }, `${catDe(f).icone} ${catDe(f).nom}`),
    h('h2', { style: 'margin-top:8px' }, f.question),
    tags(f.etiquettes),
    h('div', { class: 'carte ' + (f.calcul ? 'enbref' : 'reponse-finale') },
      h('div', { class: f.calcul ? 'eb-titre' : 'rf-titre' }, f.calcul ? 'En bref' : 'La réponse'), h('p', { class: f.calcul ? '' : 'rf-texte' }, f.reponse)),
    f.calcul ? h('div', { class: 'carte' }, h('h3', {}, 'Cas du salarié : renseignez les champs'), h('div', { class: 'champs' }, champsEl)) : null,
    f.calcul ? resultat : null,
    textes);
  onglets(f.categorie); calculer(); window.scrollTo(0, 0);
}

$('#formRecherche').addEventListener('submit', e => { e.preventDefault(); const q = $('#q').value.trim(); q ? recherche(q) : accueil(); window.scrollTo(0, 0); });
$('#titre').addEventListener('click', accueil);

// ---- Démarrage ----
(async () => {
  const [f, s] = await Promise.all([fetch('fiches/fiches.json').then(r => r.json()), fetch('fiches/synonymes.json').then(r => r.json())]);
  FICHES = f.fiches; SYN = s; CATS = f.categories || []; FREQ = f.frequentes || [];
  DOCS_TITRES = {
    subst: { titre: 'Accord de substitution', scan: true }, nao: { titre: 'NAO 2026', scan: true },
    cc: { titre: 'Convention collective IDCC 2216 (28 août 2025)', scan: false },
    avenant: { titre: 'Avenant intéressement 2026 (non signé)', scan: false }, interess: { titre: 'Accord d\'intéressement 2025', scan: true },
    pee: { titre: 'Règlement PEE', scan: true }, particip: { titre: 'Accord de participation (signé le 24/11/2025)', scan: true }, percol: { titre: 'Règlement PERCOL', scan: true }, livret: { titre: 'Livret CGT', scan: false }, ct: { titre: 'Code du travail (code.travail.gouv.fr, version du 10/08/2016)', scan: false },
  };
  if (EMPREINTE_MDP) $('#porte').hidden = false; else { $('#appli').hidden = false; accueil(); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
