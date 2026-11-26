'use strict';
/* ---------- Jeu : ouverture virtuelle de boosters (juste pour le plaisir : rien n'est ajouté à la collection) ----------
   Chargé avant app.js : n'utilise les fonctions de app.js (h, setMeta, loadCardInfo, applyScans, imgHigh, rarityTier…) qu'au moment d'être appelé. */

// Taux et compositions : estimations communautaires (Pokémon n'en publie pas). Sources : TCGplayer (≈ 3 000 boosters du 30ᵉ Anniversaire :
// Illustration rare ≈ 1 sur 5, Collection Classique ≈ 1 sur 10, Illustration spéciale ≈ 1 sur 21, Futuristic ≈ 1 sur 120) et estimations des
// extensions « Méga-Évolution » pour Règne Delta (Double rare ≈ 1 sur 5, Illustration rare ≈ 1 sur 9, Ultra rare ≈ 1 sur 12, Illustration spéciale ≈ 1 sur 82,
// Méga Hyper Rare ≈ 1 sur 1 100). Ce sont des ordres de grandeur, pas des chiffres officiels.
const GAME_SETS = [
  { id: '30th', name: '30ᵉ Anniversaire', members: ['30th', '30th-c'], logo: 'images/set-logos/30th.webp', cards: 6, tint: ['#ffcf3a', '#e8731f'],
    desc: '6 cartes : 2 communes, 1 énergie, 1 carte « Illustration rare / Collection Classique » possible, 1 Pikachu Rare garanti, 1 carte rare ou mieux.',
    rates: [['Illustration rare (3ᵉ carte)', '1 sur 5'], ['Collection Classique (3ᵉ carte)', '1 sur 10'], ['EX (dernière carte)', '1 sur 4'], ['Illustration spéciale rare', '1 sur 21'], ['Futuristic Rare', '1 sur 120'], ['RGB Rare (Mew R / G / B)', '1 sur 660']] },
  { id: 'me06', name: 'Règne Delta', members: ['me06'], logo: 'images/set-logos/me06.webp', cards: 10, tint: ['#3fd0ff', '#2a56d6'],
    desc: '10 cartes : 4 communes, 3 peu communes, 1 reverse, 1 énergie, 1 carte rare ou mieux.',
    rates: [['Double rare', '1 sur 5'], ['Illustration rare', '1 sur 9'], ['Ultra Rare', '1 sur 12'], ['Illustration spéciale rare', '1 sur 82'], ['Méga Hyper Rare', '1 sur 1 100']] },
];
const gameLabel = (def, r) => (def.id === '30th' && r === 'Double rare' ? 'EX' : r);
const pickOne = (a, not) => { const b = not && not.size ? a.filter((x) => !not.has(x)) : a; const l = b.length ? b : a; return l[Math.floor(Math.random() * l.length)]; };

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

// Tirage d'un booster : liste de { c: carte | null, rar, energy?, reverse? } dans l'ordre de révélation (la meilleure carte en dernier)
function drawPack(def, pool) {
  const by = pool.by, out = [], used = new Set(), r = Math.random;
  const take = (rar, extra) => { const c = pickOne(by[rar] || [], used); if (!c) return null; used.add(c); out.push({ c, rar, ...extra }); return c; };
  const energy = () => out.push({ c: null, rar: 'Énergie', energy: true });
  if (def.id === '30th') {
    take('Commune'); take('Commune'); energy();
    const x = r(); if (x < 0.10 && by['Collection Classique']) take('Collection Classique'); else if (x < 0.30) take('Illustration rare'); else take('Commune');
    take('Pikachu Rare');
    const y = r();
    if (y < 1 / 21) take('Illustration spéciale rare'); else if (y < 1 / 21 + 1 / 120) take('Futuristic Rare'); else if (y < 1 / 21 + 1 / 120 + 1 / 660) take('RGB Rare'); else if (y < 0.28) take('Double rare'); else take('Rare');
  } else {
    for (let i = 0; i < 4; i++) take('Commune');
    for (let i = 0; i < 3; i++) take('Peu Commune');
    energy();
    const z = r(); take(z < 0.55 ? 'Commune' : z < 0.9 ? 'Peu Commune' : 'Rare', { reverse: true });
    const y = r();
    if (y < 1 / 1100) take('Méga Hyper Rare'); else if (y < 1 / 1100 + 1 / 82) take('Illustration spéciale rare'); else if (y < 1 / 82 + 1 / 1100 + 1 / 12) take('Ultra Rare');
    else if (y < 1 / 82 + 1 / 1100 + 1 / 12 + 1 / 9) take('Illustration rare'); else if (y < 1 / 82 + 1 / 1100 + 1 / 12 + 1 / 9 + 1 / 5) take('Double rare'); else take('Rare');
  }
  return out;
}

