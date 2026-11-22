import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../moteur/calculs.js';
const brut = (res, i = 0) => res.lignes[i].brut;
const val = (res, i = 0) => res.lignes[i].valeur;

test('congés : jours à pointer (6 × absence ÷ jours par semaine, arrondi inférieur) — accord art. 4.1.2', () => {
  assert.equal(brut(C.congesPointage({ joursHebdo: 5, joursAbsence: 5 })), 6);   // une semaine complète = 6
  assert.equal(brut(C.congesPointage({ joursHebdo: 4, joursAbsence: 2 })), 3);   // 6×2/4
  assert.equal(brut(C.congesPointage({ joursHebdo: 3, joursAbsence: 2 })), 4);   // 6×2/3
  assert.equal(brut(C.congesPointage({ joursHebdo: 5, joursAbsence: 1 })), 1);   // 6/5=1,2 → 1
});

test('préavis — convention annexes I, II, III art. 5.1', () => {
  assert.equal(brut(C.preavis({ statut: 'employe', motif: 'demission', ancienneteMois: 10 })), 1);
  assert.equal(brut(C.preavis({ statut: 'employe', motif: 'licenciement', ancienneteMois: 24 })), 2);
  assert.equal(brut(C.preavis({ statut: 'employe', motif: 'licenciement', ancienneteMois: 23 })), 1);
  assert.equal(brut(C.preavis({ statut: 'maitrise', motif: 'licenciement', ancienneteMois: 5 })), 2);
  assert.equal(brut(C.preavis({ statut: 'cadre', motif: 'demission', ancienneteMois: 5 })), 3);
  assert.equal(brut(C.preavis({ statut: 'employe', motif: 'faute', ancienneteMois: 60 })), 0);
});

test('indemnité de licenciement (employé) — accord art. 3.4', () => {
  const base = { statut: 'employe', salaireMensuel: 1800, primeAnnuelle: 1800, motif: 'autre' }; // référence 1800+150 = 1950
  assert.equal(brut(C.indemniteLicenciement({ ...base, ancienneteMois: 18 }), 1), 0);          // < 2 ans
  assert.equal(brut(C.indemniteLicenciement({ ...base, ancienneteMois: 30 }), 1), 975);        // 50 % × 1950
  assert.equal(brut(C.indemniteLicenciement({ ...base, ancienneteMois: 60 }), 1), 2437.5);     // (75 %+2×25 %)=1,25 × 1950
  assert.equal(C.indemniteLicenciement({ ...base, ancienneteMois: 360 }).lignes[1].mois, 6);   // plafond 6 fois
  assert.equal(brut(C.indemniteLicenciement({ ...base, ancienneteMois: 60, age: 46, enfants: 1 }), 3), 3168.75); // +30 %
  assert.equal(brut(C.indemniteLicenciement({ ...base, ancienneteMois: 60, motif: 'faute' }), 1), 0);
});
test('indemnité de licenciement (employé) — convention annexe I art. 6 et 7', () => {
  const base = { statut: 'employe', brut12: 24000, brut3: 0, motif: 'autre' }; // 2000 €/mois
  const cc = r => r.lignes.find(l => l.label.startsWith('Indemnité de licenciement (convention'));
  assert.equal(cc(C.indemniteLicenciement({ ...base, ancienneteMois: 7 })).brut, 0);          // < 8 mois
  assert.equal(cc(C.indemniteLicenciement({ ...base, ancienneteMois: 100 })).brut, 4166.67);  // 100/12 × 1/4 = 2,0833 mois
  assert.equal(cc(C.indemniteLicenciement({ ...base, ancienneteMois: 150 })).brut, 6666.67);  // 10 ans × 1/4 + 2,5 ans × 1/3 = 3,3333 mois
  assert.equal(cc(C.indemniteLicenciement({ ...base, brut12: 0, brut3: 7500, ancienneteMois: 120 })).brut, 6250); // tiers des 3 mois = 2500 ; 2,5 mois
});

