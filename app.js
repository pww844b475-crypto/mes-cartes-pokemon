'use strict';
/* Mes cartes Pokémon — application statique, données TCGdex (api.tcgdex.net). */

const API = 'https://api.tcgdex.net/v2';
// Langues proposées dans l'interface : français seulement. Le stockage garde aussi zh-cn et ja
// (cases déjà cochées) pour ne rien perdre : elles sont simplement masquées et conservées dans les sauvegardes.
const LANGS = [
  { id: 'fr', name: 'Français', native: 'Français', flag: '🇫🇷' },
];
const STORAGE_LANGS = ['fr', 'zh-cn', 'ja'];
const LANG_IDS = LANGS.map((l) => l.id);
const langLabel = (id) => (LANGS.find((x) => x.id === id)?.name || id).toLowerCase();
const langAttr = (id) => (id === 'zh-cn' ? 'zh-CN' : id);
const K = {
  owned: 'cartes.v1',       // ancien format (listes d'identifiants) — conservé tel quel, jamais supprimé
  owned2: 'cartes.v2',      // format actuel (identifiant → quantité)
  lang: 'cartes.lang', cov: 'cartes.cov', exp: 'cartes.lastExport', tip: 'cartes.tipHidden', order: 'cartes.order',
  friends: 'cartes.friends.v1', pseudo: 'cartes.pseudo',
  splash: 'cartes.splash', // 'off' = écran d'ouverture désactivé
  meta: 'cartes.setmeta', blocks: 'cartes.blocks', prices: 'cartes.prices', ebay: 'cartes.ebay', cmslug: 'cartes.cmslug6', view: 'cartes.view', setview: 'cartes.setview', boosters: 'cartes.boosters',
};
const BACKUP_VERSION = 3;   // sauvegarde personnelle (3 : quantités par version de carte)
const SHARE_VERSION = 2;    // fichier de partage entre amis (2 : quantités par version de carte)
const MAXQ = 99;
const MAX_TEXT = 5 * 1024 * 1024;
const CC_IDS = new Set(['cel25cc', '30th-c']); // Collection Classique (TCGdex fr) : pas d'images, on partage nom + numéro

/* ---------- Utilitaires ---------- */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};
const $app = document.getElementById('app');
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plural = (n, one, many) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;
const nullObj = () => Object.create(null);
const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '?' : d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }); };

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}

/* ---------- Écran de chargement animé (vidéo) : n'apparaît que si l'attente dure ---------- */
const loader = (() => {
  const SHOW_AFTER = 450, MIN_SHOW = 1000;      // ms : délai avant affichage (pas d'éclair), durée minimale une fois affiché
  let box = null, vid = null, txt = null, timer = 0, hideT = 0, shownAt = 0;
  const tasks = new Set(), skipped = new Set();
  const live = () => [...tasks].filter((t) => !skipped.has(t));
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function build() {
    if (box) return;
    vid = h('video', { class: 'ld-vid', loop: true, playsinline: true, preload: 'none', poster: 'images/loading-poster.webp', 'aria-hidden': 'true', disablepictureinpicture: true, tabindex: '-1' }, h('source', { src: 'images/loading.mp4', type: 'video/mp4' }));
    vid.muted = true; vid.defaultMuted = true; vid.setAttribute('muted', '');
    txt = h('p', { class: 'ld-text' });
    const skip = h('button', { type: 'button', class: 'ld-skip', onclick: () => { tasks.forEach((t) => skipped.add(t)); hide(true); } }, 'Continuer sans attendre');
    box = h('div', { id: 'loader', class: 'loader', role: 'status', 'aria-live': 'polite', hidden: true }, h('div', { class: 'ld-box' }, vid, txt, skip));
    document.body.append(box);
  }
  function show() {
    build(); const t = live().slice(-1)[0]; if (!t) return;
    txt.textContent = t.text || '';
    if (box.hidden) { box.hidden = false; shownAt = Date.now(); if (!reduce()) { try { const p = vid.play(); if (p && p.catch) p.catch(() => {}); } catch { /* ignoré */ } } }
  }
  function hide(force) {
    if (!box || box.hidden) return;
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (live().length && !force) return; box.hidden = true; try { vid.pause(); } catch { /* ignoré */ } }, force ? 0 : Math.max(0, MIN_SHOW - (Date.now() - shownAt)));
  }
  return {
    start(text) {
      const t = { text }; tasks.add(t);
      if (!timer && !(box && !box.hidden)) timer = setTimeout(() => { timer = 0; show(); }, SHOW_AFTER);
      return {
        set(x) { t.text = x; if (box && !box.hidden && live().slice(-1)[0] === t) txt.textContent = x; },
        done() { tasks.delete(t); skipped.delete(t); if (!tasks.size) { clearTimeout(timer); timer = 0; hide(false); } },
      };
    },
    preload() { build(); vid.preload = 'auto'; try { vid.load(); } catch { /* ignoré */ } },     // télécharge la vidéo en avance, quand l'application est au repos
  };
})();

let toastTimer;
function toast(msg, action) { // action : { label, run } → bouton dans le message (ex. « Annuler »)
  const t = document.getElementById('toast');
  t.replaceChildren(msg); t.classList.toggle('act', !!action);
  if (action) t.append(h('button', { type: 'button', class: 'toast-btn', onclick: () => { t.classList.remove('show'); clearTimeout(toastTimer); action.run(); } }, action.label));
  t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), action ? 9000 : 3200);
}

/* ---------- Collection : owned[langue][extension][id de carte] = quantité ---------- */
function emptyOwned() { return { fr: nullObj(), 'zh-cn': nullObj(), ja: nullObj() }; }

// Accepte l'ancien format (tableaux d'identifiants → quantité 1) et le nouveau (objets id → quantité).
// Une carte possédée vaut soit un nombre (quantité d'une carte à version unique, ou ancienne coche),
// soit un objet { cléDeVersion: quantité }. La clé '_' = « version non précisée » (ancienne coche sur une carte à plusieurs versions).
const isMulti = (v) => v !== null && typeof v === 'object';
const qtyTotal = (v) => (isMulti(v) ? Object.values(v).reduce((a, b) => a + b, 0) : (v | 0));
const qtyMax = (v) => (isMulti(v) ? Object.values(v).reduce((a, b) => Math.max(a, b), 0) : (v | 0));
function cleanQty(q) {
  if (q !== null && typeof q === 'object' && !Array.isArray(q)) {
    const o = nullObj();
    for (const [k, v] of Object.entries(q).slice(0, 40)) {
      if (k.length > 120) continue;
      const n = Math.min(MAXQ, Math.floor(Number(v)));
      if (n >= 1) o[k] = n;
    }
    const ks = Object.keys(o);
    if (!ks.length) return 0;
    if (ks.length === 1 && ks[0] === '_') return o._;
    return o;
  }
  const n = Math.min(MAXQ, Math.floor(Number(q)));
  return n >= 1 ? n : 0;
}
function mergeQty(a, b) { // fusion de deux possessions d'une même carte : la plus grande quantité, version par version
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (!isMulti(a) && !isMulti(b)) return Math.max(a, b);
  const A = isMulti(a) ? { ...a } : { _: a }, B = isMulti(b) ? b : { _: b };
  for (const [k, q] of Object.entries(B)) A[k] = Math.max(A[k] || 0, q);
  return A;
}
function setQty(mine, id, key, q) { // key : clé de version, ou null pour une carte à version unique
  q = Math.max(0, Math.min(MAXQ, q | 0));
  if (key === null) { if (q) mine[id] = q; else delete mine[id]; return; }
  const v = mine[id];
  const o = isMulti(v) ? v : (v ? { _: v | 0 } : nullObj());
  if (q) o[key] = q; else delete o[key];
  if (!Object.keys(o).length) delete mine[id]; else mine[id] = o;
}

function sanitizeOwned(o) {
  const r = emptyOwned();
  let budget = 200000;
  for (const l of STORAGE_LANGS) {
    const sets = o && typeof o === 'object' ? o[l] : null;
    if (!sets || typeof sets !== 'object') continue;
    for (const [sid, val] of Object.entries(sets)) {
      if (sid.length > 80 || !val || typeof val !== 'object') continue;
      const m = nullObj();
      const entries = Array.isArray(val) ? val.map((id) => [id, 1]) : Object.entries(val);
      for (const [id, q] of entries) {
        if (budget-- <= 0) break;
        if (typeof id !== 'string' || !id || id.length > 80) continue;
        const n = cleanQty(q);
        if (n) m[id] = n;
      }
      if (Object.keys(m).length) r[l][sid] = m;
    }
  }
  return r;
}

// Noms/numéros des cartes (Collection Classique uniquement) : meta[langue][extension][id] = [numéro, nom]
function sanitizeMeta(o) {
  const r = {};
  if (!o || typeof o !== 'object') return r;
  for (const l of STORAGE_LANGS) {
    const sets = o[l];
    if (!sets || typeof sets !== 'object') continue;
    for (const [sid, cards] of Object.entries(sets)) {
      if (sid.length > 80 || !cards || typeof cards !== 'object') continue;
      for (const [id, v] of Object.entries(cards).slice(0, 2000)) {
        if (id.length > 80 || !Array.isArray(v)) continue;
        ((r[l] ||= nullObj())[sid] ||= nullObj())[id] = [String(v[0] ?? '').slice(0, 20), String(v[1] ?? '').slice(0, 80)];
      }
    }
  }
  return r;
}

function loadOwned() {
  // 1) format actuel ; 2) à défaut (ou s'il est illisible), ancien format — qui reste intact dans le stockage.
  for (const key of [K.owned2, K.owned]) {
    const raw = store.get(key);
    if (raw == null) continue;
    try { return sanitizeOwned(JSON.parse(raw)); } catch { /* essaie le suivant */ }
  }
  return emptyOwned();
}
let owned = loadOwned();

let saveWarned = false;
function saveOwned() {
  const ok = store.set(K.owned2, JSON.stringify(owned));
  if (!ok && !saveWarned) { saveWarned = true; toast('⚠️ Impossible d’enregistrer sur cet appareil. Exportez une sauvegarde.'); }
  return ok;
}
const countKeys = (m) => (m ? Object.keys(m).length : 0);
const ownedCount = (l, sid) => countKeys(owned[l][sid]);
const ownedTotal = (l) => Object.entries(owned[l]).reduce((n, [sid, m]) => n + (isDigital(l, sid) ? 0 : countKeys(m)), 0);
const doublesCount = (m) => Object.values(m || {}).filter((v) => qtyMax(v) >= 2).length;

try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* ignoré */ }

/* ---------- Amis : données importées, stockées uniquement sur cet appareil ---------- */
function loadFriends() {
  const out = {};
  try {
    const raw = JSON.parse(store.get(K.friends) || '{}');
    for (const [id, f] of Object.entries(raw || {})) {
      if (!f || typeof f !== 'object' || id.length > 80) continue;
      out[id] = {
        id, name: String(f.name || 'Ami').slice(0, 40), pseudo: String(f.pseudo || '').slice(0, 40),
        date: typeof f.date === 'string' ? f.date : null, imported: typeof f.imported === 'string' ? f.imported : null,
        owned: sanitizeOwned(f.owned), meta: sanitizeMeta(f.meta),
      };
    }
  } catch { /* données illisibles : liste vide, sans rien casser */ }
  return out;
}
let friends = loadFriends();
const saveFriends = () => store.set(K.friends, JSON.stringify(friends));
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

/* ---------- Couverture des données : instantané + constat en direct ---------- */
let snapshot = {};
let live = {};
try { live = JSON.parse(store.get(K.cov) || '{}') || {}; } catch { live = {}; }
const snapReady = fetch('coverage.json').then((r) => (r.ok ? r.json() : {})).then((j) => { snapshot = j || {}; }).catch(() => {});

function coverage(l, id) { return (live[l] && live[l][id]) || (snapshot[l] && snapshot[l][id]) || null; }
function rememberCoverage(l, id, n, img) { (live[l] ||= {})[id] = [n, img]; store.set(K.cov, JSON.stringify(live)); }
function dataStatus(l, set, cov) {
  const c = cov || coverage(l, set.id);
  if (!c) return null;
  const total = set.cardCount?.total ?? 0;
  const [n, img] = c;
  if (n === 0) return { lvl: 'bad', txt: 'Cartes indisponibles dans TCGdex' };
  if (n < total) return { lvl: 'warn', txt: `Incomplète : ${n} cartes sur ${total}` };
  if (img === 0) return { lvl: 'info', txt: 'Aucune image disponible' };
  if (img < n) return { lvl: 'info', txt: `Images : ${img} sur ${n}` };
  return null;
}

/* ---------- Scans de remplacement : cartes sans image dans TCGdex ---------- */
// data/scans.json : { cartes: { idCarte: { p: dossier contenant low.webp et high.webp } } } — scans PokéCardex embarqués dans l'application.
// Ne liste que des cartes dont TCGdex n'a pas d'image, ou dont l'adresse d'image ne répond pas (404) : le scan remplace alors l'image TCGdex.
let scans = {};
const localScansReady = fetch('data/scans.json').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.cards) scans = j.cards; }).catch(() => {});
// data/scans-remote.json : { idCarte: [code de série PokéCardex, n° d'image] } — adresses des mêmes cartes sur le serveur d'images de PokéCardex,
// utilisées seulement en repli (appareil sans AVIF) : taille « md » pour la grille, « hd » à l'agrandissement.
let remote = {}, remoteBase = 'https://pokecardex-scans.b-cdn.net/sets/';
const remoteScansReady = fetch('data/scans-remote.json').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.cards) { remote = j.cards; if (j._base) remoteBase = j._base; } }).catch(() => {});
// data/scans-embedded.json : { ids } — scans embarqués dans l'application (AVIF 444×620, une seule image par carte pour la grille et l'agrandissement) :
// images/scans/cards/<id de carte, caractères spéciaux en _XX>.avif. Le serveur de PokéCardex ne sert plus que de repli si l'appareil ne sait pas lire l'AVIF.
let embedded = new Set();
const embeddedReady = fetch('data/scans-embedded.json').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.ids) embedded = new Set(j.ids); }).catch(() => {});
const slugId = (id) => id.replace(/[^A-Za-z0-9._-]/g, (ch) => '_' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
let avifOk = true;
const avifReady = new Promise((res) => {   // l'AVIF se lit sur iOS / iPadOS 16 et plus, et sur les navigateurs récents
  const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false);
  i.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAJwAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAAgAAAAIAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAL21kYXQSAAoIGAA2iAhoNCAyGRlHh4Yhh5555oAAAJBAyRxhSgnBjgTNEYw='; setTimeout(() => res(false), 4000);
}).then((v) => { avifOk = v; return v; });
const scansReady = Promise.all([localScansReady, remoteScansReady, embeddedReady, avifReady]);
function applyScans(cards) {
  let n = 0;
  for (const c of cards) {
    if (c._scan) continue;
    const sc = scans[c.id], rm = remote[c.id];
    if (sc) {
      c.image = sc.p; c._scan = true; n++;
      if (sc.n) { c._lid = c.localId; c.localId = sc.n; }     // numéro imprimé sur la carte (« 4/102 », « R/RGB »)
    } else if (embedded.has(c.id) && avifOk) {
      c.image = `images/scans/cards/${slugId(c.id)}.avif`; c._emb = true; c._scan = true; n++;
    } else if (rm) {                                           // repli : appareil sans AVIF
      c._remote = rm; c.image = `${remoteBase}${rm[0]}/FR/${rm[1]}.jpg`; c._scan = true; n++;
    }
  }
  return n;
}
const imgLow = (c) => (c._emb ? c.image : c._remote ? c.image + '?class=md' : c.image + '/low.webp');     // grille
const imgHigh = (c) => (c._emb ? c.image : c._remote ? c.image + '?class=hd' : c.image + '/high.webp');   // agrandissement
// data/order.json : vrai ordre des cartes (celui de PokéCardex) pour les extensions où TCGdex les range autrement.
let orders = {};
const orderReady = fetch('data/order.json').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) orders = j; }).catch(() => {});
// Groupes de cartes à lettres (RC, TG, SV, H…) : ordre naturel RC1, RC2… RC10 (TCGdex les range RC1, RC10, RC11…). Les cartes à numéro simple gardent l'ordre de TCGdex, chaque groupe reste à sa place.
function natGroups(cards) {
  const first = new Map(); cards.forEach((c, i) => { const g = numGroup(c.localId); if (!first.has(g)) first.set(g, i); });
  const num = (c) => { const m = lidShow(c.localId).match(/\d+/); return m ? parseInt(m[0], 10) : 0; };
  return cards.map((c, i) => [c, i]).sort((a, b) => {
    const ga = numGroup(a[0].localId), gb = numGroup(b[0].localId);
    if (ga !== gb) return first.get(ga) - first.get(gb);
    if (ga === '' || ga === '*') return a[1] - b[1];
    return num(a[0]) - num(b[0]) || a[1] - b[1];
  }).map((x) => x[0]);
}
function sortCards(L, setId, cards) {
  const o = orders[L] && orders[L][setId];
  if (!o) return natGroups(cards);
  const pos = new Map(o.map((id, i) => [id, i]));
  return cards.map((c, i) => [c, i]).sort((a, b) => (pos.has(a[0].id) ? pos.get(a[0].id) : 1e6 + a[1]) - (pos.has(b[0].id) ? pos.get(b[0].id) : 1e6 + b[1])).map((x) => x[0]);
}

/* ---------- Réseau ---------- */
const mem = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path) {
  if (mem.has(path)) return mem.get(path);
  let err;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + path);
      if (r.ok) { const j = await r.json(); mem.set(path, j); return j; }
      err = new Error('HTTP ' + r.status);
      if (r.status < 500) break;
    } catch (e) { err = e; }
    await sleep(600 * (i + 1));
  }
  throw err;
}

/* ---------- Extensions du jeu en ligne (Pokémon Pocket) : masquées ---------- */
const digital = {}; // langue → Set des identifiants d'extensions numériques
const DIGITAL_SERIES = 'tcgp';
const DIGITAL_FALLBACK_FR = ['P-A', 'A1', 'A1a', 'A2', 'A2a', 'A2b', 'A3', 'A3a', 'A3b', 'A4', 'A4a', 'B1', 'B1a', 'B2', 'B2a'];
async function digitalIds(L) {
  if (digital[L]) return digital[L];
  let ids;
  try { ids = new Set(((await api(`/${L}/series/${DIGITAL_SERIES}`)).sets || []).map((x) => x.id)); } catch (e) {
    // 404 : cette langue n'a pas de série numérique. Autre erreur : liste connue en français, sinon rien de masqué.
    ids = new Set(/HTTP 404/.test(e.message || '') || L !== 'fr' ? [] : DIGITAL_FALLBACK_FR);
  }
  return (digital[L] = ids);
}
// Extensions listées par TCGdex mais sans aucune carte en français : pas affichées. « Radiant Collection » (rc ; les cartes RC sont dans Générations), « W Promotional » (wp), « Cartes Jumbo » (jumbo).
const HIDDEN_SETS = new Set(['rc', 'wp', 'jumbo']);
async function loadSets(L) {
  const [all, dig] = await Promise.all([api(`/${L}/sets`), digitalIds(L)]);
  const sets = all.filter((s) => !dig.has(s.id) && !HIDDEN_SETS.has(s.id));
  return { sets, hidden: all.length - sets.length };
}
const isDigital = (l, sid) => !!(digital[l] && digital[l].has(sid));

/* ---------- Images à la demande ---------- */
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); en.target.src = en.target.dataset.src; }
  }, { rootMargin: '400px' })
  : null;

// Logos absents de TCGdex (nouvelles sorties, promos) : copies locales (source : pokecardex.com), réduites en WebP
const LOCAL_LOGOS = new Set(['me06', 'base1', 'sve', 'mee', 'mep', '30th', 'svp']);
const LOGO_OVERRIDE = new Set(['swsh3', 'me05']);      // logo TCGdex à fond blanc opaque (swsh3) ou introuvable (me05) : copie locale prioritaire
const setLogoUrl = (id, data) => (LOGO_OVERRIDE.has(id) ? `images/set-logos/${id}.webp` : data && data.logo ? data.logo + '.webp' : LOCAL_LOGOS.has(id) ? `images/set-logos/${id}.webp` : data && data.symbol ? data.symbol + '.webp' : null);
function lazyImg(src, alt, onfail) {
  const i = h('img', { alt, decoding: 'async', draggable: 'false' });
  i.dataset.src = src;
  i.addEventListener('load', () => i.classList.add('ok'));
  i.addEventListener('error', onfail);
  if (io) io.observe(i); else i.src = src;
  return i;
}

/* ---------- Routage : #fr · #fr/SV7a · #chercher · #amis · #comparer/<ami>/<langue> ---------- */
let lang = LANG_IDS.includes(store.get(K.lang)) ? store.get(K.lang) : 'fr';
let tok = 0;
let listScroll = 0;

function parseHash() {
  let parts;
  try { parts = decodeURIComponent(location.hash.slice(1)).split('/'); } catch { parts = []; }
  if (parts[0] === 'amis') return { view: 'friends' };
  if (parts[0] === 'chercher') return { view: 'search', own: parts[1] === 'own' || parts[1] === 'top', sort: parts[1] === 'top' ? 'price' : '', rar: parts[1] === 'own' ? parts[2] || '' : '', q: parts[1] === 'q' ? parts.slice(2).join('/') : '' };
  if (parts[0] === 'comparer') return { view: 'compare', fid: parts[1] || '', lang: LANG_IDS.includes(parts[2]) ? parts[2] : lang };
  if (!LANG_IDS.includes(parts[0])) return { view: 'sets', lang: null, set: null }; // ancien lien (#ja, #zh-cn…) → liste française
  return { view: 'sets', lang: parts[0], set: parts[1] || null };
}
function go(l, s) { location.hash = '#' + l + (s ? '/' + encodeURIComponent(s) : ''); }

function route() {
  const r = parseHash();
  tok++;
  if (io) io.disconnect();
  if (r.view === 'friends') return showFriends(tok);
  if (r.view === 'search') return showSearch(lang, tok, r);
  if (r.view === 'compare') return showCompare(r.fid, r.lang, tok);
  if (r.lang) { lang = r.lang; store.set(K.lang, lang); }
  if (r.set) showSet(lang, r.set, tok); else showList(tok);
}
window.addEventListener('hashchange', route);
// Écrans courts : l'en-tête se retire quand on fait défiler vers le bas et revient quand on remonte (ou quand on touche la recherche).
{
  const mq = window.matchMedia ? matchMedia('(max-height: 620px)') : { matches: false };
  let last = 0;
  window.addEventListener('scroll', () => {
    const t = document.querySelector('.top'); if (!t) return;
    const y = window.scrollY;
    if (!mq.matches || y < 90) { t.classList.remove('hide'); last = y; return; }
    if (y > last + 10) t.classList.add('hide'); else if (y < last - 10) t.classList.remove('hide');
    last = y;
  }, { passive: true });
  document.addEventListener('focusin', (e) => { const t = document.querySelector('.top'); if (t && e.target.closest && e.target.closest('.top')) t.classList.remove('hide'); });
}

/* ---------- Éléments communs ---------- */
function langSwitch(current, onPick) {
  if (LANGS.length < 2) return null; // une seule langue : pas de sélecteur
  return h('div', { class: 'seg', role: 'group', 'aria-label': 'Langue' },
    LANGS.map((l) => h('button', { type: 'button', 'aria-pressed': String(l.id === current), lang: langAttr(l.id), 'aria-label': l.name, onclick: () => onPick(l.id) },
      h('span', { class: 'ln' }, `${l.flag} ${l.short || l.name}`), l.id === 'fr' ? null : h('span', { class: 'ls' }, l.native))));
}
function errorBox(msg, retry) {
  return h('div', { class: 'note bad' }, h('b', {}, 'Chargement impossible. '), msg, h('br'), h('button', { type: 'button', onclick: retry }, 'Réessayer'));
}
const spinner = () => h('div', { class: 'spinner', role: 'progressbar', 'aria-label': 'Chargement' });
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

function privacyNote(extra) {
  return h('div', { class: 'note priv' }, h('b', {}, '🔒 Vos données restent chez vous. '),
    'Les données de vos amis sont stockées uniquement sur cet appareil et ne sont envoyées nulle part : cette application n’a ni serveur ni compte. ',
    'Seules les listes et images publiques de cartes sont demandées à TCGdex (et, uniquement sur un appareil trop ancien pour lire les images AVIF embarquées, au serveur d’images de PokéCardex pour quelques cartes). ', extra || '');
}

/* ---------- Regroupement : collections classiques et galeries de dresseurs ---------- */
// enfant → extension parente (TCGdex fr). Ces cartes font partie de la même collection que leur parent.
// Les cases cochées restent enregistrées sous l'identifiant d'origine de chaque carte : rien à migrer.
const MERGE_INTO = {
  'cel25cc': 'cel25', '30th-c': '30th', 'exu': 'ex10',
  'sma': 'sm115', 'swsh4.5sv': 'swsh4.5',      // Coffres Étincelants (Destinées Occultes, Destinées Radieuses) : cartes SV de leur extension      // exu : Collection Zarbi (A/28 … ?/28), cartes secrètes d'EX Forces Cachées
  'swsh9tg': 'swsh9', 'swsh10tg': 'swsh10', 'swsh11tg': 'swsh11', 'swsh12tg': 'swsh12', 'swsh12.5gg': 'swsh12.5',
};
const parentOf = (sid, idSet) => (MERGE_INTO[sid] && idSet.has(MERGE_INTO[sid]) ? MERGE_INTO[sid] : sid);
function buildGroups(sets) {
  const ids = new Set(sets.map((s) => s.id));
  const groups = new Map();
  for (const s of sets) if (parentOf(s.id, ids) === s.id) groups.set(s.id, { id: s.id, set: s, members: [s] });
  for (const s of sets) { const p = parentOf(s.id, ids); if (p !== s.id) groups.get(p).members.push(s); }
  return groups;
}
const groupTotal = (g) => g.members.reduce((n, m) => n + (m.cardCount?.total ?? 0), 0);
function groupStatus(L, g) {
  let n = 0, img = 0;
  for (const m of g.members) { const c = coverage(L, m.id); if (!c) return null; n += c[0]; img += c[1]; }
  return dataStatus(L, { cardCount: { total: groupTotal(g) } }, [n, img]);
}

/* ---------- Blocs (séries TCGdex), du plus récent au plus ancien ---------- */
// data/sets-meta.json : série + date de sortie de chaque extension (instantané). Une extension absente (nouvelle sortie)
// est résolue en direct (1 requête, mémorisée). Sans information, elle va dans « Promos ».
let setsMeta = { series: {}, sets: {} };
const metaReady = fetch('data/sets-meta.json').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.sets) setsMeta = j; }).catch(() => {});
let liveMeta = {};
try { liveMeta = JSON.parse(store.get(K.meta) || '{}') || {}; } catch { liveMeta = {}; }
const PROMO_SERIES = new Set(['pop', 'mc', 'tk', 'misc']); // pas de vrai bloc : tout va dans « Promos »
const setMeta = (id) => setsMeta.sets[id] || liveMeta[id] || null; // [série, date, abréviation]
const serieName = (id) => setsMeta.series[id] || liveMeta['serie:' + id] || id;
const isPromoSet = (s) => /promo|black star/i.test(s.name || '');
async function resolveMeta(L, sets) {
  const unknown = sets.filter((s) => !setMeta(s.id));
  if (!unknown.length) return;
  await Promise.all(unknown.map(async (s) => {
    try {
      const d = await api(`/${L}/sets/${encodeURIComponent(s.id)}`);
      if (d.serie?.id) { liveMeta[s.id] = [d.serie.id, d.releaseDate || '', d.abbreviation?.official || '']; if (d.serie.name) liveMeta['serie:' + d.serie.id] = d.serie.name; }
    } catch { /* hors ligne : l'extension ira dans « Promos » */ }
  }));
  store.set(K.meta, JSON.stringify(liveMeta));
}
function buildBlocks(groups) {
  const by = new Map(), bucket = new Map();
  const push = (map, key, e) => { if (!map.has(key)) map.set(key, []); map.get(key).push(e); };
  for (const g of groups) {
    const m = setMeta(g.id), serie = m ? m[0] : '';
    const e = { g, date: m ? m[1] || '' : '', promo: isPromoSet(g.set) };
    if (!serie || PROMO_SERIES.has(serie)) push(bucket, serie || '?', e); else push(by, serie, e);
  }
  const byDate = (a, b) => b.date.localeCompare(a.date) || b.g.id.localeCompare(a.g.id, 'fr', { numeric: true });   // récent → ancien (à date égale : identifiant le plus grand d'abord)
  const inBlock = (a, b) => (a.promo - b.promo) || byDate(a, b);                                              // promos du bloc à la fin
  const blocks = [...by.entries()].map(([id, items]) => {
    items.sort(inBlock);
    const newest = (items.find((i) => !i.promo) || items[0]).date;
    return { id, name: serieName(id), items: items.map((i) => i.g), newest };
  }).sort((a, b) => b.newest.localeCompare(a.newest));
  if (bucket.size) {
    const subs = [...bucket.entries()].map(([id, items]) => {
      items.sort(byDate);
      return { id, name: id === '?' ? 'Autres' : serieName(id), items: items.map((i) => i.g), newest: items[0].date };
    }).sort((a, b) => b.newest.localeCompare(a.newest));
    blocks.push({ id: 'promos', name: 'Promos', subs, items: subs.flatMap((x) => x.items), newest: '' });
  }
  return blocks;
}