// ---------- écrans ----------
function showGame(my) {
  const home = h('button', { class: 'iconbtn', type: 'button', onclick: () => go(lang), 'aria-label': 'Retour à l’accueil' }, '🏠 Accueil');
  const top = h('header', { class: 'top' }, h('div', { class: 'row' }, home, h('h1', {}, '🎮 Jeu · Boosters')));
  const main = h('main', { class: 'game' });
  $app.replaceChildren(top, main);
  scrollTo(0, 0);
  const alive = () => my === tok;
  let defSel = GAME_SETS[0], count = 1;

  function setup() {
    const cardsEl = GAME_SETS.map((d) => h('button', { type: 'button', class: 'gset' + (d === defSel ? ' on' : ''), 'aria-pressed': String(d === defSel), onclick: () => { defSel = d; setup(); } },
      h('img', { src: d.logo, alt: '', class: 'gset-logo', width: 200, height: 80 }), h('b', {}, d.name), h('span', {}, d.desc)));
    const inp = h('input', { class: 'qin bo-in', type: 'number', inputmode: 'numeric', min: '1', max: '36', value: String(count), 'aria-label': 'Nombre de boosters à ouvrir' });
    const openBtn = h('button', { class: 'btn', type: 'button', onclick: start });
    const label = () => { openBtn.textContent = `🎁 Ouvrir ${count > 1 ? `les ${count} boosters` : 'le booster'}`; };
    const setN = (v) => { count = Math.max(1, Math.min(36, Number.isFinite(v) ? v : 1)); inp.value = String(count); label(); };
    label();
    inp.addEventListener('change', () => setN(parseInt(inp.value, 10)));
    main.replaceChildren(
      h('p', { class: 'lb-help' }, 'Juste pour le plaisir : rien n’est ajouté à ta collection. Choisis une série, le nombre de boosters, puis touche le booster pour l’ouvrir.'),
      h('div', { class: 'gsets' }, cardsEl),
      h('div', { class: 'bo-line big' }, h('span', { class: 'bo-name' }, 'Combien de boosters ?'),
        h('div', { class: 'bo-step' }, h('button', { type: 'button', class: 'qb', 'aria-label': 'Un de moins', onclick: () => setN(count - 1) }, '−'), inp, h('button', { type: 'button', class: 'qb', 'aria-label': 'Un de plus', onclick: () => setN(count + 1) }, '+'))),
      openBtn,
      h('button', { class: 'btn sec', type: 'button', onclick: showRates }, 'ℹ️ Taux de tirage utilisés'));
  }

  function showRates() {
    const d = defSel;
    openSheet(h('h2', {}, 'Taux de tirage · ' + d.name), h('p', { class: 'lb-help' }, d.desc),
      h('div', { class: 'orows' }, d.rates.map(([n, v]) => h('div', { class: 'orow' }, h('div', { class: 'orow-l' }, h('span', { class: 'rn' }, n), h('span', { class: 'rc' }, v))))),
      h('p', { class: 'lb-help' }, 'Pokémon ne publie pas de taux officiels : ce sont des estimations de la communauté (TCGplayer, relevés de plusieurs milliers de boosters), des ordres de grandeur. Chaque booster est tiré au hasard, indépendamment des précédents.'),
      h('button', { class: 'btn sec', type: 'button', onclick: closeSheet }, 'Fermer'));
  }

  let packs = [], pi = 0;
  async function start() {
    main.replaceChildren(spinner());
    let pool; try { pool = await gamePool(defSel); } catch (e) { if (alive()) { main.replaceChildren(h('div', { class: 'note bad' }, 'Impossible de charger les cartes : vérifiez votre connexion.'), h('button', { class: 'btn', type: 'button', onclick: setup }, 'Retour')); } return; }
    if (!alive()) return;
    packs = Array.from({ length: count }, () => drawPack(defSel, pool)); pi = 0;
    for (const p of packs) for (const e of p) if (e.c) { const im = new Image(); im.src = imgHigh(e.c); }      // images préchargées pendant l'animation
    sealed();
  }

  // booster fermé : un toucher pour le déchirer
  function sealed() {
    const d = defSel;
    const pack = h('button', { type: 'button', class: 'gpack', 'aria-label': 'Ouvrir le booster', style: `--c1:${d.tint[0]};--c2:${d.tint[1]}` },
      h('span', { class: 'gp-top' }), h('span', { class: 'gp-body' }, h('img', { src: d.logo, alt: '', class: 'gp-logo' }), h('b', {}, 'BOOSTER'), h('small', {}, d.cards + ' cartes')), h('span', { class: 'gp-shine' }));
    pack.addEventListener('click', () => { if (pack.classList.contains('tear')) return; pack.classList.add('tear'); setTimeout(() => { if (alive()) reveal(); }, 900); });
    main.replaceChildren(h('p', { class: 'gcount' }, `Booster ${pi + 1} / ${packs.length}`), h('div', { class: 'gstage seal' }, pack), h('p', { class: 'lb-help gtip' }, 'Touche le booster pour l’ouvrir'));
  }

  // cartes retournées une par une
  function reveal() {
    const pack = packs[pi], n = pack.length; let k = 0, flipped = false;
    const counter = h('p', { class: 'gcount' });
    const stage = h('div', { class: 'gstage deck' });
    const strip = h('div', { class: 'gstrip', 'aria-label': 'Cartes déjà révélées' });
    const nextBtn = h('button', { class: 'btn', type: 'button', hidden: true }, '');
    const skipBtn = h('button', { class: 'btn sec', type: 'button', onclick: () => { while (k < n) { addThumb(k); k++; } stage.replaceChildren(); counter.textContent = `Booster ${pi + 1} / ${packs.length} · terminé`; done(); } }, '⏭ Tout révéler');
    const tip = h('p', { class: 'lb-help gtip' }, '');
    function addThumb(i) {
      const e = pack[i]; if (e.energy) { strip.append(h('div', { class: 'gthumb energy', title: 'Énergie' }, '⚡')); return; }
      const t = h('button', { type: 'button', class: 'gthumb t-' + rarityTier(e.rar), title: `${e.c.name} · ${gameLabel(defSel, e.rar)}`, onclick: () => zoomCard(e) }, h('img', { src: imgLow(e.c), alt: e.c.name }));
      strip.append(t);
    }
    function showCard() {
      const e = pack[k], tier = rarityTier(e.rar); flipped = false;
      counter.textContent = `Booster ${pi + 1} / ${packs.length} · carte ${k + 1} / ${n}`;
      tip.textContent = 'Touche la carte pour la retourner';
      const front = e.energy
        ? h('div', { class: 'gface front genergy' }, h('span', {}, '⚡'), h('b', {}, 'Énergie'), h('small', {}, 'de base'))
        : h('div', { class: 'gface front' }, h('img', { src: imgHigh(e.c), alt: e.c.name, onerror: (ev) => { ev.target.replaceWith(h('div', { class: 'gph' }, e.c.name)); } }));
      const flip = h('div', { class: 'gflip t-' + (e.energy ? 'energie' : tier) + (e.reverse ? ' reverse' : '') }, h('div', { class: 'gface back' }, h('img', { src: 'icons/icon-192.png', alt: '' })), front, h('i', { class: 'gglow' }));
      const btn = h('button', { type: 'button', class: 'gcardbtn', 'aria-label': 'Retourner la carte' }, flip);
      btn.addEventListener('click', () => {
        if (!flipped) {
          flipped = true; flip.classList.add('flipped');
          const lab = e.energy ? 'Énergie' : `${e.c.name}${e.reverse ? ' (reverse)' : ''} · ${gameLabel(defSel, e.rar)}`;
          tip.textContent = lab + (k < n - 1 ? ' — touche pour continuer' : '');
          if (!e.energy && (['ultra', 'secrete', 'promo'].includes(tier) || (tier === 'holo' && e.rar !== 'Pikachu Rare'))) { flip.classList.add('wow'); try { navigator.vibrate && navigator.vibrate(tier === 'secrete' ? [40, 30, 80] : 30); } catch { /* ignoré */ } }
          if (k === n - 1) setTimeout(done, 600);
        } else if (k < n - 1) { addThumb(k); k++; stage.replaceChildren(); showCard(); }
      });
      stage.replaceChildren(btn);
    }
    function done() {
      skipBtn.hidden = true;
      if (!strip.querySelector('.gthumb:last-child') || strip.children.length < n) { for (let i = strip.children.length; i < n; i++) addThumb(i); }
      const last = pi >= packs.length - 1;
      nextBtn.textContent = last ? '📊 Voir le résumé' : `🎁 Booster suivant (${pi + 2} / ${packs.length})`;
      nextBtn.onclick = () => { if (last) summary(); else { pi++; sealed(); } };
      nextBtn.hidden = false;
    }
    main.replaceChildren(counter, stage, tip, strip, h('div', { class: 'gacts' }, nextBtn, skipBtn));
    showCard();
  }

  function zoomCard(e) {
    const ov = h('div', { class: 'overlay gzoom', role: 'dialog', 'aria-modal': 'true', onclick: () => ov.remove() }, h('div', { class: 'gz-in' }, h('img', { src: imgHigh(e.c), alt: e.c.name }), h('p', {}, `${e.c.name} · ${gameLabel(defSel, e.rar)}`)));
    document.body.append(ov);
  }

  function summary() {
    const hits = packs.flat().filter((e) => e.c && !['commune', 'peu', 'aucune'].includes(rarityTier(e.rar)));
    const cnt = {}; for (const e of hits) { const l = gameLabel(defSel, e.rar); cnt[l] = (cnt[l] || 0) + 1; }
    const best = hits.slice().sort((a, b) => rarityRank(b.rar) - rarityRank(a.rar))[0] || null;
    const rows = Object.entries(cnt).sort((a, b) => rarityRank(b[0] === 'EX' ? 'Double rare' : b[0]) - rarityRank(a[0] === 'EX' ? 'Double rare' : a[0]));
    main.replaceChildren(
      h('h2', { class: 'gh' }, `${plural(packs.length, 'booster ouvert', 'boosters ouverts')} · ${defSel.name}`),
      best ? h('div', { class: 'gbest' }, h('p', { class: 'lb-help' }, 'Meilleure carte'), h('button', { type: 'button', class: 'gthumb big t-' + rarityTier(best.rar), onclick: () => zoomCard(best) }, h('img', { src: imgHigh(best.c), alt: best.c.name })),
        h('b', {}, best.c.name), h('span', {}, gameLabel(defSel, best.rar))) : h('p', { class: 'lb-help' }, 'Aucune carte rare cette fois…'),
      rows.length ? h('div', { class: 'orows' }, rows.map(([r, c]) => h('div', { class: 'orow' }, h('div', { class: 'orow-l' }, h('span', { class: 'rbi' }, rarityIcon(r === 'EX' ? 'Double rare' : r, 20)), h('span', { class: 'rn' }, r), h('span', { class: 'rc' }, h('b', {}, String(c))))))) : null,
      hits.length ? h('div', { class: 'gstrip wrap' }, hits.map((e) => h('button', { type: 'button', class: 'gthumb t-' + rarityTier(e.rar), title: e.c.name, onclick: () => zoomCard(e) }, h('img', { src: imgLow(e.c), alt: e.c.name })))) : null,
      h('div', { class: 'gacts' }, h('button', { class: 'btn', type: 'button', onclick: start }, '🔁 Rouvrir les mêmes'), h('button', { class: 'btn sec', type: 'button', onclick: setup }, 'Changer de série')));
  }

  setup();
}
