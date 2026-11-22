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