/* ---------- Valeur de la collection (prix Cardmarket fournis par TCGdex) ---------- */
// Le prix d'une carte est demandé à TCGdex (/cards/<id> → pricing.cardmarket, en euros) seulement pour les cartes possédées, puis mémorisé.
// Ce sont les prix Cardmarket de la fiche produit (tous vendeurs et toutes langues confondus) : TCGdex n'a pas de prix « vendeur français ».
let priceCache = {};
try { priceCache = JSON.parse(store.get(K.prices) || '{}') || {}; } catch { priceCache = {}; }
const savePrices = () => store.set(K.prices, JSON.stringify(priceCache));
const eur = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const numOrNull = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
// Prix corrigés (data/price-fix.json, outil tools/fetch-cm-prices.py) : extensions où TCGdex rattache plusieurs versions d'une carte au même produit Cardmarket (Règne Delta…)
let priceFix = null;
const priceFixReady = fetch('data/price-fix.json').then((r) => (r.ok ? r.json() : null)).then((j) => {
  if (!j || !j.cards) return;
  priceFix = j; let ch = false;           // d'anciens prix erronés déjà mémorisés sont remplacés tout de suite
  for (const [id, fx] of Object.entries(j.cards)) { const e = priceCache[id]; if (e && e[3] !== fx[2]) { priceCache[id] = [numOrNull(fx[0]), numOrNull(fx[1]), Date.parse(j.updated + 'T12:00:00') || Date.now(), numOrNull(fx[2])]; ch = true; } }
  if (ch) savePrices();
}).catch(() => {});
// « tendance » Cardmarket aberrante (ex. 0,02 € alors que l'offre la moins chère est à 25 € : cartes seulement holo dont la ligne « non foil » est vide) → on la remplace
function trendOf(m, holoOnly) {
  const t = numOrNull(m.trend), low = numOrNull(m.low), a30 = numOrNull(m.avg30), a = numOrNull(m.avg);
  const bad = t != null && ((low != null && t < low * 0.5) || (a30 != null && a30 > 5 && t < a30 * 0.1));
  if (!bad) return t ?? a ?? low;
  return a30 ?? a ?? numOrNull(m['trend-holo']) ?? low;       // moyenne des ventes sur 30 jours (vraies ventes), sinon moyenne, sinon prix foil
}
async function fetchPrice(L, id) {
  await priceFixReady;
  const fx = priceFix && priceFix.cards[id];
  if (fx && L === 'fr') { priceCache[id] = [numOrNull(fx[0]), numOrNull(fx[1]), Date.parse(priceFix.updated + 'T12:00:00') || Date.now(), numOrNull(fx[2])]; return; }
  const path = `/${L}/cards/${encodeURIComponent(id)}`;
  let c = null;
  let pv = {}, tg = {}, holoOnlyCard = false;      // prix propre à chaque version (1re Édition, sans ombre, reverse…) : TCGdex les relie à des produits Cardmarket distincts
  try {
    const d = await api(path); mem.delete(path); c = d.pricing && d.pricing.cardmarket;
    holoOnlyCard = !!(d.variants_detailed && d.variants_detailed.length && d.variants_detailed.every((x) => /holo/i.test(x.type || '')));
    const tp = d.pricing && d.pricing.tcgplayer;      // TCGplayer (dollars) : prix du marché par finition ; converti en euros à l'affichage, jamais montré en dollars
    if (tp) for (const [f, o] of Object.entries(tp)) { const u = o && typeof o === 'object' ? (numOrNull(o.marketPrice) ?? numOrNull(o.midPrice)) : null; if (u != null) tg[f.toLowerCase().replace(/[^a-z0-9]/g, '')] = u; }
    const vd = d.variants_detailed || [], stampedProd = new Set(vd.filter((x) => x.stamp && x.stamp.length && x.pricing && x.pricing.cardmarket).map((x) => x.pricing.cardmarket.idProduct));
    const holoOnly = vd.length > 0 && vd.every((x) => /holo/i.test(x.type || ''));
    for (const x of vd) {
      const m = x.pricing && x.pricing.cardmarket; if (!m) continue;
      if (!(x.stamp && x.stamp.length) && stampedProd.has(m.idProduct)) continue;     // version sans tampon rattachée au même produit que la 1re Édition : prix non fiable (≠ 1re Édition) → prix de base
      const k = vKey(descOf([x.type || 'Normal', x.size, x.foil, x.subtype, x.stamp]));
      const n = trendOf(m, holoOnly), hv = numOrNull(m['trend-holo']) ?? numOrNull(m['avg-holo']) ?? numOrNull(m['low-holo']);
      if ((n != null || hv != null) && !(k in pv)) pv[k] = [n, hv];
    }
  } catch (e) { if (!/HTTP 404/.test(e.message || '')) throw e; }
  priceCache[id] = c ? [trendOf(c, holoOnlyCard), numOrNull(c['trend-holo']) ?? numOrNull(c['avg-holo']) ?? numOrNull(c['low-holo']), Date.now(), numOrNull(c.idProduct), pv, tg, 1] : [null, null, Date.now(), null, pv, tg, 1];   // [prix, prix holo, date, identifiant produit Cardmarket]
}
// Prix Cardmarket de la fiche : « tendance » = tirage normal de la carte (y compris une carte Holo), « tendance holo » = tirage Reverse.
// Version Reverse → prix reverse (repli : prix normal) ; toute autre version (Normal, Holo…) → prix normal (repli : prix reverse).
const cmUnit = (e, key) => {
  const v = key && e[4] && e[4][key], rev = !!(key && /^reverse(\/|$)/.test(key));
  if (v && (v[0] != null || v[1] != null)) return rev ? (v[1] ?? v[0]) : (v[0] ?? v[1]);      // prix de cette version précise
  return rev ? (e[1] ?? e[0]) : (e[0] ?? e[1]);
};
// Vente eBay.fr relevée à la main (dernière vente réussie) : { idCarte: [prix] } (d'anciennes saisies de 1 à 3 prix sont lues : leur moyenne compte) ; combinée à celle de Cardmarket
function sanitizeEbay(o) {
  const out = {};
  if (o && typeof o === 'object') for (const [id, a] of Object.entries(o)) {
    if (!Array.isArray(a)) continue;
    const v = a.map(Number).filter((x) => Number.isFinite(x) && x > 0 && x < 1e6).slice(0, 3).map((x) => Math.round(x * 100) / 100);
    if (v.length) out[String(id).slice(0, 60)] = v;
  }
  return out;
}
let ebayPrices = {};
try { ebayPrices = sanitizeEbay(JSON.parse(store.get(K.ebay) || '{}')); } catch { ebayPrices = {}; }
const saveEbay = () => store.set(K.ebay, JSON.stringify(ebayPrices));
const ebayAvg = (id) => { const a = ebayPrices[id]; return a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
const blend = (id, cm) => { const eb = ebayAvg(id); return eb == null ? cm : cm == null ? eb : (cm + eb) / 2; };
// Source des prix (Réglages) : Cardmarket (euros), TCGplayer (dollars convertis en euros) ou la moyenne des deux
const PRICE_SRC = [['cm', 'Cardmarket (euros)'], ['tcg', 'TCGplayer (converti en euros)'], ['avg', 'Moyenne des deux']];
const priceSrc = () => { const v = store.get('cartes.src'); return PRICE_SRC.some(([k]) => k === v) ? v : 'cm'; };
let fx = { r: 0.86, t: 0, live: false };      // taux USD → EUR : valeur de repli, remplacée par le taux du jour (BCE via frankfurter.dev) s'il est joignable
try { const o = JSON.parse(store.get('cartes.fx') || 'null'); if (o && o.r > 0.3 && o.r < 3) fx = { r: o.r, t: o.t || 0, live: true }; } catch { /* ignoré */ }
const fxReady = (async () => {
  if (fx.live && Date.now() - fx.t < 12 * 3600e3) return;
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR'); const j = r.ok ? await r.json() : null;
    const v = j && j.rates && j.rates.EUR; if (typeof v === 'number' && v > 0.3 && v < 3) { fx = { r: v, t: Date.now(), live: true }; store.set('cartes.fx', JSON.stringify({ r: v, t: fx.t })); }
  } catch { /* hors ligne : dernier taux connu ou valeur de repli */ }
})();
// finition TCGplayer correspondant à la version (clés normalisées : holofoil, reverseholofoil, 1steditionholofoil, normal…)
function tcgUnit(e, key) {
  const t = e[5]; if (!t) return null; const ks = Object.keys(t); if (!ks.length) return null;
  const first = !!(key && /m:1re/.test(key)), rev = !!(key && /^reverse(\/|$)/.test(key)), holo = !!(key && /^holo(\/|$)/.test(key));
  const want = rev ? ['reverseholofoil', 'reversenormal'] : first ? [holo ? '1steditionholofoil' : '1steditionnormal'] : holo ? ['holofoil', 'unlimitedholofoil', 'unlimitednormal', 'normal'] : ['normal', 'unlimitednormal', 'holofoil', 'unlimitedholofoil'];
  for (const w of want) if (t[w] != null) return t[w];
  return first ? null : t[ks[0]];
}
function srcUnit(e, key) {
  const src = priceSrc(), cm = cmUnit(e, key); if (src === 'cm') return cm;
  const u = tcgUnit(e, key), tc = u == null ? null : u * fx.r;
  return src === 'tcg' ? (tc ?? cm) : (tc != null && cm != null ? (tc + cm) / 2 : (tc ?? cm));
}
const unitPrice = (e, key, id) => blend(id, e ? srcUnit(e, key) : null);
async function ownedRows(L) {
  const rows = [];
  for (const [sid, m] of Object.entries(owned[L])) {
    if (isDigital(L, sid)) continue;
    const info = await loadCardInfo(L, sid);
    for (const [id, v] of Object.entries(m)) { const qty = qtyTotal(v); if (qty > 0) rows.push({ sid, id, v, qty, rar: (info.get(id) || {}).rar || null }); }
  }
  return rows;
}
function rowValue(r) { // undefined : prix pas encore demandé · null : pas de prix connu
  const e = priceCache[r.id]; if (!e && ebayAvg(r.id) == null) return undefined;
  let t = 0, any = false;
  const add = (q, key) => { const u = unitPrice(e, key, r.id); if (u != null) { t += q * u; any = true; } };
  if (isMulti(r.v)) for (const [k, q] of Object.entries(r.v)) add(q, k === '_' ? null : k); else add(r.v | 0, null);
  return any ? t : null;
}
function summarize(rows) {
  const out = { total: 0, cards: rows.length, copies: 0, pending: 0, noPrice: 0, skipped: 0, oldest: 0, byRar: new Map() };
  for (const r of rows) {
    const v = isValued(r) ? rowValue(r) : 'skip', b = out.byRar.get(r.rar) || { rar: r.rar, cards: 0, copies: 0, value: 0, skipped: 0 };
    b.cards++; b.copies += r.qty; out.copies += r.qty;
    if (v === 'skip') { out.skipped++; b.skipped++; } else if (v === undefined) out.pending++; else if (v === null) out.noPrice++; else { b.value += v; out.total += v; }
    const ts = priceCache[r.id] && priceCache[r.id][2]; if (ts && (!out.oldest || ts < out.oldest)) out.oldest = ts;
    out.byRar.set(r.rar, b);
  }
  return out;
}
async function ensurePrices(L, rows, refresh, onProgress) {
  await fxReady;
  const ids = [...new Set(rows.filter(isValued).map((r) => r.id))].filter((id) => refresh || !priceCache[id] || (priceCache[id].length < 7 && !(priceFix && priceFix.cards[id])));   // anciens relevés sans prix par version : redemandés une fois
  let done = 0, i = 0;
  const ld = ids.length ? loader.start('Mise à jour des prix') : null;
  const worker = async () => {
    while (i < ids.length) {
      const id = ids[i++];
      try { await fetchPrice(L, id); } catch { /* hors ligne : réessayé plus tard */ }
      done++; if (done % 25 === 0) savePrices();
      if (ld) ld.set(`Mise à jour des prix · ${done}/${ids.length}`);
      if (onProgress) onProgress(done, ids.length);
    }
  };
  try { if (ids.length) await Promise.all(Array.from({ length: 5 }, worker)); } finally { if (ld) ld.done(); }
  savePrices();
  return ids.length;
}
// Par défaut, toutes les raretés sont estimées ; l'option « seulement les cartes de valeur » (Illustration rare, Illustration spéciale rare, Hyper rare…) réduit le nombre de requêtes.
const VALUE_TIERS = new Set(['secrete']);
const valueOnly = () => store.get('cartes.valueOnly') === '1';     // par défaut : toutes les raretés
const isValued = (r) => !valueOnly() || (r.rar != null && VALUE_TIERS.has(rarityTier(r.rar)));
const NO_RAR = 'Rareté inconnue';
function openOwned(L, rows, onToggle) {
  const s = summarize(rows);
  const list = [...s.byRar.values()].sort((a, b) => (a.rar === null) - (b.rar === null) || rarityRank(a.rar) - rarityRank(b.rar) || String(a.rar).localeCompare(String(b.rar), 'fr'));
  const totalEl = h('p', { class: 'owned-total' });
  const checks = [];
  const upd = () => {
    let n = 0, c = 0, v = 0;
    list.forEach((b, i) => { if (checks[i].checked) { n += b.cards; c += b.copies; v += b.value; } });
    totalEl.replaceChildren(h('b', {}, eur(v)), ` · ${plural(n, 'carte', 'cartes')}${c !== n ? ` (${plural(c, 'exemplaire', 'exemplaires')})` : ''}`);
  };
  const rowsEl = list.map((b) => {
    const cb = h('input', { type: 'checkbox', checked: true, 'aria-label': `Compter ${b.rar || NO_RAR}` }); cb.addEventListener('change', upd); checks.push(cb);
    const go = b.rar === null ? null : h('button', { type: 'button', class: 'orow-go', 'aria-label': `Voir mes cartes : ${b.rar}`, onclick: () => { closeSheet(); location.hash = '#chercher/own/' + encodeURIComponent(b.rar); } }, '›');
    return h('div', { class: 'orow' }, h('label', { class: 'orow-l' }, cb, h('span', { class: 'rdot rt-' + (b.rar === null ? 'aucune' : rarityTier(b.rar)) }), h('span', { class: 'rn' }, b.rar || NO_RAR),
      h('span', { class: 'rc' }, b.skipped === b.cards ? h('b', { class: 'dim' }, 'non estimée') : h('b', {}, eur(b.value)), ` · ${plural(b.cards, 'carte', 'cartes')}`)), go);
  });
  const notes = [];
  if (s.pending) notes.push(h('div', { class: 'note warn' }, `Prix en cours de chargement pour ${plural(s.pending, 'carte', 'cartes')}. Rouvrez cette fenêtre dans un instant.`));
  if (s.skipped) notes.push(h('div', { class: 'note' }, `${plural(s.skipped, 'carte n’est', 'cartes ne sont')} pas estimée${s.skipped > 1 ? 's' : ''} (raretés de moindre valeur) : ${s.skipped > 1 ? 'elles ne comptent' : 'elle ne compte'} pas dans le total. Décochez l’option ci-dessous pour tout estimer.`));
  if (s.noPrice) notes.push(h('div', { class: 'note' }, `${plural(s.noPrice, 'carte n’a', 'cartes n’ont')} pas de prix Cardmarket connu : ${s.noPrice > 1 ? 'elles sont comptées' : 'elle est comptée'} pour 0 €.`));
  const srcSel = h('select', { class: 'field', 'aria-label': 'Source des prix' }, PRICE_SRC.map(([k, l]) => h('option', { value: k }, l)));
  srcSel.value = priceSrc(); srcSel.addEventListener('change', () => { store.set('cartes.src', srcSel.value); closeSheet(); if (onToggle) onToggle(); });
  const vo = h('input', { type: 'checkbox', checked: valueOnly(), 'aria-label': 'Estimer seulement les cartes de valeur' });
  vo.addEventListener('change', () => { store.set('cartes.valueOnly', vo.checked ? '1' : '0'); closeSheet(); if (onToggle) onToggle(); });
  openSheet(
    h('h2', {}, 'Mes cartes possédées'),
    rows.length ? h('p', {}, 'Cochez les raretés à additionner. Touchez › pour voir les cartes d’une rareté.') : h('p', {}, 'Vous ne possédez encore aucune carte.'),
    h('div', { class: 'orows' }, rowsEl), totalEl, ...notes,
    h('label', { class: 'lbl' }, 'Source des prix', srcSel),
    h('label', { class: 'orow-l' }, vo, h('span', { class: 'rn' }, 'Estimer seulement les cartes de valeur (Illustration rare, Illustration spéciale rare, Hyper rare)')),
    h('p', { class: 'lb-help' }, `Prix Cardmarket (tendance, en euros) fournis par TCGdex : tous vendeurs et toutes langues confondus, pas seulement les vendeurs français.${s.oldest ? ' Prix relevés le ' + new Date(s.oldest).toLocaleDateString('fr-FR') + '.' : ''}`),
    rows.length ? h('button', { class: 'btn', type: 'button', onclick: () => { closeSheet(); location.hash = '#chercher/own'; } }, 'Voir toutes mes cartes') : null,
    h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Fermer'));
  upd();
}

// Affiche le prix sur les tuiles (celui déjà connu) et relève, en arrière-plan, celui des cartes de valeur (AR, SAR, hyper rares…)
function priceTiles(L, tiles, my, all) {   // all : toutes les cartes (résultat d'un scan), sinon seulement les cartes de valeur
  tiles.forEach((t) => t.paintPrice());
  const todo = tiles.filter((t) => !priceCache[t.id] && (all || (t.info && t.info.rar && VALUE_TIERS.has(rarityTier(t.info.rar)))));
  if (!todo.length) return;
  let i = 0, n = 0;
  const worker = async () => {
    while (i < todo.length && my === tok) {
      const t = todo[i++];
      try { await fetchPrice(L, t.id); t.paintPrice(); } catch { /* hors ligne */ }
      if (++n % 20 === 0) savePrices();
    }
  };
  Promise.all(Array.from({ length: 4 }, worker)).then(savePrices);
}

// Adresse de la fiche Cardmarket d'une carte : /fr/Pokemon/Products/Singles/<Extension-en-anglais>/<Nom-en-anglais>-<ABRÉVIATION><numéro>
// ex. « 30th-Celebration/Pikachu-30C034 ». Le nom anglais vient de TCGdex (/en/cards/<id>), mémorisé dans cartes.cmslug.
const slugCm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`.:!?,()]/g, '').replace(/&/g, ' ').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
let cmSlugs = {};
try { const o = JSON.parse(store.get(K.cmslug) || '{}'); for (const [k, v] of Object.entries(o || {})) if (typeof v === 'string' && /^[A-Za-z0-9-]+\/[A-Za-z0-9-]+\??$/.test(v)) cmSlugs[k] = v; } catch { cmSlugs = {}; }
let cmStatic = {};   // data/cm-links.json : adresses calculées pour les cartes de la Collection Classique des 30 ans (…/30th-Celebration/Mew-VMAX-30CFST-114)
fetch('data/cm-links.json').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && typeof j === 'object') cmStatic = j; }).catch(() => {});
// Extensions dont les adresses ont été confirmées par des liens réels fournis par l'utilisateur (les autres cas sensibles sont marqués « à vérifier »).
const CM_VERIFIED = new Set(['30th', '30th-c', 'ecard2', 'ex10', 'exu']);
const CM_PROMO_SERIES = new Set(['pop', 'mc', 'tk', 'misc']);
const CM_PARENT = { exu: 'ex10' };      // la collection Zarbi est une partie de « EX Forces Cachées » chez Cardmarket
// Règles déduites d'adresses réelles :
//  · …/Singles/Aquapolis/Umbreon-V1-AQH29 : cartes du même nom dans l'extension = V1, V2… ; les cartes « H » passent avant les cartes numérotées ;
//  · …/Singles/EX-Unseen-Forces/Unown-A-UFA-28 : Zarbi = nom-lettre-ABRÉVIATION+lettre-total, dans l'extension principale ; les extensions de la série EX sont préfixées « EX ».
// Adresses Cardmarket EXACTES (data/cm/<extension>.json, relevées avec tools/fetch-cm-slugs.py : { s: extension, n: { numéro: fin d'adresse } })
const cmSetFiles = new Map();
const cmSetFile = (sid) => { if (!cmSetFiles.has(sid)) cmSetFiles.set(sid, fetch(`data/cm/${encodeURIComponent(sid)}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null)); return cmSetFiles.get(sid); };
function setIdOfCard(id) { let best = ''; for (const k of [...Object.keys(setsMeta.sets), ...Object.keys(liveMeta)]) if (id.startsWith(k + '-') && k.length > best.length) best = k; return best; }
async function ensureCmSlug(id) {
  if (cmSlugs[id] || cmStatic[id]) return;
  const sid0 = setIdOfCard(id);
  if (sid0) {
    const j = await cmSetFile(sid0), v = j && j.n && j.n[id.slice(sid0.length + 1)];
    if (v) { const slug = v.includes('/') ? v : `${j.s}/${v}`; if (/^[A-Za-z0-9-]+\/[A-Za-z0-9-]+$/.test(slug)) { cmSlugs[id] = slug; store.set(K.cmslug, JSON.stringify(cmSlugs)); return; } }
  }
  const d = await api(`/en/cards/${encodeURIComponent(id)}`);
  const own = d.set && d.set.id; if (!own) return;
  const top = CM_PARENT[own] || own;                                  // extension affichée par Cardmarket
  let setName = d.set.name;
  if (top !== own) setName = (await api(`/en/sets/${encodeURIComponent(top)}`)).name;
  let abbr = (setMeta(top) || [])[2] || '';
  if (!abbr) { try { const sd0 = await api(`/en/sets/${encodeURIComponent(top)}`); abbr = (sd0.abbreviation && sd0.abbreviation.official) || ''; } catch { /* repli : recherche */ } }
  if ((setMeta(top) || [])[0] === 'ex' && !/^EX /i.test(setName || '')) setName = 'EX ' + setName;
  const setS = slugCm(setName); let nameS = slugCm(d.name); const abbrS = slugCm(abbr);
  if (!setS || !nameS || !abbrS) return;
  const sd = await api(`/en/sets/${encodeURIComponent(own)}`), grp = numGroup(d.localId);
  // adresse déduite d'une règle non confirmée pour cette extension ? (partie d'une autre, promo, numéros à lettres, série EX, signe dans le nom) → « ? » = à vérifier
  const serie = (setMeta(own) || [])[0] || '';
  const doubt = CM_VERIFIED.has(own) ? '' : '?';       // adresse calculée (pas relevée dans data/cm) : toujours signalée « non vérifiée »
  if (own === '30th' && /^[RGB]$/.test(d.localId)) {                  // 30 ans : les trois Mew R / G / B (lien réel fourni pour le G : …/Mew-V2-30CGRGB) → V1, V2, V3 dans l'ordre R, G, B (R et B non confirmés)
    cmSlugs[id] = `${setS}/${nameS}-V${'RGB'.indexOf(d.localId) + 1}-${abbrS}${d.localId}RGB?`; store.set(K.cmslug, JSON.stringify(cmSlugs)); return;
  }
  if (grp === '*') {                                                   // Zarbi : « A/28 »
    const ch = slugCm(lidShow(d.localId)); if (!ch) return;            // « ? » et « ! » : pas d'adresse connue → recherche
    const total = (sd.cards || []).filter((x) => numGroup(x.localId) === '*').length;
    cmSlugs[id] = `${setS}/${nameS}-${ch}-${abbrS}${ch}-${total}${doubt}`;
  } else {
    // série e-Card (Aquapolis, Skyridge) : les cartes H sont imprimées « H1 », « H29 » (TCGdex écrit « H01 ») → …-AQH1, …-AQH29
    const lid0 = lidShow(d.localId), lm0 = serie === 'ecard' && lid0.match(/^([A-Za-z]+)0*(\d+)$/);
    const numS = lm0 ? slugCm(lm0[1] + lm0[2]) : slugCm(d.localId); if (!numS) return;
    const same = (sd.cards || []).filter((x) => slugCm(x.name) === nameS);
    if (same.length > 1 && own !== '30th') {      // 30 ans (liens réels : …/Pikachu-30C040 parmi 30 Pikachu) : le code à 3 chiffres suffit, pas de V1/V2
      same.sort((a, b) => ((numGroup(a.localId) === '') - (numGroup(b.localId) === '')) || lidShow(a.localId).localeCompare(lidShow(b.localId), 'en', { numeric: true }));
      const k = same.findIndex((x) => x.id === id); if (k >= 0) nameS += `-V${k + 1}`;
      // Épée et Bouclier (liens réels fournis) : la dernière de 3 versions ou plus n'a pas de suffixe de numéro (…/Galarian-Moltres-V-V3, …/Umbreon-VMAX-V3)
      if (serie === 'swsh' && same.length >= 3 && k === same.length - 1) { cmSlugs[id] = `${setS}/${nameS}${doubt}`; store.set(K.cmslug, JSON.stringify(cmSlugs)); return; }
    } else if (serie === 'swsh' && grp === '') {
      // Épée et Bouclier : une carte au nom unique dans l'extension s'écrit sans numéro (…/Shining-Fates/Dhelmise-VMAX, …/Celebrations/Zamazenta-V)
      cmSlugs[id] = `${setS}/${nameS}${doubt}`; store.set(K.cmslug, JSON.stringify(cmSlugs)); return;
    }
    cmSlugs[id] = `${setS}/${nameS}-${abbrS}${numS}${doubt}`;
  }
  store.set(K.cmslug, JSON.stringify(cmSlugs));
}

