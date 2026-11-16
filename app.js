'use strict';
/* Mes cartes Pokémon — application statique, données TCGdex (api.tcgdex.net). */

const API = 'https://api.tcgdex.net/v2';
const LANGS = [
  { id: 'fr', label: 'Français' },
  { id: 'zh-cn', label: '简体中文' },
  { id: 'ja', label: '日本語' },
];
const LANG_IDS = LANGS.map((l) => l.id);
const langLabel = (id) => LANGS.find((x) => x.id === id)?.label || id;
const langAttr = (id) => (id === 'zh-cn' ? 'zh-CN' : id);
const K = {
  owned: 'cartes.v1',       // ancien format (listes d'identifiants) — conservé tel quel, jamais supprimé
  owned2: 'cartes.v2',      // format actuel (identifiant → quantité)
  lang: 'cartes.lang', cov: 'cartes.cov', exp: 'cartes.lastExport', tip: 'cartes.tipHidden', order: 'cartes.order',
  friends: 'cartes.friends.v1', pseudo: 'cartes.pseudo',
};
const BACKUP_VERSION = 2;   // sauvegarde personnelle
const SHARE_VERSION = 1;    // fichier de partage entre amis
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
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- Collection : owned[langue][extension][id de carte] = quantité ---------- */
function emptyOwned() { return { fr: nullObj(), 'zh-cn': nullObj(), ja: nullObj() }; }

