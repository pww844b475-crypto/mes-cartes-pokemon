'use strict';
/* Mes cartes Pokémon — application statique, données TCGdex (api.tcgdex.net). */

const API = 'https://api.tcgdex.net/v2';
const LANGS = [
  { id: 'fr', label: 'Français' },
  { id: 'zh-cn', label: '简体中文' },
  { id: 'ja', label: '日本語' },
];
const LANG_IDS = LANGS.map((l) => l.id);
const K = { owned: 'cartes.v1', lang: 'cartes.lang', cov: 'cartes.cov', exp: 'cartes.lastExport', tip: 'cartes.tipHidden', order: 'cartes.order' };

/* ---------- Utilitaires ---------- */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};
const $app = document.getElementById('app');
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plural = (n, one, many) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;

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
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- Collection (cases « je l'ai ») : owned[langue][extension] = [id de carte, …] ---------- */
function emptyOwned() { return { fr: Object.create(null), 'zh-cn': Object.create(null), ja: Object.create(null) }; }

function sanitize(o) {
  const r = emptyOwned();
  for (const l of LANG_IDS) {
    const sets = o && typeof o === 'object' ? o[l] : null;
    if (!sets || typeof sets !== 'object') continue;
    for (const [sid, arr] of Object.entries(sets)) {
      if (!Array.isArray(arr)) continue;
      const u = [...new Set(arr.filter((x) => typeof x === 'string' && x.length < 80))];
      if (u.length) r[l][sid] = u;
    }
  }
  return r;
}

let owned;
try { owned = sanitize(JSON.parse(store.get(K.owned) || '{}')); } catch { owned = emptyOwned(); }

let saveWarned = false;
function saveOwned() {
  const ok = store.set(K.owned, JSON.stringify(owned));
  if (!ok && !saveWarned) { saveWarned = true; toast('⚠️ Impossible d’enregistrer sur cet appareil. Exportez une sauvegarde.'); }
  return ok;
}
const ownedCount = (l, sid) => (owned[l][sid] ? owned[l][sid].length : 0);
const ownedTotal = (l) => Object.values(owned[l]).reduce((n, a) => n + a.length, 0);

// Demande au navigateur de ne pas effacer les données automatiquement (sans effet garanti sur iOS).
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* ignoré */ }

/* ---------- Couverture des données : instantané + constat en direct ---------- */
let snapshot = {};
let live = {};
try { live = JSON.parse(store.get(K.cov) || '{}') || {}; } catch { live = {}; }
const snapReady = fetch('coverage.json').then((r) => (r.ok ? r.json() : {})).then((j) => { snapshot = j || {}; }).catch(() => {});

function coverage(l, id) {
  return (live[l] && live[l][id]) || (snapshot[l] && snapshot[l][id]) || null; // [cartes renvoyées, cartes avec image]
}
function rememberCoverage(l, id, n, img) {
  (live[l] ||= {})[id] = [n, img];
  store.set(K.cov, JSON.stringify(live));
}
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
      if (r.status < 500) break; // inutile de réessayer une erreur 4xx
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

/* ---------- Routage : #fr  ou  #fr/SV7a ---------- */
let lang = LANG_IDS.includes(store.get(K.lang)) ? store.get(K.lang) : 'fr';
let tok = 0;
let listScroll = 0;

function parseHash() {
  const [l, s] = decodeURIComponent(location.hash.slice(1)).split('/');
  return { lang: LANG_IDS.includes(l) ? l : null, set: s || null };
}
function go(l, s) { location.hash = '#' + l + (s ? '/' + encodeURIComponent(s) : ''); }

function route() {
  const r = parseHash();
  if (r.lang) { lang = r.lang; store.set(K.lang, lang); }
  tok++;
  if (io) io.disconnect();
  if (r.set) showSet(lang, r.set, tok); else showList(tok);
}
window.addEventListener('hashchange', route);

/* ---------- Éléments communs ---------- */
function langSwitch() {
  return h('div', { class: 'seg', role: 'group', 'aria-label': 'Langue' },
    LANGS.map((l) => h('button', { type: 'button', 'aria-pressed': String(l.id === lang), lang: l.id === 'zh-cn' ? 'zh-CN' : l.id, onclick: () => { listScroll = 0; go(l.id); } }, l.label)));
}
function errorBox(msg, retry) {
  return h('div', { class: 'note bad' }, h('b', {}, 'Chargement impossible. '), msg, h('br'), h('button', { type: 'button', onclick: retry }, 'Réessayer'));
}
const spinner = () => h('div', { class: 'spinner', role: 'progressbar', 'aria-label': 'Chargement' });
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