/* ---------- Recherche d'une carte depuis l'accueil (nom, Pokémon, numéro) : index léger de data/names.json ---------- */
let homeCards = null;
async function loadHomeCards(sets, blocks) {
  if (homeCards) return homeCards;
  const names = await fetch('data/names.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  const setName = new Map(sets.map((x) => [x.id, x.name || x.id]));
  const order = blocks.flatMap((b) => b.items.flatMap((g) => g.members.map((m) => m.id))).filter((id) => names[id]);
  const recs = [];
  const infos = new Map(await Promise.all(order.map(async (sid) => [sid, await loadCardInfo('fr', sid)])));      // raretés : « pikachu illustration rare », « holo », « hyper »…
  for (const sid of order) for (const row of names[sid]) {
    const odd = typeof row[2] === 'string', lid = lidShow(odd ? row[1] : row[0]), nm = odd ? row[2] : row[1], id = odd ? row[0] : sid + '-' + (odd ? row[1] : row[0]);
    const rar = ((infos.get(sid) || new Map()).get(id) || {}).rar || '';
    recs.push({ sid, id, nm, lid, rar, lidRaw: odd ? row[1] : row[0], noImg: odd ? row[3] === 0 : row[2] === 0, setName: setName.get(sid) || sid, text: norm(`${nm} ${lid} ${id} ${setName.get(sid) || ''} ${rar}`) });
  }
  return (homeCards = recs);
}
const matchTokens = (text, needle) => needle.split(' ').every((t) => !t || text.includes(t));

/* ---------- Carrousel des cartes les plus chères ---------- */
const tcgImage = (L, sid, lidRaw, noImg) => { const serie = (setMeta(sid) || [])[0]; return !noImg && serie ? `https://assets.tcgdex.net/${L}/${serie}/${sid}/${lidRaw}` : null; };
// prix unitaire le plus élevé parmi les versions possédées (null : prix inconnu)
function rowUnitMax(r) {
  const e = priceCache[r.id]; if (!e && ebayAvg(r.id) == null) return null;
  const keys = isMulti(r.v) ? Object.keys(r.v).filter((k) => r.v[k] > 0) : [null];
  let best = null;
  for (const k of keys) { const u = unitPrice(e, k === '_' ? null : k, r.id); if (u != null && (best == null || u > best)) best = u; }
  return best;
}
// items : [{ card, name, price, onclick }] ; all : action du bouton « Voir tout »
// Défilement continu de l'accueil : on fait défiler un vrai conteneur (scrollLeft) au lieu d'animer une bande de plusieurs milliers de pixels
// (Safari iPad ne peignait pas toute la bande : zone vide à gauche). Le doigt ou la souris met en pause ; 2 s après, ça repart.
function startMarquee(track, phase) {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const SPEED = 98;                                  // pixels par seconde (≈ une carte toutes les 3,4 s)
  let pos = null, last = 0, holdUntil = 0, down = false;
  const half = () => (track.scrollWidth / 2) || 1;
  const hold = (ms) => { holdUntil = performance.now() + ms; };
  track.addEventListener('pointerdown', () => { down = true; });
  const up = () => { down = false; hold(2000); pos = null; };
  track.addEventListener('pointerup', up); track.addEventListener('pointercancel', up);
  track.addEventListener('touchend', up, { passive: true });
  track.addEventListener('wheel', () => { hold(2000); pos = null; }, { passive: true });
  track.addEventListener('mouseenter', () => { down = true; }); track.addEventListener('mouseleave', () => { down = false; hold(500); pos = null; });
  track.addEventListener('scroll', () => { const hf = half(); if (track.scrollLeft >= hf) track.scrollLeft -= hf; }, { passive: true });
  const tick = (t) => {
    if (!track.isConnected) return;                  // carrousel remplacé ou page quittée : la boucle s'arrête
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
    if (!document.hidden && !down && t >= holdUntil && track.clientWidth > 0) {
      if (pos == null) pos = track.scrollLeft || (phase * SPEED) % half();
      pos += SPEED * dt; if (pos >= half()) pos -= half();
      track.scrollLeft = pos;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function buildCarousel(title, items, all, opts = {}) {
  const cardEl = (it, dup) => {
    const holder = h('button', { type: 'button', class: 'car-card' + (dup ? ' car-dup' : ''), role: 'listitem', 'aria-label': `${it.name} : ${eur(it.price)}`, onclick: it.onclick, ...(dup ? { 'aria-hidden': 'true', tabindex: '-1' } : {}) });
    const ph = () => { holder.classList.add('noimg'); holder.prepend(h('span', { class: 'car-ph' }, it.name)); };
    if (it.card.image) holder.append(lazyImg(imgLow(it.card), it.name, ph)); else ph();
    holder.append(h('span', { class: 'car-price' }, eur(it.price)));
    return holder;
  };
  // opts.auto : défilement continu en boucle (accueil) : les cartes sont répétées une fois et la bande glisse de la moitié de sa largeur
  const auto = !!opts.auto && items.length >= 5;
  const track = auto
    ? h('div', { class: 'car-track auto', role: 'list' }, h('div', { class: 'car-belt' }, items.map((it) => cardEl(it, false)), items.map((it) => cardEl(it, true))))
    : h('div', { class: 'car-track', role: 'list' }, items.map((it) => cardEl(it, false)));
  if (auto) startMarquee(track, opts.phase || 0);
  return h('section', { class: 'carou', 'aria-label': title }, h('div', { class: 'car-head' }, h('h2', {}, title), all ? h('button', { type: 'button', class: 'car-all', onclick: all }, 'Voir tout') : null), track);
}

/* ---------- Carrousel « en éventail » (cartes possédées) : la carte du centre est grande, la précédente et la suivante se devinent de chaque côté ---------- */
// items : [{ card, name, sub, price, onopen(index) }] ; défilement tactile avec accroche sur chaque carte
// appui long : le doigt est resté posé au moins 450 ms avant le « clic » (utilisé par l'ajout rapide)
let pressAt = 0;
addEventListener('pointerdown', () => { pressAt = performance.now(); }, true);
const longPress = () => performance.now() - pressAt >= 450;
function buildCoverflow(title, items, onOpen) {
  const cap = h('p', { class: 'cf-cap', 'aria-live': 'polite' }, h('b', { class: 'cf-name' }), h('span', { class: 'cf-sub' }));
  const count = h('p', { class: 'cf-count' });
  const els = items.map((it, i) => {
    const b = h('button', { type: 'button', class: 'cf-card', role: 'listitem', 'aria-label': `${it.name}${it.price != null ? ' : ' + eur(it.price) : ''}` });
    const ph = () => { b.classList.add('noimg'); b.prepend(h('span', { class: 'car-ph' }, it.name)); };
    if (it.card.image) b.append(lazyImg(imgLow(it.card), it.name, ph)); else ph();
    if (it.price != null) b.append(h('span', { class: 'car-price' }, eur(it.price)));
    b.addEventListener('click', () => { if (i === cur) onOpen(i); else go2(i); });
    return b;
  });
  const track = h('div', { class: 'cf-track', role: 'list', tabindex: '0', 'aria-label': title }, els);
  let cur = 0, raf = 0;
  const pitch = () => (els.length > 1 ? els[1].offsetLeft - els[0].offsetLeft : els[0].offsetWidth || 1);
  function paint() {
    raf = 0; if (!track.isConnected) return;         // carrousel déjà remplacé : rien à dessiner
    const p = pitch() || 1, pos = track.scrollLeft / p; cur = Math.max(0, Math.min(els.length - 1, Math.round(pos) || 0));
    els.forEach((el, i) => {
      const d = i - pos, a = Math.abs(d);
      if (a > 3) { el.style.transform = 'perspective(900px) scale(.6)'; el.style.opacity = '0'; el.style.zIndex = '0'; return; }
      const e = a < 0.12 ? 0 : (a - 0.12) / 0.88, sg = d < 0 ? 1 : -1;      // zone morte : la carte du centre est parfaitement droite
      const rot = a < 0.12 ? 0 : Math.max(-46, Math.min(46, sg * e * 36)), sc = a < 0.12 ? 1 : Math.max(0.58, 1 - 0.23 * Math.min(a, 1.8));
      el.style.transform = `perspective(900px) rotateY(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
      el.style.opacity = String(Math.max(0.2, 1 - 0.4 * Math.min(a, 1.7)).toFixed(2));
      el.style.zIndex = String(10 - Math.round(a * 2));
    });
    const it = items[cur]; cap.querySelector('.cf-name').textContent = it.name; cap.querySelector('.cf-sub').textContent = it.sub || '';
    count.textContent = `${cur + 1} / ${items.length}`;
  }
  const go2 = (i) => track.scrollTo({ left: i * pitch(), behavior: 'smooth' });
  track.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
  track.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go2(Math.min(els.length - 1, cur + 1)); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go2(Math.max(0, cur - 1)); } else if (e.key === 'Enter') onOpen(cur); });
  const sec = h('section', { class: 'cflow', 'aria-label': title }, h('h2', { class: 'cf-title' }, title), track, cap, count);
  requestAnimationFrame(() => requestAnimationFrame(paint)); window.addEventListener('resize', () => { if (sec.isConnected) paint(); });
  sec.cfGo = go2; sec.cfPaint = paint;
  return sec;
}

/* ---------- Historique de la valeur de la collection (un relevé par jour) ---------- */
const HIST_KEY = 'cartes.valuehist';
function loadHist() {
  const out = {};
  try { const o = JSON.parse(store.get(HIST_KEY) || '{}'); for (const [d, v] of Object.entries(o || {})) if (/^\d{4}-\d\d-\d\d$/.test(d) && typeof v === 'number' && isFinite(v) && v >= 0) out[d] = v; } catch { /* ignoré */ }
  return out;
}
const dayKey = (t = new Date()) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
function recordValue(total) {
  const hs = loadHist(); hs[dayKey()] = Math.round(total * 100) / 100;
  const days = Object.keys(hs).sort(); for (const d of days.slice(0, Math.max(0, days.length - 1200))) delete hs[d];
  store.set(HIST_KEY, JSON.stringify(hs));
}
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs, ...kids) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); kids.forEach((c) => e.append(c)); return e; };
const PERIODS = [['1S', 7], ['1M', 30], ['3M', 90], ['1A', 365], ['Max', 0]];
// → { points:[[date, valeur]…], change:% ou null } pour la période
function histSeries(days) {
  const hs = loadHist(), all = Object.keys(hs).sort().map((d) => [d, hs[d]]);
  if (!days) return { points: all, change: all.length > 1 && all[0][1] > 0 ? (all[all.length - 1][1] / all[0][1] - 1) * 100 : null };
  const from = new Date(); from.setDate(from.getDate() - days); const fk = dayKey(from);
  let pts = all.filter(([d]) => d >= fk);
  const before = all.filter(([d]) => d < fk).slice(-1)[0];          // dernier relevé avant la période : le trait part de là
  if (before) pts = [before, ...pts];
  return { points: pts, change: pts.length > 1 && pts[0][1] > 0 ? (pts[pts.length - 1][1] / pts[0][1] - 1) * 100 : null };
}
function drawValueChart(points) {
  const W = 340, H = 190, ml = 56, mr = 14, mt = 12, mb = 26;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vc-svg', role: 'img', 'aria-label': 'Évolution de la valeur de la collection' });
  if (!points.length) return svg;
  const vals = points.map((p) => p[1]); let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 0.01) { lo = hi * 0.99; hi = hi * 1.01 + 0.01; }
  const pad = (hi - lo) * 0.12; lo = Math.max(0, lo - pad); hi += pad;
  const X = (i) => ml + (points.length === 1 ? (W - ml - mr) : (i / (points.length - 1)) * (W - ml - mr)), Y = (v) => mt + (1 - (v - lo) / (hi - lo)) * (H - mt - mb);
  for (let i = 0; i < 5; i++) {
    const v = lo + ((hi - lo) * i) / 4, y = Y(v);
    svg.append(svgEl('line', { x1: ml, x2: W - mr, y1: y, y2: y, class: 'vc-grid' }));
    const t = svgEl('text', { x: ml - 6, y: y + 4, class: 'vc-lab', 'text-anchor': 'end' }); t.textContent = Math.round(v).toLocaleString('fr-FR') + ' €'; svg.append(t);
  }
  const pts = points.length === 1 ? [[ml, Y(vals[0])], [W - mr, Y(vals[0])]] : points.map((p, i) => [X(i), Y(p[1])]);
  const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  svg.append(svgEl('path', { d: `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H - mb} L${pts[0][0].toFixed(1)} ${H - mb} Z`, class: 'vc-area' }));
  svg.append(svgEl('path', { d: line, class: 'vc-line', fill: 'none' }));
  const last = pts[pts.length - 1]; svg.append(svgEl('circle', { cx: last[0], cy: last[1], r: 5, class: 'vc-dot' }));
  const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const a = svgEl('text', { x: ml, y: H - 6, class: 'vc-lab' }); a.textContent = fmt(points[0][0]); svg.append(a);
  const b = svgEl('text', { x: W - mr, y: H - 6, class: 'vc-lab', 'text-anchor': 'end' }); b.textContent = fmt(points[points.length - 1][0]); svg.append(b);
  return svg;
}
function valuePanel(totalNow) {       // « VALEUR TOTALE » : montant, variation, période, courbe
  let period = 'Max'; const box = h('div', { class: 'vpanel' });
  const draw = () => {
    const days = PERIODS.find((x) => x[0] === period)[1], { points, change } = histSeries(days);
    const badge = change == null ? null : h('span', { class: 'vp-badge ' + (change >= 0 ? 'up' : 'down'), 'aria-label': 'Variation sur la période' }, `${change >= 0 ? '▲' : '▼'} ${change >= 0 ? '+' : '−'}${Math.abs(change).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`);
    box.replaceChildren(...[
      h('p', { class: 'vp-t' }, 'VALEUR TOTALE'),
      h('div', { class: 'vp-row' }, h('b', { class: 'vp-v' }, eur(totalNow)), badge),
      h('div', { class: 'vp-seg', role: 'group', 'aria-label': 'Période' }, PERIODS.map(([k]) => h('button', { type: 'button', 'aria-pressed': String(k === period), onclick: () => { period = k; draw(); } }, k))),
      drawValueChart(points),
      points.length < 2 ? h('p', { class: 'vp-note' }, 'Un relevé par jour : la courbe se construit au fil des jours, à chaque mise à jour des prix.') : null].filter(Boolean));
  };
  draw(); return box;
}

/* ---------- Vue : liste des extensions, par blocs ---------- */
async function showList(my) {   // l'écran de chargement animé s'affiche si l'attente dure
  const ld = loader.start('Liste des extensions');
  try { await showListInner(my); } finally { ld.done(); }
}
async function showListInner(my) {
  const L = lang;
  const q = h('input', { class: 'search', type: 'search', placeholder: 'Extension, Pokémon, carte, numéro, rareté…', 'aria-label': 'Rechercher une extension, un Pokémon ou une carte', enterkeyhint: 'search', autocomplete: 'off' });
  const top = h('header', { class: 'top' },
    h('div', { class: 'row brandrow' }, h('h1', { class: 'brand' }, h('img', { src: 'icons/logo-banner.webp', alt: '', width: 1000, height: 251, decoding: 'async', draggable: 'false' }), h('span', { class: 'sr' }, 'Pijakollection')), q),   // la recherche est à côté du logo (dessous sur un petit écran)
    langSwitch(L, (id) => { listScroll = 0; go(id); }));
  const main = h('main', {}, spinner());
  $app.replaceChildren(top, main);

  let sets;
  try { ({ sets } = await loadSets(L)); await Promise.all([snapReady, metaReady]); await resolveMeta(L, sets); } catch (e) {
    if (my !== tok) return;
    main.replaceChildren(errorBox('Vérifiez votre connexion. ' + (e.message || ''), () => showList(tok))); return;
  }
  if (my !== tok) return;

  const groups = [...buildGroups(sets).values()];
  const blocks = buildBlocks(groups);
  const pctOf = (have, total) => (total ? Math.min(100, Math.round(have / total * 100)) : 0);

  const rowFor = (g) => {
    const s = g.set, total = groupTotal(g), st = groupStatus(L, g);
    const have = g.members.reduce((n, m) => n + ownedCount(L, m.id), 0);
    const dbl = g.members.reduce((n, m) => n + doublesCount(owned[L][m.id]), 0);
    const logoUrl = setLogoUrl(s.id, s);
    const logo = h('div', { class: 'logo' });
    const ph = () => logo.replaceChildren(h('span', { class: 'ph' }, s.abbreviation?.official || setMeta(s.id)?.[2] || s.id));
    if (logoUrl) logo.append(lazyImg(logoUrl, '', ph)); else ph();
    const btn = h('button', { type: 'button', class: 'set' + (st && st.lvl === 'bad' ? ' dim' : ''), onclick: () => { listScroll = scrollY; go(L, s.id); } },
      logo,
      h('div', { class: 'info' },
        h('div', { class: 'toprow' },
          h('div', { class: 'name' }, s.name || s.id),
          h('div', { class: 'cnt', title: `${have} cartes possédées sur ${total}` }, h('b', {}, String(have)), `/${total.toLocaleString('fr-FR')} | ${pctOf(have, total)}%`)),
        h('div', { class: 'sid' }, s.id, dbl ? ` · ${plural(dbl, 'double', 'doubles')}` : ''),
        g.members.length > 1 && h('div', { class: 'sid' }, 'Inclut : ' + g.members.slice(1).map((m) => m.name || m.id).join(', ')),
        h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${pctOf(have, total)}%` })),
        st && h('span', { class: 'badge ' + st.lvl }, st.txt)),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'));
    const li = h('li', {}, btn);
    li._name = norm(g.members.map((m) => `${m.name} ${m.id}`).join(' '));
    return li;
  };

  // état ouvert / fermé des blocs (mémorisé) : par défaut seul le bloc le plus récent est ouvert
  let openState = null;
  try { openState = JSON.parse(store.get(K.blocks) || 'null'); } catch { openState = null; }
  if (!openState || typeof openState !== 'object') openState = { [blocks[0]?.id]: true };
  const saveOpen = () => store.set(K.blocks, JSON.stringify(openState));

  const secs = blocks.map((b) => {
    const have = b.items.reduce((n, g) => n + g.members.reduce((k, m) => k + ownedCount(L, m.id), 0), 0);
    const total = b.items.reduce((n, g) => n + groupTotal(g), 0);
    const rows = [];
    const mk = (items) => h('ul', { class: 'sets' }, items.map((g) => { const li = rowFor(g); rows.push(li); return li; }));
    const subEls = b.subs ? b.subs.map((x) => ({ head: h('h3', { class: 'subhead' }, x.name), list: mk(x.items), n: x.items.length })) : null;
    const body = h('div', { class: 'block-body' }, subEls ? subEls.flatMap((x) => [x.head, x.list]) : mk(b.items));
    const head = h('button', { type: 'button', class: 'block-head', 'aria-expanded': 'false' },
      h('span', { class: 'bn' }, b.name),
      h('span', { class: 'bc' }, h('b', {}, String(have)), `/${total.toLocaleString('fr-FR')} | ${pctOf(have, total)}%`),
      h('span', { class: 'chev', 'aria-hidden': 'true' }));
    const el = h('section', { class: 'block', 'data-block': b.id }, head, body);
    const sec = { b, el, head, body, rows, subEls, have, total };
    sec.set = (open) => { head.setAttribute('aria-expanded', String(open)); body.hidden = !open; };
    head.addEventListener('click', () => { const open = body.hidden; openState[b.id] = open; saveOpen(); sec.set(open); });
    sec.set(!!openState[b.id]);
    return sec;
  });
  const none = h('p', { class: 'empty', hidden: true }, 'Aucune extension ne correspond.');

  // une toute petite icône : déplie tout, ou replie tout quand tout est déjà déplié
  const toggleAll = h('button', { type: 'button', class: 'toggleall' });
  const syncToggle = () => {
    const all = secs.every((x) => openState[x.b.id]);
    toggleAll.textContent = all ? '⊟' : '⊞'; toggleAll.setAttribute('aria-expanded', String(all));
    toggleAll.setAttribute('aria-label', all ? 'Tout replier' : 'Tout déplier'); toggleAll.title = all ? 'Tout replier' : 'Tout déplier';
  };
  toggleAll.addEventListener('click', () => {
    const open = !secs.every((x) => openState[x.b.id]);
    secs.forEach((x) => { openState[x.b.id] = open; x.set(open); }); saveOpen(); syncToggle();
  });
  secs.forEach((x) => x.head.addEventListener('click', syncToggle));
  syncToggle();
  // raccourci vers mes cartes possédées (par rareté) + estimation de leur valeur
  let valRows = [], busy = false;
  const mineBtn = h('button', { type: 'button', class: 'mine mtile', 'aria-label': 'Mes cartes possédées', onclick: () => { listScroll = scrollY; location.hash = '#chercher/own'; } }, h('span', { class: 'mi' }, '🃏'), h('span', { class: 'ml' }, 'Mes cartes'), h('b', { class: 'mn' }, '0'));
  const valNum = h('b', { class: 'vv' }, '…'), valSub = h('span', { class: 'vs' });
  const refreshBtn = h('button', { type: 'button', class: 'tbtn2', 'aria-label': 'Actualiser les prix', title: 'Actualiser les prix', onclick: () => recalc(true) }, '⟳');
  const valbox = h('div', { class: 'valbox' }, h('button', { type: 'button', class: 'vt', 'aria-label': 'Détail de la valeur par rareté', onclick: () => openOwned(L, valRows, () => recalc(false)) }, h('span', { class: 'vl' }, 'Valeur estimée'), valNum, valSub), refreshBtn);
  const carSlot = h('div', { class: 'carslot', hidden: true });
  let carTimer = 0;
  let carSig = '', carT0 = 0;
  async function paintCarousel() {
    const rows = valRows.map((r) => [r, rowUnitMax(r)]).filter(([, u]) => u != null).sort((a, b) => b[1] - a[1]).slice(0, 20);
    if (!rows.length) { carSlot.hidden = true; carSlot.replaceChildren(); return; }
    let recs; try { recs = await loadHomeCards(sets, blocks); } catch { return; }
    if (my !== tok) return;
    const byId = new Map(recs.map((r) => [r.id, r]));
    const items = rows.map(([r, u]) => { const rec = byId.get(r.id); return rec ? { card: { id: r.id, localId: rec.lidRaw, name: rec.nm, image: tcgImage(L, rec.sid, rec.lidRaw, rec.noImg) }, name: rec.nm, price: u, onclick: () => go(L, r.sid) } : null; }).filter(Boolean);
    applyScans(items.map((i) => i.card));
    // le défilement ne doit ni recommencer ni sauter à chaque mise à jour de prix : on ne reconstruit que si la liste a vraiment changé, et la bande repart de sa position
    const sig = items.map((i) => i.card.id + ':' + i.price.toFixed(2)).join('|');
    if (sig === carSig && carSlot.firstChild) return;
    const first = !carSig; carSig = sig; if (first) carT0 = performance.now();
    const phase = ((performance.now() - carT0) / 1000) % (items.length * 3.4);
    carSlot.replaceChildren(buildCarousel('Mes cartes les plus chères', items, () => { listScroll = scrollY; location.hash = '#chercher/top'; }, { auto: true, phase }));
    carSlot.hidden = !items.length;
  }
  const paint = (prog) => {
    clearTimeout(carTimer); carTimer = setTimeout(paintCarousel, 250);
    const sm = summarize(valRows);
    mineBtn.querySelector('.mn').textContent = String(sm.cards);
    valNum.textContent = eur(sm.total);
    valSub.textContent = prog ? `Calcul des prix… ${prog}` : sm.pending ? 'Prix indisponibles pour le moment (connexion ?)' : `${valueOnly() ? 'Cartes de valeur · ' : ''}${{ cm: 'Cardmarket · tendance · tous vendeurs', tcg: 'TCGplayer · prix du marché (converti en €)', avg: 'Cardmarket + TCGplayer (converti en €)' }[priceSrc()]}${sm.oldest ? ' · relevé le ' + new Date(sm.oldest).toLocaleDateString('fr-FR') : ''}`;
  };
  // à chaque ouverture de l'application (une fois par lancement) : proposer d'actualiser les prix
  const askSlot = h('div', { class: 'askslot' });
  const askPrices = () => {
    let asked = false; try { asked = sessionStorage.getItem('cartes.askPrices') === '1'; sessionStorage.setItem('cartes.askPrices', '1'); } catch { /* ignoré */ }
    if (asked || !valRows.length) return;
    const last = summarize(valRows).oldest;
    askSlot.replaceChildren(h('div', { class: 'note ask', role: 'alert' },
      h('b', {}, 'Mettre à jour les prix ? '), last ? `Dernier relevé : ${new Date(last).toLocaleDateString('fr-FR')}.` : 'Aucun prix relevé pour le moment.',
      h('div', { class: 'acts' },
        h('button', { type: 'button', onclick: () => { askSlot.replaceChildren(); recalc(true); } }, 'Mettre à jour'),
        h('button', { type: 'button', onclick: () => askSlot.replaceChildren() }, 'Plus tard'))));
  };
  async function recalc(refresh) {
    if (busy) return; busy = true;
    try {
      valRows = await ownedRows(L); if (my !== tok) return; paint(); askPrices();
      await ensurePrices(L, valRows, refresh, (d, n) => { if (my === tok) paint(`${d}/${n}`); });
    } finally { busy = false; if (my === tok) { paint(); const sm = summarize(valRows); if (valRows.length && !sm.pending) recordValue(sm.total); } }
  }
  // statistiques de la collection
  function openStats() {
    const sm = summarize(valRows);
    const haveAll = secs.reduce((n, x) => n + x.have, 0), totAll = secs.reduce((n, x) => n + x.total, 0);
    const done = blocks.flatMap((b) => b.items).filter((g) => { const t = groupTotal(g); return t > 0 && g.members.reduce((n, m) => n + ownedCount(L, m.id), 0) >= t; }).length;
    const dbl = blocks.flatMap((b) => b.items).reduce((n, g) => n + g.members.reduce((k, m) => k + doublesCount(owned[L][m.id]), 0), 0);
    openSheet(
      h('h2', {}, 'Statistiques'),
      valuePanel(sm.total),
      h('p', { class: 'owned-total' }, h('b', {}, plural(haveAll, 'carte possédée', 'cartes possédées')), ` sur ${totAll.toLocaleString('fr-FR')} · ${pctOf(haveAll, totAll)} %`),
      h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${pctOf(haveAll, totAll)}%` })),
      h('ul', { class: 'stats' },
        h('li', {}, `${plural(sm.copies, 'exemplaire', 'exemplaires')} au total`),
        h('li', {}, `${plural(dbl, 'carte en double', 'cartes en double')} (2 exemplaires ou plus d’une version)`),
        h('li', {}, `${plural(done, 'extension complète', 'extensions complètes')}`),
        h('li', {}, `Valeur estimée : ${eur(sm.total)}`)),
      h('button', { class: 'btn', type: 'button', onclick: () => openBoosters(blocks, L) }, '🎁 Ouverture de booster'),
      h('button', { class: 'btn sec', type: 'button', onclick: () => openOwned(L, valRows, () => recalc(false)) }, '🃏 Mes cartes par rareté et estimation'),
      h('h2', {}, 'Par bloc'),
      h('div', { class: 'orows' }, secs.map((x) => h('div', { class: 'orow' }, h('div', { class: 'orow-l' }, h('span', { class: 'rn' }, x.b.name), h('span', { class: 'rc' }, h('b', {}, String(x.have)), `/${x.total.toLocaleString('fr-FR')} · ${pctOf(x.have, x.total)} %`)))).concat([])),
      h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Fermer'));
  }
  const goto = (hash) => () => { listScroll = scrollY; location.hash = hash; };
  const mtile = (icon, label, aria, onclick) => h('button', { type: 'button', class: 'mtile', 'aria-label': aria, onclick }, h('span', { class: 'mi' }, icon), h('span', { class: 'ml' }, label));
  const homeScanIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, 'aria-label': 'Photo de la carte à scanner' });
  homeScanIn.addEventListener('change', () => { const file = homeScanIn.files[0]; homeScanIn.value = ''; if (!file) return; pendingScan = file; listScroll = scrollY; location.hash = '#chercher/scan'; });
  const menu = h('nav', { class: 'menu', 'aria-label': 'Menu' },
    mineBtn,
    mtile('📷', 'Scanner', 'Scanner une carte avec l’appareil photo', () => { pendingScan = 'live'; listScroll = scrollY; location.hash = '#chercher/scan'; }),
    homeScanIn,
    mtile('📊', 'Statistiques', 'Statistiques de la collection', openStats),
    mtile('👥', 'Amis', 'Amis : partager et comparer', goto('#amis')),
    mtile('💾', 'Sauvegarde', 'Sauvegarde et restauration', () => openBackup()),
    mtile('⚙️', 'Réglages', 'Réglages', () => openSettings()));
  let setView = store.get(K.setview) === 'grille' ? 'grille' : 'liste';
  const vBtns = [['liste', 'Liste'], ['grille', 'Grille']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(setView === k), onclick: () => {
    setView = k; store.set(K.setview, k); vBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['liste', 'grille'][i] === k))); main.classList.toggle('setgrid', k === 'grille');
  } }, l));
  const colhead = h('div', { class: 'colhead' }, h('h2', {}, 'Collection'), toggleAll, h('div', { class: 'vseg', role: 'group', 'aria-label': 'Affichage des extensions' }, vBtns));
  const notes = [];
  if (isIOS && !isStandalone && !store.get(K.tip)) {
    notes.push(h('div', { class: 'note warn' },
      h('b', {}, 'Astuce iPhone / iPad : '), 'touchez Partager ⬆︎ puis « Sur l’écran d’accueil ». Cochez vos cartes depuis l’icône installée : ses données sont séparées de celles de Safari (utilisez Sauvegarde pour les transférer).',
      h('button', { type: 'button', onclick: (e) => { store.set(K.tip, '1'); e.target.closest('.note').remove(); } }, 'Compris')));
  }
  main.replaceChildren(...notes, askSlot, menu, carSlot, valbox, colhead, ...secs.map((x) => x.el), none);
  main.classList.toggle('setgrid', setView === 'grille');
  recalc(false);

  // résultats « cartes » : sous la recherche, avec accès à la page de recherche complète (images, prix, ajout)
  const hitsBox = h('section', { class: 'cardhits', hidden: true, 'aria-label': 'Cartes trouvées' });
  main.prepend(hitsBox);
  let hitsTimer = 0;
  const updateHits = async () => {
    const n = norm(q.value.trim());
    if (n.length < 2) { hitsBox.hidden = true; hitsBox.replaceChildren(); return; }
    let recs; try { recs = await loadHomeCards(sets, blocks); } catch { hitsBox.hidden = true; return; }
    if (my !== tok || norm(q.value.trim()) !== n) return;
    const found = recs.filter((r) => matchTokens(r.text, n));
    if (!found.length) { hitsBox.hidden = true; hitsBox.replaceChildren(); return; }
    const shownHits = found.slice(0, 8);
    hitsBox.replaceChildren(
      h('h2', {}, `Cartes : ${found.length.toLocaleString('fr-FR')} trouvée${found.length > 1 ? 's' : ''} en français`),
      h('ul', { class: 'hitlist' }, shownHits.map((r) => h('li', {}, h('button', { type: 'button', class: 'hit', onclick: () => { listScroll = scrollY; location.hash = '#chercher/q/' + encodeURIComponent(q.value.trim()); } },
        h('span', { class: 'hn' }, r.nm), h('span', { class: 'hl' }, `#${r.lid} · ${r.setName}${r.rar ? ' · ' + r.rar : ''}`))))),
      h('button', { type: 'button', class: 'btn hits-all', onclick: () => { listScroll = scrollY; location.hash = '#chercher/q/' + encodeURIComponent(q.value.trim()); } }, `Voir ${found.length > 1 ? `les ${found.length.toLocaleString('fr-FR')} cartes` : 'la carte'} avec images et prix`));
    hitsBox.hidden = false;
  };
  q.addEventListener('input', () => {
    const n = norm(q.value.trim()); let shown = 0;
    for (const x of secs) {
      let m = 0;
      for (const li of x.rows) { const ok = !n || matchTokens(li._name, n); li.hidden = !ok; if (ok) m++; }
      if (x.subEls) for (const sub of x.subEls) { const any = [...sub.list.children].some((li) => !li.hidden); sub.head.hidden = sub.list.hidden = !any; }
      x.el.hidden = !!n && !m;
      x.body.hidden = n ? !m : !openState[x.b.id];                 // pendant une recherche : les blocs concernés s'ouvrent
      x.head.setAttribute('aria-expanded', String(!x.body.hidden));
      shown += m;
    }
    none.hidden = shown > 0 || !n || !hitsBox.hidden;
    clearTimeout(hitsTimer); hitsTimer = setTimeout(async () => { await updateHits(); none.hidden = shown > 0 || !n || !hitsBox.hidden; }, 150);
  });
  if (listScroll) requestAnimationFrame(() => scrollTo(0, listScroll));
}

/* ---------- Vue : cartes d'une extension (avec ses extensions liées) ---------- */
async function showSet(L, setId, my) {
  const ld = loader.start('Cartes de l’extension');
  try { await showSetInner(L, setId, my); } finally { ld.done(); }
}
async function showSetInner(L, setId, my) {
  const back = h('button', { class: 'iconbtn', type: 'button', onclick: () => go(L), 'aria-label': 'Retour aux extensions' }, '‹ Extensions');
  const title = h('h1', {}, setId);
  const q = h('input', { class: 'search', type: 'search', placeholder: 'Nom, numéro ou rareté…', 'aria-label': 'Rechercher une carte', enterkeyhint: 'search', autocomplete: 'off' });
  const top = h('header', { class: 'top' }, h('div', { class: 'row' }, back, title), q);
  const main = h('main', {}, spinner());
  $app.replaceChildren(top, main);
  scrollTo(0, 0);

  let sets = [];
  try { ({ sets } = await loadSets(L)); } catch { /* liste indisponible : on tente l'extension seule */ }
  if (my !== tok) return;
  const idSet = new Set(sets.map((s) => s.id));
  const pid = parentOf(setId, idSet);
  if (pid !== setId) { history.replaceState(null, '', '#' + L + '/' + encodeURIComponent(pid)); setId = pid; } // ancien lien vers une extension liée
  const group = buildGroups(sets).get(setId);
  const members = group ? group.members : [{ id: setId }];

  const results = await Promise.allSettled(members.map((m) => api(`/${L}/sets/${encodeURIComponent(m.id)}`)));
  if (my !== tok) return;
  if (results[0].status === 'rejected') {
    const e = results[0].reason;
    const missing = /HTTP 404/.test(e?.message || '');
    main.replaceChildren(missing
      ? h('div', { class: 'note bad' }, h('b', {}, 'Extension introuvable. '), `TCGdex ne connaît pas « ${setId} » en ${langLabel(L)}.`)
      : errorBox('Vérifiez votre connexion. ' + (e?.message || ''), () => showSet(L, setId, tok)));
    return;
  }

  const infos = await Promise.all(members.map((m) => loadCardInfo(L, m.id)));   // rareté + versions (instantané, petit fichier)
  await Promise.all([scansReady, orderReady]);
  if (my !== tok) return;
  const parts = members.map((m, i) => {
    const data = results[i].status === 'fulfilled' ? results[i].value : null;
    const cards = sortCards(L, m.id, (() => { const l = Array.isArray(data?.cards) ? data.cards : []; applyScans(l); return l; })());
    if (data) rememberCoverage(L, m.id, cards.length, cards.filter((c) => c.image).length);
    return { id: m.id, name: data?.name || m.name || m.id, data, cards, info: infos[i], total: data?.cardCount?.total ?? m.cardCount?.total ?? cards.length, mine: owned[L][m.id] || nullObj() };
  });
  const allCards = parts.reduce((n, p) => n + p.cards.length, 0);
  const allTotal = parts.reduce((n, p) => n + p.total, 0);
  const withImg = parts.reduce((n, p) => n + p.cards.filter((c) => c.image).length, 0);
  title.textContent = parts[0].name;
  title.setAttribute('lang', langAttr(L));

  const counter = h('span', {});
  const bar = h('i', {});
  const progress = h('div', { class: 'progress' }, h('div', { class: 'count' }, counter), h('div', { class: 'bar', 'aria-hidden': 'true' }, bar));
  const refresh = () => {
    const n = parts.reduce((s, p) => s + countKeys(p.mine), 0), d = parts.reduce((s, p) => s + doublesCount(p.mine), 0);
    counter.replaceChildren(h('b', {}, plural(n, 'carte possédée', 'cartes possédées')), ` sur ${allTotal.toLocaleString('fr-FR')}`, d ? ` · dont ${plural(d, 'double', 'doubles')}` : '');
    bar.style.width = (allTotal ? Math.min(100, Math.round(n / allTotal * 100)) : 0) + '%';
  };
  refresh();

  const notes = [];
  parts.forEach((p, i) => { if (i > 0 && !p.data) notes.push(h('div', { class: 'note warn' }, `Impossible de charger « ${p.name} » (connexion ?). Ses cartes ne sont pas affichées.`)); });
  if (allCards === 0) {
    notes.push(h('div', { class: 'note bad' }, h('b', {}, 'Cartes indisponibles. '),
      `TCGdex annonce ${plural(allTotal, 'carte', 'cartes')} pour cette extension en ${langLabel(L)}, mais n’en fournit aucune. Vous ne pouvez donc pas les cocher ici pour l’instant. Revenez plus tard.`));
  } else {
    if (allCards < allTotal) notes.push(h('div', { class: 'note warn' }, h('b', {}, 'Extension incomplète. '), `TCGdex ne fournit que ${allCards} cartes sur ${allTotal} annoncées.`));
    if (withImg === 0) notes.push(h('div', { class: 'note' }, h('b', {}, 'Pas d’images. '), 'TCGdex n’a aucune image pour cette extension ; les cartes sont listées par nom et numéro.'));
    else if (withImg < allCards) notes.push(h('div', { class: 'note' }, h('b', {}, 'Images partielles. '), `${withImg} cartes sur ${allCards} ont une image.`));
  }

  const fromScans = parts.reduce((n, p) => n + p.cards.filter((c) => c._scan).length, 0);
  const fromRemote = parts.reduce((n, p) => n + p.cards.filter((c) => c._remote).length, 0);
  if (fromScans) notes.push(h('div', { class: 'note' }, h('b', {}, 'Scans PokéCardex. '),
    `${plural(fromScans, 'carte de cette extension n’a', 'cartes de cette extension n’ont')} pas d’image utilisable dans TCGdex : ${fromScans > 1 ? 'leurs scans viennent' : 'son scan vient'} de `,
    h('a', { href: 'https://www.pokecardex.com/', target: '_blank', rel: 'noopener noreferrer' }, 'PokéCardex'),
    fromRemote ? ` (${fromRemote > 1 ? 'chargés' : 'chargé'} depuis son serveur d’images, cet appareil ne lisant pas l’AVIF).` : '.'));

  let filter = 'all';
  const persist = (part) => () => {
    if (countKeys(part.mine)) owned[L][part.id] = part.mine; else delete owned[L][part.id];
    saveOwned(); refresh(); apply();
  };
  const tiles = [];
  let selMode = false, quickMode = false;
  const picked = new Set();
  const visible = () => tiles.filter((x) => !x.el.hidden && !x.el.closest('[hidden]'));
  const pickedVisible = () => visible().filter((x) => picked.has(x));
  const quickAdd = (t) => {                          // un exemplaire de plus (1re version si la carte en a plusieurs)
    const key = hasVersions(t.info) ? t.info.vars[0].key : null;
    const cur = key == null ? qtyTotal(t.value) : (isMulti(t.value) ? (t.value[key] || 0) : 0);
    if (cur >= MAXQ) { toast('Quantité maximale atteinte.'); return; }
    t.set(key, cur + 1);
    t.el.classList.remove('qflash'); void t.el.offsetWidth; t.el.classList.add('qflash');
    toast(`+1 ${t.name}`);
  };
  const zoom = (t) => {
    if (selMode) { togglePick(t); return; }          // en mode sélection, toucher la photo sélectionne la carte
    if (quickMode && !longPress()) { quickAdd(t); return; }     // ajout rapide : toucher bref = +1 ; appui long = fiche (prix, eBay…)
    const vis = visible();
    openLightbox(vis, Math.max(0, vis.indexOf(t)), L);
  };
  const sections = parts.map((part) => {
    const ptot = prefixTotals(part.cards);
    const pt = part.cards.map((c) => makeTile(c, part.mine, persist(part), { info: part.info, setName: part.name, official: part.data?.cardCount?.official, zoom, prefixTotals: ptot }));
    tiles.push(...pt);
    const el = h('section', { class: 'part' },
      parts.length > 1 && h('h2', { class: 'part-h' }, `${part.name} · ${plural(part.cards.length || part.total, 'carte', 'cartes')}`),
      parts.length > 1 && !part.cards.length && h('p', { class: 'empty' }, 'Cartes indisponibles pour cette partie.'),
      pt.length ? h('div', { class: 'cards' }, pt.map((t) => t.el)) : null);
    return { el, tiles: pt };
  });
  const none = h('p', { class: 'empty', hidden: true }, 'Aucune carte ne correspond.');

  const FILTERS = [['all', 'Toutes'], ['own', 'Possédées'], ['miss', 'Manquantes'], ['dbl', 'Doubles']];
  const filterBtns = FILTERS.map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === filter), onclick: () => { filter = k; filterBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(FILTERS[i][0] === k))); apply(); } }, label));

  // --- raretés : filtre + récapitulatif par rareté ---
  let rarFilter = '';
  const rarTotals = new Map();
  for (const t of tiles) { const r = t.info && t.info.rar; if (r) rarTotals.set(r, (rarTotals.get(r) || 0) + 1); }
  const rarList = [...rarTotals.keys()].sort((a, b) => rarityRank(a) - rarityRank(b) || a.localeCompare(b, 'fr'));
  const rarSel = h('select', { class: 'sel', 'aria-label': 'Filtrer par rareté' }, h('option', { value: '' }, 'Toutes les raretés'), ...rarList.map((r) => h('option', { value: r }, `${r} (${rarTotals.get(r)})`)));
  rarSel.addEventListener('change', () => { rarFilter = rarSel.value; apply(); });
  const pc = (a, b) => (b ? Math.round(a / b * 100) : 0);
  function openRarities() {
    const rows = rarList.map((r) => { const ts = tiles.filter((t) => t.info && t.info.rar === r); return { r, total: ts.length, have: ts.filter((t) => qtyTotal(t.mine[t.card.id]) > 0).length }; });
    const unknown = tiles.filter((t) => !(t.info && t.info.rar)).length;
    openSheet(
      h('h2', {}, 'Raretés de cette extension'),
      h('p', {}, 'Cartes possédées sur le total, pour chaque rareté. Touchez une ligne pour n’afficher que ces cartes.'),
      h('div', { class: 'rarlist' }, rows.map((x) => h('button', { type: 'button', class: 'rarrow', onclick: () => { rarFilter = x.r; rarSel.value = x.r; apply(); closeSheet(); } },
        h('span', { class: 'rdot rt-' + rarityTier(x.r) }), h('span', { class: 'rn' }, x.r), h('span', { class: 'rc' }, h('b', {}, String(x.have)), `/${x.total} · ${pc(x.have, x.total)} %`),
        h('span', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${pc(x.have, x.total)}%` }))))),
      unknown ? h('p', {}, `${plural(unknown, 'carte', 'cartes')} sans rareté connue.`) : null,
      h('button', { class: 'btn sec', type: 'button', onclick: () => { rarFilter = ''; rarSel.value = ''; apply(); closeSheet(); } }, 'Toutes les raretés'),
      h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Fermer'));
  }

  // --- ajout groupé : une version, pour toutes les cartes affichées (selon recherche et filtres) ---
  function openBulk() {
    const vis = selMode ? pickedVisible() : visible();
    if (selMode && !vis.length) { toast('Touchez d’abord des cartes pour les sélectionner.'); return; }
    if (!vis.length) { toast('Aucune carte affichée : rien à modifier.'); return; }
    const kinds = new Map(); let singles = 0;
    for (const t of vis) {
      if (hasVersions(t.info)) for (const v of t.info.vars) { const k = kinds.get(v.key) || { label: v.label, n: 0 }; k.n++; kinds.set(v.key, k); } else singles++;
    }
    const options = [...kinds.entries()].sort((a, b) => b[1].n - a[1].n).map(([key, k]) => [key, `${k.label} (${plural(k.n, 'carte', 'cartes')})`]);
    if (singles) options.push(['', `Cartes à version unique (${plural(singles, 'carte', 'cartes')})`]);
    const verSel = h('select', { class: 'field', 'aria-label': 'Version' }, options.map(([k, l]) => h('option', { value: k }, l)));
    const modeSel = h('select', { class: 'field', 'aria-label': 'Action' }, h('option', { value: 'add' }, 'Ajouter'), h('option', { value: 'set' }, 'Définir à'), h('option', { value: 'del' }, 'Retirer (mettre à 0)'));
    const qIn = h('input', { class: 'field', type: 'number', inputmode: 'numeric', min: '1', max: String(MAXQ), value: '1', 'aria-label': 'Nombre d’exemplaires' });
    const qLabel = h('label', { class: 'lbl' }, 'Nombre d’exemplaires', qIn);
    const info = h('div', { class: 'note' });
    const applyBtn = h('button', { class: 'btn', type: 'button' }, 'Appliquer');
    // nombre de cartes : toutes, ou seulement les N premières (dans l'ordre affiché), ex. 50 cartes d'une même rareté
    const limSel = h('select', { class: 'field', 'aria-label': 'Cartes concernées' }, h('option', { value: 'all' }, 'Toutes les cartes concernées'), h('option', { value: 'first' }, 'Seulement les N premières (ordre affiché)'));
    const limIn = h('input', { class: 'field', type: 'number', inputmode: 'numeric', min: '1', value: '50', hidden: true, 'aria-label': 'Nombre de cartes concernées' });
    limSel.addEventListener('change', () => { limIn.hidden = limSel.value !== 'first'; refreshInfo(); }); limIn.addEventListener('input', () => refreshInfo());
    const targetsOf = () => {
      const all = vis.filter((t) => (verSel.value === '' ? !hasVersions(t.info) : hasVersions(t.info) && t.info.vars.some((v) => v.key === verSel.value)));
      return limSel.value === 'first' ? all.slice(0, Math.max(1, parseInt(limIn.value, 10) || 1)) : all;
    };
    const refreshInfo = () => { const n = targetsOf().length; qLabel.hidden = modeSel.value === 'del'; info.textContent = `${plural(n, 'carte sera modifiée', 'cartes seront modifiées')}.`; applyBtn.disabled = n === 0; };
    verSel.addEventListener('change', refreshInfo); modeSel.addEventListener('change', refreshInfo);
    applyBtn.addEventListener('click', () => {
      const key = verSel.value, mode = modeSel.value, q = Math.max(1, Math.min(MAXQ, parseInt(qIn.value, 10) || 1));
      const targets = targetsOf(); if (!targets.length) return;
      const before = targets.map((t) => [t, t.value === undefined ? undefined : isMulti(t.value) ? { ...t.value } : t.value]);
      for (const t of targets) {
        const cur = key === '' ? qtyTotal(t.value) : (isMulti(t.value) ? (t.value[key] || 0) : 0);
        const n = mode === 'add' ? cur + q : mode === 'set' ? q : 0;
        t.setQuiet(key === '' ? null : key, Math.max(0, Math.min(MAXQ, n)));
      }
      parts.forEach((pt) => persist(pt)());
      closeSheet();
      toast(`${plural(targets.length, 'carte mise à jour', 'cartes mises à jour')}.`, { label: 'Annuler', run: () => { for (const [t, v] of before) t.restore(v); parts.forEach((pt) => persist(pt)()); toast('Modification annulée.'); } });
    });
    openSheet(
      h('h2', {}, 'Ajout groupé'),
      rarList.length ? h('button', { class: 'btn sec', type: 'button', onclick: () => { closeSheet(); openRarityPick(); } }, '🎯 Choisir les cartes d’une rareté…') : null,
      h('p', {}, selMode ? `S’applique aux ${plural(vis.length, 'carte sélectionnée', 'cartes sélectionnées')}.` : `S’applique aux ${plural(vis.length, 'carte affichée', 'cartes affichées')} (selon la recherche et les filtres en cours, ex. une seule rareté).`, ' Une carte qui n’a pas la version choisie n’est pas touchée.'),
      h('label', { class: 'lbl' }, 'Version', verSel), h('label', { class: 'lbl' }, 'Cartes concernées', limSel, limIn), h('label', { class: 'lbl' }, 'Action', modeSel), qLabel, info, applyBtn,
      h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Annuler'));
    refreshInfo();
  }

  const selCount = h('span', { class: 'sc' });
  const updateSel = () => { selCount.textContent = plural(pickedVisible().length, 'carte sélectionnée', 'cartes sélectionnées'); };
  function togglePick(t) { if (picked.has(t)) picked.delete(t); else picked.add(t); t.el.classList.toggle('picked', picked.has(t)); updateSel(); }
  const selBar = h('div', { class: 'selbar', hidden: true }, selCount,
    h('button', { type: 'button', class: 'tbtn', onclick: () => { visible().forEach((t) => { picked.add(t); t.el.classList.add('picked'); }); updateSel(); } }, 'Tout (affichées)'),
    h('button', { type: 'button', class: 'tbtn', onclick: () => { picked.forEach((t) => t.el.classList.remove('picked')); picked.clear(); updateSel(); } }, 'Aucune'),
    h('button', { type: 'button', class: 'tbtn', onclick: openBulk }, '➕ Ajouter'));
  function setSelMode(on) {
    if (on && quickMode) quickBtn.click();
    selMode = on; selBtn.setAttribute('aria-pressed', String(selMode)); selBar.hidden = !selMode; main.classList.toggle('selecting', selMode);
    if (!selMode) { picked.forEach((t) => t.el.classList.remove('picked')); picked.clear(); }
    updateSel();
  }
  const quickBtn = h('button', { type: 'button', class: 'tbtn', 'aria-pressed': 'false', 'aria-label': 'Ajout rapide : toucher une carte en ajoute un exemplaire', title: 'Ajout rapide : chaque toucher sur une carte en ajoute un exemplaire', onclick: () => {
    quickMode = !quickMode; if (quickMode && selMode) setSelMode(false);
    quickBtn.setAttribute('aria-pressed', String(quickMode)); main.classList.toggle('quick', quickMode);
    if (quickMode) toast('Ajout rapide : touchez une carte pour en ajouter un exemplaire.');
  } }, '⚡');
  const selBtn = h('button', { type: 'button', class: 'tbtn', 'aria-pressed': 'false', 'aria-label': 'Mode sélection de cartes', title: 'Sélectionner des cartes', onclick: () => setSelMode(!selMode) }, '☑︎');
  // --- ajout par rareté : on choisit une rareté, on coche soi-même les cartes voulues, puis on valide ---
  function openRarityPick(startRar) {
    let rar = startRar || (rarList.includes(rarFilter) ? rarFilter : rarList[0]);
    const sel = h('select', { class: 'field', 'aria-label': 'Rareté à choisir' }, rarList.map((r) => h('option', { value: r }, `${r} (${rarTotals.get(r)})`)));
    sel.value = rar;
    const list = h('div', { class: 'pickrows', role: 'group', 'aria-label': 'Cartes de cette rareté' });
    const count = h('p', { class: 'owned-total' });
    const goBtn = h('button', { class: 'btn', type: 'button' }, 'Continuer');
    let rows = [];
    const upd = () => { const n = rows.filter((x) => x.cb.checked).length; count.replaceChildren(h('b', {}, plural(n, 'carte choisie', 'cartes choisies')), ` sur ${rows.length}`); goBtn.disabled = n === 0; };
    const fill = () => {
      rar = sel.value;
      rows = tiles.filter((t) => t.info && t.info.rar === rar).map((t) => {
        const cb = h('input', { type: 'checkbox', 'aria-label': `Choisir ${t.name} (n° ${t.card.localId})` }); cb.addEventListener('change', upd);
        return { t, cb, el: h('label', { class: 'pickrow' }, cb, h('span', { class: 'pn' }, '#' + t.card.localId), h('span', { class: 'pt' }, t.name), qtyTotal(t.value) > 0 ? h('span', { class: 'po' }, '✓ possédée') : null) };
      });
      list.replaceChildren(...rows.map((x) => x.el)); upd();
    };
    sel.addEventListener('change', fill);
    goBtn.addEventListener('click', () => {
      const chosen = rows.filter((x) => x.cb.checked).map((x) => x.t); if (!chosen.length) return;
      closeSheet();
      q.value = ''; filter = 'all'; filterBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(FILTERS[i][0] === 'all')));
      rarFilter = rar; rarSel.value = rar; apply();          // les cartes choisies sont toutes affichées
      setSelMode(false); setSelMode(true);
      chosen.forEach((t) => { picked.add(t); t.el.classList.add('picked'); }); updateSel();
      openBulk();                                              // version, action et quantité : ne s'applique qu'aux cartes choisies
    });
    openSheet(
      h('h2', {}, 'Ajout par rareté'),
      h('p', {}, 'Choisissez une rareté, cochez les cartes voulues (par exemple 25 « Illustration spéciale rare »), puis continuez : vous indiquerez la version et la quantité.'),
      h('label', { class: 'lbl' }, 'Rareté', sel),
      h('div', { class: 'acts' },
        h('button', { class: 'btn sec', type: 'button', onclick: () => { rows.forEach((x) => { x.cb.checked = true; }); upd(); } }, 'Tout cocher'),
        h('button', { class: 'btn sec', type: 'button', onclick: () => { rows.forEach((x) => { x.cb.checked = false; }); upd(); } }, 'Aucune')),
      list, count, goBtn,
      h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Annuler'));
    fill();
  }

  if (allCards) top.append(
    h('div', { class: 'tools' }, h('div', { class: 'seg small' }, filterBtns)),
    h('div', { class: 'tools2' },
      rarList.length ? rarSel : null,
      rarList.length ? h('button', { type: 'button', class: 'tbtn', 'aria-label': 'Récapitulatif par rareté', title: 'Récapitulatif par rareté', onclick: openRarities }, '📊') : null,
      selBtn, quickBtn,
      h('button', { type: 'button', class: 'tbtn wide', 'aria-label': 'Ajout groupé', onclick: openBulk }, '➕ Ajout groupé')),
    selBar);

  // --- en-tête de l'extension : logo, date, avancement, détail par rareté ; onglets Cartes / Liste / Grille ---
  const meta0 = setMeta(parts[0].id) || [];
  const logoBox = h('div', { class: 'sc-logo' });
  { const lu = setLogoUrl(parts[0].id, parts[0].data); const ph = () => logoBox.replaceChildren(h('span', { class: 'ph' }, meta0[2] || parts[0].id)); if (lu) logoBox.append(lazyImg(lu, '', ph)); else ph(); }
  const rbk = h('div', { class: 'rbk', role: 'group', 'aria-label': 'Avancement par rareté' });
  function paintRbk() {
    rbk.replaceChildren(...rarList.map((r) => {
      const ts = tiles.filter((t) => t.info && t.info.rar === r), have = ts.filter((t) => qtyTotal(t.mine[t.card.id]) > 0).length;
      return h('button', { type: 'button', class: 'rbkc' + (rarFilter === r ? ' on' : ''), 'aria-pressed': String(rarFilter === r), title: `${r} : ${have} sur ${ts.length}`,
        onclick: () => { rarFilter = rarFilter === r ? '' : r; rarSel.value = rarFilter; apply(); } },
        h('span', { class: 'rbi' }, rarityIcon(r, 20)), h('b', {}, String(have)), h('span', { class: 'rt' }, '/' + ts.length), h('span', { class: 'rn' }, r));
    }));
    rbk.hidden = !rarList.length;
  }
  const fmtD = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR'); };
  const setcard = h('section', { class: 'setcard' },
    h('div', { class: 'sc-top' }, logoBox, h('div', { class: 'sc-info' }, h('h2', {}, parts[0].name), meta0[1] ? h('p', {}, 'Date de sortie : ' + fmtD(meta0[1])) : null, meta0[2] ? h('span', { class: 'sc-abbr' }, meta0[2]) : null)),
    progress, rbk);
  // Affichage par défaut : éventail (la carte du centre, la précédente et la suivante visibles), pour toutes les cartes de l'extension, possédées ou non
  const VIEWS = [['eventail', 'Éventail'], ['cartes', 'Cartes'], ['liste', 'Liste'], ['grille', 'Grille']];
  let view = VIEWS.some(([k]) => k === store.get('cartes.view2')) ? store.get('cartes.view2') : 'eventail';
  const cfSlot = h('div', { class: 'carslot' });
  function paintCf() {
    if (view !== 'eventail' || !main.isConnected) { cfSlot.hidden = true; return; }
    const vis = sections.flatMap((x) => x.tiles).filter((t) => !t.el.hidden);
    cfSlot.hidden = !vis.length;
    if (!vis.length) { cfSlot.replaceChildren(); return; }
    const items = vis.map((t) => { const e = priceCache[t.card.id]; return { card: t.card, name: t.card.name, sub: '#' + lidShow(t.card.localId) + (qtyTotal(t.mine[t.card.id]) > 0 ? ' · possédée' : ''), price: blend(t.card.id, e ? srcUnit(e, null) : null) }; });
    const keep = cfSlot.querySelector('.cf-track') ? cfSlot.querySelector('.cf-track').scrollLeft : 0;
    cfSlot.replaceChildren(buildCoverflow(`${vis.length.toLocaleString('fr-FR')} carte${vis.length > 1 ? 's' : ''}`, items, (i) => { if (quickMode && !longPress()) { quickAdd(vis[i]); paintCf(); } else openLightbox(vis, i, L); }));
    const tr = cfSlot.querySelector('.cf-track'); if (tr && keep) requestAnimationFrame(() => { tr.scrollLeft = keep; });
  }
  const applyView = () => {
    VIEWS.forEach(([k]) => main.classList.toggle('view-' + k, k === view)); viewBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(VIEWS[i][0] === view)));
    sections.forEach((x) => { x.el.style.display = view === 'eventail' ? 'none' : ''; }); paintCf();
  };
  const viewBtns = VIEWS.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(k === view), onclick: () => { view = k; store.set('cartes.view2', k); applyView(); } }, l));
  const viewSeg = h('div', { class: 'vseg views', role: 'group', 'aria-label': 'Affichage des cartes' }, viewBtns);

  function apply() {
    const n = norm(q.value.trim()); let shown = 0;
    for (const sec of sections) {
      let secShown = 0;
      for (const t of sec.tiles) {
        const v = t.mine[t.card.id], qty = qtyTotal(v);
        const byFilter = filter === 'all' || (filter === 'own' && qty > 0) || (filter === 'miss' && qty === 0) || (filter === 'dbl' && qtyMax(v) >= 2);
        const byRar = !rarFilter || (t.info && t.info.rar === rarFilter);
        const ok = byFilter && byRar && (!n || t.text.includes(n));
        t.el.hidden = !ok; if (ok) secShown++;
      }
      shown += secShown;
      if (sec.tiles.length) sec.el.hidden = secShown === 0; // une partie sans carte visible disparaît pendant un filtre
    }
    none.hidden = shown > 0 || !allCards;
    paintRbk(); paintCf();
  }
  q.addEventListener('input', apply);
  apply(); applyView();
  main.replaceChildren(...notes, setcard, viewSeg, cfSlot, ...sections.map((x) => x.el), none);
  applyView();
  priceTiles(L, tiles, my);
  for (const ms of [2500, 7000]) setTimeout(() => { if (main.isConnected && view === 'eventail' && my === tok) paintCf(); }, ms);      // les prix arrivent après l'affichage
}

/* ---------- Vue : recherche dans toute la collection (nom, extension, rareté, version, possession) ---------- */
// data/names.json : { extension: [[numéro, nom(, 0 = sans image)] ou [idAtypique, numéro, nom(, 0)]…] } (outil : tools/fetch-card-names.py)
let searchIdx = null;
async function buildSearchIndex(L, sets) {
  const names = await fetch('data/names.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  await Promise.all([scansReady, metaReady]);
  const groups = [...buildGroups(sets).values()], blocks = buildBlocks(groups);
  const order = blocks.flatMap((b) => b.items.flatMap((g) => g.members.map((m) => [m, g.id]))).filter(([m]) => names[m.id]);
  const infos = new Map(await Promise.all(order.map(async ([m]) => [m.id, await loadCardInfo(L, m.id)])));
  const recs = [], vers = new Map(), rars = new Map();
  for (const [m, gid] of order) {
    const sid = m.id, serie = setMeta(sid)?.[0], info = infos.get(sid), cards = [];
    for (const row of names[sid]) {
      const odd = typeof row[2] === 'string', lid = String(odd ? row[1] : row[0]), nm = odd ? row[2] : row[1], noImg = odd ? row[3] === 0 : row[2] === 0;
      const id = odd ? row[0] : sid + '-' + lid;
      cards.push({ id, localId: lid, name: nm, image: !noImg && serie ? `https://assets.tcgdex.net/${L}/${serie}/${sid}/${lid}` : null, vi: cards.length });
    }
    applyScans(cards);
    for (const c of cards) {
      const i = info.get(c.id) || null;
      recs.push({ card: c, sid, gid, setName: m.name || sid, info: i, text: norm(`${c.name} ${lidShow(c.localId)} ${c.id} ${i && i.rar ? i.rar : ''}`) });
      if (i && i.rar) rars.set(i.rar, (rars.get(i.rar) || 0) + 1);
      if (i) for (const v of i.vars) { const e = vers.get(v.key) || { label: v.label, n: 0 }; e.n++; vers.set(v.key, e); }
    }
  }
  const prefix = new Map(); for (const [m] of order) prefix.set(m.id, prefixTotals((names[m.id] || []).map((row) => ({ localId: typeof row[2] === 'string' ? row[1] : row[0] }))));
  return { L, recs, infos, blocks, rars, vers, prefix, official: new Map(sets.map((x) => [x.id, x.cardCount && x.cardCount.official])) };
}

/* ---------- Scan d'une carte : reconnaissance du texte dans l'appareil (la photo n'est envoyée nulle part) ---------- */
// Tesseract.js (dossier vendor/), chargé seulement à la première utilisation. On lit le nom et le numéro imprimé (« 001/131 »),
// puis on cherche dans data/names.json les cartes qui correspondent.
let ocrWorker = null;
let pendingScan = null;    // photo prise depuis l'accueil, analysée dès l'ouverture de la page de recherche
const loadScript = (src) => new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('Chargement du lecteur impossible')); document.head.append(el); });
let ocrIdle = 0;
function touchOcr() { clearTimeout(ocrIdle); ocrIdle = setTimeout(() => { if (ocrWorker) { const w = ocrWorker; ocrWorker = null; w.terminate().catch(() => {}); } }, 20000); }      // libère la mémoire (et la batterie) 20 s après la dernière lecture
async function getOcr() {
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
  const abs = (p) => new URL(p, location.href).href;
  ocrWorker = await Tesseract.createWorker('fra', 1, { workerPath: abs('vendor/tesseract/worker.min.js'), corePath: abs('vendor/tesseract/core'), langPath: abs('vendor/tesseract/lang') });
  return ocrWorker;
}
// Charge une photo avec son orientation (EXIF) : par une balise <img> (le décodage d'image applique l'orientation partout), puis dessinée sur un canevas (3200 px au plus)
async function loadPhoto(file) {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const k = Math.min(1, 3200 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
    } finally { URL.revokeObjectURL(url); }
  } catch { return createImageBitmap(file); }
}
const turnCanvas = (src, quarter) => { const c = document.createElement('canvas'); c.width = src.height; c.height = src.width; const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(quarter * Math.PI / 2); x.drawImage(src, -src.width / 2, -src.height / 2); return c; };
async function photoCanvases(src) { // photo entière (réduite), bande du bas (numéro) et bandes du haut (nom), agrandies
  const bmp = src.width ? src : await loadPhoto(src);
  const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const full = document.createElement('canvas'); full.width = Math.round(bmp.width * k); full.height = Math.round(bmp.height * k);
  full.getContext('2d').drawImage(bmp, 0, 0, full.width, full.height);
  const band = (y0, frac, kmax) => {
    const sh = Math.round(bmp.height * frac), sy = Math.round(bmp.height * y0), ks = Math.min(kmax, 1800 / bmp.width);
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * ks); c.height = Math.round(sh * ks);
    c.getContext('2d').drawImage(bmp, 0, sy, bmp.width, sh, 0, 0, c.width, c.height); return c;
  };
  const out = [full, band(0.8, 0.2, 2), band(0, 0.16, 3), band(0, 0.22, 3)];
  if (bmp.close) bmp.close();
  return out;
}
/* Détection de la carte dans la photo : on cherche le rectangle de proportions 63×88 (une carte) dont le contour sépare au mieux deux zones de couleurs différentes
   ET dont l'extérieur ressemble au fond de la photo (couleur médiane des bords) : le contour extérieur de la carte l'emporte ainsi sur le cadre de l'illustration.
   D'abord en grossier, puis affiné. Renvoie { x, y, w, h } en pixels de l'image d'origine, ou null. */