// Accepte l'ancien format (tableaux d'identifiants → quantité 1) et le nouveau (objets id → quantité).
function sanitizeOwned(o) {
  const r = emptyOwned();
  let budget = 200000;
  for (const l of LANG_IDS) {
    const sets = o && typeof o === 'object' ? o[l] : null;
    if (!sets || typeof sets !== 'object') continue;
    for (const [sid, val] of Object.entries(sets)) {
      if (sid.length > 80 || !val || typeof val !== 'object') continue;
      const m = nullObj();
      const entries = Array.isArray(val) ? val.map((id) => [id, 1]) : Object.entries(val);
      for (const [id, q] of entries) {
        if (budget-- <= 0) break;
        if (typeof id !== 'string' || !id || id.length > 80) continue;
        const n = Math.min(MAXQ, Math.floor(Number(q)));
        if (n >= 1) m[id] = n;
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
  for (const l of LANG_IDS) {
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
const ownedTotal = (l) => Object.values(owned[l]).reduce((n, m) => n + countKeys(m), 0);
const doublesCount = (m) => Object.values(m || {}).filter((q) => q >= 2).length;

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
function dataStatus(l, set) {
  const c = coverage(l, set.id);
  if (!c) return null;
  const total = set.cardCount?.total ?? 0;
  const [n, img] = c;
  if (n === 0) return { lvl: 'bad', txt: 'Cartes indisponibles dans TCGdex' };
  if (n < total) return { lvl: 'warn', txt: `Incomplète : ${n} cartes sur ${total}` };
  if (img === 0) return { lvl: 'info', txt: 'Aucune image disponible' };
  if (img < n) return { lvl: 'info', txt: `Images : ${img} sur ${n}` };
  return null;
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

/* ---------- Routage : #fr · #fr/SV7a · #amis · #comparer/<ami>/<langue> ---------- */
let lang = LANG_IDS.includes(store.get(K.lang)) ? store.get(K.lang) : 'fr';
let tok = 0;
let listScroll = 0;

function parseHash() {
  let parts;
  try { parts = decodeURIComponent(location.hash.slice(1)).split('/'); } catch { parts = []; }
  if (parts[0] === 'amis') return { view: 'friends' };
  if (parts[0] === 'comparer') return { view: 'compare', fid: parts[1] || '', lang: LANG_IDS.includes(parts[2]) ? parts[2] : lang };
  return { view: 'sets', lang: LANG_IDS.includes(parts[0]) ? parts[0] : null, set: parts[1] || null };
}
function go(l, s) { location.hash = '#' + l + (s ? '/' + encodeURIComponent(s) : ''); }

function route() {
  const r = parseHash();
  tok++;
  if (io) io.disconnect();
  if (r.view === 'friends') return showFriends(tok);
  if (r.view === 'compare') return showCompare(r.fid, r.lang, tok);
  if (r.lang) { lang = r.lang; store.set(K.lang, lang); }
  if (r.set) showSet(lang, r.set, tok); else showList(tok);
}
window.addEventListener('hashchange', route);

/* ---------- Éléments communs ---------- */
function langSwitch(current, onPick) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': 'Langue' },
    LANGS.map((l) => h('button', { type: 'button', 'aria-pressed': String(l.id === current), lang: langAttr(l.id), onclick: () => onPick(l.id) }, l.label)));
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
    'Seules les listes et images publiques de cartes sont demandées à TCGdex. ', extra || '');
}

/* ---------- Vue : liste des extensions ---------- */
async function showList(my) {
  const L = lang;
  const q = h('input', { class: 'search', type: 'search', placeholder: 'Rechercher une extension…', 'aria-label': 'Rechercher une extension', enterkeyhint: 'search', autocomplete: 'off' });
  const top = h('header', { class: 'top' },
    h('div', { class: 'row' }, h('h1', {}, 'Mes cartes Pokémon'),
      h('button', { class: 'iconbtn', type: 'button', onclick: () => { location.hash = '#amis'; }, 'aria-label': 'Amis : partager et comparer' }, '👥 Amis'),
      h('button', { class: 'iconbtn', type: 'button', onclick: openBackup, 'aria-label': 'Sauvegarde et restauration', title: 'Sauvegarde' }, '💾')),
    langSwitch(L, (id) => { listScroll = 0; go(id); }), q);
  const main = h('main', {}, spinner());
  $app.replaceChildren(top, main);

  let sets;
  try { sets = await api(`/${L}/sets`); await snapReady; } catch (e) {
    if (my !== tok) return;
    main.replaceChildren(errorBox('Vérifiez votre connexion. ' + (e.message || ''), () => showList(tok))); return;
  }
  if (my !== tok) return;

  const reversed = store.get(K.order) === 'asc';
  const ordered = reversed ? sets.slice() : sets.slice().reverse();

  const stat = { empty: 0, partial: 0, noimg: 0 };
  for (const s of sets) {
    const st = dataStatus(L, s);
    if (st) { if (st.lvl === 'bad') stat.empty++; else if (st.lvl === 'warn') stat.partial++; else stat.noimg++; }
  }
  const incomplete = stat.empty + stat.partial;

  const items = ordered.map((s) => {
    const total = s.cardCount?.total ?? 0, have = ownedCount(L, s.id), st = dataStatus(L, s);
    const dbl = doublesCount(owned[L][s.id]);
    const logoUrl = s.logo ? s.logo + '.webp' : s.symbol ? s.symbol + '.webp' : null;
    const logo = h('div', { class: 'logo' });
    const ph = () => logo.replaceChildren(h('span', { class: 'ph' }, s.abbreviation?.official || s.id));
    if (logoUrl) logo.append(lazyImg(logoUrl, '', ph)); else ph();
    const btn = h('button', { type: 'button', class: 'set' + (st && st.lvl === 'bad' ? ' dim' : ''), onclick: () => { listScroll = scrollY; go(L, s.id); } },
      logo,
      h('div', { class: 'info' },
        h('div', { class: 'name' }, s.name || s.id),
        h('div', { class: 'count' }, h('b', {}, plural(have, 'carte possédée', 'cartes possédées')), ` sur ${total.toLocaleString('fr-FR')}`, dbl ? ` · ${plural(dbl, 'double', 'doubles')}` : ''),
        h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${total ? Math.min(100, Math.round(have / total * 100)) : 0}%` })),
        st && h('span', { class: 'badge ' + st.lvl }, st.txt)),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'));
    const li = h('li', {}, btn);
    li._name = norm(`${s.name} ${s.id}`);
    return li;
  });
  const ul = h('ul', { class: 'sets' }, items);
  const none = h('p', { class: 'empty', hidden: true }, 'Aucune extension ne correspond.');

  const notes = [];
  notes.push(h('div', { class: 'note' },
    h('b', {}, `${plural(sets.length, 'extension', 'extensions')} en ${langLabel(L)}`),
    ` · ${plural(ownedTotal(L), 'carte possédée', 'cartes possédées')}. `,
    incomplete || stat.noimg
      ? `Données TCGdex incomplètes pour cette langue : ${incomplete ? plural(incomplete, 'extension', 'extensions') + ' sans toutes les cartes' : ''}${incomplete && stat.noimg ? ', ' : ''}${stat.noimg ? plural(stat.noimg, 'extension', 'extensions') + ' sans toutes les images' : ''}. Elles sont signalées en dessous.`
      : 'Aucun défaut de données connu.',
    h('button', { type: 'button', onclick: () => { store.set(K.order, reversed ? 'desc' : 'asc'); showList(tok); } }, '↕ Inverser l’ordre')));
  if (isIOS && !isStandalone && !store.get(K.tip)) {
    notes.push(h('div', { class: 'note warn' },
      h('b', {}, 'Astuce iPhone / iPad : '), 'touchez Partager ⬆︎ puis « Sur l’écran d’accueil ». Cochez vos cartes depuis l’icône installée : ses données sont séparées de celles de Safari (utilisez Sauvegarde pour les transférer).',
      h('button', { type: 'button', onclick: (e) => { store.set(K.tip, '1'); e.target.closest('.note').remove(); } }, 'Compris')));
  }
  main.replaceChildren(...notes, ul, none);

  q.addEventListener('input', () => {
    const n = norm(q.value.trim()); let shown = 0;
    for (const li of items) { const ok = !n || li._name.includes(n); li.hidden = !ok; if (ok) shown++; }
    none.hidden = shown > 0;
  });
  if (listScroll) requestAnimationFrame(() => scrollTo(0, listScroll));
}

/* ---------- Vue : cartes d'une extension ---------- */
async function showSet(L, setId, my) {
  const back = h('button', { class: 'iconbtn', type: 'button', onclick: () => go(L), 'aria-label': 'Retour aux extensions' }, '‹ Extensions');
  const title = h('h1', {}, setId);
  const q = h('input', { class: 'search', type: 'search', placeholder: 'Nom ou numéro de carte…', 'aria-label': 'Rechercher une carte', enterkeyhint: 'search', autocomplete: 'off' });
  const top = h('header', { class: 'top' }, h('div', { class: 'row' }, back, title), q);
  const main = h('main', {}, spinner());
  $app.replaceChildren(top, main);
  scrollTo(0, 0);

  let set;
  try { set = await api(`/${L}/sets/${encodeURIComponent(setId)}`); } catch (e) {
    if (my !== tok) return;
    const missing = /HTTP 404/.test(e.message || '');
    main.replaceChildren(missing
      ? h('div', { class: 'note bad' }, h('b', {}, 'Extension introuvable. '), `TCGdex ne connaît pas « ${setId} » en ${langLabel(L)}.`)
      : errorBox('Vérifiez votre connexion. ' + (e.message || ''), () => showSet(L, setId, tok)));
    return;
  }
  if (my !== tok) return;

  const cards = Array.isArray(set.cards) ? set.cards : [];
  const total = set.cardCount?.total ?? cards.length;
  const withImg = cards.filter((c) => c.image).length;
  rememberCoverage(L, setId, cards.length, withImg);
  title.textContent = set.name || setId;
  title.setAttribute('lang', langAttr(L));

  const mine = owned[L][setId] || nullObj();
  const counter = h('span', {});
  const bar = h('i', {});
  const progress = h('div', { class: 'progress' }, h('div', { class: 'count' }, counter), h('div', { class: 'bar', 'aria-hidden': 'true' }, bar));
  const refresh = () => {
    const n = countKeys(mine), d = doublesCount(mine);
    counter.replaceChildren(h('b', {}, plural(n, 'carte possédée', 'cartes possédées')), ` sur ${total.toLocaleString('fr-FR')}`, d ? ` · dont ${plural(d, 'double', 'doubles')}` : '');
    bar.style.width = (total ? Math.min(100, Math.round(n / total * 100)) : 0) + '%';
  };
  refresh();

  const notes = [];
  if (cards.length === 0) {
    notes.push(h('div', { class: 'note bad' }, h('b', {}, 'Cartes indisponibles. '),
      `TCGdex annonce ${plural(total, 'carte', 'cartes')} pour cette extension en ${langLabel(L)}, mais n’en fournit aucune. Vous ne pouvez donc pas les cocher ici pour l’instant. Essayez une autre langue ou revenez plus tard.`));
  } else {
    if (cards.length < total) notes.push(h('div', { class: 'note warn' }, h('b', {}, 'Extension incomplète. '), `TCGdex ne fournit que ${cards.length} cartes sur ${total} annoncées.`));
    if (withImg === 0) notes.push(h('div', { class: 'note' }, h('b', {}, 'Pas d’images. '), 'TCGdex n’a aucune image pour cette extension ; les cartes sont listées par nom et numéro.'));
    else if (withImg < cards.length) notes.push(h('div', { class: 'note' }, h('b', {}, 'Images partielles. '), `${withImg} cartes sur ${cards.length} ont une image.`));
  }

  let filter = 'all';
  const persist = () => {
    if (countKeys(mine)) owned[L][setId] = mine; else delete owned[L][setId];
    saveOwned(); refresh(); apply();
  };
  const tiles = cards.map((c) => makeTile(c, mine, persist));
  const grid = h('div', { class: 'cards' }, tiles.map((t) => t.el));
  const none = h('p', { class: 'empty', hidden: true }, 'Aucune carte ne correspond.');

  const FILTERS = [['all', 'Toutes'], ['own', 'Possédées'], ['miss', 'Manquantes'], ['dbl', 'Doubles']];
  const filterBtns = FILTERS.map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === filter), onclick: () => { filter = k; filterBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(FILTERS[i][0] === k))); apply(); } }, label));
  if (cards.length) top.append(h('div', { class: 'tools' }, h('div', { class: 'seg small' }, filterBtns)));

  function apply() {
    const n = norm(q.value.trim()); let shown = 0;
    for (const t of tiles) {
      const qty = mine[t.card.id] || 0;
      const byFilter = filter === 'all' || (filter === 'own' && qty > 0) || (filter === 'miss' && qty === 0) || (filter === 'dbl' && qty >= 2);
      const ok = byFilter && (!n || t.text.includes(n));
      t.el.hidden = !ok; if (ok) shown++;
    }
    none.hidden = shown > 0 || !cards.length;
  }
  q.addEventListener('input', apply);
  apply();
  main.replaceChildren(...notes, progress, cards.length ? grid : '', none);
}

function placeholderContent(name) {
  return h('div', {}, h('span', { class: 't' }, name), h('span', { class: 's' }, 'Image indisponible'));
}

function makeTile(card, mine, onChange) {
  const id = card.id;
  const name = card.name || '#' + card.localId;
  const cb = h('input', { type: 'checkbox', class: 'cb', 'aria-label': `Je possède ${name} (n° ${card.localId})` });
  const media = h('div', { class: 'media' });
  const placeholder = () => { media.classList.add('noimg'); media.replaceChildren(placeholderContent(name)); };
  if (card.image) media.append(lazyImg(card.image + '/low.webp', name, placeholder)); else placeholder();

  const dbl = h('span', { class: 'dbl', hidden: true });
  const qv = h('span', { class: 'qv', 'aria-live': 'polite' }, '1');
  const minus = h('button', { type: 'button', class: 'qb', 'aria-label': `Un exemplaire de moins de ${name}` }, '−');
  const plus = h('button', { type: 'button', class: 'qb', 'aria-label': `Un exemplaire de plus de ${name}` }, '+');
  const qty = h('div', { class: 'qty' }, minus, qv, plus);
  const el = h('label', { class: 'card' }, media, dbl, h('span', { class: 'num' }, '#' + card.localId), h('span', { class: 'nm' }, name), qty, cb);

  function sync() {
    const n = mine[id] || 0;
    el.classList.toggle('own', n > 0);
    cb.checked = n > 0;
    qv.textContent = String(n || 1);
    dbl.textContent = '×' + n; dbl.hidden = n < 2;
    minus.disabled = n <= 1; plus.disabled = n >= MAXQ;
  }
  const step = (d) => (e) => {
    e.preventDefault(); e.stopPropagation();
    mine[id] = Math.max(1, Math.min(MAXQ, (mine[id] || 1) + d));
    sync(); onChange();
  };
  minus.addEventListener('click', step(-1));
  plus.addEventListener('click', step(1));
  cb.addEventListener('change', () => {
    if (cb.checked) mine[id] = 1; else delete mine[id];
    sync(); onChange();
  });
  sync();
  return { el, card, text: norm(`${name} ${card.localId} ${id}`) };
}

/* Carte en lecture seule (comparaison) */
function viewTile(card, qty) {
  const name = card.name || '#' + card.localId;
  const media = h('div', { class: 'media' });
  const badge = qty > 1 ? h('span', { class: 'dbl' }, '×' + qty) : null;
  const placeholder = () => { media.classList.add('noimg'); media.replaceChildren(...[placeholderContent(name), badge].filter(Boolean)); };
  if (card.image) media.append(lazyImg(card.image + '/low.webp', name, placeholder)); else placeholder();
  if (badge && card.image) media.append(badge);
  return h('div', { class: 'card view' }, media, h('span', { class: 'num' }, '#' + card.localId), h('span', { class: 'nm' }, name));
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
    h('ul', {}, LANGS.map((l) => h('li', {}, `${l.label} : ${plural(ownedTotal(l.id), 'carte possédée', 'cartes possédées')}`))),
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
  const payload = JSON.stringify({ app: 'mes-cartes-pokemon', type: 'sauvegarde', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), owned }, null, 1);
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
    const incoming = sanitizeOwned(data.owned);
    const sum = LANG_IDS.reduce((s, l) => s + ownedIn(incoming, l), 0);
    if (!sum) return openBackup('La sauvegarde ne contient aucune carte.');
    openSheet(
      h('h2', {}, 'Importer cette sauvegarde ?'),
      h('ul', {}, LANGS.map((l) => h('li', {}, `${l.label} : ${plural(ownedIn(incoming, l.id), 'carte', 'cartes')} (actuellement ${ownedTotal(l.id)})`))),
      data.exportedAt ? h('p', {}, `Sauvegarde du ${fmtDate(data.exportedAt)}.`) : null,
      h('button', { class: 'btn', type: 'button', onclick: () => applyImport(incoming, 'merge') }, 'Fusionner (garde la plus grande quantité)'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => applyImport(incoming, 'replace') }, 'Remplacer ma collection actuelle'),
      h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Annuler'));
  };
  rd.readAsText(file);
}
const ownedIn = (o, l) => Object.values(o[l]).reduce((s, m) => s + countKeys(m), 0);

function applyImport(incoming, mode) {
  if (mode === 'replace') owned = incoming;
  else {
    for (const l of LANG_IDS) for (const [sid, m] of Object.entries(incoming[l])) {
      const cur = owned[l][sid] || (owned[l][sid] = nullObj());
      for (const [id, qn] of Object.entries(m)) cur[id] = Math.max(cur[id] || 0, qn);
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
  if (!LANG_IDS.some((l) => ownedIn(ow, l))) return { error: 'Ce partage ne contient aucune carte cochée.' };
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
  const prep = collectCCMeta().then((r) => { ready = r; fileBtn.disabled = copyBtn.disabled = false; });

  const build = () => {
    const p = pseudo.value.trim();
    if (!p) { err.hidden = false; err.textContent = 'Indiquez d’abord votre pseudo : votre ami le verra.'; pseudo.focus(); return null; }
    err.hidden = true; store.set(K.pseudo, p);
    const obj = { app: 'mes-cartes-pokemon', type: 'partage', version: SHARE_VERSION, pseudo: p, date: new Date().toISOString(), owned, meta: ready.meta };
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
    h('ul', {}, LANGS.map((l) => h('li', {}, `${l.label} : ${plural(ownedIn(data.owned, l.id), 'carte', 'cartes')}`))),
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
    h('div', { class: 'count' }, LANGS.map((l) => `${l.label} : ${ownedIn(f.owned, l.id)}`).join(' · ')),
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
  try { sets = await api(`/${L}/sets`); } catch (e) {
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
    const mi = owned[L][sid] || nullObj(), th = f.owned[L][sid] || nullObj();
    const A = Object.keys(mi).filter((id) => !(id in th));
    const B = Object.keys(th).filter((id) => !(id in mi));
    const D = A.filter((id) => mi[id] >= 2);
    const union = new Set([...Object.keys(mi), ...Object.keys(th)]).size;
    const total = info.get(sid)?.cardCount?.total ?? 0;
    per.set(sid, { sid, mi, th, A, B, D, Cn: Math.max(0, total - union) });
  }
  const sorted = [...per.values()].sort((a, b) => { const ia = order.indexOf(a.sid), ib = order.indexOf(b.sid); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); });
  const countOf = (tab, p) => (tab === 'C' ? p.Cn : p[tab].length);
  const sum = (tab) => sorted.reduce((s, p) => s + countOf(tab, p), 0);
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
    const rows = sorted.filter((p) => countOf(tab, p) > 0);
    if (selSet !== '*' && !rows.some((p) => p.sid === selSet)) selSet = '*';
    picker.replaceChildren(h('option', { value: '*' }, `Toutes les extensions (${rows.length})`), ...rows.map((p) => h('option', { value: p.sid }, `${setName(p.sid)} (${countOf(tab, p)})`)));
    picker.value = selSet;
    const shown = selSet === '*' ? rows : rows.filter((p) => p.sid === selSet);
    const n = shown.reduce((s, p) => s + countOf(tab, p), 0);
    heading.textContent = `${CMP[tab].full(f.name)} : ${n.toLocaleString('fr-FR')}`;
    if (!rows.length) {
      body.replaceChildren(h('p', { class: 'empty' }, tab === 'C' ? 'Aucune carte restante à trouver dans les extensions connues.' : 'Aucune carte dans cette liste en ' + langLabel(L) + '.'));
      return;
    }
    const open = shown.length === 1;
    body.replaceChildren(...shown.map((p) => section(p, open)));
  }

  function section(p, open) {
    const n = countOf(tab, p);
    const content = h('div', { class: 'sec-body', hidden: !open });
    const head = h('button', { type: 'button', class: 'sec-head', 'aria-expanded': String(open) },
      h('span', { class: 'sn' }, setName(p.sid)), h('span', { class: 'sc' }, n.toLocaleString('fr-FR')), h('span', { class: 'chev', 'aria-hidden': 'true' }, open ? '⌄' : '›'));
    let loaded = false;
    const toggle = (force) => {
      const o = force ?? content.hidden;
      content.hidden = !o; head.setAttribute('aria-expanded', String(o)); head.lastChild.textContent = o ? '⌄' : '›';
      if (o && !loaded) { loaded = true; fillSection(p, content); }
    };
    head.addEventListener('click', () => toggle());
    const el = h('section', { class: 'sec' }, head, content);
    if (open) toggle(true);
    return el;
  }

  async function fillSection(p, content) {
    const myTab = tab;
    content.replaceChildren(spinner());
    let cards = [], failed = false;
    try { cards = (await api(`/${L}/sets/${encodeURIComponent(p.sid)}`)).cards || []; } catch { failed = true; }
    if (my !== tok) return;
    const byId = new Map(cards.map((c) => [c.id, c]));
    const metaOf = (id) => (f.meta[L]?.[p.sid]?.[id]) || null;
    const fallback = (id) => { const m = metaOf(id); return { id, localId: m ? m[0] : id.slice(p.sid.length + 1), name: m ? m[1] : '' }; };
    const notes = [];
    if (failed) notes.push(h('div', { class: 'note warn' }, 'Impossible de charger les images de cette extension (connexion ?). Les cartes sont listées par numéro.'));
    else if (!cards.length) notes.push(h('div', { class: 'note' }, 'TCGdex ne fournit pas les cartes de cette extension : pas d’images ni de noms.'));
    let tiles;
    if (myTab === 'C') {
      const known = new Set([...Object.keys(p.mi), ...Object.keys(p.th)]);
      const rest = cards.filter((c) => !known.has(c.id));
      tiles = rest.map((c) => viewTile(c, 0));
      if (!cards.length) notes.push(h('div', { class: 'note' }, `D’après le total annoncé, il reste environ ${plural(p.Cn, 'carte', 'cartes')} que personne n’a, mais la liste détaillée est indisponible.`));
      else if (cards.length !== rest.length + known.size && rest.length !== p.Cn) notes.push(h('div', { class: 'note' }, `TCGdex ne fournit que ${cards.length} cartes pour cette extension : la liste peut différer du compteur (${p.Cn}).`));
    } else {
      const idsList = myTab === 'A' ? p.A : myTab === 'B' ? p.B : p.D;
      const qtyOf = (id) => (myTab === 'B' ? p.th[id] : p.mi[id]);
      const pos = new Map(cards.map((c, i) => [c.id, i]));
      tiles = idsList.slice().sort((a, b) => (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9)).map((id) => viewTile(byId.get(id) || fallback(id), qtyOf(id)));
    }
    content.replaceChildren(...notes, tiles.length ? h('div', { class: 'cards' }, tiles) : h('p', { class: 'empty' }, 'Rien à afficher.'));
  }

  picker.addEventListener('change', () => { selSet = picker.value; render(); });

  const fl = f.owned[L];
  const friendLangCount = Object.values(fl).reduce((s, m) => s + countKeys(m), 0);
  main.replaceChildren(
    privacyNote(),
    h('p', { class: 'meta' }, `Données de ${f.name} : version du ${f.date ? fmtDate(f.date) : 'date inconnue'}, importée le ${f.imported ? fmtDate(f.imported) : '?'}. `, `En ${langLabel(L)}, ${f.name} a ${plural(friendLangCount, 'carte cochée', 'cartes cochées')} et vous ${plural(ownedTotal(L), 'carte', 'cartes')}.`),
    friendLangCount === 0 ? h('div', { class: 'note warn' }, `${f.name} n’a aucune carte en ${langLabel(L)} dans sa dernière version : changez de langue ci-dessus ou importez une version à jour.`) : '',
    tabs, h('label', { class: 'lbl' }, 'Extension', picker), heading, body);
  render();
}

/* ---------- Démarrage ---------- */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) toast('Mise à jour installée : rechargez la page pour l’utiliser.'); });
}
if (!location.hash) history.replaceState(null, '', '#' + lang);
route();