/* ---------- Vue : liste des extensions ---------- */
async function showList(my) {
  const L = lang;
  const q = h('input', { class: 'search', type: 'search', placeholder: 'Rechercher une extension…', 'aria-label': 'Rechercher une extension', enterkeyhint: 'search', autocomplete: 'off' });
  const top = h('header', { class: 'top' },
    h('div', { class: 'row' }, h('h1', {}, 'Mes cartes Pokémon'),
      h('button', { class: 'iconbtn', type: 'button', onclick: openBackup, 'aria-label': 'Sauvegarde et restauration' }, '💾 Sauvegarde')),
    langSwitch(), q);
  const main = h('main', {}, spinner());
  $app.replaceChildren(top, main);

  let sets;
  try { sets = await api(`/${L}/sets`); await snapReady; } catch (e) {
    if (my !== tok) return;
    main.replaceChildren(errorBox('Vérifiez votre connexion. ' + (e.message || ''), () => showList(tok))); return;
  }
  if (my !== tok) return;

  const reversed = store.get(K.order) === 'asc'; // par défaut : fin de la liste de l'API en premier (plus récent)
  const ordered = reversed ? sets.slice() : sets.slice().reverse();

  const stat = { empty: 0, partial: 0, noimg: 0, complete: 0 };
  for (const s of sets) {
    const st = dataStatus(L, s);
    if (!st) stat.complete++; else if (st.lvl === 'bad') stat.empty++; else if (st.lvl === 'warn') stat.partial++; else stat.noimg++;
  }
  const incomplete = stat.empty + stat.partial;

  const items = ordered.map((s) => {
    const total = s.cardCount?.total ?? 0, have = ownedCount(L, s.id), st = dataStatus(L, s);
    const logoUrl = s.logo ? s.logo + '.webp' : s.symbol ? s.symbol + '.webp' : null;
    const logo = h('div', { class: 'logo' });
    const ph = () => logo.replaceChildren(h('span', { class: 'ph' }, s.abbreviation?.official || s.id));
    if (logoUrl) logo.append(lazyImg(logoUrl, '', ph)); else ph();
    const btn = h('button', { type: 'button', class: 'set' + (st && st.lvl === 'bad' ? ' dim' : ''), onclick: () => { listScroll = scrollY; go(L, s.id); } },
      logo,
      h('div', { class: 'info' },
        h('div', { class: 'name' }, s.name || s.id),
        h('div', { class: 'count' }, h('b', {}, plural(have, 'carte possédée', 'cartes possédées')), ` sur ${total.toLocaleString('fr-FR')}`),
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
    h('b', {}, `${plural(sets.length, 'extension', 'extensions')} en ${LANGS.find((x) => x.id === L).label}`),
    ` · ${plural(ownedTotal(L), 'carte possédée', 'cartes possédées')}. `,
    incomplete || stat.noimg
      ? `Données TCGdex incomplètes pour cette langue : ${incomplete ? plural(incomplete, 'extension', 'extensions') + ' sans toutes les cartes' : ''}${incomplete && stat.noimg ? ', ' : ''}${stat.noimg ? plural(stat.noimg, 'extension', 'extensions') + ' sans toutes les images' : ''}. Elles sont signalées en dessous.`
      : 'Aucun défaut de données connu.',
    ' ',
    h('button', { type: 'button', onclick: () => { store.set(K.order, reversed ? 'desc' : 'asc'); showList(tok); } }, '↕ Inverser l’ordre')));
  if (isIOS && !isStandalone && !store.get(K.tip)) {
    notes.push(h('div', { class: 'note warn' },
      h('b', {}, 'Astuce iPhone / iPad : '), 'touchez Partager ⬆︎ puis « Sur l’écran d’accueil ». Cochez vos cartes depuis l’icône installée : ses données sont séparées de celles de Safari (utilisez Sauvegarde pour les transférer).',
      h('br'), h('button', { type: 'button', onclick: (e) => { store.set(K.tip, '1'); e.target.closest('.note').remove(); } }, 'Compris')));
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
      ? h('div', { class: 'note bad' }, h('b', {}, 'Extension introuvable. '), `TCGdex ne connaît pas « ${setId} » en ${LANGS.find((x) => x.id === L).label}.`)
      : errorBox('Vérifiez votre connexion. ' + (e.message || ''), () => showSet(L, setId, tok)));
    return;
  }
  if (my !== tok) return;

  const cards = Array.isArray(set.cards) ? set.cards : [];
  const total = set.cardCount?.total ?? cards.length;
  const withImg = cards.filter((c) => c.image).length;
  rememberCoverage(L, setId, cards.length, withImg);
  title.textContent = set.name || setId;
  title.setAttribute('lang', L === 'zh-cn' ? 'zh-CN' : L);

  const have = new Set(owned[L][setId] || []);
  const counter = h('span', {});
  const bar = h('i', {});
  const progress = h('div', { class: 'progress' }, h('div', { class: 'count' }, counter), h('div', { class: 'bar', 'aria-hidden': 'true' }, bar));
  const refresh = () => {
    counter.replaceChildren(h('b', {}, plural(have.size, 'carte possédée', 'cartes possédées')), ` sur ${total.toLocaleString('fr-FR')}`);
    bar.style.width = (total ? Math.min(100, Math.round(have.size / total * 100)) : 0) + '%';
  };
  refresh();

  const notes = [];
  if (cards.length === 0) {
    notes.push(h('div', { class: 'note bad' }, h('b', {}, 'Cartes indisponibles. '),
      `TCGdex annonce ${plural(total, 'carte', 'cartes')} pour cette extension en ${LANGS.find((x) => x.id === L).label}, mais n’en fournit aucune. Vous ne pouvez donc pas les cocher ici pour l’instant. Essayez une autre langue ou revenez plus tard.`));
  } else {
    if (cards.length < total) notes.push(h('div', { class: 'note warn' }, h('b', {}, 'Extension incomplète. '), `TCGdex ne fournit que ${cards.length} cartes sur ${total} annoncées.`));
    if (withImg === 0) notes.push(h('div', { class: 'note' }, h('b', {}, 'Pas d’images. '), 'TCGdex n’a aucune image pour cette extension ; les cartes sont listées par nom et numéro.'));
    else if (withImg < cards.length) notes.push(h('div', { class: 'note' }, h('b', {}, 'Images partielles. '), `${withImg} cartes sur ${cards.length} ont une image.`));
  }

  let filter = 'all';
  const tiles = cards.map((c) => makeTile(c, have, () => { owned[L][setId] = [...have]; if (!have.size) delete owned[L][setId]; saveOwned(); refresh(); apply(); }));
  const grid = h('div', { class: 'cards' }, tiles.map((t) => t.el));
  const none = h('p', { class: 'empty', hidden: true }, 'Aucune carte ne correspond.');

  const filterBtns = [['all', 'Toutes'], ['own', 'Possédées'], ['miss', 'Manquantes']].map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === filter), onclick: () => { filter = k; filterBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['all', 'own', 'miss'][i] === k))); apply(); } }, label));
  if (cards.length) top.append(h('div', { class: 'tools' }, h('div', { class: 'seg' }, filterBtns)));

  function apply() {
    const n = norm(q.value.trim()); let shown = 0;
    for (const t of tiles) {
      const own = have.has(t.card.id);
      const ok = (filter === 'all' || (filter === 'own' ? own : !own)) && (!n || t.text.includes(n));
      t.el.hidden = !ok; if (ok) shown++;
    }
    none.hidden = shown > 0 || !cards.length;
  }
  q.addEventListener('input', apply);
  main.replaceChildren(...notes, progress, cards.length ? grid : '', none);
}