const CARD_RATIO = 63 / 88;
function edgeSearch(bmp, W, win) {
  const H = Math.round(W * bmp.height / bmp.width);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }); x.filter = 'blur(1px)'; x.drawImage(bmp, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, m = Math.max(2, Math.round(Math.min(W, H) * 0.04)), ring = [[], [], []];
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (xx < m || yy < m || xx >= W - m || yy >= H - m) { const o = (yy * W + xx) * 4; ring[0].push(d[o]); ring[1].push(d[o + 1]); ring[2].push(d[o + 2]); }
  const bg = ring.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
  const R = (xx, yy) => { xx = Math.min(W - 1, Math.max(0, xx)); yy = Math.min(H - 1, Math.max(0, yy)); return (yy * W + xx) * 4; };
  const dc = (o1, o2) => Math.hypot(d[o1] - d[o2], d[o1 + 1] - d[o2 + 1], d[o1 + 2] - d[o2 + 2]);
  const db = (o) => Math.hypot(d[o] - bg[0], d[o + 1] - bg[1], d[o + 2] - bg[2]);
  const hMin = win ? win.h0 : Math.round(H * 0.26), hMax = win ? win.h1 : Math.floor(Math.min(H, W / CARD_RATIO)), g = Math.max(2, Math.round(W / 40));
  const N = 14;
  let best = null;
  for (let h = hMin; h <= hMax; h++) for (const fw of (win ? [0.94, 1, 1.06] : [1])) {      // affinage : largeur libre (±10 %, perspective)
    const w = Math.round(h * CARD_RATIO * fw); if (w >= W || h >= H) continue;
    const xa = win ? win.x0 : 0, xb = win ? win.x1 : W - w - 1, ya = win ? win.y0 : 0, yb = win ? win.y1 : H - h - 1;
    for (let x0 = Math.max(0, xa); x0 <= Math.min(W - w - 1, xb); x0++) for (let y0 = Math.max(0, ya); y0 <= Math.min(H - h - 1, yb); y0++) {
      let sc = 0, n = 0;
      for (let k = 0; k < N; k++) {
        const t = (k + 0.5) / N, px = Math.round(x0 + w * t), py = Math.round(y0 + h * t);
        // haut, bas, gauche, droite : (dedans, dehors)
        // (dedans, dehors, bord de l'image dans la même direction) : le dehors du vrai contour ressemble au fond local, pas celui d'un cadre intérieur
        const pairs = [[R(px, y0 + g), R(px, y0 - g), R(px, m)], [R(px, y0 + h - g), R(px, y0 + h + g), R(px, H - 1 - m)], [R(x0 + g, py), R(x0 - g, py), R(m, py)], [R(x0 + w - g, py), R(x0 + w + g, py), R(W - 1 - m, py)]];
        for (const [i1, i2, i3] of pairs) { sc += Math.min(dc(i1, i2), 90) - 1.1 * Math.min(dc(i2, i3), 90); n++; }
      }
      sc /= n; if (!best || sc > best.sc) best = { sc, x0, y0, w, h };
    }
  }
  return best ? { ...best, W, H } : null;
}
// Recale les quatre côtés du cadre sur le vrai bord de la carte : le long de chaque côté, on suit la distance au fond local (bande de 6 à 10 % plus loin)
// en s'éloignant du centre ; le bord est là où elle chute le plus. Corrige les décalages de quelques % dus aux bords gris peu contrastés.
function snapBox(src, box) {
  try {
    const Wn = 420, k = Wn / src.width, Hn = Math.round(src.height * k), c = document.createElement('canvas'); c.width = Wn; c.height = Hn;
    const x = c.getContext('2d', { willReadFrequently: true }); x.filter = 'blur(1px)'; x.drawImage(src, 0, 0, Wn, Hn);
    const d = x.getImageData(0, 0, Wn, Hn).data;
    const px = (xx, yy) => { xx = Math.min(Wn - 1, Math.max(0, Math.round(xx))); yy = Math.min(Hn - 1, Math.max(0, Math.round(yy))); const o = (yy * Wn + xx) * 4; return [d[o], d[o + 1], d[o + 2]]; };
    const bx = { x: box.x * k, y: box.y * k, w: box.w * k, h: box.h * k };
    // côté : direction sortante (ox, oy), points le long du côté
    const sides = { top: { n: [0, -1], pt: (t) => [bx.x + bx.w * t, bx.y] }, bottom: { n: [0, 1], pt: (t) => [bx.x + bx.w * t, bx.y + bx.h] }, left: { n: [-1, 0], pt: (t) => [bx.x, bx.y + bx.h * t] }, right: { n: [1, 0], pt: (t) => [bx.x + bx.w, bx.y + bx.h * t] } };
    const L = { top: bx.h, bottom: bx.h, left: bx.w, right: bx.w }, out = {};
    for (const [nm, sd] of Object.entries(sides)) {
      const len = L[nm], offs = [];                               // décalages testés, de -7 % (dedans) à +7 % (dehors) de la dimension
      for (let o = -0.07; o <= 0.0701; o += 0.005) offs.push(o);
      const samp = (o) => { const col = [[], [], []]; for (let i = 0; i < 16; i++) { const t = 0.12 + 0.76 * (i / 15), p = sd.pt(t), q = px(p[0] + sd.n[0] * o * len, p[1] + sd.n[1] * o * len); col[0].push(q[0]); col[1].push(q[1]); col[2].push(q[2]); } return col.map((a) => a.sort((m, n2) => m - n2)[8]); };
      const bgc = (() => { const col = [[], [], []]; for (const o of [0.1, 0.12, 0.14]) { const q = samp(o); col[0].push(q[0]); col[1].push(q[1]); col[2].push(q[2]); } return col.map((a) => a.sort((m, n2) => m - n2)[1]); })();
      const dist = offs.map((o) => { const q = samp(o); return Math.hypot(q[0] - bgc[0], q[1] - bgc[1], q[2] - bgc[2]); });
      // le bord extérieur est la dernière chute importante (le cadre intérieur peut en produire une plus forte) après laquelle on est revenu au niveau du fond
      let maxDrop = 0; for (let i = 0; i < offs.length - 2; i++) maxDrop = Math.max(maxDrop, dist[i] - dist[i + 2]);
      const dmax = Math.max(...dist); let bi = -1;
      for (let i = offs.length - 3; i >= 0; i--) if (dist[i] - dist[i + 2] > 0.4 * maxDrop && dist[i + 2] < 0.4 * dmax) { bi = i + 1; break; }
      out[nm] = bi >= 0 && maxDrop > 12 ? offs[bi] * len : 0;           // décalage en pixels réduits (positif = vers l'extérieur)
    }
    const nb = { x: bx.x - out.left, y: bx.y - out.top, w: bx.w + out.left + out.right, h: bx.h + out.top + out.bottom };
    const ratio = nb.w / nb.h; if (ratio < 0.58 || ratio > 0.86 || nb.w < bx.w * 0.8 || nb.h < bx.h * 0.8) return box;      // résultat incohérent : on garde le cadre d'origine
    return { x: nb.x / k, y: nb.y / k, w: nb.w / k, h: nb.h / k };
  } catch { return box; }
}
function rotCanvas(src, W, ang, bg) {      // image redressée de « ang » degrés, coins remplis avec la couleur du fond
  const H = Math.round(W * src.height / src.width), c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`; x.fillRect(0, 0, W, H);
  x.translate(W / 2, H / 2); x.rotate(ang * Math.PI / 180); x.drawImage(src, -W / 2, -H / 2, W, H); return c;
}
// → { box: { x, y, w, h }, src } : la carte repérée dans « src » (la photo, ou la photo redressée si la carte est penchée), ou null
function detectCardBox(bmp) {
  try {
    const t = document.createElement('canvas'); t.width = 32; t.height = Math.max(8, Math.round(32 * bmp.height / bmp.width));
    const tx = t.getContext('2d', { willReadFrequently: true }); tx.drawImage(bmp, 0, 0, t.width, t.height);
    const td = tx.getImageData(0, 0, t.width, t.height).data, rg = [[], [], []];
    for (let yy = 0; yy < t.height; yy++) for (let xx = 0; xx < t.width; xx++) if (xx < 2 || yy < 2 || xx >= t.width - 2 || yy >= t.height - 2) { const o = (yy * t.width + xx) * 4; rg[0].push(td[o]); rg[1].push(td[o + 1]); rg[2].push(td[o + 2]); }
    const bg = rg.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
    let best = null, zero = null;
    const tryAng = (ang) => { const a = edgeSearch(rotCanvas(bmp, 48, ang, bg), 48); if (a && ang === 0) zero = { ang, a }; if (a && (!best || a.sc > best.a.sc)) best = { ang, a }; };
    for (const ang of [0, -4, 4, -8, 8]) tryAng(ang);       // la carte peut être posée de travers : on cherche aussi les petits angles
    window.__detSc = best ? best.a.sc : null;
    if (!best || best.a.sc < 8) return null;
    const a0 = best.ang; for (const d of [-2, 2]) tryAng(a0 + d);
    // un petit angle ne vaut pas la peine de rééchantillonner (le texte minuscule s'en trouve flou) : on reste sur la photo d'origine
    if (zero && Math.abs(best.ang) <= 1.5 && zero.a.sc >= best.a.sc * 0.85) best = zero;
    const { ang, a } = best, k = 4, hi = rotCanvas(bmp, 48 * k, ang, bg);
    const b = edgeSearch(hi, 48 * k, { x0: a.x0 * k - 10, x1: a.x0 * k + 10, y0: a.y0 * k - 10, y1: a.y0 * k + 10, h0: a.h * k - 10, h1: a.h * k + 10 });
    const r = b || { x0: a.x0 * k, y0: a.y0 * k, w: a.w * k, h: a.h * k, W: a.W * k, H: a.H * k };
    const src = ang ? rotCanvas(bmp, bmp.width, ang, bg) : bmp;
    const box0 = { x: r.x0 / r.W * src.width, y: r.y0 / r.H * src.height, w: r.w / r.W * src.width, h: r.h / r.H * src.height };
    return { box: window.__snap ? snapBox(src, box0) : box0, box0, src, ang };
  } catch { return null; }
}
/* Lecture d'une photo : plusieurs tentatives de plus en plus poussées, on s'arrête dès qu'un résultat est sûr.
   « score(texte) » (fourni par l'appelant) : 3 = numéro + total (+ nom ou extension) retrouvés, 2 = numéro retrouvé, 1 = nom seul, 0 = rien.
   Tentatives : (1) carte repérée et redressée, bandes lues telles quelles ; (2) mêmes bandes en niveaux de gris contrastés ; (3) cadre décalé / autres échelles ;
   (4) bandes de la photo entière sans repérage ; (5) lecture classique de la photo entière. Au final, le texte qui donne le meilleur score. */
// Niveaux de gris + étirement du contraste (2 % – 98 % de l'histogramme) : rend le texte plus net pour le lecteur, quelle que soit la lumière
function enhance(c) {
  try {
    const x = c.getContext('2d', { willReadFrequently: true }), im = x.getImageData(0, 0, c.width, c.height), d = im.data, n = d.length / 4, hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const g = Math.round(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11); d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
    let acc = 0, lo = 0, hi = 255; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.02) { lo = i; break; } }
    acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.02) { hi = i; break; } }
    const k = hi > lo + 8 ? 255 / (hi - lo) : 1;
    for (let i = 0; i < d.length; i += 4) { const g = Math.max(0, Math.min(255, (d[i] - lo) * k)); d[i] = d[i + 1] = d[i + 2] = g; }
    x.putImageData(im, 0, 0);
  } catch { /* image non lisible : on la laisse telle quelle */ }
}
// Outils de lecture (partagés par la lecture d'une photo et par le scanner en direct)
function ocrTools(w) {
  const flat = (c) => { try { const t = document.createElement('canvas'); t.width = 32; t.height = 16; const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0, 32, 16); const d = x.getImageData(0, 0, 32, 16).data; let m = 0; for (let i = 0; i < d.length; i += 4) m += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; m /= 512; let v = 0; for (let i = 0; i < d.length; i += 4) { const g = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; v += (g - m) ** 2; } return Math.sqrt(v / 512) < 10; } catch { return false; } };
  const okc = (c) => c.width >= 240 && c.height >= 40 && !flat(c);      // une bande minuscule ou uniforme fait protester le lecteur
  const rd = async (c, psm, wl) => { if (!okc(c)) return ''; await w.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: wl || '' }); const t = '\n' + (await w.recognize(c)).data.text; await w.setParameters({ tessedit_char_whitelist: '' }); touchOcr(); c.width = c.height = 0; return t; };
  const grab = (src, bx, kk, filt, plain) => (fx0, fy0, fx1, fy1, k2 = kk) => {      // bande de la carte (coordonnées relatives au cadre bx), agrandie
    const c = document.createElement('canvas'), sx = bx.x + bx.w * fx0, sy = bx.y + bx.h * fy0, sw = bx.w * (fx1 - fx0), sh = bx.h * (fy1 - fy0);
    c.width = Math.max(1, Math.round(sw * k2)); c.height = Math.max(1, Math.round(sh * k2));
    const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    if (filt && !plain) enhance(c);        // pas de « ctx.filter » : Safari ne le gère pas ; le traitement se fait pixel par pixel
    return c;
  };
  return { rd, grab, okc };
}
const NUMS = '0123456789/';
// lit nom (en haut) et numéro (en bas, chiffres seuls) sur un cadre bx de src ; renvoie le texte lu
async function readCardBands(w, src, bx, filt, scales, fast) {
  const { rd, grab } = ocrTools(w), ks = Math.min(2.5, 1500 / bx.w), cr = grab(src, bx, ks, filt);
  let text = await rd(cr(0.08, 0.0, 0.75, 0.14), '6');
  if (!fast) text += await rd(cr(0.03, 0.0, 0.9, 0.2), '6');         // bande du haut plus large (nom de l'évolution, « Pv »)
  for (const [sc, y0, y1] of scales) {
    text += await rd(cr(0, y0, 1, y1, ks * sc), '6', NUMS);
    const pn = parseCardText(text); if (pn.n != null && pn.total != null && String(pn.n).length + String(pn.total).length >= 5) break;
  }
  return text;
}
async function ocrPhoto(file, score, onStep, onVisual) {
  const bmp = await loadPhoto(file);
  let res = await ocrBitmap(bmp, score, onStep, false, onVisual);
  // la photo peut être couchée (carte tournée d'un quart de tour, orientation du téléphone mal lue) : on essaie les deux sens
  if (res.score < 2) for (const q of [1, -1]) {
    if (onStep) onStep('Photo tournée ?…');
    const r2 = await ocrBitmap(turnCanvas(bmp, q), score, null, true);
    if (r2.score > res.score) res = r2;
    if (res.score >= 3) break;
  }
  return res;
}
async function ocrBitmap(bmp, score, onStep, quick, onVisual) {
  const w = await getOcr();
  const det = detectCardBox(bmp), box = det && det.box, srcImg = det ? det.src : bmp;
  const tries = [];                       // { text, sc, photo, cropped }
  let done = false;
  const { grab, rd } = ocrTools(w);
  const readCard = (bx, filt, scales) => readCardBands(w, srcImg, bx, filt, scales);
  let acc = '';                           // texte cumulé de toutes les tentatives : le nom lu dans l'une et le numéro lu dans l'autre se complètent
  const evalTry = (text, photo, cropped) => {
    const sc = score(text); tries.push({ text, sc, photo, cropped }); acc += '\n' + text;
    if (sc >= 3) done = true;
    else if (tries.length > 1) { const sa = score(acc); if (sa >= 3) { tries.push({ text: acc, sc: sa, photo, cropped }); done = true; } }
    return sc;
  };
  const plainPhoto = () => grab(srcImg, box, Math.min(1, 1000 / box.h), false, true)(0, 0, 1, 1, Math.min(1, 1000 / box.h));
  if (box) {
    const photo = plainPhoto();
    if (onVisual && !quick) {                // reconnaissance par l'illustration (instantanée) : si la carte est identifiée sans ambiguïté, plus besoin de lire le texte
      if (onStep) onStep('Reconnaissance de l’illustration…');
      const ids = await onVisual(photo); if (ids) { window.__scanDbg = { tries: [], visual: true }; return { text: '', full: photo, cropped: true, score: 3, preIds: ids }; }
    }
    if (onStep) onStep('Lecture de la carte…');
    evalTry(await readCard(box, true, [[1.3, 0.88, 1.07], [1, 0.86, 1.09], [1.7, 0.9, 1.06]]), photo, true);
    if (!done) { if (onStep) onStep('Lecture renforcée…'); evalTry(await readCard(box, false, [[1.3, 0.88, 1.07], [1, 0.86, 1.09], [1.7, 0.9, 1.06], [2.1, 0.9, 1.05]]), photo, true); }
    // cadre décalé : le repérage peut être faussé de quelques %
    for (const [dx, dy, dh] of [[0, 0.03, 0], [0, -0.03, 0], [-0.03, 0, 0.03], [0.03, 0, 0.03]]) {
      if (quick || done || Math.max(0, ...tries.map((t) => t.sc)) < 1) break;       // rien lu du tout dans le cadre : inutile de le décaler, on passe aux bandes de la photo entière
      const b2 = { x: box.x + box.w * dx, y: box.y + box.h * dy, w: box.w * (1 + dh * 0.5), h: box.h * (1 + dh) };
      if (onStep) onStep('Nouvel essai de lecture…');
      evalTry(await readCard(b2, true, [[1.3, 0.88, 1.07], [1, 0.84, 1.1]]), photo, true);
    }
  }
  if (!done && !quick) {                  // sans repérage : bandes de la photo entière (le numéro est en bas de la carte, le nom en haut)
    if (onStep) onStep('Analyse de toute la photo…');
    const full = { x: 0, y: 0, w: bmp.width, h: bmp.height }, ks = Math.min(2.5, 1800 / bmp.width), cr = grab(bmp, full, ks, true);
    let text = '';
    for (const [y0, y1] of [[0.62, 0.8], [0.74, 0.92], [0.84, 1]]) { text += await rd(cr(0, y0, 1, y1), '6', NUMS); if (done) break; }
    for (const [y0, y1] of [[0.0, 0.2], [0.1, 0.3], [0.18, 0.38]]) text += await rd(cr(0, y0, 1, y1), '6');
    const cs = await photoCanvases(bmp); await w.setParameters({ tessedit_pageseg_mode: '6' });
    const full0 = cs[0];
    evalTry(text, full0, false);
    if (!done) { let t2 = ''; for (const c of cs) t2 += '\n' + (await w.recognize(c)).data.text; evalTry(t2, full0, false); }   // lecture classique de la photo entière
  }
  if (bmp.close) bmp.close();
  const best = tries.reduce((b, t) => (!b || t.sc > b.sc ? t : b), null) || { text: '', photo: null, cropped: false };
  window.__scanDbg = { tries: tries.map((t) => ({ sc: t.sc, cropped: t.cropped, text: t.text.slice(0, 120) })) };
  return { text: best.text, full: best.photo, cropped: best.cropped, score: best.sc };
}
/* ---------- Scan : classement visuel des candidats ----------
   Beaucoup de cartes portent le même nom (Pikachu : des centaines) ; quand le numéro imprimé n'est pas lisible, on compare l'illustration de la photo
   (couleurs de la zone centrale, à 3 échelles de cadrage) à celle de chaque candidat (image TCGdex en basse définition). */
const VIS_ART = [0.08, 0.11, 0.92, 0.54];
function visDesc(src, box) {
  const w = src.width || src.naturalWidth, hh = src.height || src.naturalHeight;
  const c = document.createElement('canvas'); c.width = 24; c.height = 24;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, box[0] * w, box[1] * hh, (box[2] - box[0]) * w, (box[3] - box[1]) * hh, 0, 0, 24, 24);
  const d = x.getImageData(0, 0, 24, 24).data, g = new Float32Array(108), hb = new Float32Array(12);
  for (let cy = 0; cy < 6; cy++) for (let cx = 0; cx < 6; cx++) for (let ch = 0; ch < 3; ch++) {
    let sum = 0; for (let y = 0; y < 4; y++) for (let xx = 0; xx < 4; xx++) sum += d[((cy * 4 + y) * 24 + cx * 4 + xx) * 4 + ch];
    g[(cy * 6 + cx) * 3 + ch] = sum / 16 / 255;
  }
  for (let ch = 0; ch < 3; ch++) { let m = 0; for (let i = 0; i < 36; i++) m += g[i * 3 + ch]; m /= 36; for (let i = 0; i < 36; i++) g[i * 3 + ch] -= m; }
  let n = 0; for (let i = 0; i < 108; i++) n += g[i] * g[i]; n = Math.sqrt(n) + 1e-6; for (let i = 0; i < 108; i++) g[i] /= n;
  let hs = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), df = mx - mn;
    if (df < 1e-6 || mx < 1e-6) continue;
    let hue = mx === r ? ((gg - b) / df) % 6 : mx === gg ? (b - r) / df + 2 : (r - gg) / df + 4; hue = (hue < 0 ? hue + 6 : hue) / 6;
    const wgt = (df / mx) * mx; hb[Math.min(11, Math.floor(hue * 12))] += wgt; hs += wgt;
  }
  for (let i = 0; i < 12; i++) hb[i] /= hs + 1e-6;
  return { g, hb };
}
function visSim(a, b) { let dot = 0, inter = 0; for (let i = 0; i < 108; i++) dot += a.g[i] * b.g[i]; for (let i = 0; i < 12; i++) inter += Math.min(a.hb[i], b.hb[i]); return dot * 0.6 + inter * 0.4; }
/* Empreintes visuelles précalculées (data/vis.bin : 120 octets par carte ; outil tools/build-vis.py) : plus aucune image à télécharger au moment du scan,
   donc rien qui dépende des droits d'accès (CORS) du serveur d'images, et un classement instantané, même hors connexion. */
let visPromise = null;
function loadVis() {
  if (!visPromise) visPromise = Promise.all([fetch('data/vis.bin').then((r) => (r.ok ? r.arrayBuffer() : null)), fetch('data/vis-index.json').then((r) => (r.ok ? r.json() : null))])
    .then(([buf, index]) => (buf && index ? { bytes: new Uint8Array(buf), index } : null)).catch(() => null);
  return visPromise;
}
function visOf(vis, r) {      // empreinte d'une fiche de la recherche, ou null (carte sans image)
  const e = vis.index[r.sid]; if (!e || r.card.vi == null) return null;
  const o = (e.o + r.card.vi) * 120; if (o + 120 > vis.bytes.length) return null;
  const b = vis.bytes.subarray(o, o + 120); let any = 0; for (let i = 0; i < 120; i++) any |= b[i]; if (!any) return null;
  const g = new Float32Array(108), hb = new Float32Array(12); for (let i = 0; i < 108; i++) g[i] = (b[i] - 128) / 127; for (let i = 0; i < 12; i++) hb[i] = b[108 + i] / 255;
  return { g, hb };
}
function photoDescs(photo, cropped) {
  const W = photo.width, H = photo.height;
  // carte repérée : cadrage exact + petits décalages / échelles (le cadre peut être faussé de quelques %) ; sinon 3 cadrages possibles
  const frames = cropped ? [[0, 0, 1], [0.025, 0.025, 1], [-0.025, -0.025, 1], [0.03, -0.03, 1], [-0.03, 0.03, 1], [0, 0, 0.92], [0, 0, 1.08]] : [[0, 0, 1], [0, 0, 0.85], [0, 0, 0.7]];
  return frames.map(([dx, dy, sc]) => {
    const ch = sc, cw = cropped ? sc : Math.min(1, sc * 0.716 * H / W), x0 = 0.5 - cw / 2 + dx, y0 = 0.5 - ch / 2 + dy;
    return visDesc(photo, [Math.max(0, x0 + cw * VIS_ART[0]), Math.max(0, y0 + ch * VIS_ART[1]), Math.min(1, x0 + cw * VIS_ART[2]), Math.min(1, y0 + ch * VIS_ART[3])]);
  });
}
// → identifiants réordonnés (les cartes dont le numéro correspond gardent un bonus) ; en cas d'échec, l'ordre d'origine
async function rerankVisual(idx, ids, hits, photo, cropped) {
  try {
    const vis = await loadVis(); if (!vis) return ids;
    if (!idx.byId) idx.byId = new Map(idx.recs.map((r) => [r.card.id, r]));
    const pd = photoDescs(photo, cropped), top = ids.slice(0, 200), score = new Map();
    for (const id of top) { const r = idx.byId.get(id), d = r && visOf(vis, r); if (d) score.set(id, Math.max(...pd.map((p) => visSim(p, d)))); }
    window.__visDbg = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (score.size < 2) return ids;
    const avg = [...score.values()].reduce((a, b) => a + b, 0) / score.size;
    const key = (id, i) => (score.has(id) ? score.get(id) : avg) + (hits && hits.has(id) ? 0.25 : 0) - 0.0005 * i;
    const out = [...top.map((id, i) => [id, key(id, i)]).sort((a, b) => b[1] - a[1]).map(([id]) => id), ...ids.slice(200)]; out.vs = score; return out;
  } catch { return ids; }
}
// Jugement d'un classement visuel [[id, ressemblance]…] : la carte de tête est-elle identifiée ? « family » = cartes quasi identiques (même illustration, autres extensions)
function judgeVisual(vs, minSim = 0.7) {
  if (!vs.length || vs[0][1] < minSim) return null;
  const family = vs.filter(([, sc]) => sc >= vs[0][1] - 0.02), other = vs.find(([, sc]) => sc < vs[0][1] - 0.02), margin = other ? vs[0][1] - other[1] : 1;
  return margin >= 0.04 || vs[0][1] >= 0.88 ? { ids: vs.map(([id]) => id), family: family.map(([id]) => id), sim: vs[0][1], margin } : null;
}
// recherche visuelle dans toutes les cartes (quand ni le nom ni le numéro n'ont pu être lus) → les n cartes qui ressemblent le plus à la photo
async function visualSearch(idx, photo, cropped, n = 20) {
  try {
    const vis = await loadVis(); if (!vis) return [];
    const pd = photoDescs(photo, cropped), best = [];
    for (const r of idx.recs) {
      const d = visOf(vis, r); if (!d) continue;
      let sc = -9; for (const p of pd) { const v = visSim(p, d); if (v > sc) sc = v; }
      if (best.length < n || sc > best[best.length - 1][1]) { best.push([r.card.id, sc]); best.sort((a, b) => b[1] - a[1]); if (best.length > n) best.pop(); }
    }
    return best;                              // [[id, ressemblance]…] du plus ressemblant au moins ressemblant ; c'est à l'appelant de juger si c'est assez net
  } catch { return []; }
}
function parseCardText(text) {
  const t = text.replace(/[Il|]/g, '1').toUpperCase();
  const nums = [...t.matchAll(/(^|[^A-Z])([A-Z]{0,3})\s?(\d{1,3})\s*[\/\\]\s*([A-Z]{0,3})\s?(\d{2,3})/g)].map((m) => ({ pre: m[2], n: parseInt(m[3], 10), tpre: m[4], total: parseInt(m[5], 10) }));   // le préfixe (H, TG, GG, SV…) ne doit pas être la fin d'un mot
  const okN = nums.filter((x) => x.n > 0 && x.total >= 10 && x.n <= x.total + 40 && (x.pre === x.tpre || !x.tpre));
  const len = (x) => String(x.n).length + String(x.total).length;
  const pick = okN.length ? okN.reduce((b, x) => (len(x) > len(b) ? x : b), okN[0]) : null;      // « 067/128 » (lu en grand) l'emporte sur « 7/12 » (lecture tronquée)
  const cm = pick ? null : t.match(/(^|[^A-Z0-9])([A-Z!?])\s?\/\s?(\d{2,3})(?![0-9])/);      // Zarbi : « A/28 », « ?/28 »
  return { ch: cm ? cm[2] : '', chTotal: cm ? parseInt(cm[3], 10) : null, n: pick ? pick.n : null, pre: pick ? pick.pre : '', total: pick ? pick.total : null, tpre: pick ? pick.tpre : '', norm: ' ' + norm(text).replace(/[^a-z0-9]+/g, ' ') + ' ' };
}
// distance d'édition (petites erreurs de lecture : « Guemlande » ≈ « Guérilande »)
function lev(a, b) {
  if (a === b) return 0; if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length];
}
const nameBase = (n) => norm(n).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w !== 'mega')[0] || '';
// → liste d'identifiants de cartes, de la plus probable à la moins probable
function matchScan(idx, p) {
  const out = [];
  const toks = p.norm.trim().split(' ').filter(Boolean), abSids = new Set();      // extensions dont l'abréviation imprimée (« 30C », « SSP »…) figure dans le texte lu (une ou deux lettres parasites tolérées)
  for (const [sid, m] of Object.entries(setsMeta.sets)) { const ab = String(m[2] || '').toLowerCase(); if (ab.length >= 3 || /\d/.test(ab)) { if (toks.some((t) => t === ab || (t.startsWith(ab) && t.length - ab.length <= 2))) abSids.add(sid); } }
  const lm = (r) => String(r.card.localId).match(/^([A-Za-z]*)0*(\d+)$/);
  const rate = (r, sc) => {
    const m = lm(r);        // « H01 » → groupe H, numéro 1 ; « 1 » → groupe vide, numéro 1
    const numHit = p.n != null && !!m && m[1].toUpperCase() === (p.tpre ? p.pre : '') && parseInt(m[2], 10) === p.n;   // total sans lettre (« 103/130 ») : carte à numéro simple ; lettres parasites avant le numéro ignorées
    const chHit = !!p.ch && lidShow(r.card.localId).toUpperCase() === p.ch;
    const totHit = chHit ? (idx.prefix.get(r.sid) && idx.prefix.get(r.sid).get('*')) === p.chTotal : p.total != null && (p.tpre ? (idx.prefix.get(r.sid) && idx.prefix.get(r.sid).get(p.tpre)) === p.total : idx.official.get(r.sid) === p.total);
    // total lu avec un seul chiffre faux (« 125 » pour « 128 ») : accepté avec un nom lu
    const off = p.tpre ? (idx.prefix.get(r.sid) && idx.prefix.get(r.sid).get(p.tpre)) : idx.official.get(r.sid);
    const totNear = !chHit && !totHit && p.total != null && off != null && lev(String(p.total), String(off)) === 1;
    out.push({ id: r.card.id, score: sc + ((numHit || chHit) ? 200 : 0) + (totHit ? 40 : totNear ? 15 : 0) + (abSids.has(r.sid) ? 120 : 0), numHit: numHit || chHit, strict: (numHit || chHit) && totHit, near: numHit && totNear, ab: abSids.has(r.sid) });
  };
  for (const r of idx.recs) {
    const full = norm(r.card.name).replace(/[^a-z0-9]+/g, ' ').trim();
    const base = full.split(' ').filter((w) => w !== 'mega')[0] || '';       // « Mentali-GX » → « mentali » (le suffixe est souvent mal lu)
    if (full.length >= 5 && p.norm.includes(' ' + full + ' ')) rate(r, 100 + full.length);
    else if (base.length >= 5 && p.norm.includes(' ' + base + ' ')) rate(r, base.length);
  }
  if (p.n != null && p.total != null) {  // le nom n'est pas toujours lu : toute carte dont le numéro ET le total (nombre de cartes de l'extension) correspondent est candidate
    const have = new Set(out.map((x) => x.id));
    for (const r of idx.recs) if (!have.has(r.card.id)) { rate(r, 0); const x = out[out.length - 1]; if (x.strict) x.inj = true; else out.pop(); }
  }
  if (!out.length) {                    // rien d'exact : nom approché (une ou deux lettres mal lues)
    const words = [...new Set(p.norm.split(' ').filter((w) => w.length >= 5 && /^[a-z]/.test(w)))];
    if (!idx.bases) { idx.bases = new Map(); idx.recs.forEach((r, i) => { const b = nameBase(r.card.name); if (b.length >= 5) { if (!idx.bases.has(b)) idx.bases.set(b, []); idx.bases.get(b).push(i); } }); }
    const near = [];
    for (const [b, list] of idx.bases) {
      let best = 9; for (const w of words) { const d = lev(b, w); if (d < best) best = d; }
      if (best <= (b.length >= 8 ? 2 : 1)) near.push([b, best, list]);
    }
    near.sort((x, y) => x[1] - y[1]).slice(0, 6).forEach(([b, d, list]) => list.forEach((i) => rate(idx.recs[i], b.length - 12 * d)));
  }
  const byId = new Map(); for (const x of out) { const o = byId.get(x.id); if (!o || x.score > o.score) byId.set(x.id, x); }
  out.length = 0; out.push(...byId.values());
  // les candidats trouvés par le seul numéro (nom non lu) ne servent que si aucun nom n'a été reconnu : un nom lu reste prioritaire
  const named = out.filter((x) => !x.inj), pool = named.length ? named : out;
  const best = pool.some((x) => x.numHit) ? pool.filter((x) => x.numHit) : pool;
  const ids = best.map((x, i) => [x, i]).sort((a, b) => b[0].score - a[0].score || a[1] - b[1]).slice(0, 120).map(([x]) => x.id);   // à score égal : extension la plus récente d'abord
  ids.hits = new Set(best.filter((x) => x.numHit).map((x) => x.id));
  const injStrict = best.filter((x) => x.inj && x.strict).length, namedHit = best.some((x) => !x.inj && x.numHit);
  ids.conf = best.some((x) => (x.strict || (x.near && !x.inj)) && (!x.inj || x.ab));                     // numéro ET total (nombre de cartes de l'extension) retrouvés, avec un nom lu ou l'extension imprimée reconnue : sûr                       // numéro retrouvé avec un nom lu ou l'extension imprimée reconnue : résultat sûr
  // note de la lecture : 3 sûr, 2 nom + numéro non confirmés, 1 nom seul, 0,5 numéro + total seuls (un couple lu au hasard peut tomber juste : jamais préféré à un nom), 0 rien
  ids.score = ids.conf ? 3 : namedHit ? 2 : named.length ? 1 : injStrict ? 0.5 : 0;     // numéro retrouvé avec un nom lu ou l'extension imprimée reconnue : résultat sûr
  return ids;
}

async function showSearch(L, my, preset = {}) {
  const ld = loader.start('Préparation de la recherche');
  try { await showSearchInner(L, my, preset); } finally { ld.done(); }
}
async function showSearchInner(L, my, preset = {}) {
  const back = h('button', { class: 'iconbtn', type: 'button', onclick: () => go(L), 'aria-label': 'Retour aux extensions' }, '‹ Extensions');
  const q = h('input', { class: 'search', type: 'search', placeholder: 'Nom, numéro ou rareté…', 'aria-label': 'Rechercher une carte dans toute la collection', enterkeyhint: 'search', autocomplete: 'off' });
  const top = h('header', { class: 'top' }, h('div', { class: 'row' }, back, h('h1', {}, 'Rechercher des cartes')), q);
  const main = h('main', {}, spinner());
  $app.replaceChildren(top, main);
  scrollTo(0, 0);

  let idx = searchIdx && searchIdx.L === L ? searchIdx : null;
  if (!idx) {
    try {
      const { sets } = await loadSets(L); await Promise.all([snapReady, metaReady]); await resolveMeta(L, sets);
      if (my !== tok) return;
      idx = searchIdx = await buildSearchIndex(L, sets);
    } catch (e) {
      if (my !== tok) return;
      main.replaceChildren(errorBox('Vérifiez votre connexion. ' + (e.message || ''), () => showSearch(L, tok))); return;
    }
  }
  if (my !== tok) return;

  const mines = new Map();
  for (const r of idx.recs) if (!mines.has(r.sid)) mines.set(r.sid, owned[L][r.sid] || nullObj());
  if (preset.q) q.value = preset.q;                  // requête venue de l'accueil
  const f = { own: preset.own ? 'own' : 'all', gid: '', rar: preset.rar && idx.rars.has(preset.rar) ? preset.rar : '', ver: '', ids: null, rank: null, sort: preset.sort || '' };
  const POSS = [['all', 'Toutes'], ['own', 'Possédées'], ['miss', 'Manquantes'], ['dbl', 'Doubles']];
  const gname = new Map(); for (const b of idx.blocks) for (const g of b.items) gname.set(g.id, g.set.name || g.id);
  const rarList = [...idx.rars.keys()].sort((a, b) => rarityRank(a) - rarityRank(b) || a.localeCompare(b, 'fr'));
  const verList = [...idx.vers.entries()].sort((a, b) => b[1].n - a[1].n);
  const activeCount = () => (f.own !== 'all') + !!f.gid + !!f.rar + !!f.ver + !!f.ids;

  const match = (r, n) => {
    if (f.ids && !f.ids.has(r.card.id)) return false;
    if (f.gid && r.gid !== f.gid) return false;
    if (n && !matchTokens(r.text, n)) return false;      // plusieurs mots : « pikachu 25 »
    const info = r.info;
    if (f.rar && !(info && info.rar === f.rar)) return false;
    if (f.ver && !(info && info.vars.some((v) => v.key === f.ver))) return false;
    if (f.own !== 'all') {
      const v = mines.get(r.sid)[r.card.id];
      const qt = f.ver ? (isMulti(v) ? v[f.ver] || 0 : 0) : qtyTotal(v), qm = f.ver ? qt : qtyMax(v);
      if (f.own === 'own' ? qt <= 0 : f.own === 'miss' ? qt > 0 : qm < 2) return false;
    }
    return true;
  };

  const PAGE = 60, tiles = [];
  let matches = [], shown = 0, needle = '';
  const summary = h('p', { class: 'count sum' });
  const chips = h('div', { class: 'fchips' });
  const grid = h('div', { class: 'cards' });
  const moreBtn = h('button', { type: 'button', class: 'btn sec more', hidden: true }, 'Afficher plus de cartes');
  const none = h('p', { class: 'empty', hidden: true });
  const persist = (sid) => { const m = mines.get(sid); if (countKeys(m)) owned[L][sid] = m; else delete owned[L][sid]; saveOwned(); };
  const zoom = (t) => { const vis = tiles.filter((x) => !x.el.hidden); openLightbox(vis, Math.max(0, vis.indexOf(t)), L); };
  const mkTile = (r) => {
    const t = makeTile(r.card, mines.get(r.sid), () => { persist(r.sid); t.el.hidden = !match(r, needle); updateSummary(); }, { info: idx.infos.get(r.sid), setName: r.setName, official: idx.official.get(r.sid), zoom, prefixTotals: idx.prefix.get(r.sid) });
    t.el.querySelector('.nm').after(h('span', { class: 'setlbl' }, r.setName));
    return t;
  };
  const mk = (r) => { const t = mkTile(r); tiles.push(t); return t; };
  const more = () => {
    const next = matches.slice(shown, shown + PAGE); shown += next.length;
    const made = next.map((r) => mk(r)); grid.append(...made.map((t) => t.el)); priceTiles(L, made, my, !!f.ids);
    moreBtn.hidden = shown >= matches.length;
    moreBtn.textContent = `Afficher plus de cartes (${(matches.length - shown).toLocaleString('fr-FR')} restantes)`;
  };
  function updateSummary() {
    const idle = !needle && !activeCount();
    if (idle) { summary.textContent = `${idx.recs.length.toLocaleString('fr-FR')} cartes dans ${mines.size} extensions. Tapez un nom ou ouvrez les filtres.`; return; }
    const have = matches.reduce((n, r) => n + (qtyTotal(mines.get(r.sid)[r.card.id]) > 0 ? 1 : 0), 0);
    summary.replaceChildren(h('b', {}, plural(matches.length, 'carte trouvée', 'cartes trouvées')), matches.length ? ` · ${have} possédée${have > 1 ? 's' : ''}` : '');
  }
  function updateChips() {
    const items = [];
    if (f.ids) items.push(['Résultat du scan', () => { f.ids = f.rank = null; }]);
    if (f.own !== 'all') items.push([POSS.find((x) => x[0] === f.own)[1], () => { f.own = 'all'; }]);
    if (f.gid) items.push([gname.get(f.gid) || f.gid, () => { f.gid = ''; }]);
    if (f.rar) items.push([f.rar, () => { f.rar = ''; }]);
    if (f.ver) items.push([idx.vers.get(f.ver)?.label || f.ver, () => { f.ver = ''; }]);
    chips.replaceChildren(...items.map(([label, clear]) => h('button', { type: 'button', class: 'fchip', 'aria-label': `Retirer le filtre : ${label}`, onclick: () => { clear(); run(); } }, label, h('span', { 'aria-hidden': 'true' }, ' ✕'))));
    chips.hidden = !items.length;
    filterBtn.hidden = f.own === 'own';      // « mes cartes » : on choisit directement les raretés, sans bouton filtre
    const n = activeCount(); filterBtn.querySelector('.nb').textContent = String(n); filterBtn.querySelector('.nb').hidden = !n;
  }
  function run() {
    needle = norm(q.value.trim());
    const idle = !needle && !activeCount();
    matches = idle ? [] : idx.recs.filter((r) => match(r, needle));
    if (f.rank) matches.sort((a, b) => f.rank.get(a.card.id) - f.rank.get(b.card.id));
    if (f.sort === 'price') matches.sort((a, b) => (priceOfRec(b) ?? -1) - (priceOfRec(a) ?? -1));
    sortBtn.setAttribute('aria-pressed', String(f.sort === 'price'));
    tiles.length = 0; grid.replaceChildren(); shown = 0; more();
    none.hidden = idle || matches.length > 0; none.textContent = 'Aucune carte ne correspond.';
    updateChips(); updateSummary(); if (sheetSync) sheetSync();
    paintRarPick(); paintCar(); fetchTopPrices();
  }

  // carrousel des cartes les plus chères parmi les résultats (prix Cardmarket estimés ; ceux déjà connus, les autres sont relevés en arrière-plan)
  // boutons de rareté, directement sur la page « mes cartes » (un toucher = afficher seulement cette rareté ; retoucher = toutes)
  const rarPick = h('div', { class: 'rpick', role: 'group', 'aria-label': 'Raretés', hidden: true });
  function paintRarPick() {
    if (f.own !== 'own') { rarPick.hidden = true; rarPick.replaceChildren(); return; }
    const cnt = new Map();
    for (const r of idx.recs) {
      const info = r.info; if (!info || !info.rar) continue;
      if (f.gid && r.gid !== f.gid) continue;
      if (qtyTotal(mines.get(r.sid)[r.card.id]) > 0) cnt.set(info.rar, (cnt.get(info.rar) || 0) + 1);
    }
    const list = [...cnt.keys()].sort((a, b) => rarityRank(a) - rarityRank(b) || a.localeCompare(b, 'fr'));
    const total = [...cnt.values()].reduce((n, c) => n + c, 0);
    const btn = (label, sym, tier, n, on, set) => h('button', { type: 'button', class: 'rpb' + (on ? ' on' : ''), 'aria-pressed': String(on), title: `${label} : ${n}`, onclick: () => { f.rar = set; run(); } },
      h('span', { class: 'rps', 'aria-hidden': 'true' }, sym), h('span', { class: 'rpn' }, label), h('b', {}, String(n)));
    rarPick.replaceChildren(btn('Toutes', '✦', 'aucune', total, !f.rar, ''), ...list.map((r) => btn(r, rarityIcon(r, 26), rarityTier(r), cnt.get(r), f.rar === r, r)));
    rarPick.hidden = !list.length;
  }
  const carSlot = h('div', { class: 'carslot', hidden: true });
  const ownedMode = () => f.own === 'own' || f.own === 'dbl';
  function priceOfRec(r) {
    if (ownedMode()) { const u = rowUnitMax({ id: r.card.id, v: mines.get(r.sid)[r.card.id] }); if (u != null) return u; }
    const e = priceCache[r.card.id]; return blend(r.card.id, e ? srcUnit(e, null) : null);
  }
  function paintCar() {
    {                                   // éventail pour toute liste de cartes (la carte du centre, la précédente et la suivante visibles de chaque côté)
      const list = matches.slice(0, 80);
      if (!list.length) { carSlot.hidden = true; carSlot.replaceChildren(); return; }
      const items = list.map((r) => ({ card: r.card, name: r.card.name, sub: `#${numLabelOf(r.card, idx.prefix.get(r.sid))} · ${r.setName}`, price: priceOfRec(r) }));
      const keep = carSlot.querySelector('.cf-track') ? carSlot.querySelector('.cf-track').scrollLeft : 0;
      carSlot.replaceChildren(buildCoverflow(`${ownedMode() ? 'Mes cartes' : 'Résultats'}${matches.length > list.length ? ` (80 premières sur ${matches.length.toLocaleString('fr-FR')})` : ''}`, items, (i) => { const ts = list.map((r) => mkTile(r)); openLightbox(ts, i, L); }));
      const tr = carSlot.querySelector('.cf-track'); if (tr && keep) requestAnimationFrame(() => { tr.scrollLeft = keep; });
      carSlot.hidden = false;
    }
  }
  let carFetch = 0;
  function fetchTopPrices() {
    const cand = matches.filter((r) => !priceCache[r.card.id] && (ownedMode() || f.ids || (r.info && r.info.rar && VALUE_TIERS.has(rarityTier(r.info.rar))))).slice(0, 60);
    if (!cand.length) return;
    const stamp = ++carFetch; let i = 0;
    const worker = async () => { while (i < cand.length && stamp === carFetch && my === tok) { const r = cand[i++]; try { await fetchPrice(L, r.card.id); } catch { /* hors ligne */ } if (stamp === carFetch && my === tok && (i % 5 === 0 || i === cand.length)) { paintCar(); } } };
    Promise.all(Array.from({ length: 4 }, worker)).then(() => { savePrices(); if (stamp === carFetch && my === tok) paintCar(); });
  }
  const sortBtn = h('button', { type: 'button', class: 'tbtn', 'aria-pressed': 'false', 'aria-label': 'Trier par prix décroissant', title: 'Trier par prix décroissant', onclick: () => { f.sort = f.sort === 'price' ? '' : 'price'; run(); } }, '↓ Prix');

  let sheetSync = null;
  function openFilters() {
    const segBtns = POSS.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(f.own === k), onclick: () => { f.own = k; run(); } }, l));
    const gSel = h('select', { class: 'field', 'aria-label': 'Extension' }, h('option', { value: '' }, 'Toutes les extensions'),
      idx.blocks.map((b) => h('optgroup', { label: b.name }, b.items.map((g) => h('option', { value: g.id }, g.set.name || g.id)))));
    const rSel = h('select', { class: 'field', 'aria-label': 'Rareté' }, h('option', { value: '' }, 'Toutes les raretés'), rarList.map((r) => h('option', { value: r }, `${r} (${idx.rars.get(r).toLocaleString('fr-FR')})`)));
    const vSel = h('select', { class: 'field', 'aria-label': 'Version' }, h('option', { value: '' }, 'Toutes les versions'), verList.map(([k, e]) => h('option', { value: k }, `${e.label} (${e.n.toLocaleString('fr-FR')})`)));
    gSel.addEventListener('change', () => { f.gid = gSel.value; run(); }); rSel.addEventListener('change', () => { f.rar = rSel.value; run(); }); vSel.addEventListener('change', () => { f.ver = vSel.value; run(); });
    const seeBtn = h('button', { class: 'btn', type: 'button', onclick: closeSheet }, 'Voir les cartes');
    sheetSync = () => {
      segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(POSS[i][0] === f.own)));
      gSel.value = f.gid; rSel.value = f.rar; vSel.value = f.ver;
      seeBtn.textContent = !needle && !activeCount() ? 'Voir les cartes' : `Voir ${plural(matches.length, 'carte', 'cartes')}`;
    };
    const ov = openSheet(
      h('h2', {}, 'Filtres'),
      h('p', { class: 'lbl' }, 'Possession'), h('div', { class: 'fseg', role: 'group', 'aria-label': 'Possession' }, segBtns),
      h('label', { class: 'lbl' }, 'Extension', gSel), h('label', { class: 'lbl' }, 'Rareté', rSel), h('label', { class: 'lbl' }, 'Version', vSel),
      h('p', { class: 'lb-help' }, 'Avec une version choisie, « Possédées » et « Manquantes » portent sur cette version précise.'),
      seeBtn,
      h('button', { class: 'btn sec', type: 'button', onclick: () => { f.own = 'all'; f.gid = f.rar = f.ver = ''; f.ids = f.rank = null; run(); } }, 'Réinitialiser les filtres'));
    new MutationObserver((_, ob) => { if (!ov.isConnected) { sheetSync = null; ob.disconnect(); } }).observe(document.body, { childList: true });
    sheetSync();
  }
  const filterBtn = h('button', { type: 'button', class: 'tbtn', 'aria-label': 'Filtres', title: 'Filtres', onclick: openFilters }, '⚙︎ Filtres ', h('span', { class: 'nb', hidden: true }, '0'));
  const scanIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, 'aria-label': 'Photo de la carte' });
  const scanBtn = h('button', { type: 'button', class: 'tbtn', 'aria-label': 'Scanner une carte avec l’appareil photo', title: 'Scanner une carte', onclick: () => openLiveScan() }, '📷 Scanner');
  // affiche le résultat d'une lecture : la meilleure carte s'ouvre tout de suite avec son prix, les autres candidats se parcourent avec ‹ ›
  const readNote = h('p', { class: 'lb-help', hidden: true });
  async function finishScan(ids, readScore, full, cropped) {
    if (ids.length > 1 && !ids.vs) { const hits = ids.hits; ids = await rerankVisual(idx, ids, hits, full, cropped); if (my !== tok) return; }
    // lecture pas sûre (ou rien de lu) : on cherche aussi parmi toutes les cartes celles dont l'illustration ressemble à la photo ; si l'une ressemble nettement
    // plus que les candidats du texte, elle passe devant
    if (full && (readScore || 0) < 3) {
      const vs = await visualSearch(idx, full, cropped, 12); if (my !== tok) return;
      const topText = ids.vs && ids.vs.size ? Math.max(...ids.vs.values()) : -1;
      if (vs.length && vs[0][1] >= 0.7 && (!ids.length || (vs[0][1] >= 0.8 && vs[0][1] > topText + 0.04))) {
        const first = vs.map(([id]) => id); ids = [...first, ...ids.filter((id) => !first.includes(id))];
        toast(readScore ? 'Lecture incertaine : cartes qui ressemblent le plus à la photo en premier.' : 'Ni nom ni numéro lisibles : voici les cartes qui ressemblent le plus à la photo.');
      }
    }
    if (!ids.length) { f.ids = f.rank = null; run(); toast('Carte non reconnue. Photo de face, bien éclairée, nom et numéro lisibles ; ou tapez son nom.'); return; }
    q.value = ''; f.ids = new Set(ids); f.rank = new Map(ids.map((id, i) => [id, i])); run();
    // les prix des 3 premières sont demandés en parallèle
    if (L === 'fr') await Promise.race([Promise.all(ids.slice(0, 3).filter((id) => !priceCache[id]).map((id) => fetchPrice(L, id).catch(() => {}))).then(() => savePrices()), new Promise((r) => setTimeout(r, 1500))]);
    if (my !== tok) return;
    if (tiles[0]) { zoom(tiles[0]); if (ids.length > 1) toast(`Meilleure correspondance parmi ${plural(ids.length, 'carte possible', 'cartes possibles')} : ‹ › pour voir les autres.`); }
  }
  async function runScan(file) {
    scanBtn.disabled = true; summary.textContent = 'Analyse de la photo… (la première fois, quelques secondes)';
    const ldScan = loader.start('Analyse de la photo');
    try {
      const { text, full, cropped, score: readScore, preIds } = await ocrPhoto(file, (t) => { const r = matchScan(idx, parseCardText(t)); return r.score; }, (m) => { summary.textContent = 'Analyse de la photo · ' + m; },
        async (photo) => { const j = judgeVisual(await visualSearch(idx, photo, true, 8), 0.72); return j && j.family.length === 1 ? j.ids : null; }); if (my !== tok) return;
      if (preIds) { readNote.textContent = 'Reconnue par l’illustration.'; readNote.hidden = false; await finishScan(preIds, 3, full, cropped); return; }
      { const pr = parseCardText(text); readNote.textContent = 'Lecture : ' + (pr.n != null && pr.total != null ? `n° ${pr.n}/${pr.total} · ` : 'numéro non lu · ') + (text.replace(/[^A-Za-zÀ-ÿ0-9\/ ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'rien'); readNote.hidden = false; }      // pour comprendre un échec
      await finishScan(matchScan(idx, parseCardText(text)), readScore, full, cropped);
    } catch (e) { run(); toast('Scan impossible : ' + (e && e.message ? e.message : 'erreur')); } finally { scanBtn.disabled = false; ldScan.done(); }
  }
  /* Scanner en direct : l'appareil photo reste ouvert, la carte se place dans le cadre, des images sont lues en continu (nom, numéro, total, extension) et le résultat
     s'affiche dès qu'une carte est trouvée. Les lectures des dernières images se cumulent ; la photo reste disponible en secours. */
  async function openLiveScan() {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { scanIn.click(); return; }
    let stream = null, track = null, stopped = false, ended = false, restarts = 0, black = 0;
    const video = h('video', { class: 'live-video', playsinline: '', autoplay: '', muted: '' }); video.muted = true;
    const frame = h('div', { class: 'live-frame' }, h('i', { class: 'live-line' }));
    const msg = h('p', { class: 'live-msg' }, 'Démarrage de l’appareil photo…'), readout = h('p', { class: 'live-read' });
    const onVis = () => { if (!document.hidden && !stopped) ended = true; };      // retour dans l'application : la caméra est relancée
    const shut = () => { stopped = true; document.removeEventListener('visibilitychange', onVis); if (stream) stream.getTracks().forEach((t) => t.stop()); ov.remove(); };
    const ov = h('div', { class: 'live', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Scanner une carte' }, video, frame,
      h('div', { class: 'live-top' }, msg, readout),
      h('div', { class: 'live-bar' }, h('button', { class: 'btn sec', type: 'button', onclick: shut }, 'Fermer'), h('button', { class: 'btn sec', type: 'button', onclick: () => { shut(); scanIn.click(); } }, '📁 Photo')));
    document.body.append(ov);
    // flux de la caméra ; il peut s'interrompre (écran noir sur iPhone après quelques secondes, application mise en arrière-plan…) : on le relance tout seul
    const startStream = async () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      track = stream.getVideoTracks()[0]; ended = false; black = 0; if (track) track.addEventListener('ended', () => { ended = true; });
      video.srcObject = stream; try { await video.play(); } catch { /* lecture automatique refusée : le flux s'affiche quand même */ }
    };
    try { await startStream(); }
    catch (e) { shut(); toast('Appareil photo inaccessible : autorisez-le dans les réglages, ou utilisez « 📁 Photo ».'); return; }
    video.addEventListener('pause', () => { if (!stopped) video.play().catch(() => {}); });
    document.addEventListener('visibilitychange', onVis);
    msg.textContent = 'Placez la carte dans le cadre, bien à plat et éclairée.';
    // Reconnaissance par l'image d'abord (instantanée, sans lecture de texte donc presque sans batterie) : l'illustration du cadre est comparée aux empreintes
    // des 20 000 cartes. Le texte (numéro) n'est lu que si plusieurs éditions ont la même illustration, et seulement quelques fois.
    const SC = [[[1.3, 0.88, 1.07]], [[1, 0.86, 1.09]], [[1.7, 0.9, 1.06]], [[1.3, 0.84, 1.1]]];
    const pad = 0.04, m = pad / (1 + 2 * pad), t0 = Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let streak = 0, lastTop = null, ocrTries = 0, texts = [];
    const grabFrame = (maxH) => {      // la zone du cadre (avec une marge de 4 %), prise dans l'image de la caméra (affichée en « cover » plein écran)
      const vw = video.videoWidth, vh = video.videoHeight; if (!vw || !vh) return null;
      const W = ov.clientWidth, H = ov.clientHeight, k = Math.max(W / vw, H / vh), ox = (vw * k - W) / 2, oy = (vh * k - H) / 2, r = frame.getBoundingClientRect();
      const x0 = (r.left - r.width * pad + ox) / k, y0 = (r.top - r.height * pad + oy) / k, ww = r.width * (1 + 2 * pad) / k, hh = r.height * (1 + 2 * pad) / k, kk = Math.min(1, maxH / hh);
      const c = document.createElement('canvas'); c.width = Math.round(ww * kk); c.height = Math.round(hh * kk); c.getContext('2d').drawImage(video, x0, y0, ww, hh, 0, 0, c.width, c.height); return c;
    };
    const finish = async (ids, sc, c) => { shut(); await finishScan(ids, sc, c, true); };
    while (!stopped && my === tok) {
      await sleep(330);                                   // ~3 images par seconde : assez réactif, sans chauffer
      if (Date.now() - t0 > 30000 + restarts * 15000) { shut(); toast('Pas trouvé en 30 s : rapprochez la carte du cadre, évitez les reflets, ou utilisez « 📁 Photo ».'); return; }
      if (ended || !track || track.readyState !== 'live') {          // flux interrompu : on relance la caméra (4 fois au plus)
        if (restarts >= 4) { shut(); toast('La caméra s’est interrompue : relancez le scan ou utilisez « 📁 Photo ».'); return; }
        restarts++; msg.textContent = 'Caméra relancée…'; try { await startStream(); } catch { shut(); toast('Appareil photo inaccessible.'); return; }
        continue;
      }
      const c = grabFrame(480); if (!c) continue;
      { // image noire (flux figé) : relance après ~2 s
        const t = document.createElement('canvas'); t.width = 16; t.height = 16; const tx = t.getContext('2d', { willReadFrequently: true }); tx.drawImage(c, 0, 0, 16, 16);
        const d = tx.getImageData(0, 0, 16, 16).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
        black = sum / (256 * 3) < 5 ? black + 1 : 0; if (black >= 6) { ended = true; c.width = c.height = 0; continue; }
      }
      const vs = await visualSearch(idx, c, true, 8); if (stopped) return;
      const j = judgeVisual(vs, 0.7);
      readout.textContent = vs.length ? `Ressemblance : ${Math.round(vs[0][1] * 100)} %${j ? ' · carte repérée' : ''}` : '';
      if (!j) { streak = 0; lastTop = null; msg.textContent = 'Placez la carte dans le cadre, bien à plat et éclairée.'; c.width = c.height = 0; continue; }
      streak = j.ids[0] === lastTop ? streak + 1 : 1; lastTop = j.ids[0];
      msg.textContent = 'Carte repérée…';
      if (streak < 3) { c.width = c.height = 0; continue; }
      if (j.family.length === 1) { await finish(j.ids, 3, c); return; }
      // plusieurs éditions pour la même illustration : on lit le numéro pour choisir (jusqu'à 3 lectures, sur une image plus grande)
      msg.textContent = 'Plusieurs éditions : lecture du numéro…';
      const big = grabFrame(1000), bx = { x: big.width * m, y: big.height * m, w: big.width * (1 - 2 * m), h: big.height * (1 - 2 * m) };
      let text = ''; try { text = await readCardBands(await getOcr(), big, bx, true, SC[ocrTries % SC.length], true); } catch { text = ''; }
      big.width = big.height = 0; if (stopped) return;
      ocrTries++; texts.push(text); if (texts.length > 4) texts.shift();
      const pr = parseCardText(texts.join('\n')), r = matchScan(idx, pr), famSet = new Set(j.family);
      readout.textContent = 'Lu : ' + (pr.n != null && pr.total != null ? `${String(pr.n).padStart(3, '0')}/${pr.total}` : (text.replace(/[^A-Za-zÀ-ÿ0-9\/ ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || '…'));
      const pick = r.find((id) => famSet.has(id) && r.hits.has(id));
      if (pick) { await finish([pick, ...j.ids.filter((id) => id !== pick)], 3, c); return; }
      if (ocrTries >= 3) { toast('Plusieurs éditions possibles : touchez ‹ › pour choisir la bonne.'); await finish(j.ids, 2, c); return; }
      c.width = c.height = 0;
    }
  }
  scanIn.addEventListener('change', () => { const file = scanIn.files[0]; scanIn.value = ''; if (file) runScan(file); });
  top.append(h('div', { class: 'tools2' }, filterBtn, sortBtn, scanBtn, scanIn), chips);

  let timer = null;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  moreBtn.addEventListener('click', more);
  main.replaceChildren(summary, readNote, rarPick, carSlot, grid, moreBtn, none);
  run();
  if (pendingScan) { const file = pendingScan; pendingScan = null; history.replaceState(null, '', '#chercher'); if (file === 'live') openLiveScan(); else runScan(file); }
}

/* ---------- Rareté et versions de chaque carte (français) ---------- */
// data/cards/<extension>.json : { rar:[raretés], var:[[type, taille, foil, sous-type, [tampons]]…], c:{ idCarte:[indexRareté,[indexVersions]] } }
// Instantané de TCGdex ; une carte absente (nouvelle) est demandée en direct à l'agrandissement.
const infoCache = new Map();
// TCGdex : « Magnifique rare » = rares secrètes / rainbow de toutes les époques (affichées « Rare secrète ») ; « Magnifique » = les 9 vraies Magnifiques rares d'Épée et Bouclier (logo M)
const RAR_ALIAS = { 'Magnifique rare': 'Rare secrète', 'Magnifique': 'Magnifique rare' };
const rarName = (r) => (r ? RAR_ALIAS[r] || r : r);
function descOf(a) {
  const d = { type: a[0] };
  if (a[1] && a[1] !== 'Standard') d.size = a[1];
  if (a[2]) d.foil = a[2];
  if (a[3]) d.subtype = a[3];
  if (a[4] && a[4].length) d.stamp = a[4];
  return d;
}
const vKey = (d) => [d.type, d.size ? 's:' + d.size : '', d.foil ? 'f:' + d.foil : '', d.subtype ? 't:' + d.subtype : '', d.stamp ? 'm:' + d.stamp.join('+') : ''].filter(Boolean).join('/').toLowerCase();
const vLabel = (d) => [d.type, d.foil, d.subtype, ...(d.stamp || []), d.size].filter(Boolean).join(' · ');
function withKeys(vars) { return vars.map((d) => ({ ...d, key: vKey(d), label: vLabel(d) })); }
function loadCardInfo(L, setId) {
  if (L !== 'fr') return Promise.resolve(new Map());
  const k = L + '/' + setId;
  if (!infoCache.has(k)) {
    infoCache.set(k, fetch(`data/cards/${encodeURIComponent(setId)}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const m = new Map();
      if (j && j.c) for (const [id, [ri, vi]] of Object.entries(j.c)) {
        const vars = withKeys(vi.map((i) => descOf(j.var[i])));
        let rar = ri >= 0 ? rarName(j.rar[ri]) : null;
        // TCGdex appelle « Rare » les rares holo comme les non-holo des séries anciennes : si toutes les versions sont holo, c'est une « Rare Holo »
        if (rar === 'Rare' && vars.length && vars.every((v) => /holo/i.test(v.type || ''))) rar = 'Rare Holo';
        m.set(id, { rar, vars });
      }
      return m;
    }).catch(() => new Map()));
  }
  return infoCache.get(k);
}
async function fetchCardInfo(L, cardId) { // repli en direct (carte absente de l'instantané)
  const d = await api(`/${L}/cards/${encodeURIComponent(cardId)}`);
  let vars = (d.variants_detailed || []).map((x) => ({ type: x.type || 'Normal', ...(x.size && x.size !== 'Standard' ? { size: x.size } : {}), ...(x.foil ? { foil: x.foil } : {}), ...(x.subtype ? { subtype: x.subtype } : {}), ...(x.stamp && x.stamp.length ? { stamp: x.stamp } : {}) }));
  if (!vars.length && d.variants) {
    const f = d.variants;
    if (f.normal) vars.push({ type: 'Normal' }); if (f.reverse) vars.push({ type: 'Reverse' }); if (f.holo) vars.push({ type: 'Holo' });
    if (f.firstEdition) vars.push({ type: 'Normal', stamp: ['1re Édition'] }); if (f.wPromo) vars.push({ type: 'Normal', stamp: ['Promo W'] });
  }
  return { rar: rarName(d.rarity) || null, vars: withKeys(vars) };
}
// Niveaux de rareté (pour les couleurs et l'ordre du filtre) : modifiable ici. Une rareté inconnue (nouvelle sortie) est classée d'après son nom.
const RARITY_TIER = {
  'Commune': 'commune', 'Peu Commune': 'peu', 'Rare': 'rare', 'Sans Rareté': 'aucune', 'Promo': 'promo', 'Collection Classique': 'promo',
  'Holo Rare': 'holo', 'Rare Holo': 'holo', 'Rare Holo LV.X': 'holo', 'Rare Prime': 'holo', 'LÉGENDE': 'holo', 'HIGH-TECH rare': 'holo', 'Radieux Rare': 'holo',
  'Pikachu Rare': 'holo', 'Magnifique rare': 'holo', 'Magnifique': 'holo', 'Rare secrète': 'holo', 'Rare Noir Blanc': 'holo', 'Futuristic Rare': 'holo',
  'Ultra Rare': 'ultra', 'Holo Rare V': 'ultra', 'Holo Rare VMAX': 'ultra', 'Holo Rare VSTAR': 'ultra', 'Double rare': 'ultra', 'Dresseur Full Art': 'ultra',
  'Shiny rare': 'ultra', 'Shiny rare V': 'ultra', 'Shiny rare VMAX': 'ultra', 'Chromatique ultra rare': 'ultra', 'Mega Attack Rare': 'ultra', 'RGB Rare': 'ultra',
  'Illustration rare': 'secrete', 'Illustration spéciale rare': 'secrete', 'Hyper rare': 'secrete', 'Méga Hyper Rare': 'secrete',
};
const TIER_ORDER = ['commune', 'peu', 'rare', 'holo', 'ultra', 'secrete', 'promo', 'aucune'];
const rarityTier = (r) => RARITY_TIER[r] || (/ultra|vmax|vstar|full art|hyper|illustration/i.test(r || '') ? 'ultra' : 'holo');
const rarityRank = (r) => TIER_ORDER.indexOf(rarityTier(r));
// Pictogramme d'une rareté (SVG, d'après les symboles imprimés sur les cartes) : ● commune, ◆ peu commune, ★ rare, ☆ holo, étoiles dorées pour les illustrations…
const STAR_PTS = (cx, cy, R) => Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? R * 0.42 : R; return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`; }).join(' ');
function rarityKind(r) {
  const m = {
    'Commune': 'circle', 'Peu Commune': 'diamond', 'Rare': 'star', 'Promo': 'promo', 'Collection Classique': 'promo', 'Sans Rareté': 'dash',
    'Double rare': 'two-black', 'Ultra Rare': 'two-silver', 'Illustration rare': 'one-gold', 'Illustration spéciale rare': 'two-gold',
    'Hyper rare': 'three-gold', 'Méga Hyper Rare': 'three-gold', 'Shiny rare': 'one-hollow', 'Shiny rare V': 'one-hollow', 'Shiny rare VMAX': 'one-hollow', 'Chromatique ultra rare': 'two-hollow', 'Rare secrète': 'one-small', 'Magnifique rare': 'amazing', 'Magnifique': 'amazing',
    'Mega Attack Rare': 'two-color', 'Futuristic Rare': 'rainbow', 'RGB Rare': 'rgb',
  };
  if (m[r]) return m[r];
  const t = rarityTier(r);
  return t === 'ultra' ? 'two-silver' : t === 'secrete' ? 'one-gold' : t === 'promo' ? 'promo' : t === 'aucune' ? 'dash' : t === 'commune' ? 'circle' : t === 'peu' ? 'diamond' : t === 'rare' ? 'star' : 'star-white';
}
function rarityIcon(r, size = 22) {
  const k = rarityKind(r), svg = svgEl('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'ric', 'aria-hidden': 'true', focusable: 'false' });
  const star = (cx, cy, R, fill, stroke = '#fff', sw = 1) => svg.append(svgEl('polygon', { points: STAR_PTS(cx, cy, R), fill, stroke, 'stroke-width': String(sw), 'stroke-linejoin': 'round' }));
  const GOLD = '#f0b429', SILVER = '#a9adb5', BLACK = '#1d1d1f';
  if (k === 'circle') svg.append(svgEl('circle', { cx: 12, cy: 12, r: 6.5, fill: BLACK }));
  else if (k === 'diamond') svg.append(svgEl('polygon', { points: '12,4.5 18,12 12,19.5 6,12', fill: BLACK }));
  else if (k === 'star') star(12, 12.5, 9, BLACK, 'none');
  else if (k === 'star-white') star(12, 12.5, 9, '#fff', BLACK);
  else if (k === 'one-gold') star(12, 12.5, 9, GOLD);
  else if (k === 'amazing') svg.append(svgEl('image', { href: 'images/rarity/amazing.webp', x: 1, y: 1, width: 22, height: 22, preserveAspectRatio: 'xMidYMid meet' }));     // logo officiel fourni (M multicolore)
  else if (k === 'one-small') star(12, 12.5, 6.4, GOLD);
  else if (k === 'one-hollow') star(12, 12.5, 9, 'none', GOLD, 1.8);
  else if (k === 'two-hollow') { star(8, 10, 6, 'none', GOLD, 1.5); star(16, 15, 6, 'none', GOLD, 1.5); }
  else if (k === 'two-black') { star(8, 10, 6, BLACK, 'none'); star(16, 15, 6, BLACK, 'none'); }
  else if (k === 'two-silver') { star(8, 10, 6, SILVER); star(16, 15, 6, SILVER); }
  else if (k === 'two-gold') { star(8, 10, 6, GOLD); star(16, 15, 6, GOLD); }
  else if (k === 'three-gold') { star(12, 6.5, 5.2, GOLD); star(7, 15.5, 5.2, GOLD); star(17, 15.5, 5.2, GOLD); }
  else if (k === 'sparkle') { svg.append(svgEl('path', { d: 'M12 2 L14.6 9.4 L22 12 L14.6 14.6 L12 22 L9.4 14.6 L2 12 L9.4 9.4 Z', fill: GOLD, stroke: BLACK, 'stroke-width': '1.2', 'stroke-linejoin': 'round' })); svg.append(svgEl('path', { d: 'M12 6.5 L13.3 10.7 L17.5 12 L13.3 13.3 L12 17.5 L10.7 13.3 L6.5 12 L10.7 10.7 Z', fill: BLACK })); }
  else if (k === 'two-color') { star(8, 10, 6, '#e98bc0'); star(16, 15, 6, '#7ccf9b'); }
  else if (k === 'rainbow') { const id = 'rg' + Math.random().toString(36).slice(2, 7); const g = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 1 }, svgEl('stop', { offset: '0', 'stop-color': '#2bb3a3' }), svgEl('stop', { offset: '1', 'stop-color': '#8e2f8f' })); svg.append(svgEl('defs', {}, g)); star(12, 12.5, 9, `url(#${id})`); }
  else if (k === 'rgb') { for (const [x, y, c] of [[12, 8.8, '#e24a3b'], [8.2, 15, '#3aa65a'], [15.8, 15, '#2f5db3']]) svg.append(svgEl('circle', { cx: x, cy: y, r: 5.2, fill: c, 'fill-opacity': '.88', stroke: '#fff', 'stroke-width': '.8' })); }
  else if (k === 'promo') { star(12, 12.5, 9, BLACK, 'none'); svg.append(svgEl('text', { x: 12, y: 14.6, 'text-anchor': 'middle', 'font-size': '4.1', 'font-weight': '900', fill: '#fff', 'font-family': 'system-ui, sans-serif' }, 'PROMO')); }
  else svg.append(svgEl('line', { x1: 7, y1: 17, x2: 17, y2: 7, stroke: '#7a7f8a', 'stroke-width': '2.6', 'stroke-linecap': 'round' }));
  return svg;
}

const hasVersions = (info) => !!(info && info.vars && info.vars.length >= 2);

/* ---------- Cartes ---------- */
function placeholderContent(name) {
  return h('div', {}, h('span', { class: 't' }, name), h('span', { class: 's' }, 'Image indisponible'));
}
function mediaButton(card, name, onclick, badge) {
  const media = h('button', { type: 'button', class: 'media', 'aria-label': `Agrandir ${name}`, onclick });
  const placeholder = () => { media.classList.add('noimg'); media.replaceChildren(placeholderContent(name), ...(badge ? [badge] : [])); };
  if (card.image) { media.append(lazyImg(imgLow(card), name, placeholder)); if (badge) media.append(badge); } else placeholder();
  return { media, placeholder };
}

// Numérotation par groupe : « H01 » fait partie des « H » (H01/H32), pas des 147 cartes numérotées d'Aquapolis ; idem TG, GG, SV…
// Les cartes numérotées par une lettre ou un signe (Zarbi « A/28 », « ?/28 ») forment le groupe « * ».
const lidShow = (lid) => { try { return decodeURIComponent(String(lid)); } catch { return String(lid); } };      // « %3F » → « ? »
const numPrefix = (lid) => (String(lid).match(/^[A-Za-z]+/) || [''])[0].toUpperCase();
const numGroup = (lid) => { const d = lidShow(lid); if (d.includes('/')) return ''; return /\d/.test(d) ? numPrefix(d) : '*'; };      // un numéro déjà complet (« R/RGB ») n'a pas de groupe
function prefixTotals(cards) { const m = new Map(); for (const c of cards) { const g = numGroup(c.localId); if (g) m.set(g, (m.get(g) || 0) + 1); } return m; }
const numLabelOf = (card, totals) => {
  const d = lidShow(card.localId), g = numGroup(card.localId), n = g && totals && totals.get(g);
  if (!(n > 1)) return d;
  return g === '*' ? `${d}/${n}` : `${d}/${g}${String(n).padStart(2, '0')}`;
};
const MAXCHIPS = 4;
function makeTile(card, mine, onChange, ctx) {
  const id = card.id, name = card.name || '#' + card.localId;
  let info = ctx.info.get(id) || null;
  const { media } = mediaButton(card, name, () => ctx.zoom(t));

  const dbl = h('span', { class: 'dbl', hidden: true });
  const numLabel = numLabelOf(card, ctx.prefixTotals);
  const num = h('span', { class: 'num' }, '#' + numLabel);
  const rar = h('span', { class: 'rar' });
  const price = h('span', { class: 'price', hidden: true });
  const ctl = h('div', { class: 'ctl' });
  const el = h('div', { class: 'card' }, media, dbl, num, h('span', { class: 'nm' }, name), rar, price, ctl);
  let cb = null, mark = null, qv = null, minus = null, plus = null, chips = [], unChip = null;

  const t = {
    el, card, mine, id, name, setName: ctx.setName, official: ctx.official, numLabel, text: '',
    get info() { return info; },
    setInfo(i) { info = i; build(); sync(); },
    get value() { return mine[id]; },
    paintPrice() { const e = priceCache[id], u = blend(id, e ? srcUnit(e, null) : null); price.hidden = u == null; if (u != null) price.textContent = '≈ ' + eur(u); },
    set(key, q) { setQty(mine, id, key, q); sync(); onChange(); },
    setQuiet(key, q) { setQty(mine, id, key, q); sync(); },                       // sans enregistrer (actions groupées)
    restore(v) { if (v === undefined) delete mine[id]; else mine[id] = isMulti(v) ? { ...v } : v; sync(); },
    clearUnassigned() { const v = mine[id]; if (isMulti(v)) setQty(mine, id, '_', 0); else delete mine[id]; sync(); onChange(); },
  };

  function build() {
    rar.textContent = info && info.rar ? info.rar : '';
    rar.className = 'rar' + (info && info.rar ? ' rt-' + rarityTier(info.rar) : '');
    t.text = norm(`${name} ${lidShow(card.localId)} ${id} ${info && info.rar ? info.rar : ''}`);
    el.querySelector('.cb')?.remove(); ctl.replaceChildren(); chips = []; unChip = null;
    if (hasVersions(info)) {
      cb = null; qv = minus = plus = null;
      mark = h('span', { class: 'cb ind', 'aria-hidden': 'true' }); el.append(mark);
      const shown = info.vars.slice(0, MAXCHIPS);
      shown.forEach((v) => {   // toucher la pastille ajoute un exemplaire ; « − » en retire un
        const c = h('button', { type: 'button', class: 'chip', title: v.label + ' : un exemplaire de plus', 'aria-pressed': 'false', 'aria-label': `${v.label} — ${name} : un exemplaire de plus` });
        c.addEventListener('click', () => t.set(v.key, Math.min(MAXQ, qtyOfKey(v.key) + 1)));
        const m = h('button', { type: 'button', class: 'cm', hidden: true, 'aria-label': `${v.label} — ${name} : un exemplaire de moins` }, '−');
        m.addEventListener('click', () => t.set(v.key, Math.max(0, qtyOfKey(v.key) - 1)));
        chips.push([v, c, m]); ctl.append(h('div', { class: 'chiprow' }, c, m));
      });
      if (info.vars.length > MAXCHIPS) ctl.append(h('button', { type: 'button', class: 'chip more', onclick: () => ctx.zoom(t), title: 'Toutes les versions' }, `+${info.vars.length - MAXCHIPS}`));
      unChip = h('button', { type: 'button', class: 'chip unk', hidden: true, title: 'Ancienne coche sans version précisée : touchez pour la retirer, puis choisissez la bonne version.' });
      unChip.addEventListener('click', () => t.clearUnassigned());
      ctl.append(unChip);
    } else {
      mark = null;
      cb = h('input', { type: 'checkbox', class: 'cb', 'aria-label': `Je possède ${name} (n° ${lidShow(card.localId)})` });
      cb.addEventListener('change', () => t.set(null, cb.checked ? 1 : 0));
      el.append(cb);
      qv = h('span', { class: 'qv', 'aria-live': 'polite' }, '1');
      minus = h('button', { type: 'button', class: 'qb', 'aria-label': `Un exemplaire de moins de ${name}` }, '−');
      plus = h('button', { type: 'button', class: 'qb', 'aria-label': `Un exemplaire de plus de ${name}` }, '+');
      minus.addEventListener('click', () => t.set(null, Math.max(1, qtyTotal(mine[id]) - 1)));
      plus.addEventListener('click', () => t.set(null, Math.min(MAXQ, qtyTotal(mine[id]) + 1)));
      ctl.append(h('div', { class: 'qty' }, minus, qv, plus));
    }
  }
  function qtyOfKey(k) { const v = mine[id]; return isMulti(v) ? (v[k] || 0) : 0; }
  function sync() {
    const v = mine[id], total = qtyTotal(v), mx = qtyMax(v);
    el.classList.toggle('own', total > 0);
    dbl.textContent = '×' + mx; dbl.hidden = mx < 2;
    if (cb) {
      cb.checked = total > 0; qv.textContent = String(total || 1);
      minus.disabled = total <= 1; plus.disabled = total >= MAXQ;
    } else {
      mark.classList.toggle('on', total > 0);
      for (const [vr, c, m] of chips) { const q = qtyOfKey(vr.key); c.setAttribute('aria-pressed', String(q > 0)); c.textContent = q >= 2 ? `${vr.label} ×${q}` : vr.label; m.hidden = q <= 0; }
      const un = isMulti(v) ? (v._ || 0) : (v | 0);
      unChip.hidden = un <= 0; unChip.textContent = `Version ? ×${un}`;
    }
  }
  build(); sync(); t.paintPrice();
  return t;
}

/* Carte en lecture seule (comparaison) */
function viewTile(card, qty, zoom) {
  const name = card.name || '#' + card.localId;
  const badge = qty > 1 ? h('span', { class: 'dbl' }, '×' + qty) : null;
  const { media } = mediaButton(card, name, zoom, badge);
  return h('div', { class: 'card view' }, media, h('span', { class: 'num' }, '#' + card.localId), h('span', { class: 'nm' }, name));
}

/* ---------- Agrandissement d'une carte ---------- */
let lb = null;
function closeLightbox() {
  if (!lb) return;
  document.removeEventListener('keydown', lb.onKey);
  lb.el.remove(); document.documentElement.classList.remove('lb-open');
  const f = lb.opener; lb = null;
  try { f && f.focus({ preventScroll: true }); } catch { /* ignoré */ }
}
// items : cartes (tuiles de la grille, ou { card, name, setName } en lecture seule) ; index : celle à afficher
function openLightbox(items, index, L) {
  closeLightbox();
  let i = index;
  const readonly = !items[0] || !('mine' in items[0]);
  const img = h('img', { class: 'lb-img', alt: '', draggable: 'false' });
  const stageBox = h('div', { class: 'lb-stage' });
  const nameEl = h('h2', { class: 'lb-name' }), subEl = h('p', { class: 'lb-sub' }), rarEl = h('p', { class: 'lb-rar' }), varsEl = h('div', { class: 'lb-vars' });
  const priceEl = h('p', { class: 'lb-price' }), linksEl = h('p', { class: 'lb-links' }), ebayEl = h('div', { class: 'lb-ebay' });
  const prev = h('button', { type: 'button', class: 'lb-nav prev', 'aria-label': 'Carte précédente' }, '‹');
  const next = h('button', { type: 'button', class: 'lb-nav next', 'aria-label': 'Carte suivante' }, '›');
  const close = h('button', { type: 'button', class: 'lb-close', 'aria-label': 'Fermer l’agrandissement' }, '✕');
  const el = h('div', { class: 'lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Carte agrandie' },
    close, stageBox, h('div', { class: 'lb-info' }, nameEl, subEl, rarEl, priceEl, linksEl, ebayEl, varsEl));
  stageBox.append(prev, img, next);
  const opener = document.activeElement;

  const infoOf = (it) => (it.info !== undefined ? it.info : it._info) || null;
  function qtyRow(label, q, onSet, opts = {}) {
    const m = h('button', { type: 'button', class: 'qb', 'aria-label': `Un de moins : ${label}`, disabled: q <= 0, onclick: () => onSet(Math.max(0, q - 1)) }, '−');
    const p = h('button', { type: 'button', class: 'qb', 'aria-label': `Un de plus : ${label}`, disabled: q >= MAXQ || opts.noPlus, onclick: () => onSet(Math.min(MAXQ, q + 1)) }, '+');
    const inp = h('input', { class: 'qin', type: 'number', inputmode: 'numeric', min: '0', max: String(MAXQ), value: String(q), 'aria-label': `Quantité : ${label}` });   // on peut taper directement un nombre
    const commit = () => { let n = parseInt(inp.value, 10); if (!Number.isFinite(n)) n = q; n = Math.max(0, Math.min(MAXQ, n)); if (n !== q) onSet(n); else inp.value = String(q); };
    inp.addEventListener('change', commit); inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } e.stopPropagation(); });   // les flèches du clavier ne changent pas de carte pendant la saisie
    return h('div', { class: 'vrow' + (q > 0 ? ' on' : '') }, h('span', { class: 'vl' }, label), h('div', { class: 'qty vq' }, m, inp, p));
  }
  function renderVars() {
    const it = items[i], info = infoOf(it);
    varsEl.replaceChildren();
    if (readonly) {
      if (info && info.vars.length) varsEl.append(h('p', { class: 'lb-help' }, 'Versions existantes : ' + info.vars.map((v) => v.label).join(' · ')));
      return;
    }
    const v = it.value;
    if (info) {      // ajout en un geste : un exemplaire (de la première version si la carte en a plusieurs ; ajustable juste dessous)
      const first = hasVersions(info) ? info.vars[0] : null, have = qtyTotal(v);
      varsEl.append(have > 0
        ? h('p', { class: 'lb-own' }, `✓ Dans ma collection : ${plural(have, 'exemplaire', 'exemplaires')}`)
        : h('button', { class: 'btn lb-add', type: 'button', onclick: () => { it.set(first ? first.key : null, 1); renderVars(); toast(first ? `Ajouté : ${first.label}. Changez la version ci-dessous si besoin.` : 'Ajouté à votre collection.'); } }, '➕ Ajouter à ma collection'));
    }
    if (hasVersions(info)) {
      varsEl.append(h('p', { class: 'lb-help' }, 'Quantité possédée pour chaque version :'));
      for (const vr of info.vars) {
        const q = isMulti(v) ? (v[vr.key] || 0) : 0;
        varsEl.append(qtyRow(vr.label, q, (n) => { it.set(vr.key, n); renderVars(); }));
      }
      const un = isMulti(v) ? (v._ || 0) : (v | 0);
      if (un > 0) {
        varsEl.append(qtyRow('Version non précisée (ancienne coche)', un, (n) => { if (n <= 0) it.clearUnassigned(); else it.set('_', n); renderVars(); }, { noPlus: true }));
        varsEl.append(h('p', { class: 'lb-help' }, 'Retirez-la, puis ajoutez la bonne version ci-dessus.'));
      }
    } else {
      varsEl.append(qtyRow('Exemplaires', qtyTotal(v), (n) => { it.set(null, n); renderVars(); }));
    }
  }
  function paintPrice(it) {
    const e = priceCache[it.card.id];
    if (!e) { priceEl.textContent = 'Prix : relevé en cours…'; return; }
    const parts = [];
    if (e[0] != null) parts.push(`Normal / Holo ${eur(e[0])}`);
    if (e[1] != null && e[1] !== e[0]) parts.push(`Reverse ${eur(e[1])}`);
    priceEl.replaceChildren(parts.length ? h('b', {}, 'Prix Cardmarket (tendance) : ') : 'Prix indisponible pour cette carte.', parts.join(' · '),
      parts.length ? h('span', { class: 'lb-help' }, ' Tous vendeurs et toutes langues (pas seulement la France).') : '');
  }
  function paintEbay(it) {
    const id = it.card.id, avg0 = ebayAvg(id);
    const inp = h('input', { class: 'field ebin', type: 'text', inputmode: 'decimal', placeholder: '€', value: avg0 != null ? String(Math.round(avg0 * 100) / 100).replace('.', ',') : '', 'aria-label': 'Dernière vente réussie sur eBay.fr (en euros)' });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } e.stopPropagation(); });
    inp.addEventListener('focus', () => inp.select());
    const res = h('p', { class: 'lb-help' });
    const upd = () => { const eb = ebayAvg(id); const e = priceCache[id]; const cm = e ? srcUnit(e, null) : null;
      res.textContent = eb == null ? 'Notez le prix de la dernière vente réussie : il est combiné à celui de Cardmarket.' : `Dernière vente eBay.fr : ${eur(eb)}${cm != null ? ` · avec Cardmarket (${eur(cm)}) : ${eur((eb + cm) / 2)}` : ''}`; };
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value.replace(',', '.'));
      if (Number.isFinite(v) && v > 0) ebayPrices[id] = sanitizeEbay({ [id]: [v] })[id]; else delete ebayPrices[id];
      saveEbay(); upd(); if (it.paintPrice) it.paintPrice();
    });
    ebayEl.replaceChildren(h('p', { class: 'lb-help' }, 'Dernière vente réussie sur eBay.fr (en €) :'), h('div', { class: 'ebrow' }, inp), res);
    upd();
  }
  // fiche exacte de la carte avec les filtres : carte française, vendeur en France, Near Mint ou mieux
  // repli : page Cardmarket de la carte par numéro de produit (test réel : Products?idProduct=… ouvre la bonne carte dans la bonne extension, parfois une autre version) ; sans numéro de produit : recherche
  const cmFallbackUrl = (it) => { const e = priceCache[it.card.id], idp = e && e[3]; return idp ? `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${idp}` : cmSearchUrl(it); };
  const cmSearchUrl = (it) => 'https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=' + encodeURIComponent([it.name, lidShow(it.card.localId).replace(/[^A-Za-z0-9]/g, '')].filter(Boolean).join(' ')) + '&language=2&sellerCountry=12&minCondition=2';
  function cmUrl(it) {
    const F = 'language=2&sellerCountry=12&minCondition=2', slug = cmStatic[it.card.id] || (cmSlugs[it.card.id] || '').replace(/\?$/, '');
    return slug ? `https://www.cardmarket.com/fr/Pokemon/Products/Singles/${slug}?${F}` : 'https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=' + encodeURIComponent([it.name, lidShow(it.card.localId).replace(/[^A-Za-z0-9]/g, '')].filter(Boolean).join(' ')) + '&' + F;
  }
  // Liens Cardmarket mis de côté pour l'instant (connexion exigée) : cartes.cmLinks = '1' les remet (direct, copie, repli).
  const SHOW_CM_LINKS = () => store.get('cartes.cmLinks') === '1';      // interrupteur caché (réglage 'cartes.cmLinks' = '1')
  function paintLinks(it) {
    const c = it.card, lid = lidShow(c.localId).replace(/[^A-Za-z0-9]/g, '');
    // « Phyllali 17/90 » : nom + numéro imprimé complet ; sans total connu : nom + numéro + extension.
    const term = [it.name, /^\d+$/.test(lid) && it.official ? `${lid}/${it.official}` : [lid, it.setName].filter(Boolean).join(' ')].filter(Boolean).join(' ');
    linksEl.replaceChildren(...[
      h('a', { href: 'https://www.ebay.fr/sch/i.html?_nkw=' + encodeURIComponent(term) + '&LH_Sold=1&LH_Complete=1&LH_PrefLoc=1', target: '_blank', rel: 'noopener noreferrer' }, 'Ventes terminées sur eBay.fr ↗'),
      ' · ',
      h('a', { href: 'https://www.ebay.fr/sch/i.html?_nkw=' + encodeURIComponent(term) + '&LH_PrefLoc=1', target: '_blank', rel: 'noopener noreferrer' }, 'Annonces en cours sur eBay.fr ↗'),
      SHOW_CM_LINKS() ? ' · ' : null,
      SHOW_CM_LINKS() ? h('a', { href: cmUrl(it), target: '_blank', rel: 'noopener noreferrer' }, 'Cardmarket (carte française, vendeurs France, NM) ↗') : null,
      SHOW_CM_LINKS() ? ' ' : null,
      SHOW_CM_LINKS() ? h('button', { type: 'button', class: 'lb-copy', 'aria-label': 'Copier l’adresse Cardmarket', onclick: async () => { const u = cmUrl(it); try { await navigator.clipboard.writeText(u); toast('Adresse Cardmarket copiée.'); } catch { window.prompt('Adresse Cardmarket :', u); } } }, '📋 Copier') : null,
      SHOW_CM_LINKS() ? ' · ' : null,
      SHOW_CM_LINKS() ? h('a', { href: cmFallbackUrl(it), target: '_blank', rel: 'noopener noreferrer' }, ((priceCache[it.card.id] || [])[3] ? 'ou page de la carte (choisir la version) ↗' : 'ou recherche Cardmarket ↗')) : null,
      SHOW_CM_LINKS() && /\?$/.test(cmSlugs[it.card.id] || '') && !cmStatic[it.card.id] ? h('span', { class: 'lb-help' }, ' Adresse déduite, non vérifiée : si la page est introuvable, utilisez le second lien Cardmarket.') : null].filter(Boolean));
  }
  function show() {
    const it = items[i], c = it.card, info = infoOf(it);
    paintPrice(it); paintLinks(it); paintEbay(it);
    if (SHOW_CM_LINKS() && L === 'fr' && !cmSlugs[c.id] && !cmStatic[c.id]) ensureCmSlug(c.id).then(() => { if (items[i] === it && lb) paintLinks(it); }).catch(() => {});
    if (!priceCache[c.id] && L === 'fr') fetchPrice(L, c.id).then(() => { savePrices(); if (items[i] === it && lb) { paintPrice(it); paintLinks(it); } }).catch(() => { if (items[i] === it && lb) priceEl.textContent = 'Prix indisponible pour le moment.'; });
    nameEl.textContent = it.name;
    subEl.textContent = `#${it.numLabel || lidShow(c.localId)} · ${it.setName || ''} · ${i + 1}/${items.length}`;
    rarEl.textContent = info && info.rar ? `Rareté : ${info.rar}` : '';
    rarEl.className = 'lb-rar' + (info && info.rar ? ' rt-' + rarityTier(info.rar) : '');
    rarEl.hidden = !(info && info.rar);
    img.alt = it.name; img.classList.remove('ok'); img.removeAttribute('src'); stageBox.classList.remove('noimg');
    stageBox.querySelector('.lb-ph')?.remove();
    if (c.image) {
      img.src = imgLow(c);
      const hi = new Image(); hi.onload = () => { if (items[i] === it) { img.src = hi.src; } }; hi.src = imgHigh(c);
      img.onload = () => img.classList.add('ok');
      img.onerror = () => { if (!stageBox.querySelector('.lb-ph')) { img.classList.remove('ok'); stageBox.append(h('div', { class: 'lb-ph' }, placeholderContent(it.name))); } };
    } else stageBox.append(h('div', { class: 'lb-ph' }, placeholderContent(it.name)));
    prev.hidden = items.length < 2; next.hidden = items.length < 2;
    renderVars();
    if (!info && L === 'fr') {      // version / rareté absentes de l'instantané : demande en direct
      fetchCardInfo(L, c.id).then((got) => { if (it.setInfo) it.setInfo(got); else it._info = got; if (items[i] === it && lb) { rarEl.textContent = got.rar ? `Rareté : ${got.rar}` : ''; rarEl.className = 'lb-rar' + (got.rar ? ' rt-' + rarityTier(got.rar) : ''); rarEl.hidden = !got.rar; renderVars(); } }).catch(() => {});
    }
  }
  const go2 = (d) => { if (items.length < 2) return; i = (i + d + items.length) % items.length; show(); };
  prev.addEventListener('click', () => go2(-1)); next.addEventListener('click', () => go2(1));
  close.addEventListener('click', closeLightbox);
  el.addEventListener('click', (e) => { if (e.target === el || e.target === stageBox) closeLightbox(); });
  const onKey = (e) => { if (e.key === 'Escape') closeLightbox(); else if (e.key === 'ArrowLeft') go2(-1); else if (e.key === 'ArrowRight') go2(1); };
  document.addEventListener('keydown', onKey);
  let x0 = null;
  img.addEventListener('click', () => closeLightbox());     // retoucher la carte l'ouvre puis la referme, sans bouton
  stageBox.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  stageBox.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 55) go2(dx < 0 ? 1 : -1); }, { passive: true });
  lb = { el, onKey, opener };
  document.body.append(el); document.documentElement.classList.add('lb-open');
  show(); try { close.focus({ preventScroll: true }); } catch { /* ignoré */ }
}

