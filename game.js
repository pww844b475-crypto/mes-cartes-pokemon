'use strict';
/* ---------- Jeu : ouverture virtuelle de boosters (juste pour le plaisir : rien n'est ajouté à la collection) ----------
   Chargé avant app.js : n'utilise les fonctions de app.js (h, setMeta, loadCardInfo, applyScans, imgHigh, rarityTier…) qu'au moment d'être appelé. */

// Taux et compositions : estimations communautaires (Pokémon n'en publie pas). Sources : TCGplayer (≈ 3 000 boosters du 30ᵉ Anniversaire :
// Illustration rare ≈ 1 sur 5, Collection Classique ≈ 1 sur 10, Illustration spéciale ≈ 1 sur 21, Futuristic ≈ 1 sur 120) et estimations des
// extensions « Méga-Évolution » pour Règne Delta (Double rare ≈ 1 sur 5, Illustration rare ≈ 1 sur 9, Ultra rare ≈ 1 sur 12, Illustration spéciale ≈ 1 sur 82,
// Méga Hyper Rare ≈ 1 sur 1 100). Ce sont des ordres de grandeur, pas des chiffres officiels.
const GAME_SETS = [
  { id: '30th', name: '30ᵉ Anniversaire', members: ['30th', '30th-c'], logo: 'images/set-logos/30th.webp', cards: 5, hits: ['Pikachu Rare', 'Illustration rare', 'Illustration spéciale rare', 'RGB Rare', 'Futuristic Rare', 'Collection Classique', 'Double rare'], tint: ['#ffcf3a', '#e8731f'], packs: [1, 2, 3, 4].map((i) => `images/boosters/30th-${i}.webp`),
    desc: '5 cartes, dans cet ordre : 2 communes ; 3ᵉ carte : commune, Illustration rare ou reprint Collection Classique ; 4ᵉ carte : Rare, EX, Illustration spéciale rare, RGB ou Futuristic, mais jamais de hit en 4ᵉ si la 3ᵉ en est un ; 5ᵉ : Pikachu Rare garanti.',
    rates: [['Illustration rare (3ᵉ carte)', '1 sur 5'], ['Collection Classique (3ᵉ carte)', '1 sur 10'], ['EX (4ᵉ carte)', '1 sur 4'], ['Illustration spéciale rare (4ᵉ carte)', '1 sur 21'], ['Futuristic Rare (4ᵉ carte)', '1 sur 120'], ['RGB Rare, Mew R / G / B (4ᵉ carte)', '1 sur 660']] },
  { id: 'me06', name: 'Règne Delta', members: ['me06'], logo: 'images/set-logos/me06.webp', cards: 10, reverse: true, hits: ['Double rare', 'Ultra Rare', 'Illustration rare', 'Illustration spéciale rare', 'Méga Hyper Rare'], tint: ['#3fd0ff', '#2a56d6'], pairs: [['me06-094', 'me06-095'], ['me06-096', 'me06-097'], ['me06-098', 'me06-099']],      // « Stades » imprimés en deux moitiés : l'une ne vient jamais sans l'autre
    packs: [1, 2, 3, 4].map((i) => `images/boosters/me06-${i}.webp`),
    desc: '10 cartes, dans cet ordre : 4 communes, 3 peu communes, 1 reverse, puis une 2ᵉ reverse qui peut être remplacée par une Illustration rare ou une Illustration spéciale rare, puis une carte rare (Rare, Double rare ou Ultra Rare).',
    rates: [['Illustration rare (à la place de la 2ᵉ reverse)', '1 sur 9'], ['Illustration spéciale rare (idem)', '1 sur 82'], ['Double rare (dernière carte)', '1 sur 5'], ['Ultra Rare (dernière carte)', '1 sur 12'], ['Méga Hyper Rare (dernière carte)', '1 sur 1 100']] },
];
const gameLabel = (def, r) => (def.id === '30th' && r === 'Double rare' ? 'EX' : r);
const SPECIAL = ['Illustration spéciale rare', 'Méga Hyper Rare', 'Futuristic Rare', 'RGB Rare'];      // animation plein écran automatique
// une carte existe en reverse si c'est une Commune, Peu Commune ou Rare d'une extension classique, sauf les moitiés de Stade
const hasReverse = (def, c) => !!def.reverse && ['Commune', 'Peu Commune', 'Rare'].includes(c.rar) && !(def.pairs || []).flat().includes(c.id);
const pickOne = (a, not) => { const b = not && not.size ? a.filter((x) => !not.has(x)) : a; const l = b.length ? b : a; return l[Math.floor(Math.random() * l.length)]; };