function makeTile(card, have, onChange) {
  const id = card.id;
  const name = card.name || '#' + card.localId;
  const cb = h('input', { type: 'checkbox', class: 'cb', 'aria-label': `Je possède ${name} (n° ${card.localId})` });
  cb.checked = have.has(id);
  const media = h('div', { class: 'media' });
  const placeholder = () => {
    media.classList.add('noimg');
    media.replaceChildren(h('div', {}, h('span', { class: 't' }, name), h('span', { class: 's' }, 'Image indisponible')));
  };
  if (card.image) media.append(lazyImg(card.image + '/low.webp', name, placeholder)); else placeholder();
  const el = h('label', { class: 'card' + (cb.checked ? ' own' : '') }, media,
    h('span', { class: 'num' }, '#' + card.localId), h('span', { class: 'nm' }, name), cb);
  cb.addEventListener('change', () => {
    if (cb.checked) have.add(id); else have.delete(id);
    el.classList.toggle('own', cb.checked);
    onChange();
  });
  return { el, card, text: norm(`${name} ${card.localId} ${id}`) };
}

/* ---------- Sauvegarde / restauration ---------- */
function closeSheet() { document.querySelector('.overlay')?.remove(); }
function openSheet(...content) {
  closeSheet();
  const ov = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === ov) closeSheet(); } }, h('div', { class: 'sheet' }, ...content));
  document.body.append(ov);
  return ov;
}