/* ---------- Fenêtres ---------- */
function closeSheet() { document.querySelector('.overlay')?.remove(); }
/* ---------- Ouverture de booster : taux d'obtention (« pull rate ») par extension, uniquement depuis Statistiques ---------- */
// cartes.boosters : [{ id, set, name, n (boosters ouverts), hits:{rareté:nombre}, t }]
function loadBoosters() {
  try { const a = JSON.parse(store.get(K.boosters) || '[]'); return Array.isArray(a) ? a.filter((x) => x && typeof x.set === 'string' && x.n > 0 && x.hits && typeof x.hits === 'object') : []; } catch { return []; }
}
const saveBoosters = (a) => store.set(K.boosters, JSON.stringify(a));
const pullPct = (hits, n) => (n > 0 ? Math.round((hits / n) * 1000) / 10 : 0);
function openBoosters(blocks, L) {
  const groups = blocks.flatMap((b) => b.items.map((g) => ({ g, block: b.name })));
  const nameOf = (id) => { const x = groups.find((y) => y.g.id === id); return x ? (x.g.set.name || id) : id; };
  const sel = h('select', { class: 'bo-set', 'aria-label': 'Extension ouverte' }, h('option', { value: '' }, 'Choisir l’extension ouverte…'),
    ...blocks.map((b) => h('optgroup', { label: b.name }, b.items.map((g) => h('option', { value: g.id }, g.set.name || g.id)))));
  const body = h('div', { class: 'bo-body' });
  let cur = null;
  // compteur à gros boutons − / +
  const stepper = (label, value, onChange, opts = {}) => {
    const inp = h('input', { class: 'qin bo-in', type: 'number', inputmode: 'numeric', min: String(opts.min ?? 0), max: '9999', value: String(value), 'aria-label': label });
    const set = (v) => { v = Math.max(opts.min ?? 0, Math.min(9999, Number.isFinite(v) ? v : 0)); inp.value = String(v); if (onChange) onChange(v); };
    inp.addEventListener('focus', () => inp.select()); inp.addEventListener('change', () => set(parseInt(inp.value, 10)));
    const el = h('div', { class: 'bo-step' }, h('button', { type: 'button', class: 'qb', 'aria-label': 'Un de moins : ' + label, onclick: () => set((parseInt(inp.value, 10) || 0) - 1) }, '−'), inp,
      h('button', { type: 'button', class: 'qb', 'aria-label': 'Un de plus : ' + label, onclick: () => set((parseInt(inp.value, 10) || 0) + 1) }, '+'));
    return { el, inp, get: () => Math.max(0, parseInt(inp.value, 10) || 0), reset: (v) => { inp.value = String(v); } };
  };
  // les communes et peu communes ne comptent pas comme « hits »
  const isHit = (r) => !['commune', 'peu'].includes(rarityTier(r));
  function graph(set) {
    const all = loadBoosters().filter((x) => x.set === set);
    if (!all.length) return h('p', { class: 'lb-help' }, 'Aucune ouverture enregistrée pour cette extension : vos statistiques apparaîtront ici et se cumuleront à chaque nouvelle ouverture.');
    const n = all.reduce((a, x) => a + x.n, 0), tot = {};
    for (const x of all) for (const [r, c] of Object.entries(x.hits)) if (isHit(r)) tot[r] = (tot[r] || 0) + (Number(c) || 0);
    const rows = Object.entries(tot).filter(([, c]) => c > 0).sort((a, b) => rarityRank(a[0]) - rarityRank(b[0]));
    const maxPct = Math.max(1, ...rows.map(([, c]) => pullPct(c, n)));
    const hitsTotal = rows.reduce((a, [, c]) => a + c, 0);
    return h('div', { class: 'bo-graph' },
      h('h3', {}, `Statistiques · ${nameOf(set)}`),
      h('div', { class: 'bo-kpis' },
        h('div', { class: 'bo-kpi' }, h('b', {}, n.toLocaleString('fr-FR')), h('span', {}, n > 1 ? 'boosters ouverts' : 'booster ouvert')),
        h('div', { class: 'bo-kpi' }, h('b', {}, hitsTotal.toLocaleString('fr-FR')), h('span', {}, hitsTotal > 1 ? 'hits' : 'hit')),
        h('div', { class: 'bo-kpi' }, h('b', {}, pullPct(hitsTotal, n).toLocaleString('fr-FR') + ' %'), h('span', {}, 'hits / booster'))),
      rows.length ? h('div', { class: 'bo-bars', role: 'list' }, rows.map(([r, c]) => {
        const pct = pullPct(c, n);
        return h('div', { class: 'bo-bar', role: 'listitem', 'aria-label': `${r} : ${pct} %` },
          h('div', { class: 'bo-bl' }, h('span', { class: 'rbi' }, rarityIcon(r, 20)), h('span', { class: 'bo-name' }, r)),
          h('div', { class: 'bo-track' }, h('i', { class: 'rt-' + rarityTier(r), style: `width:${Math.max(3, (pct / maxPct) * 100).toFixed(1)}%` })),
          h('div', { class: 'bo-val' }, h('b', {}, `${pct.toLocaleString('fr-FR')} %`), h('span', {}, ` · ${c}/${n} · 1 tous les ${(n / c).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} boosters`)));
      })) : h('p', { class: 'lb-help' }, 'Aucun hit noté pour le moment.'),
      h('h3', {}, 'Ouvertures enregistrées'),
      h('div', { class: 'orows' }, all.slice().reverse().map((x) => h('div', { class: 'orow' }, h('div', { class: 'orow-l' },
        h('span', { class: 'rn' }, `${new Date(x.t).toLocaleDateString('fr-FR')} · ${plural(x.n, 'booster', 'boosters')}`),
        h('span', { class: 'rc' }, Object.entries(x.hits).filter(([r, c]) => c > 0 && isHit(r)).map(([r, c]) => `${c} ${r}`).join(', ') || 'aucun hit')),
        h('button', { type: 'button', class: 'orow-go', 'aria-label': 'Supprimer cette ouverture', onclick: () => { saveBoosters(loadBoosters().filter((y) => y.id !== x.id)); render(); } }, '✕')))));
  }
  async function render() {
    body.replaceChildren();
    if (!cur) { body.append(h('p', { class: 'lb-help' }, 'Choisissez l’extension dont vous avez ouvert des boosters. Chaque nouvelle ouverture s’ajoute à la même extension et met à jour les statistiques.')); return; }
    body.append(h('p', { class: 'lb-help' }, 'Chargement des raretés…'));
    const x = groups.find((y) => y.g.id === cur);
    const maps = await Promise.all(x.g.members.map((m) => loadCardInfo(L, m.id)));
    if (sel.value !== cur) return;
    const rars = [...new Set(maps.flatMap((m) => [...m.values()].map((i) => i.rar).filter(Boolean)))].filter(isHit).sort((a, b) => rarityRank(a) - rarityRank(b) || a.localeCompare(b, 'fr'));
    const nStep = stepper('Nombre de boosters ouverts', 1, null, { min: 1 });
    const hitSteps = new Map(rars.map((r) => [r, stepper(`Hits : ${r}`, 0)]));
    const save = () => {
      const n = nStep.get(); if (n < 1) { toast('Indiquez le nombre de boosters ouverts.'); return; }
      const hits = {}; for (const [r, st] of hitSteps) if (st.get()) hits[r] = st.get();
      const a = loadBoosters(); a.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), set: cur, name: nameOf(cur), n, hits, t: Date.now() });
      saveBoosters(a); toast('Ouverture ajoutée à ' + nameOf(cur) + '.'); render();
    };
    body.replaceChildren(
      h('div', { class: 'bo-form' },
        h('h3', {}, 'Nouvelle ouverture'),
        h('div', { class: 'bo-line big' }, h('span', { class: 'bo-name' }, 'Boosters ouverts'), nStep.el),
        rars.length ? h('p', { class: 'lb-help' }, 'Hits obtenus (laissez 0 s’il n’y en a pas) :') : h('p', { class: 'lb-help' }, 'Aucune rareté de hit connue pour cette extension.'),
        ...rars.map((r) => h('div', { class: 'bo-line' }, h('span', { class: 'rbi' }, rarityIcon(r, 24)), h('span', { class: 'bo-name' }, r), hitSteps.get(r).el)),
        h('button', { class: 'btn', type: 'button', onclick: save }, '➕ Ajouter cette ouverture')),
      graph(cur));
  }
  sel.addEventListener('change', () => { cur = sel.value || null; render(); });
  render();
  openSheet(h('h2', {}, '🎁 Ouverture de booster'), sel, body, h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Fermer'));
}

