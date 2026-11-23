import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { norm } from '../moteur/normalise.js';
import { chercherFiches, chercherTexte } from '../moteur/recherche.js';
const { fiches } = JSON.parse(readFileSync(new URL('../fiches/fiches.json', import.meta.url)));
const syn = JSON.parse(readFileSync(new URL('../fiches/synonymes.json', import.meta.url)));
const corpus = JSON.parse(readFileSync(new URL('../data/corpus-complet.json', import.meta.url)));

test('normalisation : accents, majuscules, ponctuation', () => assert.equal(norm('  Préavis, DÉMISSION !'), 'preavis demission'));
test('recherche ignore accents et casse', () => assert.equal(chercherFiches('PREAVIS', fiches, syn).fiches[0].id, 'preavis'));
test('recherche tolère une faute légère', () => assert.equal(chercherFiches('indemnite de licenciment', fiches, syn).fiches[0].id, 'indemnite-licenciement'));
test('synonyme : « CP » mène aux congés payés', () => assert.ok(chercherFiches('CP', fiches, syn).fiches[0].id.startsWith('conges-')));
test('synonyme : « RSA » mène à la remise sur achats', () => assert.equal(chercherFiches('RSA', fiches, syn).fiches[0].id, 'remise-achats'));
test('aucune fiche → mode aucune', () => assert.equal(chercherFiches('xylophone', fiches, syn).mode, 'aucune'));
test('texte exact dans le corpus, avec référence', () => {
  const r = chercherTexte('délai de carence de 2 jours', corpus);
  assert.ok(r.some(x => x.doc === 'subst' && x.page === 37));
});
test('page de la convention = numéro du pied de page', () => {
  const r = chercherTexte('préavis réciproque est fixée à 1 mois de date à date', corpus);
  assert.ok(r.some(x => x.doc === 'cc' && x.page === 114));
});
test('un seul mot commun ne suffit pas : « heures de délégation » → pas de fiche', () => assert.equal(chercherFiches('heures de délégation', fiches, syn).mode, 'aucune'));
test('« majoration heures de nuit » → fiche nuit', () => assert.equal(chercherFiches('majoration heures de nuit', fiches, syn).fiches[0].id, 'majoration-nuit'));
test('l\'extrait de la recherche de texte contient le mot cherché', () => {
  const r = chercherTexte('hospitalisation', corpus, 5);
  assert.ok(r.length > 0 && r.every(x => norm(x.extrait).includes('hospitalisation')));
});
test('question réelle : « salarié à 24 heures, journée de solidarité » ouvre directement la fiche', () => {
  const r = chercherFiches('je suis un salarié à 24 heures, combien ai-je de journée de solidarité', fiches, syn);
  assert.equal(r.mode, 'direct'); assert.equal(r.fiches[0].id, 'journee-solidarite');
});
test('« préavis » ouvre directement la fiche préavis', () => assert.equal(chercherFiches('préavis', fiches, syn).mode, 'direct'));
test('question réelle : 13e mois pendant un arrêt maladie → fiche prime annuelle et arrêt', () => {
  const r = chercherFiches('il est en arrêt maladie depuis un an, a-t-il droit au 13e mois', fiches, syn);
  assert.equal(r.fiches[0].id, 'prime-annuelle-arret');
});

import { readFileSync as lire } from 'node:fs';
const lot1 = JSON.parse(lire(new URL('./questions-lot1.json', import.meta.url)));
test('lot 1 (absences et maladie) : chacune des 38 questions du tableau ouvre directement la bonne fiche', () => {
  const rates = lot1.filter(q => { const r = chercherFiches(q.question, fiches, syn); return !(r.mode === 'direct' && r.fiches[0].id === q.fiche); });
  assert.deepEqual(rates.map(q => `Q${q.n}`), []);
});

const lot2 = JSON.parse(lire(new URL('./questions-lot2.json', import.meta.url)));
test('lot 2 (congés payés, maternité et parentalité) : chacune des 23 questions du tableau ouvre directement la bonne fiche', () => {
  const rates = lot2.filter(q => { const r = chercherFiches(q.question, fiches, syn); return !(r.mode === 'direct' && r.fiches[0].id === q.fiche); });
  assert.deepEqual(rates.map(q => `Q${q.n}`), []);
});

const lot3 = JSON.parse(lire(new URL('./questions-lot3.json', import.meta.url)));
test('lot 3 (rupture du contrat et retraite) : chacune des 15 questions du tableau ouvre directement la bonne fiche', () => {
  const rates = lot3.filter(q => { const r = chercherFiches(q.question, fiches, syn); return !(r.mode === 'direct' && r.fiches[0].id === q.fiche); });
  assert.deepEqual(rates.map(q => `Q${q.n}`), []);
});

const lot4 = JSON.parse(lire(new URL('./questions-lot4.json', import.meta.url)));
test('lot 4 (heures supplémentaires, annualisation, temps partiel) : chacune des 15 questions du tableau ouvre directement la bonne fiche', () => {
  const rates = lot4.filter(q => { const r = chercherFiches(q.question, fiches, syn); return !(r.mode === 'direct' && r.fiches[0].id === q.fiche); });
  assert.deepEqual(rates.map(q => `Q${q.n}`), []);
});

const lot5 = JSON.parse(lire(new URL('./questions-lot5.json', import.meta.url)));
test('lot 5 (participation) : chacune des 15 questions du tableau ouvre directement la bonne fiche', () => {
  const rates = lot5.filter(q => { const r = chercherFiches(q.question, fiches, syn); return !(r.mode === 'direct' && r.fiches[0].id === q.fiche); });
  assert.deepEqual(rates.map(q => `Q${q.n}`), []);
});

const lot6 = JSON.parse(lire(new URL('./questions-lot6.json', import.meta.url)));
test('lot 6 (nuit, dimanche, jours fériés, solidarité) : chacune des 13 questions du tableau ouvre directement la bonne fiche', () => {
  const rates = lot6.filter(q => { const r = chercherFiches(q.question, fiches, syn); return !(r.mode === 'direct' && r.fiches[0].id === q.fiche); });
  assert.deepEqual(rates.map(q => `Q${q.n}`), []);
});