test('prime annuelle — accord art. 3.2', () => {
  assert.equal(brut(C.primeAnnuelle({ dateEmbauche: '2025-05-31', annee: 2025, brutAnnee: 24000 })), true);   // 6 mois au 30/11
  assert.equal(brut(C.primeAnnuelle({ dateEmbauche: '2025-06-01', annee: 2025, brutAnnee: 24000 })), false);  // 6 mois au 01/12
  const r = C.primeAnnuelle({ dateEmbauche: '2020-01-01', annee: 2025, brutAnnee: 24000 });
  assert.deepEqual([brut(r, 1), brut(r, 2), brut(r, 3)], [2000, 1500, 500]);                                   // 1/12 ; 75 % ; 25 %
  const alt = C.primeAnnuelle({ dateEmbauche: '2020-01-01', annee: 2025, brutAnnee: 24000, joursMaladie: 10, sommeForfaitaires: 25200 });
  assert.equal(brut(alt, 3), 1575);                                                                           // 75 % de 2100
});

test('intéressement 2026 — grilles de l\'avenant', () => {
  const tot = r => r.lignes[3].brut;
  assert.equal(tot(C.interessement2026({ caX: 100.5, mdcX: 36, demarqueEcart: 0.25, nps: 45 })), 255);  // 100 (meilleur) + 80 + 75
  assert.equal(tot(C.interessement2026({ caX: 97.9, mdcX: 20, demarqueEcart: -0.1, nps: 30 })), 0);
  assert.equal(tot(C.interessement2026({ caX: 103, mdcX: 0, demarqueEcart: 0.4, nps: 51 })), 400);
  assert.equal(tot(C.interessement2026({ caX: 98, mdcX: 0, demarqueEcart: 0, nps: 36 })), 30);         // 10 + 20 + 0
  assert.equal(C.interessement2026({ caX: 100.5, mdcX: 36, demarqueEcart: 0.25, nps: 45, presenceMois: 6 }).lignes[4].brut, 127.5);
});

test('abondement PEE/PERCOL — grille par tranche, plafond 580,30 €', () => {
  const ab = v => C.abondement({ versements: v }).lignes[1].brut;
  assert.equal(ab(50), 110);          // 50 × 220 %
  assert.equal(ab(100), 200);         // + 50 × 180 %
  assert.equal(ab(300), 437.5);       // 110+90+75+62,5+100
  assert.equal(ab(1000), 555.1);      // 437,5 + 700 × 16,8 %
  assert.equal(ab(1150), 580.3);      // = plafond du règlement
  assert.equal(ab(5000), 580.3);      // versements retenus limités à 1 150 €
});

test('majoration de nuit — accord art. 5.6 et convention art. 5.11.4', () => {
  const r = C.majorationNuit({ tauxHoraire: 10, h225: 8 });
  assert.deepEqual([brut(r, 0), brut(r, 1)], [24, 16]);
  const r2 = C.majorationNuit({ tauxHoraire: 10, h2122: 1, h225: 8, h56: 1 });
  assert.deepEqual([brut(r2, 0), brut(r2, 1)], [26, 16.5]);
  assert.equal(brut(C.majorationNuit({ tauxHoraire: 10, h225: 8, forfaitJours: true })), 0);
});

test('arrêt maladie — accord art. 3.11 et convention annexe I art. 3', () => {
  const a = C.arretMaladie({ statut: 'employe', ancienneteAns: 3 });
  assert.deepEqual([brut(a, 0), brut(a, 1), brut(a, 2)], [2, 180, 7]);
  const h = C.arretMaladie({ statut: 'employe', ancienneteAns: 12, hospitalisation: true });
  assert.deepEqual([brut(h, 0), brut(h, 1), brut(h, 2)], [0, 360, 0]);
  assert.equal(brut(C.arretMaladie({ statut: 'cadre', ancienneteAns: 2 }), 1), 540);
  assert.equal(brut(C.arretMaladie({ statut: 'employe', ancienneteAns: 30 }), 1), 540);
  assert.equal(brut(C.arretMaladie({ statut: 'employe', ancienneteAns: 0.5 }), 1), null);
  assert.equal(brut(C.arretMaladie({ statut: 'employe', ancienneteAns: 3, plus23j: true }), 0), 0);
});

test('événements familiaux — accord art. 4.1 (image p.44) et convention art. 7.5.1', () => {
  assert.equal(val(C.evenementFamilial({ evenement: 'naissance' }), 0), '3 jours ouvrés');
  assert.equal(val(C.evenementFamilial({ evenement: 'deces_conjoint' }), 0), '5 jours ouvrés (enfant à charge)');
  const p = C.evenementFamilial({ evenement: 'deces_parent' });
  assert.ok(val(p, 0).startsWith('4') && val(p, 1).startsWith('3'));
  assert.equal(C.evenementFamilial({ evenement: 'deces_parent', distance300: true }).lignes.length, 4);
});