function openSheet(...content) {
  closeSheet();
  const ov = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === ov) closeSheet(); } }, h('div', { class: 'sheet' }, ...content));
  document.body.append(ov);
  return ov;
}

/* ---------- Sauvegarde / restauration personnelle ---------- */
function openBackup(msg) {
  const last = store.get(K.exp);
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json,text/plain,.txt', hidden: true, onchange: () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) readImport(f); } });
  openSheet(
    h('h2', {}, 'Sauvegarde et restauration'),
    typeof msg === 'string' ? h('div', { class: 'note bad' }, msg) : null,
    h('ul', {}, LANGS.map((l) => h('li', {}, `${l.name} : ${plural(ownedTotal(l.id), 'carte possédée', 'cartes possédées')}`))),
    h('p', {}, last ? `Dernière sauvegarde : ${fmtDate(last)}.` : 'Aucune sauvegarde faite depuis cet appareil.'),
    h('p', {}, 'Vos cases cochées et vos quantités sont stockées uniquement sur cet appareil. Exportez régulièrement un fichier pour ne rien perdre (changement d’appareil, iOS qui nettoie les données d’un site peu utilisé, etc.). Pour échanger avec un ami, utilisez plutôt « 👥 Amis ».'),
    h('button', { class: 'btn', type: 'button', onclick: doExport }, '⬆︎ Exporter ma collection'),
    h('button', { class: 'btn sec', type: 'button', onclick: () => fileIn.click() }, '⬇︎ Importer une sauvegarde'),
    fileIn,
    h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Fermer'));
}

// Envoie un fichier via la feuille de partage (iOS : AirDrop, Messages, Mail, Fichiers…) ou, à défaut, le télécharge.
async function sendFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return true; } catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

