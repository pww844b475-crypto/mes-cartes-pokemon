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
// animations intermédiaires sur la carte (sous les animations plein écran des cartes vedettes) : une signature par rareté
const FX = {
  'Double rare': { k: 'ex', buzz: 30 }, 'Illustration rare': { k: 'ir', buzz: [25, 25, 25] },
  'Ultra Rare': { k: 'ur', buzz: [40, 30, 40] }, 'Collection Classique': { k: 'cc', buzz: 20 },
};
const fxLabel = (def, r) => (r === 'Double rare' ? (def.id === '30th' ? 'EX' : 'DOUBLE RARE') : r === 'Illustration rare' ? 'ILLUSTRATION RARE' : r === 'Ultra Rare' ? 'ULTRA RARE' : r === 'Collection Classique' ? 'REPRINT' : '');

// ---------- plus la rareté est grosse, plus l'animation est spectaculaire ----------
// niveaux : 1 Rare · 2 reprint, EX/Double rare · 3 Illustration rare · 4 Ultra Rare · 5 Illustration spéciale rare · 6 Futuristic · 7 RGB et Méga Hyper Rare (jackpot)
const LEVEL = { 'Rare': 1, 'Collection Classique': 2, 'Double rare': 2, 'Illustration rare': 3, 'Ultra Rare': 4, 'Illustration spéciale rare': 5, 'Futuristic Rare': 6, 'RGB Rare': 7, 'Méga Hyper Rare': 7 };
const CONF = ['#ffd24a', '#ff6b78', '#6bd0ff', '#9d7bff', '#5be38f', '#fff'];
function confetti(parent, n, mode) {      // mode 'burst' : jaillit autour de la carte ; 'rain' : tombe de haut en bas
  const els = Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 170;
    const st = mode === 'rain' ? `left:${(Math.random() * 100).toFixed(1)}%;--dx:${(Math.random() * 80 - 40).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;--c:${CONF[Math.floor(Math.random() * CONF.length)]};--d:${(Math.random() * 2.4).toFixed(2)}s;--t:${(2.2 + Math.random() * 1.8).toFixed(2)}s`
      : `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;--c:${CONF[Math.floor(Math.random() * CONF.length)]};--d:${(Math.random() * 0.25).toFixed(2)}s`;
    return h('i', { class: 'gconf ' + mode, style: st });
  });
  parent.append(...els); return els;
}
function showSpecial(e, next) {      // animation plein écran des cartes vedettes (niveaux 5 à 7)
  const lv = LEVEL[e.rar] || 5;
  const label = e.rar === 'Méga Hyper Rare' ? 'MÉGA HYPER RARE' : e.rar === 'Illustration spéciale rare' ? 'ILLUSTRATION SPÉCIALE' : e.rar === 'Futuristic Rare' ? 'FUTURISTIC RARE' : 'RGB RARE';
  const nSparks = [0, 0, 0, 0, 0, 34, 60, 95][lv];
  const ov = h('div', { class: 'overlay gspecial lv' + lv, role: 'dialog', 'aria-modal': 'true', onclick: () => { ov.remove(); if (next) next(); } },
    h('i', { class: 'gsp-rays' }), h('i', { class: 'gsp-flash' }), lv >= 6 ? h('i', { class: 'gsp-flash two' }) : null, lv >= 7 ? h('i', { class: 'gsp-vignette' }) : null,
    h('div', { class: 'gsp-in' }, lv >= 7 ? h('p', { class: 'gsp-jack' }, '✦ JACKPOT ✦') : null, h('p', { class: 'gsp-lab' }, label), h('div', { class: 'gsp-card' }, h('img', { src: imgHigh(e.c), alt: e.c.name }), h('i', { class: 'gsp-sheen' })), h('b', {}, e.c.name), h('small', {}, 'Touche pour continuer')),
    h('div', { class: 'gsp-sparks' }, Array.from({ length: nSparks }, () => h('b', { style: `left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 2.4).toFixed(2)}s;--s:${(8 + Math.random() * 14).toFixed(0)}px` }))));
  document.body.append(ov);
  if (lv >= 6) confetti(ov, lv >= 7 ? 90 : 36, lv >= 7 ? 'rain' : 'burst');
  try { navigator.vibrate && navigator.vibrate(lv >= 7 ? [80, 40, 80, 40, 80, 40, 220] : lv === 6 ? [70, 40, 70, 40, 160] : [60, 40, 120]); } catch { /* ignoré */ }
}
const pickOne = (a, not) => { const b = not && not.size ? a.filter((x) => !not.has(x)) : a; const l = b.length ? b : a; return l[Math.floor(Math.random() * l.length)]; };