test('remise sur achats — accord art. 3.2 et NAO 2026', () => {
  const r = C.remiseAchats({ achats: 5000, ancienneteMois: 12 });
  assert.deepEqual([brut(r, 0), brut(r, 1)], [500, 600]);
  const g = C.remiseAchats({ achats: 20000, ancienneteMois: 12 });
  assert.deepEqual([brut(g, 0), brut(g, 1)], [1100, 1560]);   // plafonds 11 000 × 10 % ; 13 000 × 12 %
  assert.equal(brut(C.remiseAchats({ achats: 5000, ancienneteMois: 2 })), 0);
});

test('journée de solidarité — accord art. 5.9 (7 h × horaire ÷ horaire conventionnel)', () => {
  const m = (statut, h, c) => C.journeeSolidarite({ statut, horaireSalarie: h, horaireConv: c }).lignes[0].brut;
  assert.equal(m('employe', 36, '36'), 420);   // temps complet : 7 h 00
  assert.equal(m('employe', 24, '36'), 280);   // 7 × 24 ÷ 36 = 4,667 h = 4 h 40
  assert.equal(m('employe', 24, '35'), 288);   // 7 × 24 ÷ 35 = 4,8 h = 4 h 48
  assert.equal(val(C.journeeSolidarite({ statut: 'employe', horaireSalarie: 24, horaireConv: '36' })).startsWith('4 h 40'), true);
  assert.equal(m('encadrement', 36, '36'), 1);
});

test('journée de solidarité — lecture avec 35 h de référence (4 h 48 pour 24 h ; 7 h 12 pour un 36 h)', () => {
  const m = (h, c) => C.journeeSolidarite({ statut: 'employe', horaireSalarie: h, horaireConv: c }).lignes[0].brut;
  assert.equal(m(24, '35'), 288);   // 7 × 24 ÷ 35 = 4,8 h
  assert.equal(m(36, '35'), 432);   // 7 × 36 ÷ 35 = 7,2 h = 7 h 12
  assert.equal(C.journeeSolidarite({ statut: 'employe', horaireSalarie: 36, horaireConv: '35' }).lignes[0].valeur.startsWith('7 h 12'), true);
});

test('journée de solidarité — salarié arrivé en cours d\'année : pratique RH signalée, calcul conservé', () => {
  const r = C.journeeSolidarite({ statut: 'employe', horaireSalarie: 24, horaireConv: '35', arriveeEnCours: true });
  assert.equal(r.lignes[0].niveau, 'pratique');
  assert.equal(r.lignes[1].brut, 288);
  assert.equal(C.journeeSolidarite({ statut: 'employe', horaireSalarie: 24 }).lignes[0].brut, 288);   // 35 h par défaut
});

test('journée de solidarité — exemple RH : CDI à 30 h par semaine, référence 35 h = 6 h 00', () => {
  const r = C.journeeSolidarite({ statut: 'employe', horaireSalarie: 30, horaireConv: '35' });
  assert.equal(r.lignes[0].brut, 360);
  assert.ok(r.lignes[0].valeur.startsWith('6 h 00'));
});

test('prime annuelle d\'un salarié en arrêt — accord art. 3.2 / 3.11.2, convention art. 3.6.2', () => {
  const run = p => C.primeEtArret({ statut: 'employe', annee: 2026, ...p }).lignes;
  const a = run({ ancienneteAns: 3, dateDebut: '2025-07-01' });        // 180 j → fin 2025-12-27
  assert.equal(a[0].brut, '2025-12-27');
  assert.equal(a[1].brut, 0);                                           // aucun complément en 2026
  assert.equal(a[2].brut, false);                                       // suspendu depuis plus d'un an en décembre 2026
  const b = run({ ancienneteAns: 12, dateDebut: '2025-07-01' });       // 360 j → fin 2026-06-25
  assert.equal(b[0].brut, '2026-06-25'); assert.equal(b[1].brut, 176);  // du 1er janvier au 25 juin 2026
  const c = run({ ancienneteAns: 3, dateDebut: '2026-03-01' });        // fin 2026-08-27 ; suspendu < 1 an
  assert.equal(c[0].brut, '2026-08-27'); assert.equal(c[2].brut, true);
  assert.equal(run({ ancienneteAns: 0.5, dateDebut: '2025-07-01' })[1].brut, 0);
});