async function doExport() {
  const payload = JSON.stringify({ app: 'mes-cartes-pokemon', type: 'sauvegarde', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), owned, ...(Object.keys(ebayPrices).length ? { ebay: ebayPrices } : {}) }, null, 1);
  const name = `cartes-pokemon-${new Date().toISOString().slice(0, 10)}.json`;
  if (await sendFile(new File([payload], name, { type: 'application/json' }))) {
    store.set(K.exp, new Date().toISOString()); toast('Sauvegarde exportée ✔︎'); closeSheet();
  }
}

function readImport(file) {
  const rd = new FileReader();
  rd.onerror = () => openBackup('Lecture du fichier impossible.');
  rd.onload = () => {
    if (String(rd.result).length > MAX_TEXT) return openBackup('Fichier trop volumineux pour être une sauvegarde.');
    let data;
    try { data = JSON.parse(rd.result); } catch { return openBackup('Ce fichier n’est pas une sauvegarde valide (JSON illisible).'); }
    if (!data || typeof data !== 'object' || data.app !== 'mes-cartes-pokemon' || !data.owned || typeof data.owned !== 'object') return openBackup('Ce fichier n’est pas une sauvegarde de cette application.');
    if (data.type === 'partage') return openBackup('Ce fichier est un partage de collection d’un ami, pas une sauvegarde. Utilisez « 👥 Amis » → « Importer la collection d’un ami ».');
    const v = data.version === undefined ? 1 : data.version;
    if (!Number.isInteger(v) || v < 1) return openBackup('Version de sauvegarde invalide : fichier ignoré.');
    if (v > BACKUP_VERSION) return openBackup(`Cette sauvegarde a été créée par une version plus récente de l’application (format ${v}, celle-ci comprend jusqu’au format ${BACKUP_VERSION}). Mettez l’application à jour, puis réessayez.`);
    const incoming = sanitizeOwned(data.owned), incEbay = sanitizeEbay(data.ebay);
    const sum = STORAGE_LANGS.reduce((s, l) => s + ownedIn(incoming, l), 0);
    if (!sum) return openBackup('La sauvegarde ne contient aucune carte.');
    openSheet(
      h('h2', {}, 'Importer cette sauvegarde ?'),
      h('ul', {}, LANGS.map((l) => h('li', {}, `${l.name} : ${plural(ownedIn(incoming, l.id), 'carte', 'cartes')} (actuellement ${ownedTotal(l.id)})`))),
      data.exportedAt ? h('p', {}, `Sauvegarde du ${fmtDate(data.exportedAt)}.`) : null,
      h('button', { class: 'btn', type: 'button', onclick: () => applyImport(incoming, 'merge', incEbay) }, 'Fusionner (garde la plus grande quantité)'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => applyImport(incoming, 'replace', incEbay) }, 'Remplacer ma collection actuelle'),
      h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Annuler'));
  };
  rd.readAsText(file);
}
const ownedIn = (o, l) => Object.entries(o[l]).reduce((s, [sid, m]) => s + (isDigital(l, sid) ? 0 : countKeys(m)), 0);