function openBackup() {
  const last = store.get(K.exp);
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) readImport(f); } });
  openSheet(
    h('h2', {}, 'Sauvegarde et restauration'),
    h('ul', {}, LANGS.map((l) => h('li', {}, `${l.label} : ${plural(ownedTotal(l.id), 'carte possédée', 'cartes possédées')}`))),
    h('p', {}, last ? `Dernière sauvegarde : ${new Date(last).toLocaleString('fr-FR')}.` : 'Aucune sauvegarde faite depuis cet appareil.'),
    h('p', {}, 'Vos cases cochées sont stockées uniquement sur cet appareil. Exportez régulièrement un fichier pour ne rien perdre (changement d’appareil, iOS qui nettoie les données d’un site peu utilisé, etc.).'),
    h('button', { class: 'btn', type: 'button', onclick: doExport }, '⬆︎ Exporter ma collection'),
    h('button', { class: 'btn sec', type: 'button', onclick: () => fileIn.click() }, '⬇︎ Importer une sauvegarde'),
    fileIn,
    h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Fermer'));
}

async function doExport() {
  const payload = JSON.stringify({ app: 'mes-cartes-pokemon', version: 1, exportedAt: new Date().toISOString(), owned }, null, 1);
  const name = `cartes-pokemon-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([payload], name, { type: 'application/json' });
  const done = () => { store.set(K.exp, new Date().toISOString()); toast('Sauvegarde exportée ✔︎'); closeSheet(); };
  if (navigator.canShare && navigator.canShare({ files: [file] })) { // feuille de partage iOS : « Enregistrer dans Fichiers »
    try { await navigator.share({ files: [file], title: name }); return done(); } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  done();
}

function readImport(file) {
  const rd = new FileReader();
  rd.onerror = () => toast('Lecture du fichier impossible.');
  rd.onload = () => {
    let data;
    try { data = JSON.parse(rd.result); } catch { return toast('Ce fichier n’est pas une sauvegarde valide (JSON illisible).'); }
    if (!data || data.app !== 'mes-cartes-pokemon' || !data.owned || typeof data.owned !== 'object') return toast('Ce fichier n’est pas une sauvegarde de cette application.');
    const incoming = sanitize(data.owned);
    const n = (o, l) => Object.values(o[l]).reduce((s, a) => s + a.length, 0);
    const sum = LANG_IDS.reduce((s, l) => s + n(incoming, l), 0);
    if (!sum) return toast('La sauvegarde ne contient aucune carte.');
    openSheet(
      h('h2', {}, 'Importer cette sauvegarde ?'),
      h('ul', {}, LANGS.map((l) => h('li', {}, `${l.label} : ${plural(n(incoming, l.id), 'carte', 'cartes')} (actuellement ${ownedTotal(l.id)})`))),
      data.exportedAt ? h('p', {}, `Sauvegarde du ${new Date(data.exportedAt).toLocaleString('fr-FR')}.`) : null,
      h('button', { class: 'btn', type: 'button', onclick: () => applyImport(incoming, 'merge') }, 'Fusionner avec ma collection actuelle'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => applyImport(incoming, 'replace') }, 'Remplacer ma collection actuelle'),
      h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Annuler'));
  };
  rd.readAsText(file);
}

function applyImport(incoming, mode) {
  if (mode === 'replace') owned = incoming;
  else for (const l of LANG_IDS) for (const [sid, arr] of Object.entries(incoming[l])) owned[l][sid] = [...new Set([...(owned[l][sid] || []), ...arr])];
  saveOwned(); closeSheet(); toast(mode === 'replace' ? 'Collection remplacée ✔︎' : 'Collection fusionnée ✔︎'); route();
}

/* ---------- Démarrage ---------- */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (!location.hash) history.replaceState(null, '', '#' + lang);
route();