test('retraite progressive — accord art. 3.13 (60 ans ; < 2 ans avant l\'âge légal ; 150 trimestres)', () => {
  const r = p => C.retraiteProgressive(p).lignes;
  assert.equal(r({ age: 61, moisAvantAgeLegal: 12, trimestres: 160 })[3].brut, true);
  assert.equal(r({ age: 59, moisAvantAgeLegal: 12, trimestres: 160 })[3].brut, false);    // moins de 60 ans
  assert.equal(r({ age: 61, moisAvantAgeLegal: 24, trimestres: 160 })[1].brut, false);    // 2 ans pile : pas « moins de 2 ans »
  assert.equal(r({ age: 61, moisAvantAgeLegal: 12, trimestres: 149 })[2].brut, false);
  assert.ok(r({ age: 61, moisAvantAgeLegal: 12, trimestres: 160, horaire: 36 })[4].valeur.startsWith('18 h (50 %) ou 21.6 h'));
});

test('enfant malade / hospitalisé — accord art. 4.2.1 et convention art. 7.6.9', () => {
  const r = p => C.enfantMalade(p).lignes;
  assert.equal(r({ situation: 'hospitalise', ageEnfant: 8 })[0].brut, 6);
  assert.equal(r({ situation: 'hospitalise', ageEnfant: 16 })[0].brut, 0);
  assert.equal(r({ situation: 'malade', ageEnfant: 8, nbEnfantsMoins16: 1 })[0].brut, 3);
  assert.equal(r({ situation: 'malade', ageEnfant: 8, nbEnfantsMoins16: 3 })[0].brut, 5);
  assert.equal(r({ situation: 'malade', ageEnfant: 0.5, nbEnfantsMoins16: 1 })[0].brut, 5);
  assert.ok(r({ situation: 'malade', ageEnfant: 8 })[1].valeur.includes('payés'));            // convention < 12 ans
  assert.ok(r({ situation: 'malade', ageEnfant: 13 })[1].valeur.includes('non rémunérés'));   // convention 12-16 ans
  assert.equal(r({ situation: 'malade', ageEnfant: 17 })[1].brut, 0);
});

test('délai de protection — accord art. 3.12 et convention art. 7.3.1', () => {
  const r = p => C.delaiProtection({ statut: 'employe', ...p }).lignes;
  assert.equal(r({ ancienneteAns: 0.8 })[0].brut, '4 mois');
  assert.equal(r({ ancienneteAns: 3 })[0].brut, 180);               // 180 jours + 1 mois
  assert.equal(r({ ancienneteAns: 12 })[0].brut, 360);
  assert.equal(r({ ancienneteAns: 3, accidentTrajet: true })[0].brut, '2 ans');
  assert.equal(C.delaiProtection({ statut: 'cadre', ancienneteAns: 3 }).lignes[0].brut, '2 ans');
  assert.equal(r({ ancienneteAns: 3 })[1].brut, 4);                  // convention : 4 mois, pas de majoration avant 4 ans
  assert.equal(r({ ancienneteAns: 4 })[1].brut, 6);                  // +2 mois
  assert.equal(r({ ancienneteAns: 16 })[1].brut, 9);                 // +5 mois
  assert.equal(r({ ancienneteAns: 0.3 })[1].brut, null);
});
test('capital décès — livret CGT p.30 (tableau lu sur l\'image)', () => {
  const p = x => C.capitalDeces(x).lignes[0].brut;
  assert.equal(p({ situation: 'seul', nbEnfants: 0 }), 100);
  assert.equal(p({ situation: 'couple', nbEnfants: 0 }), 150);
  assert.equal(p({ situation: 'seul', nbEnfants: 1 }), 185);
  assert.equal(p({ situation: 'couple', nbEnfants: 3 }), 255);       // 185 + 35 + 35
  assert.equal(p({ situation: 'couple', nbEnfants: 4 }), 305);       // + 50 à partir du 4e
  const l = C.capitalDeces({ situation: 'couple', nbEnfants: 3, salaireReference: 30000 }).lignes;
  assert.deepEqual([l[1].brut, l[2].brut], [76500, 38250]);
});
test('déménagement — accord art. 4.2.3 (12 mois après ; 6 mois avant ou après)', () => {
  const d = (motif, m) => C.demenagement({ motif, moisEcart: m }).lignes[0].brut;
  assert.equal(d('divorce', 12), true); assert.equal(d('divorce', 13), false); assert.equal(d('divorce', -1), false);
  assert.equal(d('naissance', -6), true); assert.equal(d('naissance', 6), true); assert.equal(d('mariage', 7), false); assert.equal(d('mariage', -7), false);
});

