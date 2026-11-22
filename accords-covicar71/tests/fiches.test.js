import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { norm } from '../moteur/normalise.js';
const corpus = JSON.parse(readFileSync(new URL('../data/corpus.json', import.meta.url)));
const { fiches } = JSON.parse(readFileSync(new URL('../fiches/fiches.json', import.meta.url)));

test('il y a 10 fiches avec identifiant unique', () => {
  assert.equal(fiches.length, 10);
  assert.equal(new Set(fiches.map(f => f.id)).size, 10);
});
for (const f of fiches) {
  test(`fiche ${f.id} : chaque source a document, article, page et un extrait court retrouvé dans le texte`, () => {
    let nbSources = 0;
    for (const n of f.niveaux) for (const s of n.sources) {
      nbSources++;
      assert.ok(s.doc && s.article && s.page && s.extrait, 'référence incomplète');
      assert.ok(corpus[s.doc], `document inconnu ${s.doc}`);
      assert.ok(s.extrait.split(/\s+/).length < 25, `extrait trop long (${s.article})`);
      const doc = corpus[s.doc];
      const pdfPage = s.doc === 'cc' ? s.page + doc.offset : s.page;
      const texte = doc.pages[String(pdfPage)];
      assert.ok(texte, `page absente ${s.doc} p.${s.page}`);
      if (!s.ocr_corrige) assert.ok(norm(texte).includes(norm(s.extrait)), `extrait introuvable ${s.doc} p.${s.page} : « ${s.extrait} »`);
      else assert.ok(s.note_ocr, 'extrait corrigé sans explication');
    }
    assert.ok(nbSources > 0, 'aucune source');
    // le niveau Code du travail doit être signalé comme à compléter
    const ct = f.niveaux.find(n => n.niveau === 'code');
    assert.ok(ct && /Information à compléter/.test(ct.regles.join(' ')));
  });
}