// ---------- boosters à ouvrir (gagnés), récompenses et classeur virtuel (séparé de la vraie collection) ----------
const GAME_KEY = 'cartes.game', BINDER_KEY = 'cartes.vbinder';
const REWARD_DAILY = 10, REWARD_SCAN = 3;
const CAP_STOCK = 50;      // plafond du solde de boosters à ouvrir (vraies parties) ; le mode test n'a pas de limite
const TEST_KEY = 'cartes.gametest', STATS_KEY = 'cartes.gamestats';
const testMode = () => store.get(TEST_KEY) === '1';
function gameState() {
  let s = null; try { s = JSON.parse(store.get(GAME_KEY) || 'null'); } catch { s = null; }
  if (!s || typeof s !== 'object') s = {};
  return { credits: Math.max(0, Math.floor(Number(s.credits) || 0)), daily: typeof s.daily === 'string' ? s.daily : '', scans: s.scans && typeof s.scans === 'object' ? s.scans : {}, rewarded: Array.isArray(s.rewarded) ? s.rewarded : [] };
}
const gameSave = (s) => store.set(GAME_KEY, JSON.stringify(s));
function dailyLogin() {      // une fois par jour, à l'ouverture de l'application : +10 boosters
  const s = gameState(), today = dayKey(); if (s.daily === today) return 0;
  const before = s.credits; s.daily = today; s.credits = Math.max(s.credits, Math.min(CAP_STOCK, s.credits + REWARD_DAILY)); s.scans = Object.fromEntries(Object.entries(s.scans).filter(([, d]) => d === today)); gameSave(s);
  return s.credits - before;
}
function gameScanReward(cardId) {      // scan réussi (carte reconnue directement) : +3 boosters, une seule fois par carte et par jour
  if (!cardId) return 0; const s = gameState(), today = dayKey(); if (s.scans[cardId] === today) return 0;
  const before = s.credits; s.scans[cardId] = today; s.credits = Math.max(s.credits, Math.min(CAP_STOCK, s.credits + REWARD_SCAN)); gameSave(s); return s.credits - before;
}
// +1 booster par carte ajoutée à la vraie collection (française), une seule fois par carte : l'enlever puis la remettre ne rapporte rien de plus
function syncCardRewards() {
  try {
    const s = gameState(), seen = new Set(s.rewarded); let gain = 0;
    for (const [sid, m] of Object.entries((owned && owned.fr) || {})) {
      if (isDigital('fr', sid) || DIGITAL_FALLBACK_FR.includes(sid)) continue;      // extensions du jeu en ligne exclues
      for (const [id, v] of Object.entries(m || {})) {
        if (s.credits + gain >= CAP_STOCK) break;      // plafond atteint : les autres cartes attendent, un booster leur sera versé quand il y aura de la place
        if (qtyTotal(v) > 0 && !seen.has(id)) { seen.add(id); s.rewarded.push(id); gain++; }
      }
    }
    if (gain) { s.credits += gain; gameSave(s); }
    return gain;
  } catch { return 0; }
}
function pendingCardRewards() {      // cartes de la collection qui attendent encore leur booster (plafond atteint)
  try { const seen = new Set(gameState().rewarded); let n = 0; for (const [sid, m] of Object.entries((owned && owned.fr) || {})) { if (isDigital('fr', sid) || DIGITAL_FALLBACK_FR.includes(sid)) continue; for (const [id, v] of Object.entries(m || {})) if (qtyTotal(v) > 0 && !seen.has(id)) n++; } return n; } catch { return 0; }
}
// statistiques par série : boosters comptés, temps de jeu (pauses de plus de 5 min ignorées), et le jour où le classeur est complet
function statsLoad() { try { const o = JSON.parse(store.get(STATS_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
const statsSave = (o) => store.set(STATS_KEY, JSON.stringify(o));
const fmtDur = (ms) => { const m = Math.round(ms / 60000), hh = Math.floor(m / 60); return hh ? `${hh} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };
function binderComplete(def, pool, b) {
  return pool.cards.length > 0 && pool.cards.every((c) => { const en = b[c.id] || [0, 0]; return en[0] > 0 && (!hasReverse(def, c) || en[1] > 0); });
}
function binderLoad() { try { const o = JSON.parse(store.get(BINDER_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
const binderSave = (o) => store.set(BINDER_KEY, JSON.stringify(o));
let gamePools = {};
async function gamePool(def) {
  if (gamePools[def.id]) return gamePools[def.id];
  await Promise.all([metaReady, scansReady, orderReady]);
  const names = await fetch('data/names.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  const cards = [];
  for (const sid of def.members) {
    const info = await loadCardInfo('fr', sid), part = [];
    for (const row of names[sid] || []) {
      const odd = typeof row[2] === 'string', lidRaw = odd ? row[1] : row[0], nm = odd ? row[2] : row[1], id = odd ? row[0] : sid + '-' + lidRaw, noImg = odd ? row[3] === 0 : row[2] === 0;
      part.push({ id, localId: lidRaw, name: nm, image: tcgImage('fr', sid, lidRaw, noImg), rar: (info.get(id) || {}).rar || null });
    }
    cards.push(...sortCards('fr', sid, part));      // vrai ordre de la collection (PokéCardex), comme dans l'écran des extensions
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

  const maxCount = () => (testMode() ? 500 : 36);      // mode test : jusqu'à 500 boosters d'un coup (à retirer après les essais)
  function setup() {
    imm(false);
    const cardsEl = GAME_SETS.map((d) => h('button', { type: 'button', class: 'gset' + (d === defSel ? ' on' : ''), 'aria-pressed': String(d === defSel), onclick: () => { defSel = d; setup(); } },
      h('img', { src: d.logo, alt: '', class: 'gset-logo', width: 200, height: 80 }), h('b', {}, d.name)));      // la composition du booster ne s'affiche plus sous la série
    const inp = h('input', { class: 'qin bo-in', type: 'number', inputmode: 'numeric', min: '1', max: String(maxCount()), value: String(count), 'aria-label': 'Nombre de boosters à ouvrir' });
    syncCardRewards();
    const credits = gameState().credits;
    const tm = testMode(), pend = pendingCardRewards();
    const bank = h('div', { class: 'gbank' }, h('b', {}, tm ? '🎟 ∞' : `🎟 ${credits}`), h('span', {}, tm ? 'ouvertures illimitées (mode test)' : (credits === 1 ? 'booster à ouvrir' : 'boosters à ouvrir')),
      h('small', {}, `Gagne-en : +${REWARD_DAILY} chaque jour à l’ouverture de l’appli, +${REWARD_SCAN} par carte reconnue directement au scanner (une fois par carte et par jour), +1 pour chaque carte ajoutée à ta collection (une seule fois par carte : l’enlever puis la remettre ne rapporte rien). Le solde est plafonné à ${CAP_STOCK}.` + (pend ? ` ${pend} cartes de ta collection attendent leur booster : ils arrivent au fur et à mesure que tu en ouvres.` : '')));
    const openBtn = h('button', { class: 'btn', type: 'button', onclick: start });
    const label = () => {
      const kept = testMode() ? count : Math.min(count, credits), free = count - kept;
      openBtn.textContent = `🎁 Ouvrir ${count > 1 ? `les ${count} boosters` : 'le booster'}` + (free ? ` (${free} pour le plaisir)` : '');
    };
    const setN = (v) => { count = Math.max(1, Math.min(maxCount(), Number.isFinite(v) ? v : 1)); inp.value = String(count); label(); };
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
      h('button', { class: 'btn sec', type: 'button', onclick: showRates }, 'ℹ️ Taux de tirage utilisés'),
      h('button', { class: 'btn sec gtest', type: 'button', onclick: resetSheet }, testMode() ? '🧪 Mode test activé · réglages' : '🧪 Mode test et remise à zéro'));
  }

  // mode test : ouvertures illimitées (pour mesurer le temps de remplissage des classeurs) et remise à zéro
  function resetSheet() {
    const doReset = (withBinder) => {
      store.set(GAME_KEY, JSON.stringify({ credits: 0, daily: '', scans: {}, rewarded: [] }));
      if (withBinder) { store.set(BINDER_KEY, '{}'); store.set(STATS_KEY, '{}'); }
      closeSheet(); const gain = dailyLogin() + syncCardRewards();
      toast(`🧪 Réinitialisé : ${gain} boosters recrédités (plafond ${CAP_STOCK})` + (withBinder ? ', classeur et statistiques vidés' : ''));
      setup();
    };
    const on = testMode(), st = statsLoad();
    const rows = GAME_SETS.map((d) => { const r = st[d.id];
      return h('div', { class: 'orow' }, h('div', { class: 'orow-l' }, h('span', { class: 'rn' }, d.name), h('span', { class: 'rc' }, r ? `${r.n} boosters · ${fmtDur(r.active)}` + (r.done ? ` · 🏆 complet en ${r.done.n} boosters, ${fmtDur(r.done.active)}` : '') : 'pas encore ouvert'))); });
    const sw = h('input', { type: 'checkbox', role: 'switch', 'aria-label': 'Mode test : ouvertures illimitées' }); sw.checked = on;
    sw.addEventListener('change', () => { store.set(TEST_KEY, sw.checked ? '1' : '0'); closeSheet(); toast(sw.checked ? '🧪 Mode test : ouvertures illimitées' : 'Mode test désactivé : les boosters gagnés comptent à nouveau'); setup(); });
    openSheet(h('h2', {}, '🧪 Mode test'),
      h('label', { class: 'orow-l' }, sw, h('span', { class: 'rn' }, 'Ouvertures illimitées : aucun booster à gagner, tout est gardé dans le classeur')),
      h('p', { class: 'lb-help' }, 'Pour voir combien de boosters et de temps il faut pour remplir tous les classeurs virtuels. Le temps compte seulement les périodes de jeu (une pause de plus de 5 minutes n’est pas comptée).'),
      h('h3', {}, 'Statistiques par série'), h('div', { class: 'orows' }, rows),
      h('h3', {}, 'Remise à zéro'),
      h('p', { class: 'lb-help' }, `Remet à zéro les boosters et les récompenses déjà versées, puis recrédite la connexion du jour et les cartes de ta collection (dans la limite de ${CAP_STOCK}). Ta vraie collection n’est jamais touchée.`),
      h('button', { class: 'btn', type: 'button', onclick: () => doReset(false) }, 'Réinitialiser les boosters (garder classeur et statistiques)'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => doReset(true) }, 'Tout réinitialiser, classeur et statistiques compris'),
      h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Fermer'));
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
    packs = Array.from({ length: count }, (_, i) => ({ keep: testMode() || i < credits, committed: false, cards: drawPack(defSel, pool), art: arts.length ? (ch !== undefined && arts[ch] ? arts[ch] : arts[Math.floor(Math.random() * arts.length)]) : null, opened: false }));
    for (const p of packs.slice(0, 12)) for (const e of p.cards) { const im = new Image(); im.src = imgHigh(e.c); }      // images préchargées pendant l'animation (les 12 premiers boosters)
    packsScreen();
  }

  // à l'ouverture d'un booster : un booster gagné est débité et ses cartes vont dans le classeur (les boosters « pour le plaisir » ne comptent pas)
  function commitPack(p) {
    if (p.committed) return; p.committed = true;
    if (!p.keep) return;
    if (!testMode()) { const s = gameState(); if (s.credits < 1) { p.keep = false; return; } s.credits--; gameSave(s); }
    const b = binderLoad();
    for (const e of p.cards) { const en = b[e.c.id] || [0, 0], k = e.reverse ? 1 : 0; e.isNew = en[k] === 0; en[k]++; b[e.c.id] = en; }
    binderSave(b);
    const st = statsLoad(), now = Date.now(), r = st[defSel.id] || (st[defSel.id] = { n: 0, t0: now, last: now, active: 0, done: null });
    r.active += Math.min(now - r.last, 300000); r.last = now; r.n++;
    const pool = gamePools[defSel.id];
    if (!r.done && pool && binderComplete(defSel, pool, b)) { r.done = { n: r.n, active: r.active, at: now }; p.completed = true; }
    statsSave(st);
  }

  // ---------- parcours d'ouverture, comme dans la vidéo : carrousel 3D → booster choisi en grand → trait lumineux → cartes une à une → résumé ----------
  const imm = (on) => { main.classList.toggle('imm', !!on); main.classList.remove('holding'); };      // décor clair de l'ouverture
  const raritySpot = (e) => h('div', { class: 'grar' }, h('span', { class: 'grar-ic' }, rarityIcon(e.rar, 30)), h('span', { class: 'grar-t' }, [gameLabel(defSel, e.rar), e.reverse ? 'reverse' : null].filter(Boolean).join(' · ')), e.isNew ? h('b', { class: 'grar-new' }, '✨ nouvelle !') : null);
  function packsScreen(focus) {
    imm(true);
    const d = defSel, n = packs.length, P = 1300;      // P : distance de perspective
    const stageW = Math.min(main.clientWidth || window.innerWidth, 560), RATIO = (packs[0].art ? packs[0].art.h / packs[0].art.w : 1.733);
    const IW = Math.round(Math.min(stageW * 0.42, 170, (window.innerHeight * 0.44) / RATIO)), IH = Math.round(IW * RATIO);      // le booster s'adapte à la largeur ET à la hauteur de l'écran (petit écran, écran déplié, paysage)
    const step = 30, R = Math.round((IW / 2 + 14) / Math.tan(step * Math.PI / 360)), wrap = false, BOT = Math.round(IH * 0.42);      // éventail en arc de cercle : seuls les boosters proches du centre sont dessinés
    let heldZ = 0;
    let cur = focus !== undefined ? focus : Math.max(0, packs.findIndex((p) => !p.opened)), held = null, tween = 0;
    const call = h('p', { class: 'gcall' }), info = h('p', { class: 'gcount' });
    const items = packs.map((p, i) => {
      const body = p.art
        ? [h('span', { class: 'gpi-body' }), h('span', { class: 'gpi-top' })]
        : [h('span', { class: 'gp-top' }), h('span', { class: 'gp-body' }, h('img', { src: d.logo, alt: '', class: 'gp-logo' }), h('b', {}, 'BOOSTER'), h('small', {}, d.cards + ' cartes'))];
      const out = h('div', { class: 'gout' }, h('img', { src: imgHigh(p.cards[0].c), alt: '' }));      // la 1re carte qui sort du booster déchiré
      const trail = h('i', { class: 'gtl-trail' });
      const tear = h('div', { class: 'gtear', role: 'slider', 'aria-label': 'Glisse le doigt sur la ligne lumineuse pour déchirer le booster' }, h('i', { class: 'gtl-glint' }), trail);
      const el = h('div', { class: 'gpack gcar' + (p.art ? ' gpi' : ''), style: p.art ? `--img:url("${p.art.u}");--ar:${p.art.w} / ${p.art.h};--r:${RATIO.toFixed(4)};--iw:${IW}px` : `--c1:${d.tint[0]};--c2:${d.tint[1]};--r:1.733;--iw:${IW}px` }, out, ...body, h('span', { class: 'gp-shine' }), tear, h('b', { class: 'gopened' }, '✓ ouvert'), p.keep ? null : h('i', { class: 'gfree' }, 'pour le plaisir'));
      const item = h('div', { class: 'gri', role: 'listitem', 'data-i': String(i), style: `width:${IW}px;margin-left:${-IW / 2}px;transform:rotateY(${(i * step).toFixed(3)}deg) translateZ(${R}px)` }, el);
      // trait de déchirure : un balayage horizontal sur la ligne lumineuse (n'importe quel sens, trait approximatif accepté, la progression se garde entre deux essais)
      let drag = null, prog = 0;
      tear.addEventListener('pointerdown', (ev) => { if (held !== i || p.opened || el.classList.contains('tear')) return; try { tear.setPointerCapture(ev.pointerId); } catch { /* ignoré */ } drag = { last: ev.clientX, w: tear.getBoundingClientRect().width }; ev.preventDefault(); ev.stopPropagation(); });
      tear.addEventListener('pointermove', (ev) => {
        if (!drag) return; prog += Math.abs(ev.clientX - drag.last) / (drag.w * 0.5); drag.last = ev.clientX;
        const pr = Math.min(1, prog); el.style.setProperty('--p', pr.toFixed(3)); trail.style.width = (pr * 100).toFixed(1) + '%';
        if (pr >= 1) { drag = null; rip(i); }
      });
      const end = () => { drag = null; };
      tear.addEventListener('pointerup', end); tear.addEventListener('pointercancel', end);
      return { item, el, p, i };
    });
    const ring = h('div', { class: 'gring' }, items.map((x) => x.item));
    const stage = h('div', { class: 'grs', style: `height:${IH + 45 + BOT}px;--iw:${IW}px;perspective-origin:50% ${45 + IH / 2}px` }, ring);
    ring.style.top = '45px';
    const idxOf = (c) => Math.max(0, Math.min(n - 1, Math.round(c)));
    let shown = new Set(items.map((x) => x.i));      // au premier affichage, tout ce qui est hors de la fenêtre visible est masqué
    const place = () => {
      ring.style.transform = `translateZ(${-R}px)`;
      const f = held === null ? cur : Math.round(cur), lo = Math.max(0, Math.floor(f) - 6), hi = Math.min(n - 1, Math.ceil(f) + 6), now = new Set();
      for (let i = lo; i <= hi; i++) {
        const x = items[i], rel = i - f, a = Math.abs(rel); now.add(i);
        x.item.style.visibility = ''; x.item.style.transform = `rotateY(${(rel * step).toFixed(2)}deg) translateZ(${R + (held === i ? heldZ : 0)}px)`;
        x.item.style.opacity = held !== null ? (i === held ? '1' : '0') : String(Math.max(0.3, 1 - 0.2 * a).toFixed(2));
        x.el.classList.toggle('near', a <= 1.2); x.el.classList.toggle('sel', i === idxOf(f)); x.el.classList.toggle('opened', x.p.opened);
      }
      for (const i of shown) if (!now.has(i)) items[i].item.style.visibility = 'hidden';
      shown = now;
      const op = packs.filter((q) => q.opened).length, left = n - op;
      call.textContent = held !== null ? 'Fais glisser ton doigt sur la ligne lumineuse' : left ? 'Touchez un Booster à ouvrir !' : 'Tous les boosters sont ouverts';
      info.textContent = n > 1 ? `Booster ${idxOf(cur) + 1} / ${n}${packs[idxOf(cur)].opened ? ' · ouvert' : ''}` : '';
      sumBtn.hidden = !op; openBtn2.hidden = held === null; allBtn.hidden = left < 2 || held !== null;
      allBtn.textContent = `⏭ Ouvrir les ${left} boosters d’un coup`;
    };
    function rotateTo(t, ms, done) {      // fait tourner l'anneau jusqu'à t (en nombre de boosters), avec une douce décélération
      cancelAnimationFrame(tween); const c0 = cur, t0 = performance.now();
      const tick = (now) => { const u = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - u, 3); cur = c0 + (t - c0) * e; place(); if (u < 1) tween = requestAnimationFrame(tick); else { cur = t; place(); if (done) done(); } };
      tween = requestAnimationFrame(tick);
    }
    const nearest = (i) => i;
    function hold(i) {      // le booster choisi vient au centre et grossit, les autres s'effacent
      held = i; ring.classList.remove('drag'); stage.classList.add('locked'); main.classList.add('holding');
      rotateTo(i, 380, () => {
        const k = Math.max(1, Math.min(1.6, (window.innerWidth * 0.8) / IW, (window.innerHeight - 350) / IH)), H = Math.round(IH * k + 90);
        heldZ = Math.round(P * (1 - 1 / k)); items[i].item.style.transition = 'transform .5s cubic-bezier(.2, 1, .3, 1)';
        items[i].el.classList.add('held'); stage.style.height = H + 'px'; ring.style.top = Math.round((H - IH) / 2) + 'px'; stage.style.perspectiveOrigin = `50% ${Math.round(H / 2)}px`; place();
        try { scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* ignoré */ }
      });
      releaseBtn.hidden = false; place();
    }
    function release() {
      const i = held; held = null; heldZ = 0; stage.classList.remove('locked'); main.classList.remove('holding'); stage.style.height = IH + 45 + BOT + 'px'; ring.style.top = '45px'; stage.style.perspectiveOrigin = `50% ${45 + IH / 2}px`;
      if (i !== null) { items[i].el.classList.remove('held'); items[i].el.style.setProperty('--p', 0); items[i].item.style.transition = ''; }
      releaseBtn.hidden = true; place();
    }
    // glisser pour faire tourner ; un simple toucher choisit le booster touché
    let gd = null;
    stage.addEventListener('pointerdown', (ev) => { if (held !== null || ev.target.closest('.gtear')) return; cancelAnimationFrame(tween); gd = { x: ev.clientX, c: cur, t: performance.now(), moved: false, lx: ev.clientX, lt: performance.now(), v: 0, tgt: ev.target.closest('.gri') }; try { stage.setPointerCapture(ev.pointerId); } catch { /* ignoré */ } });
    stage.addEventListener('pointermove', (ev) => {
      if (!gd) return; const dx = ev.clientX - gd.x; if (Math.abs(dx) > 8) { gd.moved = true; ring.classList.add('drag'); }
      if (!gd.moved) return;
      let c = gd.c - dx / (IW * 0.85); if (!wrap) c = Math.max(-0.3, Math.min(n - 0.7, c)); cur = c;
      const now = performance.now(); gd.v = (ev.clientX - gd.lx) / Math.max(1, now - gd.lt); gd.lx = ev.clientX; gd.lt = now; place();
    });
    const up = () => {
      if (!gd) return; const g0 = gd; gd = null; ring.classList.remove('drag');
      if (!g0.moved) { if (g0.tgt) { const i = Number(g0.tgt.dataset.i); if (packs[i].opened) bsum(i); else hold(i); } return; }
      let t = Math.round(cur - g0.v * 350 / (IW * 0.85)); if (!wrap) t = Math.max(0, Math.min(n - 1, t)); rotateTo(t, 420);
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    function rip(i) {
      const x = items[i]; x.el.classList.add('tear'); x.item.append(h('i', { class: 'gpuff' })); try { navigator.vibrate && navigator.vibrate(25); } catch { /* ignoré */ }
      commitPack(x.p); setTimeout(() => { if (alive()) { x.p.opened = true; reveal(i); } }, 1750);      // le haut s'envole, la carte sort du booster, puis les cartes s'affichent
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
    put(nav(), call, info, stage, h('div', { class: 'gacts' }, allBtn, sumBtn, openBtn2, releaseBtn));
    requestAnimationFrame(() => { place(); });
  }

  // les cartes une à une : face visible, la suivante arrive de la droite par-dessus ; on touche ou on balaie ; « Maintenir » accélère
  function reveal(pi) {
    imm(true);
    const pk = packs[pi], pack = pk.cards, n = pack.length; let k = 0, busy = false, fast = null;
    const counter = h('p', { class: 'gcount' });
    const stage = h('div', { class: 'gstage deck' });
    const rarRow = h('div', { class: 'grar-wrap' });
    const sparkles = (e) => {      // petits scintillements : reverse (plus nombreux) et simple Rare
      const reverse = !!e.reverse; if (!reverse && e.rar !== 'Rare') return null;
      return h('i', { class: 'gspark' + (reverse ? ' rev' : '') }, Array.from({ length: reverse ? 20 : 11 }, () => h('b', { style: `left:${(Math.random() * 92 + 2).toFixed(1)}%;top:${(Math.random() * 92 + 2).toFixed(1)}%;--d:${(Math.random() * 2.6).toFixed(2)}s;--s:${(7 + Math.random() * 10).toFixed(0)}px` })));
    };
    function applyFx(btn, face, e) {      // signature de rareté : animation plein écran (niveaux 5 à 7) ou sur la carte (2 à 4)
      const tier = rarityTier(e.rar);
      if (SPECIAL.includes(e.rar)) { face.classList.add('wow'); busy = true; setTimeout(() => { if (alive() && stage.isConnected) showSpecial(e, () => { busy = false; }); else busy = false; }, 500); return; }      // une carte vedette ne peut pas être sautée : on attend la fin de son animation
      if (FX[e.rar]) {
        const fx = FX[e.rar], lvl = LEVEL[e.rar] || 2; face.classList.add('wow', 'fx-' + fx.k);
        const gf = h('i', { class: 'gfx fx-' + fx.k + ' lvl' + lvl }); btn.append(gf, h('b', { class: 'gbanner fx-' + fx.k }, fxLabel(defSel, e.rar)));
        if (lvl >= 3) confetti(gf, lvl === 3 ? 10 : 28, 'burst');
        try { navigator.vibrate && navigator.vibrate(fx.buzz); } catch { /* ignoré */ }
      } else if (['ultra', 'secrete', 'promo'].includes(tier) || (tier === 'holo' && e.rar !== 'Pikachu Rare')) { face.classList.add('wow'); try { navigator.vibrate && navigator.vibrate(30); } catch { /* ignoré */ } }
    }
    function cardEl(i) {
      const e = pack[i], tier = rarityTier(e.rar);
      const face = h('div', { class: 'gcv t-' + tier + (e.reverse ? ' reverse' : '') }, h('img', { src: imgHigh(e.c), alt: e.c.name, draggable: 'false', onerror: (ev) => { ev.target.replaceWith(h('div', { class: 'gph' }, e.c.name)); } }), sparkles(e));
      const btn = h('button', { type: 'button', class: 'gcardbtn' + (i < n - 1 ? ' pile' : ''), 'aria-label': 'Carte suivante' }, face);
      { const left = n - i - 1, sh = []; for (let s = 1; s <= Math.min(left, 9); s++) sh.push(`${s * 2.6}px ${s * 2.6}px 0 ${s % 2 ? '#8da4d4' : '#a9bde6'}`); btn.style.setProperty('--stack', sh.join(',') || 'none'); }
      return { btn, face, e };
    }
    function show(first) {
      const c = cardEl(k); c.btn.classList.add(first ? 'enter-rise' : 'enter');
      counter.textContent = `Booster ${pi + 1} / ${packs.length} · carte ${k + 1} / ${n}`;
      rarRow.replaceChildren(raritySpot(c.e));
      stage.append(c.btn);
      let sx = null, swiped = false;      // un toucher ou un balayage fait passer à la carte suivante
      c.btn.addEventListener('pointerdown', (ev) => { sx = ev.clientX; swiped = false; });
      c.btn.addEventListener('pointerup', (ev) => { if (sx !== null && Math.abs(ev.clientX - sx) > 40) { swiped = true; advance(); } sx = null; });
      c.btn.addEventListener('click', () => { if (swiped) { swiped = false; return; } advance(); });
      setTimeout(() => { if (alive()) applyFx(c.btn, c.face, c.e); }, first ? 700 : 380);
      return c;
    }
    function advance() {
      if (busy) return;
      if (document.querySelector('.gspecial')) return;
      const cardNow = stage.lastElementChild;
      if (k >= n - 1) { stopFast(); bsum(pi); return; }
      busy = true; if (cardNow) cardNow.classList.add('leave');
      setTimeout(() => { if (!alive()) return; stage.replaceChildren(); k++; show(false); busy = false; }, 260);
    }
    function stopFast() { if (fast) { clearInterval(fast); fast = null; } }
    const holdBtn = h('button', { class: 'gfast', type: 'button', 'aria-label': 'Maintenir pour accélérer' }, h('span', {}, '⏩'), h('small', {}, 'Maintenir'));
    holdBtn.addEventListener('pointerdown', (ev) => { ev.preventDefault(); stopFast(); fast = setInterval(() => { if (document.querySelector('.gspecial')) return; advance(); }, 480); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) holdBtn.addEventListener(t, stopFast);
    put(nav(), counter, stage, rarRow, h('div', { class: 'gacts rv' }, h('button', { class: 'btn sec', type: 'button', onclick: () => { stopFast(); bsum(pi); } }, '⏭ Passer au résumé'), holdBtn));
    show(true);
  }

  // résumé de l'ouverture d'un booster : toutes ses cartes en grille avec le nombre d'exemplaires possédés dans le classeur virtuel
  function bsum(pi) {
    imm(true);
    const pk = packs[pi], b = binderLoad(), left = packs.filter((p) => !p.opened).length;
    const total = (id) => { const en = b[id] || [0, 0]; return en[0] + en[1]; };
    const nextBtn = h('button', { class: 'btn', type: 'button', onclick: () => { if (left) packsScreen(packs.findIndex((p) => !p.opened)); else summary(); } }, left ? `Suivant (${left} booster${left > 1 ? 's' : ''} à ouvrir)` : 'Suivant · résumé des hits');
    put(nav(),
      h('h2', { class: 'gh' }, 'Résumé ouverture'),
      pk.completed ? h('p', { class: 'gcomplete' }, `🏆 Classeur ${defSel.name} complet : ${statsLoad()[defSel.id].done.n} boosters, ${fmtDur(statsLoad()[defSel.id].done.active)} de jeu !`) : null,
      h('div', { class: 'gsumgrid' }, pk.cards.map((e) => h('button', { type: 'button', class: 'gsc t-' + rarityTier(e.rar) + (e.reverse ? ' rv' : ''), title: `${e.c.name} · ${gameLabel(defSel, e.rar)}`, onclick: () => zoomCard(e) },
        h('img', { src: imgLow(e.c), alt: e.c.name }), pk.keep ? h('b', { class: 'gsc-n' }, String(total(e.c.id))) : null, e.isNew ? h('i', { class: 'gsc-new' }, 'NEW') : null))),
      h('div', { class: 'gacts' }, nextBtn, h('button', { class: 'btn sec', type: 'button', onclick: () => browse(pk) }, '🎠 Voir les cartes en carrousel'), h('button', { class: 'btn sec', type: 'button', onclick: binder }, '📖 Mon classeur virtuel')));
  }

  // classeur virtuel : toutes les cartes de la série, normales puis reverse, avec le nombre d'exemplaires
  const statsBox = (d) => { const r = statsLoad()[d.id]; if (!r) return null;
    return h('p', { class: 'lb-help gstat' }, `${plural(r.n, 'booster ouvert', 'boosters ouverts')} · ${fmtDur(r.active)} de jeu` + (r.done ? ` · 🏆 classeur complet en ${r.done.n} boosters (${fmtDur(r.done.active)})` : '')); };
  async function binder() {
    imm(false); put(spinner());
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
        statsBox(def),
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
    imm(false);
    const openedPacks = packs.filter((p) => p.opened);      // seuls les boosters déjà ouverts comptent : le résumé ne doit rien révéler des autres
    const hitSet = new Set(defSel.hits), hits = openedPacks.flatMap((p) => p.cards).filter((e) => hitSet.has(e.rar));
    const cnt = {}; for (const e of hits) { const l = gameLabel(defSel, e.rar); cnt[l] = (cnt[l] || 0) + 1; }
    const nonPk = hits.filter((e) => e.rar !== 'Pikachu Rare'), pool = nonPk.length ? nonPk : hits;
    const best = pool.slice().sort((a, b) => rarityRank(b.rar) - rarityRank(a.rar))[0] || null;
    const sortKey = (r) => rarityRank(r === 'EX' ? 'Double rare' : r);
    const rows = Object.entries(cnt).sort((a, b) => sortKey(b[0]) - sortKey(a[0]));
    const sorted = hits.slice().sort((a, b) => rarityRank(b.rar) - rarityRank(a.rar));
    put(
      nav(),
      h('h2', { class: 'gh' }, `${plural(openedPacks.length, 'booster ouvert', 'boosters ouverts')}${openedPacks.length < packs.length ? ` sur ${packs.length}` : ''} · ${defSel.name}`),
      best ? h('div', { class: 'gbest' }, h('p', { class: 'lb-help' }, 'Meilleur hit'), h('button', { type: 'button', class: 'gthumb big t-' + rarityTier(best.rar), onclick: () => zoomCard(best) }, h('img', { src: imgHigh(best.c), alt: best.c.name })),
        h('b', {}, best.c.name), h('span', {}, gameLabel(defSel, best.rar))) : h('p', { class: 'lb-help' }, 'Aucun hit cette fois…'),
      rows.length ? h('div', { class: 'orows' }, rows.map(([r, c]) => h('div', { class: 'orow' }, h('div', { class: 'orow-l' }, h('span', { class: 'rbi' }, rarityIcon(r === 'EX' ? 'Double rare' : r, 20)), h('span', { class: 'rn' }, r), h('span', { class: 'rc' }, h('b', {}, String(c))))))) : null,
      hits.length ? buildCoverflow(`${plural(hits.length, 'hit', 'hits')} à parcourir`, sorted.map((e) => ({ card: e.c, name: e.c.name, sub: gameLabel(defSel, e.rar) + (e.reverse ? ' · reverse' : ''), price: null })), (i) => zoomCard(sorted[i])) : null,
      h('div', { class: 'gacts' }, h('button', { class: 'btn', type: 'button', onclick: start }, '🔁 Rouvrir les mêmes'), h('button', { class: 'btn sec', type: 'button', onclick: () => packsScreen(0) }, 'Revoir les boosters'), h('button', { class: 'btn sec', type: 'button', onclick: binder }, '📖 Mon classeur virtuel'), h('button', { class: 'btn sec', type: 'button', onclick: setup }, '↩ Choisir d’autres boosters')));
  }

  setup();
}