test('congés acquis — Code du travail L3141-3, L3141-5-1, L3141-7', () => {
  const a = p => C.congesAcquis(p).lignes[0].brut;
  assert.equal(a({ moisTravail: 12 }), 30);                              // 12 × 2,5
  assert.equal(a({ moisTravail: 6 }), 15);
  assert.equal(a({ moisTravail: 5.5 }), 14);                             // 13,75 arrondi au supérieur
  assert.equal(a({ moisTravail: 6, moisMaladieNonPro: 6 }), 27);         // 15 + 6 × 2
  assert.equal(a({ moisTravail: 0, moisMaladieNonPro: 12 }), 24);        // plafond de 24 jours pour la maladie
  assert.equal(a({ moisTravail: 12, moisMaladieNonPro: 12 }), 30);       // plafond général de 30
});
test('fractionnement — accord art. 4.1.4', () => {
  const f = n => C.fractionnement({ joursHorsPeriode: n }).lignes[0].brut;
  assert.deepEqual([f(2), f(3), f(5), f(6), f(10)], [0, 1, 1, 2, 2]);
});
test('congé d\'ancienneté — accord art. 4.2 et convention art. 7.1.2', () => {
  const c = n => C.congeAnciennete({ ancienneteAns: n }).lignes.map(l => l.brut);
  assert.deepEqual(c(9), [0, 0]); assert.deepEqual(c(10), [1, 1]); assert.deepEqual(c(15), [2, 2]);
  assert.deepEqual(c(20), [3, 3]); assert.deepEqual(c(30), [4, 3]); assert.deepEqual(c(40), [5, 3]);
});
test('indemnité de congés payés — L3141-24 (le plus élevé du dixième et du maintien)', () => {
  const i = p => C.indemniteConges(p).lignes[2].brut;
  assert.equal(i({ remunerationReference: 24000, maintienSalaire: 2500 }), 2500);
  assert.equal(i({ remunerationReference: 24000, maintienSalaire: 2000 }), 2400);
  assert.equal(C.indemniteConges({ remunerationReference: 24000 }).lignes[0].brut, 2400);
});
test('grossesse — accord art. 4.3 et convention art. 7.6.4 d', () => {
  const g = m => C.grossesse({ moisGrossesse: m }).lignes.map(l => l.brut);
  assert.deepEqual(g(3), [0, false, false]);
  assert.deepEqual(g(4), [30, false, false]);
  assert.deepEqual(g('5'), [30, true, true]);
});
test('maternité — L1225-17 à 19, accord titre 6, convention art. 7.6.6 a', () => {
  const m = p => C.maternite(p).lignes;
  assert.equal(m({ rang: 1, multiples: 'non', ancienneteAns: 3 })[0].brut, 16);
  assert.equal(m({ rang: '3', multiples: 'non', ancienneteAns: 3 })[0].brut, 26);
  assert.equal(m({ rang: '3', multiples: 'non', ancienneteAns: 3 })[1].brut, 26);          // maintien de salaire accord
  assert.equal(m({ rang: 1, multiples: 'jumeaux', ancienneteAns: 0 })[0].brut, 34);
  assert.equal(m({ rang: 1, multiples: 'triples', ancienneteAns: 0 })[0].brut, 46);
  const cc = a => C.maternite({ rang: 1, multiples: 'non', ancienneteAns: a }).lignes.at(-1).brut;
  assert.deepEqual([cc(0.5), cc(1), cc(2), cc(3)], [0, 6, 10, 16]);
  assert.equal(C.maternite({ rang: 1, multiples: 'jumeaux', ancienneteAns: 3 }).lignes.at(-1).brut, 18);
});
test('paternité — L1225-35 et accord titre 6', () => {
  assert.equal(C.paternite({ multiples: 'non' }).lignes[0].brut, 25);
  assert.equal(C.paternite({ multiples: 'jumeaux' }).lignes[1].brut, 32);
});
test('congé parental et ancienneté — accord titre 6 p.100, L1225-54', () => {
  const p = m => C.congeParentalAnciennete({ moisCongeParental: m }).lignes.map(l => l.brut);
  assert.deepEqual(p(6), [6, 3]); assert.deepEqual(p(18), [12, 9]); assert.deepEqual(p(24), [12, 12]); assert.deepEqual(p(30), [15, 15]);
});