// ---------- boosters à ouvrir (gagnés), récompenses et classeur virtuel (séparé de la vraie collection) ----------
const GAME_KEY = 'cartes.game', BINDER_KEY = 'cartes.vbinder';
const REWARD_DAILY = 10, REWARD_SCAN = 3;
function gameState() {
  let s = null; try { s = JSON.parse(store.get(GAME_KEY) || 'null'); } catch { s = null; }
  if (!s || typeof s !== 'object') s = {};
  return { credits: Math.max(0, Math.floor(Number(s.credits) || 0)), daily: typeof s.daily === 'string' ? s.daily : '', scans: s.scans && typeof s.scans === 'object' ? s.scans : {}, rewarded: Array.isArray(s.rewarded) ? s.rewarded : [] };
}
const gameSave = (s) => store.set(GAME_KEY, JSON.stringify(s));
function dailyLogin() {      // une fois par jour, à l'ouverture de l'application : +10 boosters
  const s = gameState(), today = dayKey(); if (s.daily === today) return 0;
  s.daily = today; s.credits += REWARD_DAILY; s.scans = Object.fromEntries(Object.entries(s.scans).filter(([, d]) => d === today)); gameSave(s);
  return REWARD_DAILY;
}
function gameScanReward(cardId) {      // scan réussi (carte reconnue directement) : +3 boosters, une seule fois par carte et par jour
  if (!cardId) return 0; const s = gameState(), today = dayKey(); if (s.scans[cardId] === today) return 0;
  s.scans[cardId] = today; s.credits += REWARD_SCAN; gameSave(s); return REWARD_SCAN;
}
// +1 booster par carte ajoutée à la vraie collection (française), une seule fois par carte : l'enlever puis la remettre ne rapporte rien de plus
function syncCardRewards() {
  try {
    const s = gameState(), seen = new Set(s.rewarded); let gain = 0;
    for (const [sid, m] of Object.entries((owned && owned.fr) || {})) {
      if (isDigital('fr', sid) || DIGITAL_FALLBACK_FR.includes(sid)) continue;      // extensions du jeu en ligne exclues
      for (const [id, v] of Object.entries(m || {})) if (qtyTotal(v) > 0 && !seen.has(id)) { seen.add(id); s.rewarded.push(id); gain++; }
    }
    if (gain) { s.credits += gain; gameSave(s); }
    return gain;
  } catch { return 0; }
}
function binderLoad() { try { const o = JSON.parse(store.get(BINDER_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
const binderSave = (o) => store.set(BINDER_KEY, JSON.stringify(o));
let gamePools = {};
async function gamePool(def) {
  if (gamePools[def.id]) return gamePools[def.id];
  await Promise.all([metaReady, scansReady]);
  const names = await fetch('data/names.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  const cards = [];
  for (const sid of def.members) {
    const info = await loadCardInfo('fr', sid);
    for (const row of names[sid] || []) {
      const odd = typeof row[2] === 'string', lidRaw = odd ? row[1] : row[0], nm = odd ? row[2] : row[1], id = odd ? row[0] : sid + '-' + lidRaw, noImg = odd ? row[3] === 0 : row[2] === 0;
      cards.push({ id, localId: lidRaw, name: nm, image: tcgImage('fr', sid, lidRaw, noImg), rar: (info.get(id) || {}).rar || null });
    }
  }
  applyScans(cards);
  const by = {}; for (const c of cards) if (c.rar) (by[c.rar] = by[c.rar] || []).push(c);
  return (gamePools[def.id] = { cards, by });
}

// Tirage d'un booster : liste de { c: carte, rar, reverse?, stade? } dans l'ordre de révélation (la meilleure carte en dernier)
function drawPack(def, pool) {
  const by = pool.by, out = [], used = new Set(), r = Math.random;
  const halfIds = new Set((def.pairs || []).flat());      // une moitié de Stade n'est jamais tirée seule (ni en reverse)
  const take = (rar, extra) => { const base = by[rar] || [], c = pickOne(extra && extra.reverse ? base.filter((x) => !halfIds.has(x.id)) : base, used); if (!c) return null; used.add(c); out.push({ c, rar, ...extra }); return c; };
  if (def.id === '30th') {
    // ordre réel : 2 communes, 3ᵉ carte (Illustration rare ou reprint « Collection Classique », sinon commune), 4ᵉ carte (EX, Illustration spéciale rare, RGB, Futuristic, sinon Rare), 5ᵉ Pikachu Rare garanti
    take('Commune'); take('Commune');
    const x = r(); let hit3 = true;
    if (x < 0.10 && by['Collection Classique']) take('Collection Classique'); else if (x < 0.30) take('Illustration rare'); else { take('Commune'); hit3 = false; }
    // un hit en 3ᵉ position exclut tout hit en 4ᵉ (carte Rare) ; sans hit en 3ᵉ, les chances du 4ᵉ sont relevées (÷ 0,7) pour garder le même taux global
    const y = hit3 ? 9 : r() * 0.7;
    if (y < 1 / 21) take('Illustration spéciale rare'); else if (y < 1 / 21 + 1 / 120) take('Futuristic Rare'); else if (y < 1 / 21 + 1 / 120 + 1 / 660) take('RGB Rare'); else if (y < 0.28) take('Double rare'); else take('Rare');
    take('Pikachu Rare');
  } else {
    // ordre réel d'un booster d'extension classique : 4 communes, 3 peu communes, 1re reverse, 2ᵉ reverse (ou Illustration rare / Illustration spéciale rare), carte rare
    const rev = () => { const z = r(); take(z < 0.5 ? 'Commune' : z < 0.85 ? 'Peu Commune' : 'Rare', { reverse: true }); };
    for (let i = 0; i < 4; i++) take('Commune');
    {   // 3 peu communes ; une moitié de Stade (Pyroconduit, Sommet, Fosse Légendaire) arrive toujours avec sa moitié, côte à côte
      const half = new Map(); for (const [a, b] of def.pairs || []) { half.set(a, b); half.set(b, a); }
      const byId = new Map(pool.cards.map((c) => [c.id, c])), normal = (by['Peu Commune'] || []).filter((c) => !half.has(c.id));
      for (let n = 0; n < 3;) {
        const all = by['Peu Commune'] || [], c = pickOne(all, used), left = 3 - n;
        if (half.has(c.id)) {
          const o = byId.get(half.get(c.id));
          if (left >= 2 && o && !used.has(o)) { used.add(c); used.add(o); const [first, second] = c.id < o.id ? [c, o] : [o, c]; out.push({ c: first, rar: 'Peu Commune', stade: true }, { c: second, rar: 'Peu Commune', stade: true }); n += 2; }
          else { const x = pickOne(normal, used); used.add(x); out.push({ c: x, rar: 'Peu Commune' }); n++; }
        } else { used.add(c); out.push({ c, rar: 'Peu Commune' }); n++; }
      }
    }
    rev();
    const w = r();
    if (w < 1 / 82) take('Illustration spéciale rare'); else if (w < 1 / 82 + 1 / 9) take('Illustration rare'); else rev();
    const y = r();
    if (y < 1 / 1100) take('Méga Hyper Rare'); else if (y < 1 / 1100 + 1 / 12) take('Ultra Rare'); else if (y < 1 / 1100 + 1 / 12 + 0.2) take('Double rare'); else take('Rare');
  }
  return out;
}

// ---------- écrans ----------
function showGame(my) {
  const home = h('button', { class: 'iconbtn', type: 'button', onclick: () => go(lang), 'aria-label': 'Retour à l’accueil' }, '🏠 Accueil');
  const top = h('header', { class: 'top' }, h('div', { class: 'row' }, home, h('h1', {}, '🎮 Jeu · Boosters')));
  const main = h('main', { class: 'game' });
  const put = (...a) => main.replaceChildren(...a.flat().filter((x) => x != null && x !== false));      // replaceChildren(null) écrirait le mot « null » à l'écran
  $app.replaceChildren(top, main);
  scrollTo(0, 0);
  const alive = () => my === tok;
  let defSel = GAME_SETS[0], count = 1; const artSel = {};      // visuel de booster choisi par série (absent = au hasard)

  function setup() {
    const cardsEl = GAME_SETS.map((d) => h('button', { type: 'button', class: 'gset' + (d === defSel ? ' on' : ''), 'aria-pressed': String(d === defSel), onclick: () => { defSel = d; setup(); } },
      h('img', { src: d.logo, alt: '', class: 'gset-logo', width: 200, height: 80 }), h('b', {}, d.name), h('span', {}, d.desc)));
    const inp = h('input', { class: 'qin bo-in', type: 'number', inputmode: 'numeric', min: '1', max: '36', value: String(count), 'aria-label': 'Nombre de boosters à ouvrir' });
    syncCardRewards();
    const credits = gameState().credits;
    const bank = h('div', { class: 'gbank' }, h('b', {}, `🎟 ${credits}`), h('span', {}, credits === 1 ? 'booster à ouvrir' : 'boosters à ouvrir'),
      h('small', {}, `Gagne-en : +${REWARD_DAILY} chaque jour à l’ouverture de l’appli, +${REWARD_SCAN} par carte reconnue directement au scanner (une fois par carte et par jour), +1 pour chaque carte ajoutée à ta collection (une seule fois par carte : l’enlever puis la remettre ne rapporte rien).`));
    const openBtn = h('button', { class: 'btn', type: 'button', onclick: start });
    const label = () => {
      const kept = Math.min(count, credits), free = count - kept;
      openBtn.textContent = `🎁 Ouvrir ${count > 1 ? `les ${count} boosters` : 'le booster'}` + (free ? ` (${free} pour le plaisir)` : '');
    };
    const setN = (v) => { count = Math.max(1, Math.min(36, Number.isFinite(v) ? v : 1)); inp.value = String(count); label(); };
    label();
    inp.addEventListener('change', () => setN(parseInt(inp.value, 10)));
    const artRow = h('div', { class: 'gart', hidden: true });
    artFor(defSel).then((arts) => {
      if (!alive() || !arts.length) return;
      const cur = artSel[defSel.id], pick = (i) => { if (i === undefined) delete artSel[defSel.id]; else artSel[defSel.id] = i; setup(); };
      artRow.replaceChildren(h('p', { class: 'lb-help' }, 'Visuel du booster'),
        h('div', { class: 'gart-list' }, h('button', { type: 'button', class: 'gart-b' + (cur === undefined ? ' on' : ''), 'aria-pressed': String(cur === undefined), onclick: () => pick(undefined) }, '🎲', h('small', {}, 'Au hasard')),
          ...arts.map((a, i) => h('button', { type: 'button', class: 'gart-b' + (cur === i ? ' on' : ''), 'aria-pressed': String(cur === i), 'aria-label': 'Visuel ' + (i + 1), onclick: () => pick(i) }, h('img', { src: a.u, alt: '' })))));
      artRow.hidden = false;
    });
    put(
      bank,
      h('p', { class: 'lb-help' }, 'Les boosters comptés remplissent ton classeur virtuel (séparé de ta vraie collection) ; au-delà, tu peux en ouvrir « pour le plaisir », sans les garder. Juste pour le plaisir : rien n’est ajouté à ta collection. Choisis une série et le nombre de boosters : tu les feras défiler, puis tu déchireras celui de ton choix en traçant un trait sur le haut.'),
      h('div', { class: 'gsets' }, cardsEl),
      artRow,
      h('div', { class: 'bo-line big' }, h('span', { class: 'bo-name' }, 'Combien de boosters ?'),
        h('div', { class: 'bo-step' }, h('button', { type: 'button', class: 'qb', 'aria-label': 'Un de moins', onclick: () => setN(count - 1) }, '−'), inp, h('button', { type: 'button', class: 'qb', 'aria-label': 'Un de plus', onclick: () => setN(count + 1) }, '+'))),
      openBtn,
      h('button', { class: 'btn sec', type: 'button', onclick: binder }, '📖 Mon classeur virtuel'),
      h('button', { class: 'btn sec', type: 'button', onclick: showRates }, 'ℹ️ Taux de tirage utilisés'));
  }

  function showRates() {
    const d = defSel;
    openSheet(h('h2', {}, 'Taux de tirage · ' + d.name), h('p', { class: 'lb-help' }, d.desc),
      h('div', { class: 'orows' }, d.rates.map(([n, v]) => h('div', { class: 'orow' }, h('div', { class: 'orow-l' }, h('span', { class: 'rn' }, n), h('span', { class: 'rc' }, v))))),
      h('p', { class: 'lb-help' }, 'Pokémon ne publie pas de taux officiels : ce sont des estimations de la communauté (TCGplayer, relevés de plusieurs milliers de boosters), des ordres de grandeur. Chaque booster est tiré au hasard, indépendamment des précédents.'),
      h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Fermer'));
  }

  const nav = () => h('div', { class: 'gnav' }, h('button', { type: 'button', class: 'tbtn', onclick: setup }, '↩ Choix des boosters'), h('button', { type: 'button', class: 'tbtn', onclick: binder }, '📖 Mon classeur'));
  let packs = [];      // [{ cards: [...], art, opened }]
  const artCache = {};
  const artFor = async (d) => {      // visuels de boosters présents dans images/boosters (ceux qui n'existent pas sont ignorés)
    if (!artCache[d.id]) artCache[d.id] = Promise.all(d.packs.map((u) => new Promise((res) => { const im = new Image(); im.onload = () => res({ u, w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res(null); im.src = u; }))).then((a) => a.filter(Boolean));
    return artCache[d.id];
  };
  async function start() {
    put(spinner());
    let pool, arts; try { pool = await gamePool(defSel); arts = await artFor(defSel); } catch (e) { if (alive()) { put(h('div', { class: 'note bad' }, 'Impossible de charger les cartes : vérifiez votre connexion.'), h('button', { class: 'btn', type: 'button', onclick: setup }, 'Retour')); } return; }
    if (!alive()) return;
    const ch = artSel[defSel.id];
    const credits = gameState().credits;
    packs = Array.from({ length: count }, (_, i) => ({ keep: i < credits, committed: false, cards: drawPack(defSel, pool), art: arts.length ? (ch !== undefined && arts[ch] ? arts[ch] : arts[Math.floor(Math.random() * arts.length)]) : null, opened: false }));
    for (const p of packs) for (const e of p.cards) { const im = new Image(); im.src = imgHigh(e.c); }      // images préchargées pendant l'animation
    packsScreen();
  }

  // à l'ouverture d'un booster : un booster gagné est débité et ses cartes vont dans le classeur (les boosters « pour le plaisir » ne comptent pas)
  function commitPack(p) {
    if (p.committed) return; p.committed = true;
    if (!p.keep) return;
    const s = gameState(); if (s.credits < 1) { p.keep = false; return; }
    s.credits--; gameSave(s);
    const b = binderLoad();
    for (const e of p.cards) { const en = b[e.c.id] || [0, 0], k = e.reverse ? 1 : 0; e.isNew = en[k] === 0; en[k]++; b[e.c.id] = en; }
    binderSave(b);
  }

  // carrousel de boosters : on fait défiler, on touche celui qu'on veut (il se fige), puis on trace un trait brillant sur la ligne du haut pour le déchirer
  function packsScreen(focus) {
    const d = defSel, n = packs.length;
    let cur = focus !== undefined ? focus : Math.max(0, packs.findIndex((p) => !p.opened)), held = null;
    const info = h('p', { class: 'gcount' }), tip = h('p', { class: 'lb-help gtip' });
    const items = packs.map((p, i) => {
      const body = p.art
        ? [h('span', { class: 'gpi-body' }), h('span', { class: 'gpi-top' })]
        : [h('span', { class: 'gp-top' }), h('span', { class: 'gp-body' }, h('img', { src: d.logo, alt: '', class: 'gp-logo' }), h('b', {}, 'BOOSTER'), h('small', {}, d.cards + ' cartes'))];
      const trail = h('i', { class: 'gtl-trail' });
      const tear = h('div', { class: 'gtear', role: 'slider', 'aria-label': 'Glisse le doigt sur le trait pour déchirer le booster' }, h('i', { class: 'gtl-glint' }), trail);
      const el = h('div', { class: 'gpack gcar' + (p.art ? ' gpi' : ''), style: p.art ? `--img:url("${p.art.u}");--ar:${p.art.w} / ${p.art.h};--r:${(p.art.h / p.art.w).toFixed(4)}` : `--c1:${d.tint[0]};--c2:${d.tint[1]};--r:1.733` }, ...body, h('span', { class: 'gp-shine' }), tear, h('b', { class: 'gopened' }, '✓ ouvert'), p.keep ? null : h('i', { class: 'gfree' }, 'pour le plaisir'));
      const item = h('div', { class: 'gpc-item', role: 'listitem' }, el);
      let drag = null;
      const reset = () => { el.style.setProperty('--p', 0); trail.style.width = '0'; drag = null; };
      tear.addEventListener('pointerdown', (ev) => { if (held !== i || p.opened || el.classList.contains('tear')) return; try { tear.setPointerCapture(ev.pointerId); } catch { /* ignoré */ } drag = { last: ev.clientX, dist: 0, w: tear.getBoundingClientRect().width }; ev.preventDefault(); });
      tear.addEventListener('pointermove', (ev) => {
        if (!drag) return; drag.dist += Math.abs(ev.clientX - drag.last); drag.last = ev.clientX;
        const pr = Math.min(1, drag.dist / (drag.w * 0.85)); el.style.setProperty('--p', pr.toFixed(3)); trail.style.width = (pr * 100).toFixed(1) + '%';
        if (pr >= 1) { drag = null; rip(i); }
      });
      const end = () => { if (drag) reset(); };
      tear.addEventListener('pointerup', end); tear.addEventListener('pointercancel', end);
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('.gtear')) return;
        if (p.opened) { browse(p); return; }
        if (held === null) hold(i);
      });
      return { item, el, p };
    });
    const track = h('div', { class: 'gpc-track', role: 'list' }, items.map((x) => x.item));
    const pitch = () => (items.length > 1 ? items[1].item.offsetLeft - items[0].item.offsetLeft : (items[0].item.offsetWidth || 1));
    const goTo = (i, smooth = true) => track.scrollTo({ left: i * pitch(), behavior: smooth ? 'smooth' : 'auto' });
    function hold(i) {      // le booster choisi se fige au centre, les autres s'effacent : on peut tracer le trait
      held = i; cur = i; goTo(i); track.classList.add('locked');
      items.forEach((x, j) => { x.item.classList.toggle('on', j === i); x.el.classList.toggle('held', j === i); });
      paint(); releaseBtn.hidden = false;
    }
    function release() { held = null; track.classList.remove('locked'); items.forEach((x) => { x.item.classList.remove('on'); x.el.classList.remove('held'); x.el.style.setProperty('--p', 0); }); releaseBtn.hidden = true; paint(); }
    const paint = () => {
      const pos = track.scrollLeft / (pitch() || 1); if (held === null) cur = Math.max(0, Math.min(n - 1, Math.round(pos) || 0));
      items.forEach((x, i) => { const dd = Math.abs(i - pos), sc = Math.max(0.62, 1 - 0.3 * Math.min(dd, 1.4)); x.item.style.transform = `scale(${sc.toFixed(3)})`; x.item.style.opacity = String(Math.max(0.35, 1 - 0.45 * Math.min(dd, 1.4)).toFixed(2)); x.el.classList.toggle('sel', i === cur); x.el.classList.toggle('opened', x.p.opened); });
      const op = packs.filter((x) => x.opened).length, left = n - op;
      info.textContent = `Booster ${cur + 1} / ${n}${packs[cur].opened ? ' · ouvert' : ''}${n > 1 ? ` — ${op} ouvert${op > 1 ? 's' : ''}` : ''}`;
      tip.textContent = held !== null ? 'Trace un trait brillant sur la ligne du haut pour le déchirer' : packs[cur].opened ? 'Touche le booster pour revoir ses cartes' : 'Fais défiler, puis touche le booster que tu veux ouvrir';
      sumBtn.hidden = !op; openBtn2.hidden = held === null; allBtn.hidden = left < 2 || held !== null;
      allBtn.textContent = `⚡ Ouvrir les ${left} boosters d’un coup`;
    };
    function rip(i) {
      const x = items[i]; x.el.classList.add('tear'); x.item.append(h('i', { class: 'gpuff' })); try { navigator.vibrate && navigator.vibrate(25); } catch { /* ignoré */ }
      commitPack(x.p); setTimeout(() => { if (alive()) { x.p.opened = true; reveal(i); } }, 900);
    }
    function openAll() {      // tous les boosters d'un coup : les cartes vedettes passent en plein écran l'une après l'autre, puis le résumé
      const specials = []; for (const p of packs) if (!p.opened) { p.opened = true; commitPack(p); for (const e of p.cards) if (SPECIAL.includes(e.rar)) specials.push(e); }
      try { navigator.vibrate && navigator.vibrate([20, 30, 20]); } catch { /* ignoré */ }
      const next = () => { const e = specials.shift(); if (e) showSpecial(e, next); else summary(); };
      next();
    }
    const releaseBtn = h('button', { class: 'btn sec', type: 'button', hidden: true, onclick: release }, '↩ Choisir un autre booster');
    const openBtn2 = h('button', { class: 'btn sec', type: 'button', hidden: true, onclick: () => { if (held !== null && !packs[held].opened) rip(held); } }, 'Ouvrir sans glisser');
    const allBtn = h('button', { class: 'btn', type: 'button', onclick: openAll }, '');
    const sumBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: summary }, '📊 Voir le résumé');
    put(nav(), info, track, tip, h('div', { class: 'gacts' }, allBtn, sumBtn, openBtn2, releaseBtn, h('button', { class: 'btn sec', type: 'button', onclick: setup }, 'Changer de série')));
    track.addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true });
    requestAnimationFrame(() => { goTo(cur, false); paint(); });
  }

  // animation plein écran pour les cartes vedettes (Illustration spéciale rare, Méga Hyper Rare, Futuristic, RGB)
  function showSpecial(e, next) {
    const label = e.rar === 'Méga Hyper Rare' ? 'MÉGA HYPER RARE' : e.rar === 'Illustration spéciale rare' ? 'ILLUSTRATION SPÉCIALE' : e.rar === 'Futuristic Rare' ? 'FUTURISTIC RARE' : 'RGB RARE';
    const ov = h('div', { class: 'overlay gspecial', role: 'dialog', 'aria-modal': 'true', onclick: () => { ov.remove(); if (next) next(); } },
      h('i', { class: 'gsp-rays' }), h('i', { class: 'gsp-flash' }),
      h('div', { class: 'gsp-in' }, h('p', { class: 'gsp-lab' }, label), h('div', { class: 'gsp-card' }, h('img', { src: imgHigh(e.c), alt: e.c.name }), h('i', { class: 'gsp-sheen' })), h('b', {}, e.c.name), h('small', {}, 'Touche pour continuer')),
      h('div', { class: 'gsp-sparks' }, Array.from({ length: 34 }, () => h('b', { style: `left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 2.4).toFixed(2)}s;--s:${(8 + Math.random() * 14).toFixed(0)}px` }))));
    document.body.append(ov); try { navigator.vibrate && navigator.vibrate([60, 40, 120]); } catch { /* ignoré */ }
  }

  // cartes qui sortent, retournées une par une
  function reveal(pi) {
    const pk = packs[pi], pack = pk.cards, n = pack.length; let k = 0, flipped = false;
    const counter = h('p', { class: 'gcount' });
    const stage = h('div', { class: 'gstage deck' });
    const strip = h('div', { class: 'gstrip', 'aria-label': 'Cartes déjà révélées' });
    const nextBtn = h('button', { class: 'btn', type: 'button', hidden: true }, ''), carBtn = h('button', { class: 'btn sec', type: 'button', hidden: true, onclick: () => browse(pk) }, '🎠 Voir les cartes en carrousel');
    const skipBtn = h('button', { class: 'btn sec', type: 'button', onclick: () => { while (k < n) { addThumb(k); k++; } stage.replaceChildren(); counter.textContent = `Booster ${pi + 1} / ${packs.length} · terminé`; done(); } }, '⏭ Tout révéler');
    const tip = h('p', { class: 'lb-help gtip' }, '');
    function addThumb(i) {
      const e = pack[i];
      strip.append(h('button', { type: 'button', class: 'gthumb t-' + rarityTier(e.rar) + (e.reverse ? ' rv' : ''), title: `${e.c.name} · ${gameLabel(defSel, e.rar)}`, onclick: () => zoomCard(e) }, h('img', { src: imgLow(e.c), alt: e.c.name })));
    }
    const sparkles = (e) => {      // petits scintillements : reverse (plus nombreux) et simple Rare
      const reverse = !!e.reverse; if (!reverse && e.rar !== 'Rare') return null;
      return h('i', { class: 'gspark' + (reverse ? ' rev' : '') }, Array.from({ length: reverse ? 20 : 11 }, () => h('b', { style: `left:${(Math.random() * 92 + 2).toFixed(1)}%;top:${(Math.random() * 92 + 2).toFixed(1)}%;--d:${(Math.random() * 2.6).toFixed(2)}s;--s:${(7 + Math.random() * 10).toFixed(0)}px` })));
    };
    function showCard() {
      const e = pack[k], tier = rarityTier(e.rar); flipped = false;
      counter.textContent = `Booster ${pi + 1} / ${packs.length} · carte ${k + 1} / ${n}`;
      tip.textContent = 'Touche la carte pour la retourner';
      const front = h('div', { class: 'gface front' }, h('img', { src: imgHigh(e.c), alt: e.c.name, onerror: (ev) => { ev.target.replaceWith(h('div', { class: 'gph' }, e.c.name)); } }), sparkles(e));
      const flip = h('div', { class: 'gflip t-' + tier + (e.reverse ? ' reverse' : '') }, h('div', { class: 'gface back' }, h('img', { src: 'icons/icon-192.png', alt: '' })), front, h('i', { class: 'gglow' }));
      const btn = h('button', { type: 'button', class: 'gcardbtn' + (k < n - 1 ? ' pile' : ''), 'aria-label': 'Retourner la carte' }, flip);
      { const left = n - k - 1, sh = []; for (let s = 1; s <= Math.min(left, 9); s++) sh.push(`${s * 2.6}px ${s * 2.6}px 0 ${s % 2 ? '#0f1f52' : '#1c3478'}`); btn.style.setProperty('--stack', sh.join(',') || 'none'); }
      btn.addEventListener('click', () => {
        if (!flipped) {
          flipped = true; flip.classList.add('flipped');
          tip.textContent = `${e.c.name}${e.reverse ? ' (reverse)' : ''} · ${gameLabel(defSel, e.rar)}` + (e.isNew ? ' · ✨ nouvelle !' : '') + (k < n - 1 ? ' — touche pour continuer' : '');
          if (SPECIAL.includes(e.rar)) { flip.classList.add('wow'); setTimeout(() => { if (alive()) showSpecial(e, null); }, 750); }
          else if (['ultra', 'secrete', 'promo'].includes(tier) || (tier === 'holo' && e.rar !== 'Pikachu Rare')) { flip.classList.add('wow'); try { navigator.vibrate && navigator.vibrate(tier === 'secrete' ? [40, 30, 80] : 30); } catch { /* ignoré */ } }
          if (k === n - 1) setTimeout(done, 600);
        } else if (k < n - 1) { addThumb(k); k++; stage.replaceChildren(); showCard(); }
      });
      stage.replaceChildren(btn);
    }
    function done() {
      skipBtn.hidden = true;
      for (let i = strip.children.length; i < n; i++) addThumb(i);
      const left = packs.filter((p) => !p.opened).length;
      nextBtn.textContent = left ? `📦 Retour aux boosters (${left} à ouvrir)` : '📊 Voir le résumé';
      nextBtn.onclick = () => { if (left) packsScreen(packs.findIndex((p) => !p.opened)); else summary(); };
      nextBtn.hidden = false; carBtn.hidden = false;
    }
    put(nav(), counter, stage, tip, strip, h('div', { class: 'gacts' }, nextBtn, carBtn, skipBtn));
    showCard();
  }

  // classeur virtuel : toutes les cartes de la série, normales puis reverse, avec le nombre d'exemplaires
  async function binder() {
    put(spinner());
    let tab = 'n', def = defSel;
    const draw = async () => {
      const pool = await gamePool(def); if (!alive()) return;
      const b = binderLoad(), list = tab === 'r' ? pool.cards.filter((c) => hasReverse(def, c)) : pool.cards, k = tab === 'r' ? 1 : 0;
      const have = list.filter((c) => (b[c.id] || [0, 0])[k] > 0).length, copies = list.reduce((a, c) => a + ((b[c.id] || [0, 0])[k] || 0), 0);
      const pct = list.length ? Math.round(have / list.length * 100) : 0;
      const setBtns = GAME_SETS.map((d) => h('button', { type: 'button', class: 'gset small' + (d === def ? ' on' : ''), 'aria-pressed': String(d === def), onclick: () => { def = d; draw(); } }, h('img', { src: d.logo, alt: d.name, class: 'gset-logo' })));
      const tabs = [['n', 'Normales'], ['r', 'Reverse']].filter(([t]) => t === 'n' || def.reverse).map(([t, l]) => h('button', { type: 'button', 'aria-pressed': String(tab === t), onclick: () => { tab = t; draw(); } }, l));
      if (tab === 'r' && !def.reverse) tab = 'n';
      put(
        h('h2', { class: 'gh' }, '📖 Mon classeur virtuel'),
        h('div', { class: 'gsets small' }, setBtns),
        h('div', { class: 'gtabs', role: 'group' }, tabs),
        h('div', { class: 'gprog' }, h('b', {}, `${have} / ${list.length}`), h('span', {}, ` ${tab === 'r' ? 'reverse' : 'cartes'} · ${pct} % · ${plural(copies, 'exemplaire', 'exemplaires')}`), h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${pct}%` }))),
        h('div', { class: 'gbinder' }, list.map((c) => { const n = (b[c.id] || [0, 0])[k] || 0;
          return h('button', { type: 'button', class: 'gbc' + (n ? '' : ' none') + (tab === 'r' ? ' rv' : ''), title: `${c.name} · #${lidShow(c.localId)}${n ? ' · ×' + n : ' · manquante'}`, onclick: () => zoomCard({ c, rar: c.rar }) },
            h('img', { src: imgLow(c), alt: c.name, loading: 'lazy', decoding: 'async' }), n > 1 ? h('b', { class: 'gx' }, '×' + n) : null, n ? null : h('span', { class: 'gq' }, '?')); })),
        h('div', { class: 'gacts' }, h('button', { class: 'btn', type: 'button', onclick: setup }, '🎁 Ouvrir des boosters')));
    };
    await draw();
  }

  function zoomCard(e) {
    const ov = h('div', { class: 'overlay gzoom', role: 'dialog', 'aria-modal': 'true', onclick: () => ov.remove() }, h('div', { class: 'gz-in' }, h('img', { src: imgHigh(e.c), alt: e.c.name }), h('p', {}, [e.c.name, e.rar ? gameLabel(defSel, e.rar) : null].filter(Boolean).join(' · '))));
    document.body.append(ov);
  }

  // cartes d'un booster ouvert, en carrousel
  function browse(pk) {
    const items = pk.cards.map((e) => ({ card: e.c, name: e.c.name, sub: gameLabel(defSel, e.rar) + (e.reverse ? ' · reverse' : ''), price: null }));
    const ov = h('div', { class: 'overlay gcf', role: 'dialog', 'aria-modal': 'true' },
      buildCoverflow('Cartes du booster', items, (i) => zoomCard(pk.cards[i])),
      h('button', { class: 'btn sec gcf-close', type: 'button', onclick: () => ov.remove() }, 'Fermer'));
    document.body.append(ov);
  }

  // résumé : seulement les hits de la série
  function summary() {
    const hitSet = new Set(defSel.hits), hits = packs.flatMap((p) => p.cards).filter((e) => hitSet.has(e.rar));
    const cnt = {}; for (const e of hits) { const l = gameLabel(defSel, e.rar); cnt[l] = (cnt[l] || 0) + 1; }
    const nonPk = hits.filter((e) => e.rar !== 'Pikachu Rare'), pool = nonPk.length ? nonPk : hits;
    const best = pool.slice().sort((a, b) => rarityRank(b.rar) - rarityRank(a.rar))[0] || null;
    const sortKey = (r) => rarityRank(r === 'EX' ? 'Double rare' : r);
    const rows = Object.entries(cnt).sort((a, b) => sortKey(b[0]) - sortKey(a[0]));
    const sorted = hits.slice().sort((a, b) => rarityRank(b.rar) - rarityRank(a.rar));
    put(
      nav(),
      h('h2', { class: 'gh' }, `${plural(packs.length, 'booster ouvert', 'boosters ouverts')} · ${defSel.name}`),
      best ? h('div', { class: 'gbest' }, h('p', { class: 'lb-help' }, 'Meilleur hit'), h('button', { type: 'button', class: 'gthumb big t-' + rarityTier(best.rar), onclick: () => zoomCard(best) }, h('img', { src: imgHigh(best.c), alt: best.c.name })),
        h('b', {}, best.c.name), h('span', {}, gameLabel(defSel, best.rar))) : h('p', { class: 'lb-help' }, 'Aucun hit cette fois…'),
      rows.length ? h('div', { class: 'orows' }, rows.map(([r, c]) => h('div', { class: 'orow' }, h('div', { class: 'orow-l' }, h('span', { class: 'rbi' }, rarityIcon(r === 'EX' ? 'Double rare' : r, 20)), h('span', { class: 'rn' }, r), h('span', { class: 'rc' }, h('b', {}, String(c))))))) : null,
      hits.length ? buildCoverflow(`${plural(hits.length, 'hit', 'hits')} à parcourir`, sorted.map((e) => ({ card: e.c, name: e.c.name, sub: gameLabel(defSel, e.rar) + (e.reverse ? ' · reverse' : ''), price: null })), (i) => zoomCard(sorted[i])) : null,
      h('div', { class: 'gacts' }, h('button', { class: 'btn', type: 'button', onclick: start }, '🔁 Rouvrir les mêmes'), h('button', { class: 'btn sec', type: 'button', onclick: () => packsScreen(0) }, 'Revoir les boosters'), h('button', { class: 'btn sec', type: 'button', onclick: binder }, '📖 Mon classeur virtuel'), h('button', { class: 'btn sec', type: 'button', onclick: setup }, '↩ Choisir d’autres boosters')));
  }

  setup();
}