function applyImport(incoming, mode, incEbay = {}) {
  if (Object.keys(incEbay).length) { ebayPrices = mode === 'replace' ? incEbay : { ...ebayPrices, ...incEbay }; saveEbay(); }
  if (mode === 'replace') owned = incoming;
  else {
    for (const l of STORAGE_LANGS) for (const [sid, m] of Object.entries(incoming[l])) {
      const cur = owned[l][sid] || (owned[l][sid] = nullObj());
      for (const [id, qn] of Object.entries(m)) cur[id] = mergeQty(cur[id], qn);
    }
  }
  saveOwned(); closeSheet(); toast(mode === 'replace' ? 'Collection remplacée ✔︎' : 'Collection fusionnée ✔︎'); route();
}

/* ---------- Partage : encodage texte ---------- */
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(t) {
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (t.length % 4)) % 4));
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

async function encodeText(json) {
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'function') {
    try { return 'PKZ1:' + toB64(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch { /* texte non compressé */ }
  }
  return 'PKM1:' + toB64(bytes);
}

/* Lit un partage depuis un texte collé ou un fichier. Retourne { error } ou { data }. */
async function parseShare(input) {
  const text = String(input || '').trim();
  if (!text) return { error: 'Rien à importer : choisissez un fichier ou collez le texte reçu.' };
  if (text.length > MAX_TEXT) return { error: 'Ce contenu est beaucoup trop volumineux pour être un partage de collection.' };
  let json;
  try {
    const m = text.match(/PK([MZ])1:([A-Za-z0-9_-]+)/);
    if (m) {
      let bytes = fromB64(m[2]);
      if (m[1] === 'Z') {
        if (typeof DecompressionStream !== 'function') return { error: 'Ce texte est compressé et votre navigateur ne sait pas le lire. Demandez plutôt le fichier à votre ami.' };
        bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
      }
      json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } else if (text[0] === '{') json = text;
    else return { error: 'Ce contenu n’est pas un partage de collection (il devrait commencer par « PKZ1: », « PKM1: » ou être un fichier .json de partage).' };
  } catch { return { error: 'Le texte est incomplet ou abîmé (copie coupée ?). Demandez à votre ami de renvoyer le partage.' }; }

  let d;
  try { d = JSON.parse(json); } catch { return { error: 'Les données sont illisibles : le partage est incomplet ou abîmé.' }; }
  if (!d || typeof d !== 'object' || d.app !== 'mes-cartes-pokemon') return { error: 'Ce n’est pas un fichier de cette application (« mes-cartes-pokemon »).' };
  if (d.type === 'sauvegarde' || (d.type === undefined && d.owned && d.exportedAt)) return { error: 'C’est une sauvegarde personnelle, pas un partage d’ami. Pour la restaurer : 💾 Sauvegarde → Importer une sauvegarde.' };
  if (d.type !== 'partage') return { error: 'Type de fichier inconnu : ce n’est pas un partage de collection.' };
  if (!Number.isInteger(d.version) || d.version < 1) return { error: 'Numéro de version absent ou invalide : fichier ignoré.' };
  if (d.version > SHARE_VERSION) return { error: `Ce partage vient d’une version plus récente de l’application (format ${d.version} ; celle-ci comprend le format ${SHARE_VERSION}). Mettez l’application à jour, puis réimportez.` };
  if (!d.owned || typeof d.owned !== 'object') return { error: 'Le partage ne contient pas de liste de cartes.' };
  const ow = sanitizeOwned(d.owned);
  if (!LANG_IDS.some((l) => ownedIn(ow, l))) return { error: 'Ce partage ne contient aucune carte cochée en français.' };
  const date = typeof d.date === 'string' && !isNaN(new Date(d.date)) ? d.date : null;
  const pseudo = String(d.pseudo ?? '').trim().slice(0, 40);
  return { data: { pseudo, date, owned: ow, meta: sanitizeMeta(d.meta) } };
}

/* ---------- Partage : créer ma collection partageable ---------- */
async function collectCCMeta() {
  const meta = {}; let missing = false;
  for (const l of LANG_IDS) for (const [sid, m] of Object.entries(owned[l])) {
    if (!CC_IDS.has(sid)) continue;
    let cards = [];
    try { cards = (await api(`/${l}/sets/${encodeURIComponent(sid)}`)).cards || []; } catch { missing = true; }
    const byId = new Map(cards.map((c) => [c.id, c]));
    for (const id of Object.keys(m)) {
      const c = byId.get(id);
      if (!c) missing = true;
      ((meta[l] ||= nullObj())[sid] ||= nullObj())[id] = [c?.localId ?? id.slice(sid.length + 1), c?.name ?? ''];
    }
  }
  return { meta, missing };
}

function openShare() {
  const total = LANG_IDS.reduce((s, l) => s + ownedTotal(l), 0);
  if (!total) { openSheet(h('h2', {}, 'Partager ma collection'), h('p', {}, 'Vous n’avez encore coché aucune carte. Cochez-en quelques-unes, puis revenez ici.'), h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Fermer')); return; }
  const pseudo = h('input', { class: 'field', type: 'text', maxlength: '40', placeholder: 'Votre pseudo', value: store.get(K.pseudo) || '', 'aria-label': 'Votre pseudo', autocomplete: 'nickname', enterkeyhint: 'done' });
  const err = h('div', { class: 'note bad', hidden: true });
  const fileBtn = h('button', { class: 'btn', type: 'button', disabled: true }, '📤 Partager le fichier');
  const copyBtn = h('button', { class: 'btn sec', type: 'button', disabled: true }, '📋 Copier en texte');
  const area = h('textarea', { class: 'field', readonly: true, rows: '4', hidden: true, 'aria-label': 'Texte de partage à copier' });
  let ready = null;
  const prep = Promise.all([collectCCMeta(), ...LANG_IDS.map(digitalIds)]).then(([r]) => { ready = r; fileBtn.disabled = copyBtn.disabled = false; });

  const build = () => {
    const p = pseudo.value.trim();
    if (!p) { err.hidden = false; err.textContent = 'Indiquez d’abord votre pseudo : votre ami le verra.'; pseudo.focus(); return null; }
    err.hidden = true; store.set(K.pseudo, p);
    const mine = emptyOwned();
    for (const l of LANG_IDS) for (const [sid, m] of Object.entries(owned[l])) if (!isDigital(l, sid)) mine[l][sid] = m;
    const obj = { app: 'mes-cartes-pokemon', type: 'partage', version: SHARE_VERSION, pseudo: p, date: new Date().toISOString(), owned: mine, meta: ready.meta };
    return { p, json: JSON.stringify(obj) };
  };
  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'ami';

  fileBtn.addEventListener('click', async () => { // aucun await avant le partage : l'iPhone exige un geste direct
    const b = build(); if (!b) return;
    const name = `collection-${slug(b.p)}-${new Date().toISOString().slice(0, 10)}.json`;
    if (await sendFile(new File([b.json], name, { type: 'application/json' }))) { toast('Fichier de partage prêt ✔︎'); if (ready.missing) toast('Certains noms de la Collection Classique n’ont pas pu être récupérés (hors ligne ?).'); closeSheet(); }
  });
  copyBtn.addEventListener('click', async () => {
    const b = build(); if (!b) return;
    const textP = encodeText(b.json);
    let copied = false;
    try {
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': textP.then((t) => new Blob([t], { type: 'text/plain' })) })]); copied = true;
      } else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(await textP); copied = true; }
    } catch { /* repli : zone de texte à copier à la main */ }
    if (copied) { toast('Texte copié ✔︎ Collez-le dans un message à votre ami.'); closeSheet(); return; }
    area.value = await textP; area.hidden = false; area.focus(); area.select();
    err.hidden = false; err.textContent = 'La copie automatique a échoué : sélectionnez tout le texte ci-dessous et copiez-le.';
  });

  openSheet(
    h('h2', {}, 'Partager ma collection'),
    h('p', {}, 'Le fichier contient : votre pseudo, la date, et toutes vos cartes cochées avec leur quantité, pour chaque langue. Pour la Collection Classique, seuls le nom et le numéro des cartes sont inclus. Aucune image, et aucune donnée de vos amis.'),
    h('label', { class: 'lbl' }, 'Votre pseudo (visible par votre ami)', pseudo),
    err, fileBtn, copyBtn, area,
    h('p', {}, 'Rien n’est envoyé automatiquement : c’est vous qui transmettez le fichier ou le texte, par Messages, AirDrop, e-mail…'),
    h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Fermer'));
  prep.catch(() => { fileBtn.disabled = copyBtn.disabled = false; ready = { meta: {}, missing: true }; });
}

/* ---------- Amis : importer, remplacer, supprimer ---------- */
function openImportFriend(preselectId) {
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json,text/plain,.txt', hidden: true, onchange: () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) f.text().then(proceed).catch(() => fail('Lecture du fichier impossible.')); } });
  const area = h('textarea', { class: 'field', rows: '4', placeholder: 'Collez ici le texte reçu (PKZ1:…)', 'aria-label': 'Texte de partage reçu', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const err = h('div', { class: 'note bad', hidden: true });
  const fail = (m) => { err.hidden = false; err.textContent = m; err.scrollIntoView?.({ block: 'nearest' }); };
  const proceed = async (text) => { const r = await parseShare(text); if (r.error) return fail(r.error); confirmImport(r.data, preselectId); };

  openSheet(
    h('h2', {}, 'Importer la collection d’un ami'),
    privacyNote(),
    err,
    h('button', { class: 'btn', type: 'button', onclick: () => fileIn.click() }, '📁 Choisir un fichier'),
    fileIn,
    h('p', {}, 'ou collez le texte reçu :'), area,
    h('button', { class: 'btn sec', type: 'button', onclick: () => proceed(area.value) }, 'Lire le texte collé'),
    h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Annuler'));
}

function confirmImport(data, preselectId) {
  const list = Object.values(friends);
  const guess = preselectId && friends[preselectId] ? preselectId
    : (list.find((f) => data.pseudo && f.pseudo && norm(f.pseudo) === norm(data.pseudo)) || {}).id || '';
  const sel = h('select', { class: 'field', 'aria-label': 'Nouvel ami ou mise à jour' },
    h('option', { value: '' }, 'Ajouter comme nouvel ami'),
    list.map((f) => h('option', { value: f.id }, `Remplacer la version de ${f.name}`)));
  sel.value = guess;
  const nameIn = h('input', { class: 'field', type: 'text', maxlength: '40', 'aria-label': 'Nom de cet ami', autocomplete: 'off' });
  const err = h('div', { class: 'note bad', hidden: true });
  const warn = h('div', { class: 'note warn', hidden: true });
  const syncUi = () => {
    const f = friends[sel.value];
    nameIn.value = f ? f.name : (nameIn.dataset.touched ? nameIn.value : data.pseudo || '');
    if (f && f.date && data.date && new Date(data.date) < new Date(f.date)) { warn.hidden = false; warn.textContent = `Attention : ce fichier (${fmtDate(data.date)}) est plus ancien que la version déjà enregistrée (${fmtDate(f.date)}). Il la remplacerait par des données moins récentes.`; } else warn.hidden = true;
  };
  nameIn.addEventListener('input', () => { nameIn.dataset.touched = '1'; });
  sel.addEventListener('change', () => { delete nameIn.dataset.touched; syncUi(); });
  syncUi();

  const save = () => {
    const name = nameIn.value.trim().slice(0, 40);
    if (!name) { err.hidden = false; err.textContent = 'Donnez un nom à cet ami.'; nameIn.focus(); return; }
    const id = sel.value || newId();
    if (Object.values(friends).some((f) => f.id !== id && norm(f.name) === norm(name))) { err.hidden = false; err.textContent = `Un ami s’appelle déjà « ${name} ». Choisissez un autre nom.`; return; }
    const previous = friends[id];
    friends[id] = { id, name, pseudo: data.pseudo, date: data.date, imported: new Date().toISOString(), owned: data.owned, meta: data.meta };
    if (!saveFriends()) {
      if (previous) friends[id] = previous; else delete friends[id];
      err.hidden = false; err.textContent = 'Stockage plein sur cet appareil : l’import n’a pas été enregistré et vos données actuelles sont intactes.'; return;
    }
    closeSheet(); toast(previous ? `Collection de ${name} mise à jour ✔︎` : `${name} ajouté ✔︎`); location.hash = '#amis'; route();
  };

  openSheet(
    h('h2', {}, data.pseudo ? `Collection de « ${data.pseudo} »` : 'Collection importée'),
    h('p', {}, data.date ? `Partagée le ${fmtDate(data.date)}.` : 'Date de partage inconnue.'),
    h('ul', {}, LANGS.map((l) => h('li', {}, `${l.name} : ${plural(ownedIn(data.owned, l.id), 'carte', 'cartes')}`))),
    privacyNote(),
    list.length ? h('label', { class: 'lbl' }, 'Que faire de ce fichier ?', sel) : null,
    h('label', { class: 'lbl' }, 'Nom de cet ami', nameIn),
    warn, err,
    h('button', { class: 'btn', type: 'button', onclick: save }, 'Enregistrer sur cet appareil'),
    h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Annuler'));
}

function confirmDeleteFriend(f) {
  openSheet(
    h('h2', {}, `Supprimer ${f.name} ?`),
    h('p', {}, 'Ses données seront effacées de cet appareil. Vos propres cartes ne changent pas. Vous pourrez le réimporter si vous avez gardé le fichier.'),
    h('button', { class: 'btn danger', type: 'button', onclick: () => { delete friends[f.id]; saveFriends(); closeSheet(); toast(`${f.name} supprimé`); route(); } }, 'Supprimer définitivement'),
    h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Annuler'));
}

/* ---------- Vue : amis ---------- */
function showFriends() {
  const top = h('header', { class: 'top' }, h('div', { class: 'row' },
    h('button', { class: 'iconbtn', type: 'button', onclick: () => go(lang), 'aria-label': 'Retour aux extensions' }, '‹ Extensions'), h('h1', {}, 'Amis')));
  const list = Object.values(friends).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const cards = list.map((f) => h('li', { class: 'friend' },
    h('div', { class: 'fname' }, f.name, f.pseudo && norm(f.pseudo) !== norm(f.name) ? h('span', { class: 'sub2' }, ` (pseudo : ${f.pseudo})`) : null),
    h('div', { class: 'count' }, LANGS.map((l) => `${l.name} : ${ownedIn(f.owned, l.id)}`).join(' · ')),
    h('div', { class: 'count' }, f.date ? `Version du ${fmtDate(f.date)}` : 'Date inconnue', f.imported ? ` · importée le ${fmtDate(f.imported)}` : ''),
    h('div', { class: 'acts' },
      h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = `#comparer/${encodeURIComponent(f.id)}/${lang}`; } }, '⚖️ Comparer'),
      h('button', { class: 'btn sec', type: 'button', onclick: () => openImportFriend(f.id) }, '🔄 Nouvelle version'),
      h('button', { class: 'btn sec', type: 'button', onclick: () => confirmDeleteFriend(f) }, '🗑 Supprimer'))));
  const main = h('main', {},
    privacyNote(),
    h('div', { class: 'acts big' },
      h('button', { class: 'btn', type: 'button', onclick: openShare }, '📤 Partager ma collection'),
      h('button', { class: 'btn', type: 'button', onclick: () => openImportFriend() }, '📥 Importer la collection d’un ami')),
    list.length ? h('ul', { class: 'friends' }, cards)
      : h('div', { class: 'empty' }, 'Aucun ami pour l’instant. Demandez à un ami de vous envoyer sa collection (« Partager ma collection »), puis importez-la ici pour comparer vos cartes.'));
  $app.replaceChildren(top, main);
  scrollTo(0, 0);
}

/* ---------- Vue : comparaison avec un ami ---------- */
const CMP = {
  A: { short: (n) => `Je l’ai, pas ${n}`, full: (n) => `Cartes que j’ai et que ${n} n’a pas` },
  B: { short: (n) => `${n} l’a, pas moi`, full: (n) => `Cartes que ${n} a et que je n’ai pas` },
  C: { short: () => 'Aucun de nous', full: () => 'Cartes qu’aucun de nous n’a' },
  D: { short: (n) => `Mes doubles, pas ${n}`, full: (n) => `Mes doubles que ${n} n’a pas` },
};

async function showCompare(fid, L, my) {
  const f = friends[fid];
  if (!f) { toast('Ami introuvable.'); location.hash = '#amis'; return; }
  if (LANG_IDS.includes(L)) { lang = L; store.set(K.lang, L); }
  const top = h('header', { class: 'top' },
    h('div', { class: 'row' }, h('button', { class: 'iconbtn', type: 'button', onclick: () => { location.hash = '#amis'; }, 'aria-label': 'Retour aux amis' }, '‹ Amis'), h('h1', {}, `Comparer avec ${f.name}`)),
    langSwitch(L, (id) => { location.hash = `#comparer/${encodeURIComponent(fid)}/${id}`; }));
  const main = h('main', {}, spinner());
  $app.replaceChildren(top, main);
  scrollTo(0, 0);

  let sets;
  try { ({ sets } = await loadSets(L)); } catch (e) {
    if (my !== tok) return;
    main.replaceChildren(errorBox('Vérifiez votre connexion. ' + (e.message || ''), () => showCompare(fid, L, tok))); return;
  }
  if (my !== tok) return;

  // Calcul à partir des identifiants seulement (aucun réseau supplémentaire)
  const order = sets.slice().reverse().map((s) => s.id);
  const info = new Map(sets.map((s) => [s.id, s]));
  const ids = new Set([...Object.keys(owned[L]), ...Object.keys(f.owned[L]), ...order]);
  const per = new Map();
  for (const sid of ids) {
    if (isDigital(L, sid)) continue;
    const mi = owned[L][sid] || nullObj(), th = f.owned[L][sid] || nullObj();
    const A = Object.keys(mi).filter((id) => !(id in th));
    const B = Object.keys(th).filter((id) => !(id in mi));
    const D = A.filter((id) => qtyMax(mi[id]) >= 2);
    const union = new Set([...Object.keys(mi), ...Object.keys(th)]).size;
    const total = info.get(sid)?.cardCount?.total ?? 0;
    per.set(sid, { sid, mi, th, A, B, D, Cn: Math.max(0, total - union) });
  }
  const idSet = new Set(sets.map((s) => s.id));
  const grouped = new Map();
  for (const p of per.values()) {
    const gid = parentOf(p.sid, idSet);
    if (!grouped.has(gid)) grouped.set(gid, { sid: gid, parts: [] });
    grouped.get(gid).parts.push(p);
  }
  for (const g of grouped.values()) g.parts.sort((a, b) => (b.sid === g.sid) - (a.sid === g.sid));
  const sorted = [...grouped.values()].sort((a, b) => { const ia = order.indexOf(a.sid), ib = order.indexOf(b.sid); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); });
  const cnt = (tab, p) => (tab === 'C' ? p.Cn : p[tab].length);
  const countOf = (tab, g) => g.parts.reduce((s, p) => s + cnt(tab, p), 0);
  const sum = (tab) => sorted.reduce((s, g) => s + countOf(tab, g), 0);
  const setName = (sid) => info.get(sid)?.name || sid;

  let tab = 'A', selSet = '*';
  const heading = h('h2', { class: 'cmp-h' });
  const picker = h('select', { class: 'field', 'aria-label': 'Filtrer par extension' });
  const body = h('div', {});
  const tabBtns = {};
  const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Listes de comparaison' },
    Object.keys(CMP).map((k) => { tabBtns[k] = h('button', { type: 'button', class: 'tab', onclick: () => { tab = k; selSet = '*'; render(); } }); return tabBtns[k]; }));

  function render() {
    for (const k of Object.keys(CMP)) {
      tabBtns[k].setAttribute('aria-pressed', String(k === tab));
      tabBtns[k].replaceChildren(h('span', { class: 'tn' }, sum(k).toLocaleString('fr-FR')), h('span', { class: 'tl' }, CMP[k].short(f.name)));
    }
    const rows = sorted.filter((g) => countOf(tab, g) > 0);
    if (selSet !== '*' && !rows.some((g) => g.sid === selSet)) selSet = '*';
    picker.replaceChildren(h('option', { value: '*' }, `Toutes les extensions (${rows.length})`), ...rows.map((g) => h('option', { value: g.sid }, `${setName(g.sid)} (${countOf(tab, g)})`)));
    picker.value = selSet;
    const shown = selSet === '*' ? rows : rows.filter((g) => g.sid === selSet);
    const n = shown.reduce((s, g) => s + countOf(tab, g), 0);
    heading.textContent = `${CMP[tab].full(f.name)} : ${n.toLocaleString('fr-FR')}`;
    if (!rows.length) {
      body.replaceChildren(h('p', { class: 'empty' }, tab === 'C' ? 'Aucune carte restante à trouver dans les extensions connues.' : 'Aucune carte dans cette liste en ' + langLabel(L) + '.'));
      return;
    }
    const open = shown.length === 1;
    body.replaceChildren(...shown.map((g) => section(g, open)));
  }

  function section(g, open) {
    const n = countOf(tab, g);
    const content = h('div', { class: 'sec-body', hidden: !open });
    const head = h('button', { type: 'button', class: 'sec-head', 'aria-expanded': String(open) },
      h('span', { class: 'sn' }, setName(g.sid)), h('span', { class: 'sc' }, n.toLocaleString('fr-FR')), h('span', { class: 'chev', 'aria-hidden': 'true' }, open ? '⌄' : '›'));
    let loaded = false;
    const toggle = (force) => {
      const o = force ?? content.hidden;
      content.hidden = !o; head.setAttribute('aria-expanded', String(o)); head.lastChild.textContent = o ? '⌄' : '›';
      if (o && !loaded) { loaded = true; fillSection(g, content); }
    };
    head.addEventListener('click', () => toggle());
    const el = h('section', { class: 'sec' }, head, content);
    if (open) toggle(true);
    return el;
  }

  async function fillSection(g, content) {
    const myTab = tab;
    content.replaceChildren(spinner());
    const blocks = await Promise.all(g.parts.filter((p) => cnt(myTab, p) > 0).map((p) => partBlock(p, myTab, g.parts.length > 1)));
    if (my !== tok) return;
    content.replaceChildren(...blocks);
  }

  async function partBlock(p, myTab, titled) {
    let cards = [], failed = false;
    try { cards = (await api(`/${L}/sets/${encodeURIComponent(p.sid)}`)).cards || []; } catch { failed = true; }
    await Promise.all([scansReady, orderReady]); applyScans(cards); cards = sortCards(L, p.sid, cards);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const metaOf = (id) => (f.meta[L]?.[p.sid]?.[id]) || null;
    const fallback = (id) => { const m = metaOf(id); return { id, localId: m ? m[0] : id.slice(p.sid.length + 1), name: m ? m[1] : '' }; };
    const items = [];   // agrandissement (lecture seule) : mêmes cartes que la grille
    const mk = (card, q) => {
      const it = { card, name: card.name || '#' + card.localId, setName: setName(p.sid) };
      const idx = items.push(it) - 1;
      return viewTile(card, q, () => openLightbox(items, idx, L));
    };
    const notes = [];
    if (failed) notes.push(h('div', { class: 'note warn' }, 'Impossible de charger les images de cette extension (connexion ?). Les cartes sont listées par numéro.'));
    else if (!cards.length) notes.push(h('div', { class: 'note' }, 'TCGdex ne fournit pas les cartes de cette extension : pas d’images ni de noms.'));
    let tiles;
    if (myTab === 'C') {
      const known = new Set([...Object.keys(p.mi), ...Object.keys(p.th)]);
      const rest = cards.filter((c) => !known.has(c.id));
      tiles = rest.map((c) => mk(c, 0));
      if (!cards.length) notes.push(h('div', { class: 'note' }, `D’après le total annoncé, il reste environ ${plural(p.Cn, 'carte', 'cartes')} que personne n’a, mais la liste détaillée est indisponible.`));
      else if (cards.length !== rest.length + known.size && rest.length !== p.Cn) notes.push(h('div', { class: 'note' }, `TCGdex ne fournit que ${cards.length} cartes pour cette extension : la liste peut différer du compteur (${p.Cn}).`));
    } else {
      const idsList = myTab === 'A' ? p.A : myTab === 'B' ? p.B : p.D;
      const qtyOf = (id) => qtyTotal(myTab === 'B' ? p.th[id] : p.mi[id]);
      const pos = new Map(cards.map((c, i) => [c.id, i]));
      tiles = idsList.slice().sort((a, b) => (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9)).map((id) => mk(byId.get(id) || fallback(id), qtyOf(id)));
    }
    return h('div', { class: 'part-block' },
      titled && h('h3', { class: 'sub' }, `${setName(p.sid)} · ${cnt(myTab, p).toLocaleString('fr-FR')}`),
      ...notes, tiles.length ? h('div', { class: 'cards' }, tiles) : h('p', { class: 'empty' }, 'Rien à afficher.'));
  }

  picker.addEventListener('change', () => { selSet = picker.value; render(); });

  const fl = f.owned[L];
  const friendLangCount = ownedIn(f.owned, L);
  main.replaceChildren(
    privacyNote(),
    h('p', { class: 'meta' }, `Données de ${f.name} : version du ${f.date ? fmtDate(f.date) : 'date inconnue'}, importée le ${f.imported ? fmtDate(f.imported) : '?'}. `, `En ${langLabel(L)}, ${f.name} a ${plural(friendLangCount, 'carte cochée', 'cartes cochées')} et vous ${plural(ownedTotal(L), 'carte', 'cartes')}.`),
    friendLangCount === 0 ? h('div', { class: 'note warn' }, `${f.name} n’a aucune carte en ${langLabel(L)} dans sa dernière version : demandez-lui une version à jour.`) : '',
    tabs, h('label', { class: 'lbl' }, 'Extension', picker), heading, body);
  render();
}

/* ---------- Écran d'ouverture (au lancement seulement, désactivable) ---------- */
const splash = document.getElementById('splash');
const splashOn = () => store.get(K.splash) !== 'off';
let splashBusy = false, splashDownAt = 0, splashTimer;

function hideSplash() {
  clearTimeout(splashTimer);
  splash.classList.add('gone'); splash.classList.remove('leaving', 'pressed'); splash.setAttribute('aria-hidden', 'true');
  splashBusy = false;
}
function showSplash() { // « Revoir l'écran d'ouverture » depuis les réglages
  clearTimeout(splashTimer);
  splash.classList.remove('gone', 'leaving', 'pressed'); splash.removeAttribute('aria-hidden'); splashBusy = false;
  try { splash.focus({ preventScroll: true }); } catch { /* ignoré */ }
}
function enterApp() {
  if (splashBusy || splash.classList.contains('gone')) return;
  splashBusy = true;
  const wait = Math.max(0, 140 - (performance.now() - splashDownAt)); // l'animation de pression reste visible même sur un appui bref
  splash.classList.add('pressed');
  setTimeout(() => {
    splash.classList.remove('pressed'); splash.classList.add('leaving');
    splashTimer = setTimeout(hideSplash, 950);
  }, wait);
}
function splashSetup() {
  if (!splash) return;
  const press = (on) => { if (!splashBusy) splash.classList.toggle('pressed', on); };
  splash.addEventListener('pointerdown', () => { splashDownAt = performance.now(); press(true); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => splash.addEventListener(t, () => press(false)));
  splash.addEventListener('click', enterApp);
  splash.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterApp(); } });
  if (splashOn()) { try { splash.focus({ preventScroll: true }); } catch { /* ignoré */ } } else splash.classList.add('gone');
}

/* ---------- Réglages ---------- */
const APP_VERSION = 'v93';      // même numéro que le cache de sw.js (« shell-v82 ») : à augmenter ensemble à chaque publication
function openSettings() {
  const verEl = h('p', { class: 'lb-help' }, 'Version de l’application : …');
  verEl.textContent = 'Version de l’application : ' + APP_VERSION;
  if (window.caches) caches.keys().then((ks) => { const v = ks.find((k) => /^shell-v\d+$/.test(k)); if (v && v !== 'shell-' + APP_VERSION) verEl.textContent += ' — mise à jour du cache en attente (' + v.replace('shell-', '') + ') : fermez complètement l’application et rouvrez-la.'; }).catch(() => {});
  const sw = h('input', { type: 'checkbox', role: 'switch', 'aria-label': 'Afficher l’écran d’ouverture au lancement' });
  sw.checked = splashOn();
  sw.addEventListener('change', () => {
    store.set(K.splash, sw.checked ? 'on' : 'off');
    document.documentElement.classList.toggle('no-splash', !sw.checked);
    toast(sw.checked ? 'Écran d’ouverture activé' : 'Écran d’ouverture désactivé');
  });
  openSheet(
    h('h2', {}, 'Réglages'),
    h('label', { class: 'switch' },
      h('span', {}, h('span', { class: 'st' }, 'Écran d’ouverture'), h('span', { class: 'sd' }, 'Affiche le logo et « Touchez pour entrer » à chaque lancement de l’application.')), sw),
    h('button', { class: 'btn sec', type: 'button', onclick: () => { closeSheet(); document.documentElement.classList.remove('no-splash'); showSplash(); } }, '▶︎ Revoir l’écran d’ouverture'),
    verEl,
    h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Fermer'));
}

/* ---------- Démarrage ---------- */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) toast('Mise à jour installée : rechargez la page pour l’utiliser.'); });
}
if (!location.hash) history.replaceState(null, '', '#' + lang);
splashSetup();
route();
window.__appReady = true;
setTimeout(() => { try { loader.preload(); } catch { /* ignoré */ } }, 2500);      // la vidéo de chargement se télécharge en arrière-plan