test('congés — temps partiel : un jour pris à 3 jours par semaine compte pour 2 (accord art. 4.1.2)', () => {
  const p = (h, a) => C.congesPointage({ joursHebdo: h, joursAbsence: a }).lignes[0].brut;
  assert.equal(p(3, 1), 2);   // 6 × 1 ÷ 3
  assert.equal(p(3, 3), 6);   // semaine complète
  assert.equal(p(4, 1), 1);   // 6 ÷ 4 = 1,5 arrondi à 1
  assert.equal(p(2, 1), 3);   // 6 × 1 ÷ 2
  assert.equal(p(5, 7), 8);   // 1 semaine complète (6) + 2 jours
});

test('indemnité de licenciement — accord art. 3.4 : maîtrise et cadres', () => {
  const base = { salaireMensuel: 3000, primeAnnuelle: 0, motif: 'autre' };
  const acc = (statut, mois) => C.indemniteLicenciement({ ...base, statut, ancienneteMois: mois }).lignes[1].mois;
  assert.equal(acc('cadre', 30), 0.5);            // 2 ans : 50 %
  assert.equal(acc('cadre', 96), 7.25);           // 6 + 0,25 × (8 − 3)
  assert.equal(acc('maitrise', 96), 4.25);        // 3 + 0,25 × 5
  assert.equal(acc('cadre', 240), 12);            // 20 ans
  assert.equal(acc('maitrise', 240), 9);
});
test('indemnité de licenciement — convention annexe III (cadres)', () => {
  const cc = (mois) => C.indemniteLicenciement({ statut: 'cadre', ancienneteMois: mois, motif: 'autre', brut12: 36000 }).lignes.find(l => l.label.startsWith('Indemnité de licenciement (convention')).mois;
  assert.equal(cc(6), 0);                          // moins de 8 mois
  assert.equal(cc(48), 1);                         // 4 ans × 1/4
  assert.equal(cc(96), 2.4);                       // 8 ans × 3/10
  assert.equal(cc(180), 5);                        // 10 × 0,3 + 5 × 0,4
  assert.equal(cc(600), 15.33);                      // plafond de 12 mois, plus 10 ans × 1/3 après 40 ans
});
test('allocation de départ à la retraite — accord art. 3.5, convention annexes I à III art. 8.2', () => {
  const a = (statut, ans) => C.allocationRetraite({ statut, ancienneteAns: ans }).lignes.map(l => l.brut);
  assert.deepEqual(a('employe', 9), [0, 0]);
  assert.deepEqual(a('employe', 12), [2.5, 1.3]);        // convention : 2/20 × 10 + 3/20 × 2
  assert.deepEqual(a('employe', 25), [5, 3.25]);         // convention : 1 + 15 × 3/20 (sous le plafond de 4 mois)
  assert.deepEqual(a('employe', 40), [5, 4]);            // convention : plafond de 4 mois
  assert.deepEqual(a('maitrise', 14), [3.3, 1.6]);       // 2,5 + 0,2 × 4 ; convention 1 + 0,6
  assert.deepEqual(a('cadre', 40), [6, 6]);              // plafonds de 6 mois
  assert.equal(C.allocationRetraite({ statut: 'employe', ancienneteAns: 12, salaireReference: 3000, plafondSecu: 2500 }).lignes[1].brut, 6250);   // 2,5 × plafond 2 500
});
test('période d\'essai — convention annexes I à III art. 2, L1221-25', () => {
  const e = (statut, j) => C.periodeEssai({ statut, joursPresence: j }).lignes;
  assert.equal(e('employe', 5)[1].brut, '24 heures'); assert.equal(e('employe', 20)[1].brut, '48 heures'); assert.equal(e('employe', 60)[1].brut, '2 semaines');
  assert.equal(e('cadre', 100)[1].brut, '1 mois'); assert.equal(e('cadre', 100)[3].brut, '1 mois');
  assert.equal(e('employe', 100)[1].brut, '2 semaines'); assert.equal(e('employe', 100)[3].brut, '1 mois');   // palier légal seul
  assert.equal(e('maitrise', 5)[2].brut, 24); assert.equal(e('maitrise', 20)[2].brut, 48);
});
