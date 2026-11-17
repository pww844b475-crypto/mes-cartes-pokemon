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
  meta: 'cartes.setmeta', blocks: 'cartes.blocks', prices: 'cartes.prices', ebay: 'cartes.ebay', cmslug: 'cartes.cmslug5', view: 'cartes.view', setview: 'cartes.setview',
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
function sortCards(L, setId, cards) {
  const o = orders[L] && orders[L][setId];
  if (!o) return cards;
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
async function loadSets(L) {
  const [all, dig] = await Promise.all([api(`/${L}/sets`), digitalIds(L)]);
  const sets = all.filter((s) => !dig.has(s.id));
  return { sets, hidden: all.length - sets.length };
}
const isDigital = (l, sid) => !!(digital[l] && digital[l].has(sid));

/* ---------- Images à la demande ---------- */
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); en.target.src = en.target.dataset.src; }
  }, { rootMargin: '400px' })
  : null;

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
  if (parts[0] === 'chercher') return { view: 'search', own: parts[1] === 'own', rar: parts[2] || '' };
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
  'cel25cc': 'cel25', '30th-c': '30th', 'exu': 'ex10',      // exu : Collection Zarbi (A/28 … ?/28), cartes secrètes d'EX Forces Cachées
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
async function fetchPrice(L, id) {
  const path = `/${L}/cards/${encodeURIComponent(id)}`;
  let c = null;
  try { const d = await api(path); mem.delete(path); c = d.pricing && d.pricing.cardmarket; } catch (e) { if (!/HTTP 404/.test(e.message || '')) throw e; }
  priceCache[id] = c ? [numOrNull(c.trend) ?? numOrNull(c.avg) ?? numOrNull(c.low), numOrNull(c['trend-holo']) ?? numOrNull(c['avg-holo']) ?? numOrNull(c['low-holo']), Date.now(), numOrNull(c.idProduct)] : [null, null, Date.now(), null];   // [prix, prix holo, date, identifiant produit Cardmarket]
}
// Prix Cardmarket de la fiche : « tendance » = tirage normal de la carte (y compris une carte Holo), « tendance holo » = tirage Reverse.
// Version Reverse → prix reverse (repli : prix normal) ; toute autre version (Normal, Holo…) → prix normal (repli : prix reverse).
const cmUnit = (e, key) => ((key && /^reverse(\/|$)/.test(key)) ? (e[1] ?? e[0]) : (e[0] ?? e[1]));
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
const unitPrice = (e, key, id) => blend(id, e ? cmUnit(e, key) : null);
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
  const ids = [...new Set(rows.filter(isValued).map((r) => r.id))].filter((id) => refresh || !priceCache[id]);
  let done = 0, i = 0;
  const worker = async () => {
    while (i < ids.length) {
      const id = ids[i++];
      try { await fetchPrice(L, id); } catch { /* hors ligne : réessayé plus tard */ }
      done++; if (done % 25 === 0) savePrices();
      if (onProgress) onProgress(done, ids.length);
    }
  };
  if (ids.length) await Promise.all(Array.from({ length: 5 }, worker));
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
  const vo = h('input', { type: 'checkbox', checked: valueOnly(), 'aria-label': 'Estimer seulement les cartes de valeur' });
  vo.addEventListener('change', () => { store.set('cartes.valueOnly', vo.checked ? '1' : '0'); closeSheet(); if (onToggle) onToggle(); });
  openSheet(
    h('h2', {}, 'Mes cartes possédées'),
    rows.length ? h('p', {}, 'Cochez les raretés à additionner. Touchez › pour voir les cartes d’une rareté.') : h('p', {}, 'Vous ne possédez encore aucune carte.'),
    h('div', { class: 'orows' }, rowsEl), totalEl, ...notes,
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
async function ensureCmSlug(id) {
  if (cmSlugs[id] || cmStatic[id]) return;
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
  const doubt = !CM_VERIFIED.has(own) && (top !== own || grp !== '' || CM_PROMO_SERIES.has(serie) || /promo|black star/i.test(setName || '') || serie === 'ex' || /[&:]/.test(setName || '')) ? '?' : '';
  if (grp === '*') {                                                   // Zarbi : « A/28 »
    const ch = slugCm(lidShow(d.localId)); if (!ch) return;            // « ? » et « ! » : pas d'adresse connue → recherche
    const total = (sd.cards || []).filter((x) => numGroup(x.localId) === '*').length;
    cmSlugs[id] = `${setS}/${nameS}-${ch}-${abbrS}${ch}-${total}${doubt}`;
  } else {
    // série e-Card (Aquapolis, Skyridge) : les cartes H sont imprimées « H1 », « H29 » (TCGdex écrit « H01 ») → …-AQH1, …-AQH29
    const lid0 = lidShow(d.localId), lm0 = serie === 'ecard' && lid0.match(/^([A-Za-z]+)0*(\d+)$/);
    const numS = lm0 ? slugCm(lm0[1] + lm0[2]) : slugCm(d.localId); if (!numS) return;
    const same = (sd.cards || []).filter((x) => slugCm(x.name) === nameS);
    if (same.length > 1) {
      same.sort((a, b) => ((numGroup(a.localId) === '') - (numGroup(b.localId) === '')) || lidShow(a.localId).localeCompare(lidShow(b.localId), 'en', { numeric: true }));
      const k = same.findIndex((x) => x.id === id); if (k >= 0) nameS += `-V${k + 1}`;
    }
    cmSlugs[id] = `${setS}/${nameS}-${abbrS}${numS}${doubt}`;
  }
  store.set(K.cmslug, JSON.stringify(cmSlugs));
}

/* ---------- Vue : liste des extensions, par blocs ---------- */
async function showList(my) {
  const L = lang;
  const q = h('input', { class: 'search', type: 'search', placeholder: 'Rechercher une extension…', 'aria-label': 'Rechercher une extension', enterkeyhint: 'search', autocomplete: 'off' });
  const top = h('header', { class: 'top' },
    h('div', { class: 'row' }, h('h1', { class: 'brand' }, h('img', { src: 'icons/logo-banner.webp', alt: '', width: 1000, height: 251, decoding: 'async', draggable: 'false' }), h('span', { class: 'sr' }, 'Pijakollection'))),
    langSwitch(L, (id) => { listScroll = 0; go(id); }), q);
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
    const logoUrl = s.logo ? s.logo + '.webp' : s.symbol ? s.symbol + '.webp' : null;
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
  const mineBtn = h('button', { type: 'button', class: 'mine mtile', 'aria-label': 'Mes cartes possédées', onclick: () => openOwned(L, valRows, () => recalc(false)) }, h('span', { class: 'mi' }, '🃏'), h('span', { class: 'ml' }, 'Mes cartes'), h('b', { class: 'mn' }, '0'));
  const valNum = h('b', { class: 'vv' }, '…'), valSub = h('span', { class: 'vs' });
  const refreshBtn = h('button', { type: 'button', class: 'tbtn2', 'aria-label': 'Actualiser les prix', title: 'Actualiser les prix', onclick: () => recalc(true) }, '⟳');
  const valbox = h('div', { class: 'valbox' }, h('button', { type: 'button', class: 'vt', 'aria-label': 'Détail de la valeur par rareté', onclick: () => openOwned(L, valRows, () => recalc(false)) }, h('span', { class: 'vl' }, 'Valeur estimée'), valNum, valSub), refreshBtn);
  const paint = (prog) => {
    const sm = summarize(valRows);
    mineBtn.querySelector('.mn').textContent = String(sm.cards);
    valNum.textContent = eur(sm.total);
    valSub.textContent = prog ? `Calcul des prix… ${prog}` : sm.pending ? 'Prix indisponibles pour le moment (connexion ?)' : `${valueOnly() ? 'Cartes de valeur · ' : ''}Cardmarket · tendance · tous vendeurs${sm.oldest ? ' · relevé le ' + new Date(sm.oldest).toLocaleDateString('fr-FR') : ''}`;
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
    } finally { busy = false; if (my === tok) paint(); }
  }
  // statistiques de la collection
  function openStats() {
    const sm = summarize(valRows);
    const haveAll = secs.reduce((n, x) => n + x.have, 0), totAll = secs.reduce((n, x) => n + x.total, 0);
    const done = blocks.flatMap((b) => b.items).filter((g) => { const t = groupTotal(g); return t > 0 && g.members.reduce((n, m) => n + ownedCount(L, m.id), 0) >= t; }).length;
    const dbl = blocks.flatMap((b) => b.items).reduce((n, g) => n + g.members.reduce((k, m) => k + doublesCount(owned[L][m.id]), 0), 0);
    openSheet(
      h('h2', {}, 'Statistiques'),
      h('p', { class: 'owned-total' }, h('b', {}, plural(haveAll, 'carte possédée', 'cartes possédées')), ` sur ${totAll.toLocaleString('fr-FR')} · ${pctOf(haveAll, totAll)} %`),
      h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${pctOf(haveAll, totAll)}%` })),
      h('ul', { class: 'stats' },
        h('li', {}, `${plural(sm.copies, 'exemplaire', 'exemplaires')} au total`),
        h('li', {}, `${plural(dbl, 'carte en double', 'cartes en double')} (2 exemplaires ou plus d’une version)`),
        h('li', {}, `${plural(done, 'extension complète', 'extensions complètes')}`),
        h('li', {}, `Valeur estimée : ${eur(sm.total)}`)),
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
    mtile('📷', 'Scanner', 'Scanner une carte avec l’appareil photo', () => homeScanIn.click()),
    homeScanIn,
    mtile('📊', 'Statistiques', 'Statistiques de la collection', openStats),
    mtile('🔎', 'Rechercher', 'Rechercher des cartes dans toute la collection', goto('#chercher')),
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
  main.replaceChildren(...notes, askSlot, menu, valbox, colhead, ...secs.map((x) => x.el), none);
  main.classList.toggle('setgrid', setView === 'grille');
  recalc(false);

  q.addEventListener('input', () => {
    const n = norm(q.value.trim()); let shown = 0;
    for (const x of secs) {
      let m = 0;
      for (const li of x.rows) { const ok = !n || li._name.includes(n); li.hidden = !ok; if (ok) m++; }
      if (x.subEls) for (const sub of x.subEls) { const any = [...sub.list.children].some((li) => !li.hidden); sub.head.hidden = sub.list.hidden = !any; }
      x.el.hidden = !!n && !m;
      x.body.hidden = n ? !m : !openState[x.b.id];                 // pendant une recherche : les blocs concernés s'ouvrent
      x.head.setAttribute('aria-expanded', String(!x.body.hidden));
      shown += m;
    }
    none.hidden = shown > 0;
  });
  if (listScroll) requestAnimationFrame(() => scrollTo(0, listScroll));
}

/* ---------- Vue : cartes d'une extension (avec ses extensions liées) ---------- */
async function showSet(L, setId, my) {
  const back = h('button', { class: 'iconbtn', type: 'button', onclick: () => go(L), 'aria-label': 'Retour aux extensions' }, '‹ Extensions');
  const title = h('h1', {}, setId);
  const q = h('input', { class: 'search', type: 'search', placeholder: 'Nom ou numéro de carte…', 'aria-label': 'Rechercher une carte', enterkeyhint: 'search', autocomplete: 'off' });
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
  let selMode = false;
  const picked = new Set();
  const visible = () => tiles.filter((x) => !x.el.hidden && !x.el.closest('[hidden]'));
  const pickedVisible = () => visible().filter((x) => picked.has(x));
  const zoom = (t) => {
    if (selMode) { togglePick(t); return; }          // en mode sélection, toucher la photo sélectionne la carte
    const vis = visible();
    openLightbox(vis, Math.max(0, vis.indexOf(t)), L);
  };
  const sections = parts.map((part) => {
    const ptot = prefixTotals(part.cards);
    const pt = part.cards.map((c) => makeTile(c, part.mine, persist(part), { info: part.info, setName: part.name, zoom, prefixTotals: ptot }));
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
    selMode = on; selBtn.setAttribute('aria-pressed', String(selMode)); selBar.hidden = !selMode; main.classList.toggle('selecting', selMode);
    if (!selMode) { picked.forEach((t) => t.el.classList.remove('picked')); picked.clear(); }
    updateSel();
  }
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
      selBtn,
      h('button', { type: 'button', class: 'tbtn wide', 'aria-label': 'Ajout groupé', onclick: openBulk }, '➕ Ajout groupé')),
    selBar);

  // --- en-tête de l'extension : logo, date, avancement, détail par rareté ; onglets Cartes / Liste / Grille ---
  const meta0 = setMeta(parts[0].id) || [];
  const logoBox = h('div', { class: 'sc-logo' });
  { const lu = parts[0].data && parts[0].data.logo ? parts[0].data.logo + '.webp' : null; const ph = () => logoBox.replaceChildren(h('span', { class: 'ph' }, meta0[2] || parts[0].id)); if (lu) logoBox.append(lazyImg(lu, '', ph)); else ph(); }
  const rbk = h('div', { class: 'rbk', role: 'group', 'aria-label': 'Avancement par rareté' });
  function paintRbk() {
    rbk.replaceChildren(...rarList.map((r) => {
      const ts = tiles.filter((t) => t.info && t.info.rar === r), have = ts.filter((t) => qtyTotal(t.mine[t.card.id]) > 0).length;
      return h('button', { type: 'button', class: 'rbkc' + (rarFilter === r ? ' on' : ''), 'aria-pressed': String(rarFilter === r), title: `${r} : ${have} sur ${ts.length}`,
        onclick: () => { rarFilter = rarFilter === r ? '' : r; rarSel.value = rarFilter; apply(); } },
        h('span', { class: 'rdot rt-' + rarityTier(r) }), h('b', {}, String(have)), h('span', { class: 'rt' }, '/' + ts.length), h('span', { class: 'rn' }, r));
    }));
    rbk.hidden = !rarList.length;
  }
  const fmtD = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR'); };
  const setcard = h('section', { class: 'setcard' },
    h('div', { class: 'sc-top' }, logoBox, h('div', { class: 'sc-info' }, h('h2', {}, parts[0].name), meta0[1] ? h('p', {}, 'Date de sortie : ' + fmtD(meta0[1])) : null, meta0[2] ? h('span', { class: 'sc-abbr' }, meta0[2]) : null)),
    progress, rbk);
  let view = ['cartes', 'liste', 'grille'].includes(store.get(K.view)) ? store.get(K.view) : 'grille';
  const VIEWS = [['cartes', 'Cartes'], ['liste', 'Liste'], ['grille', 'Grille']];
  const applyView = () => { VIEWS.forEach(([k]) => main.classList.toggle('view-' + k, k === view)); viewBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(VIEWS[i][0] === view))); };
  const viewBtns = VIEWS.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(k === view), onclick: () => { view = k; store.set(K.view, k); applyView(); } }, l));
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
    paintRbk();
  }
  q.addEventListener('input', apply);
  apply(); applyView();
  main.replaceChildren(...notes, setcard, viewSeg, ...sections.map((x) => x.el), none);
  priceTiles(L, tiles, my);
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
      cards.push({ id, localId: lid, name: nm, image: !noImg && serie ? `https://assets.tcgdex.net/${L}/${serie}/${sid}/${lid}` : null });
    }
    applyScans(cards);
    for (const c of cards) {
      const i = info.get(c.id) || null;
      recs.push({ card: c, sid, gid, setName: m.name || sid, info: i, text: norm(`${c.name} ${lidShow(c.localId)} ${c.id}`) });
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
async function getOcr() {
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
  const abs = (p) => new URL(p, location.href).href;
  ocrWorker = await Tesseract.createWorker('fra', 1, { workerPath: abs('vendor/tesseract/worker.min.js'), corePath: abs('vendor/tesseract/core'), langPath: abs('vendor/tesseract/lang') });
  return ocrWorker;
}
async function photoCanvases(file) { // photo entière (réduite), bande du bas (numéro) et bandes du haut (nom), agrandies
  const bmp = await createImageBitmap(file);
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
async function ocrPhoto(file) {
  const w = await getOcr(), cs = await photoCanvases(file); let text = '';
  await w.setParameters({ tessedit_pageseg_mode: '6' });
  for (const c of cs) text += '\n' + (await w.recognize(c)).data.text;      // page, numéro (bas), nom (haut, deux hauteurs)
  return text;
}
function parseCardText(text) {
  const t = text.replace(/[Il|]/g, '1').toUpperCase();
  const nums = [...t.matchAll(/(^|[^A-Z])([A-Z]{0,3})\s?(\d{1,3})\s*[\/\\]\s*([A-Z]{0,3})\s?(\d{2,3})/g)].map((m) => ({ pre: m[2], n: parseInt(m[3], 10), tpre: m[4], total: parseInt(m[5], 10) }));   // le préfixe (H, TG, GG, SV…) ne doit pas être la fin d'un mot
  const pick = nums.find((x) => x.n > 0 && x.total >= 10 && x.n <= x.total + 40 && (x.pre === x.tpre || !x.tpre)) || null;
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
  const lm = (r) => String(r.card.localId).match(/^([A-Za-z]*)0*(\d+)$/);
  const rate = (r, sc) => {
    const m = lm(r);        // « H01 » → groupe H, numéro 1 ; « 1 » → groupe vide, numéro 1
    const numHit = p.n != null && !!m && m[1].toUpperCase() === (p.tpre ? p.pre : '') && parseInt(m[2], 10) === p.n;   // total sans lettre (« 103/130 ») : carte à numéro simple ; lettres parasites avant le numéro ignorées
    const chHit = !!p.ch && lidShow(r.card.localId).toUpperCase() === p.ch;
    const totHit = chHit ? (idx.prefix.get(r.sid) && idx.prefix.get(r.sid).get('*')) === p.chTotal : p.total != null && (p.tpre ? (idx.prefix.get(r.sid) && idx.prefix.get(r.sid).get(p.tpre)) === p.total : idx.official.get(r.sid) === p.total);
    out.push({ id: r.card.id, score: sc + ((numHit || chHit) ? 200 : 0) + (totHit ? 40 : 0), numHit: numHit || chHit });
  };
  for (const r of idx.recs) {
    const full = norm(r.card.name).replace(/[^a-z0-9]+/g, ' ').trim();
    const base = full.split(' ').filter((w) => w !== 'mega')[0] || '';       // « Mentali-GX » → « mentali » (le suffixe est souvent mal lu)
    if (full.length >= 5 && p.norm.includes(' ' + full + ' ')) rate(r, 100 + full.length);
    else if (base.length >= 5 && p.norm.includes(' ' + base + ' ')) rate(r, base.length);
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
  const best = out.some((x) => x.numHit) ? out.filter((x) => x.numHit) : out;
  return best.map((x, i) => [x, i]).sort((a, b) => b[0].score - a[0].score || a[1] - b[1]).slice(0, 60).map(([x]) => x.id);   // à score égal : extension la plus récente d'abord
}

async function showSearch(L, my, preset = {}) {
  const back = h('button', { class: 'iconbtn', type: 'button', onclick: () => go(L), 'aria-label': 'Retour aux extensions' }, '‹ Extensions');
  const q = h('input', { class: 'search', type: 'search', placeholder: 'Nom ou numéro de carte…', 'aria-label': 'Rechercher une carte dans toute la collection', enterkeyhint: 'search', autocomplete: 'off' });
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
  const f = { own: preset.own ? 'own' : 'all', gid: '', rar: preset.rar && idx.rars.has(preset.rar) ? preset.rar : '', ver: '', ids: null, rank: null };
  const POSS = [['all', 'Toutes'], ['own', 'Possédées'], ['miss', 'Manquantes'], ['dbl', 'Doubles']];
  const gname = new Map(); for (const b of idx.blocks) for (const g of b.items) gname.set(g.id, g.set.name || g.id);
  const rarList = [...idx.rars.keys()].sort((a, b) => rarityRank(a) - rarityRank(b) || a.localeCompare(b, 'fr'));
  const verList = [...idx.vers.entries()].sort((a, b) => b[1].n - a[1].n);
  const activeCount = () => (f.own !== 'all') + !!f.gid + !!f.rar + !!f.ver + !!f.ids;

  const match = (r, n) => {
    if (f.ids && !f.ids.has(r.card.id)) return false;
    if (f.gid && r.gid !== f.gid) return false;
    if (n && !r.text.includes(n)) return false;
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
  const mk = (r) => {
    const t = makeTile(r.card, mines.get(r.sid), () => { persist(r.sid); t.el.hidden = !match(r, needle); updateSummary(); }, { info: idx.infos.get(r.sid), setName: r.setName, zoom, prefixTotals: idx.prefix.get(r.sid) });
    t.el.querySelector('.nm').after(h('span', { class: 'setlbl' }, r.setName));
    tiles.push(t); return t;
  };
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
    const n = activeCount(); filterBtn.querySelector('.nb').textContent = String(n); filterBtn.querySelector('.nb').hidden = !n;
  }
  function run() {
    needle = norm(q.value.trim());
    const idle = !needle && !activeCount();
    matches = idle ? [] : idx.recs.filter((r) => match(r, needle));
    if (f.rank) matches.sort((a, b) => f.rank.get(a.card.id) - f.rank.get(b.card.id));
    tiles.length = 0; grid.replaceChildren(); shown = 0; more();
    none.hidden = idle || matches.length > 0; none.textContent = 'Aucune carte ne correspond.';
    updateChips(); updateSummary(); if (sheetSync) sheetSync();
  }

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
  const scanBtn = h('button', { type: 'button', class: 'tbtn', 'aria-label': 'Scanner une carte avec l’appareil photo', title: 'Scanner une carte', onclick: () => scanIn.click() }, '📷 Scanner');
  async function runScan(file) {
    scanBtn.disabled = true; summary.textContent = 'Analyse de la photo… (la première fois, quelques secondes)';
    try {
      const text = await ocrPhoto(file); if (my !== tok) return;
      const ids = matchScan(idx, parseCardText(text));
      if (!ids.length) { f.ids = f.rank = null; run(); toast('Carte non reconnue. Photo de face, bien éclairée, nom et numéro lisibles ; ou tapez son nom.'); }
      else {
        q.value = ''; f.ids = new Set(ids); f.rank = new Map(ids.map((id, i) => [id, i])); run();
        if (matches.length === 1 && tiles[0]) zoom(tiles[0]);          // une seule carte : on l'ouvre avec son prix
        else toast(plural(ids.length, 'carte trouvée', 'cartes trouvées') + ' : touchez la bonne, son prix s’affiche.');
      }
    } catch (e) { run(); toast('Scan impossible : ' + (e && e.message ? e.message : 'erreur')); } finally { scanBtn.disabled = false; }
  }
  scanIn.addEventListener('change', () => { const file = scanIn.files[0]; scanIn.value = ''; if (file) runScan(file); });
  top.append(h('div', { class: 'tools2' }, filterBtn, scanBtn, scanIn), chips);

  let timer = null;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  moreBtn.addEventListener('click', more);
  main.replaceChildren(summary, grid, moreBtn, none);
  run();
  if (pendingScan) { const file = pendingScan; pendingScan = null; history.replaceState(null, '', '#chercher'); runScan(file); }
}

/* ---------- Rareté et versions de chaque carte (français) ---------- */
// data/cards/<extension>.json : { rar:[raretés], var:[[type, taille, foil, sous-type, [tampons]]…], c:{ idCarte:[indexRareté,[indexVersions]] } }
// Instantané de TCGdex ; une carte absente (nouvelle) est demandée en direct à l'agrandissement.
const infoCache = new Map();
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
      if (j && j.c) for (const [id, [ri, vi]] of Object.entries(j.c)) m.set(id, { rar: ri >= 0 ? j.rar[ri] : null, vars: withKeys(vi.map((i) => descOf(j.var[i]))) });
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
  return { rar: d.rarity || null, vars: withKeys(vars) };
}
// Niveaux de rareté (pour les couleurs et l'ordre du filtre) : modifiable ici. Une rareté inconnue (nouvelle sortie) est classée d'après son nom.
const RARITY_TIER = {
  'Commune': 'commune', 'Peu Commune': 'peu', 'Rare': 'rare', 'Sans Rareté': 'aucune', 'Promo': 'promo', 'Collection Classique': 'promo',
  'Holo Rare': 'holo', 'Rare Holo': 'holo', 'Rare Holo LV.X': 'holo', 'Rare Prime': 'holo', 'LÉGENDE': 'holo', 'HIGH-TECH rare': 'holo', 'Radieux Rare': 'holo',
  'Pikachu Rare': 'holo', 'Magnifique rare': 'holo', 'Magnifique': 'holo', 'Rare Noir Blanc': 'holo', 'Futuristic Rare': 'holo',
  'Ultra Rare': 'ultra', 'Holo Rare V': 'ultra', 'Holo Rare VMAX': 'ultra', 'Holo Rare VSTAR': 'ultra', 'Double rare': 'ultra', 'Dresseur Full Art': 'ultra',
  'Shiny rare': 'ultra', 'Shiny rare V': 'ultra', 'Shiny rare VMAX': 'ultra', 'Chromatique ultra rare': 'ultra', 'Mega Attack Rare': 'ultra', 'RGB Rare': 'ultra',
  'Illustration rare': 'secrete', 'Illustration spéciale rare': 'secrete', 'Hyper rare': 'secrete', 'Méga Hyper Rare': 'secrete',
};
const TIER_ORDER = ['commune', 'peu', 'rare', 'holo', 'ultra', 'secrete', 'promo', 'aucune'];
const rarityTier = (r) => RARITY_TIER[r] || (/ultra|vmax|vstar|full art|hyper|illustration/i.test(r || '') ? 'ultra' : 'holo');
const rarityRank = (r) => TIER_ORDER.indexOf(rarityTier(r));
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
    el, card, mine, id, name, setName: ctx.setName, numLabel, text: '',
    get info() { return info; },
    setInfo(i) { info = i; build(); sync(); },
    get value() { return mine[id]; },
    paintPrice() { const e = priceCache[id], u = blend(id, e ? (e[0] ?? e[1]) : null); price.hidden = u == null; if (u != null) price.textContent = '≈ ' + eur(u); },
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
    const upd = () => { const eb = ebayAvg(id); const e = priceCache[id]; const cm = e ? (e[0] ?? e[1]) : null;
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
  function cmUrl(it) {
    const F = 'language=2&sellerCountry=12&minCondition=2', slug = cmStatic[it.card.id] || (cmSlugs[it.card.id] || '').replace(/\?$/, '');
    return slug ? `https://www.cardmarket.com/fr/Pokemon/Products/Singles/${slug}?${F}` : 'https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=' + encodeURIComponent([it.name, lidShow(it.card.localId).replace(/[^A-Za-z0-9]/g, '')].filter(Boolean).join(' ')) + '&' + F;
  }
  function paintLinks(it) {
    const c = it.card, term = [it.name, lidShow(c.localId).replace(/[^A-Za-z0-9]/g, '')].filter(Boolean).join(' ');
    linksEl.replaceChildren(
      h('a', { href: 'https://www.ebay.fr/sch/i.html?_nkw=' + encodeURIComponent(term) + '&LH_Sold=1&LH_Complete=1&LH_PrefLoc=1', target: '_blank', rel: 'noopener noreferrer' }, 'Ventes terminées sur eBay.fr ↗'),
      ' · ',
      h('a', { href: cmUrl(it), target: '_blank', rel: 'noopener noreferrer' }, 'Cardmarket (carte française, vendeurs France, NM) ↗'),
      /\?$/.test(cmSlugs[it.card.id] || '') && !cmStatic[it.card.id] ? h('span', { class: 'lb-help' }, ' Adresse déduite, non vérifiée : si la page est introuvable, signalez-le.') : null);
  }
  function show() {
    const it = items[i], c = it.card, info = infoOf(it);
    paintPrice(it); paintLinks(it); paintEbay(it);
    if (L === 'fr' && !cmSlugs[c.id] && !cmStatic[c.id]) ensureCmSlug(c.id).then(() => { if (items[i] === it && lb) paintLinks(it); }).catch(() => {});
    if (!priceCache[c.id] && L === 'fr') fetchPrice(L, c.id).then(() => { savePrices(); if (items[i] === it && lb) paintPrice(it); }).catch(() => { if (items[i] === it && lb) priceEl.textContent = 'Prix indisponible pour le moment.'; });
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
  stageBox.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  stageBox.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 55) go2(dx < 0 ? 1 : -1); }, { passive: true });
  lb = { el, onKey, opener };
  document.body.append(el); document.documentElement.classList.add('lb-open');
  show(); try { close.focus({ preventScroll: true }); } catch { /* ignoré */ }
}

/* ---------- Fenêtres ---------- */
function closeSheet() { document.querySelector('.overlay')?.remove(); }
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
function openSettings() {
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
