// Calculs des fiches. Fonctions pures : aucune donnée n'est stockée ni envoyée.
// Chaque barème vient d'un texte du dossier sources/ (références dans fiches/fiches.json).
export const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const L = (niveau, label, valeur, extra = {}) => ({ niveau, label, valeur, ...extra });

// ---- 1. Congés payés : décompte des jours à pointer (accord de substitution art. 4.1.2, p.42)
export function congesPointage({ joursHebdo, joursAbsence }) {
  if (!(joursHebdo >= 1 && joursHebdo <= 6) || !(joursAbsence >= 0)) return { lignes: [], erreur: 'Renseigner les jours de travail par semaine (1 à 6) et les jours d\'absence.' };
  const aPointer = joursHebdo >= 5 ? (joursAbsence / joursHebdo) * 6 : (6 * joursAbsence) / joursHebdo;
  const v = Math.floor(aPointer + 1e-9);
  return { lignes: [L('accord', 'Jours de congés à pointer', `${v} jour(s)`, { brut: v })] };
}

// ---- 2. Préavis (convention, annexe I art. 5.1 p.114 ; annexe II art. 5.1 p.123 ; annexe III art. 5.1 p.128)
export function preavis({ statut, motif, ancienneteMois }) {
  const grave = motif === 'faute';
  let v, note = '';
  if (grave) return { lignes: [L('convention', 'Préavis', 'Non prévu par ces articles (faute grave ou lourde)', { brut: 0 })] };
  if (statut === 'employe') {
    if (motif === 'licenciement' && ancienneteMois >= 24) v = 2; else v = 1;
    note = motif === 'licenciement' ? '2 mois si au moins 2 ans d\'ancienneté, sinon 1 mois' : '1 mois de date à date';
  } else if (statut === 'maitrise') { v = 2; note = '« ne peut être inférieure à 2 mois » (durée minimale)'; }
  else { v = 3; note = '3 mois'; }
  return { lignes: [L('convention', 'Préavis', `${v} mois`, { brut: v, note })] };
}

// ---- 3. Indemnité de licenciement : accord de substitution (art. 3.4) et convention (annexe I art. 7), côte à côte. Employés/ouvriers seulement.
export function indemniteLicenciement(p) {
  const { statut, ancienneteMois, age = 0, enfants = 0, motif, salaireMensuel = 0, primeAnnuelle = 0, indemnitesFonction = 0, brut12 = 0, brut3 = 0 } = p;
  if (statut !== 'employe') return { lignes: [], info: 'Calcul non codé pour la maîtrise et les cadres dans cette version : Information à compléter (texte : accord de substitution art. 3.4 ; convention annexes II et III).' };
  const lignes = [];
  const grave = motif === 'faute';
  // Accord
  const salRefAccord = r2(salaireMensuel + primeAnnuelle / 12 + indemnitesFonction);
  let mois = null;
  if (grave) mois = 0;
  else if (ancienneteMois < 24) mois = 0;
  else if (ancienneteMois < 36) mois = 0.5;
  else mois = Math.min(6, 0.75 + 0.25 * (Math.floor(ancienneteMois / 12) - 3));
  const base = r2(mois * salRefAccord);
  const majPct = (age >= 45 ? 20 : 0) + 10 * enfants;
  lignes.push(L('accord', 'Salaire de référence mensuel (accord)', `${salRefAccord} €`));
  lignes.push(L('accord', 'Indemnité avant majorations', `${mois} mois = ${base} €`, { brut: base, mois }));
  lignes.push(L('accord', 'Majorations possibles (45 ans : +20 % ; enfants : +10 % chacun)', `+${majPct} %`, { note: 'Base de la majoration non précisée dans le texte : ici appliquée à l\'indemnité.' }));
  lignes.push(L('accord', 'Indemnité avec majorations', `${r2(base * (1 + majPct / 100))} €`, { brut: r2(base * (1 + majPct / 100)) }));
  // Convention
  let moisCC = 0;
  if (!grave && ancienneteMois >= 8) moisCC = Math.min(ancienneteMois, 120) * (0.25 / 12) + Math.max(ancienneteMois - 120, 0) * (1 / 3 / 12);
  const salCC = Math.max(brut12 / 12, brut3 / 3);
  if (salCC > 0) {
    const b = r2(moisCC * salCC);
    lignes.push(L('convention', 'Salaire « plein tarif » (convention, art. 6)', `${r2(salCC)} €`));
    lignes.push(L('convention', 'Indemnité de licenciement (convention, art. 7.1)', `${r2(moisCC)} mois = ${b} €`, { brut: b, mois: r2(moisCC) }));
    if (motif === 'economique' && age > 50) lignes.push(L('convention', 'Majoration de 20 % (art. 7.2) si aucune exclusion ne s\'applique', `${r2(b * 1.2)} €`, { brut: r2(b * 1.2), note: 'Exclusions (reclassement, chômage jusqu\'à la retraite à taux plein, etc.) non vérifiées par le calcul.' }));
  } else lignes.push(L('convention', 'Indemnité (convention, art. 7.1)', `${r2(moisCC)} mois de salaire plein tarif`, { mois: r2(moisCC), note: 'Renseigner les rémunérations des 12 et des 3 derniers mois pour obtenir un montant.' }));
  return { lignes };
}

// ---- 4. Prime annuelle (accord de substitution art. 3.2, p.24-25) — employés
export function primeAnnuelle({ dateEmbauche, annee, brutAnnee = 0, joursMaladie = 0, sommeForfaitaires = 0 }) {
  if (!dateEmbauche || !annee) return { lignes: [], erreur: 'Renseigner la date d\'embauche et l\'année.' };
  const [y, m, d] = dateEmbauche.split('-').map(Number);
  const jmax = new Date(Date.UTC(y, m + 6, 0)).getUTCDate(); // dernier jour du mois cible (évite le débordement 31 nov.)
  const fin6 = new Date(Date.UTC(y, m - 1 + 6, Math.min(d, jmax))); // date des 6 mois d'ancienneté
  const limite = new Date(Date.UTC(annee, 10, 30)); // 30 novembre
  const eligible = fin6 <= limite;
  const lignes = [L('accord', 'Droit à la prime (6 mois d\'ancienneté à fin novembre)', eligible ? 'Oui' : 'Non', { brut: eligible })];
  if (!eligible) return { lignes };
  let montant = r2(brutAnnee / 12);
  lignes.push(L('accord', 'Montant : 1/12 de la rémunération brute de l\'assiette', `${montant} €`, { brut: montant }));
  if (joursMaladie <= 30 && sommeForfaitaires > 0) {
    const alt = r2(sommeForfaitaires / 12);
    lignes.push(L('accord', 'Mode de calcul alternatif (maladie ≤ 30 jours) : 1/12 des salaires forfaitaires mensuels', `${alt} €`, { brut: alt, note: 'Applicable « lorsque le mode de calcul lui est plus favorable, sur une année complète ».' }));
    montant = Math.max(montant, alt);
  }
  lignes.push(L('accord', 'Acompte début décembre (75 %)', `${r2(montant * 0.75)} €`, { brut: r2(montant * 0.75) }));
  lignes.push(L('accord', 'Solde avec la paie de décembre (25 %)', `${r2(montant * 0.25)} €`, { brut: r2(montant * 0.25) }));
  return { lignes };
}

// ---- 5. Intéressement 2026 : grilles de l'avenant (copie pour signature, NON SIGNÉE)
const palier = (x, grille) => { for (const [seuil, mt] of grille) if (x >= seuil - 1e-9) return mt; return 0; };
export const GRILLES_2026 = {
  ca: [[103, 100], [102, 80], [101, 60], [100, 40], [99, 20], [98, 10]],
  mdc: [[35, 100], [34, 90], [33, 80], [32, 70], [31, 60], [30, 50], [29, 40], [28, 30], [27, 20], [26, 10]],
  demarque: [[0.40, 150], [0.35, 125], [0.30, 100], [0.25, 80], [0.20, 60], [0.15, 50], [0.10, 40], [0.05, 30], [0.00, 20]],
  nps: [[51, 150], [48, 100], [45, 75], [42, 50], [39, 25], [36, 0]],
};
export function interessement2026({ caX = 0, mdcX = 0, demarqueEcart = 0, nps = 0, presenceMois = 12, ratioTempsPartiel = 1 }) {
  const c1a = palier(caX, GRILLES_2026.ca), c1b = palier(mdcX, GRILLES_2026.mdc);
  const c1 = Math.max(c1a, c1b), c2 = palier(demarqueEcart, GRILLES_2026.demarque), c3 = palier(nps, GRILLES_2026.nps);
  const total = c1 + c2 + c3;
  const prorata = r2(total * (presenceMois / 12) * ratioTempsPartiel);
  return { lignes: [
    L('accord', 'Critère 1 (meilleur des deux indicateurs)', `${c1} € (CA : ${c1a} € ; MDC : ${c1b} €)`, { brut: c1 }),
    L('accord', 'Critère 2 : démarque', `${c2} €`, { brut: c2 }),
    L('accord', 'Critère 3 : NPS', `${c3} €`, { brut: c3 }),
    L('accord', 'Total des grilles 2026 (avant seuil, prorata et plafond)', `${total} €`, { brut: total }),
    L('accord', 'Estimation au prorata de la présence (art. 7 de l\'accord)', `${prorata} €`, { brut: prorata, note: 'Estimation : l\'accord répartit selon la durée de présence ; la formule exacte de répartition est à vérifier dans le texte.' }),
  ] };
}

// ---- 6. Abondement PEE / PERCOL (règlement PEE art. 5, p.4-5 ; grille commune)
export const TRANCHES_ABONDEMENT = [[50, 2.2], [100, 1.8], [150, 1.5], [200, 1.25], [300, 1.0], [1000, 0.168], [1150, 0.168]];
export const PLAFOND_ABONDEMENT = 580.30;
export function abondement({ versements }) {
  if (!(versements >= 0)) return { lignes: [], erreur: 'Renseigner le total des versements (PEE + PERCOL).' };
  const v = Math.min(versements, 1150);
  let ab = 0, bas = 0;
  for (const [haut, taux] of TRANCHES_ABONDEMENT) { if (v > bas) ab += (Math.min(v, haut) - bas) * taux; bas = haut; }
  ab = Math.min(r2(ab), PLAFOND_ABONDEMENT, r2(3 * versements));
  return { lignes: [
    L('accord', 'Versements pris en compte (limite 1 150 €)', `${r2(v)} €`),
    L('accord', 'Abondement de l\'entreprise (tranche par tranche)', `${r2(ab)} €`, { brut: r2(ab), note: 'Sous réserve du plafond légal en vigueur (note * du règlement : valeur à compléter).' }),
  ] };
}

// ---- 7. Majorations de nuit (accord art. 5.6 p.55-56 ; convention art. 5.11.4 p.36)
export function majorationNuit({ h2122 = 0, h225 = 0, h56 = 0, tauxHoraire = 0, forfaitJours = false }) {
  if (forfaitJours) return { lignes: [L('accord', 'Majoration', 'Non applicable aux cadres au forfait annuel en jours (intégrée dans le forfait)', { brut: 0 })] };
  const acc = r2(tauxHoraire * (0.10 * h2122 + 0.30 * h225 + 0.10 * h56));
  const cc = r2(tauxHoraire * (0.05 * h2122 + 0.20 * h225));
  return { lignes: [
    L('accord', 'Majoration de nuit (21-22 h : 10 % ; 22-5 h : 30 % ; 5-6 h : 10 %)', `${acc} €`, { brut: acc }),
    L('convention', 'Majoration de nuit (21-22 h : 5 % ; 22-5 h : 20 %)', `${cc} €`, { brut: cc, note: 'La convention ne mentionne pas de majoration pour 5-6 h dans cet article.' }),
  ] };
}

// ---- 8. Arrêt maladie : carence et durée du complément (accord art. 3.11 ; convention annexe I art. 3)
export function arretMaladie({ statut, ancienneteAns = 0, hospitalisation = false, plus23j = false, plus2mois = false, accidentTravail = false }) {
  const lignes = [];
  const carenceAccord = (hospitalisation || accidentTravail || plus23j) ? 0 : 2;
  lignes.push(L('accord', 'Délai de carence', carenceAccord === 0 ? 'Aucun' : '2 jours', { brut: carenceAccord }));
  let duree;
  if (statut === 'cadre') duree = ancienneteAns >= 1 ? 540 : null;
  else duree = ancienneteAns < 1 ? null : ancienneteAns < 10 ? 180 : ancienneteAns < 25 ? 360 : 540;
  lignes.push(L('accord', 'Durée du complément de salaire', duree ? `${duree} jours calendaires` : (accidentTravail ? 'Droit sans condition d\'ancienneté pour AT/trajet ; durée sous 1 an : Information à compléter' : 'Pas de complément avant 1 an d\'ancienneté (maladie)'), { brut: duree }));
  if (statut === 'employe') {
    const carenceCC = (hospitalisation || accidentTravail || plus2mois) ? 0 : 7;
    lignes.push(L('convention', 'Délai de carence (début du complément au 8e jour)', carenceCC === 0 ? 'Aucun' : '7 jours calendaires', { brut: carenceCC }));
    let bar;
    const a = ancienneteAns;
    if (a < 1) bar = 'Pas de complément avant 1 an de présence';
    else if (a < 5) bar = '100 % pendant 30 jours, puis 90 % pendant 15 jours';
    else if (a < 10) bar = '100 % pendant 35 jours, puis 90 % pendant 40 jours';
    else if (a < 15) bar = '100 % pendant 90 jours';
    else if (a < 20) bar = '100 % pendant 90 jours, puis 60 % pendant 30 jours';
    else bar = '100 % pendant 120 jours, puis 65 % pendant 60 jours';
    lignes.push(L('convention', 'Barème du complément (employés/ouvriers)', bar, { note: 'Bornes exactes (ex. 5 ans pile) : vérifier dans le texte.' }));
  } else lignes.push(L('convention', 'Convention (maîtrise et cadres)', 'Information à compléter : barème non codé dans cette version'));
  return { lignes };
}

// ---- 9. Événements familiaux (accord art. 4.1 p.44 ; convention art. 7.5.1 p.50-51)
export const EVENEMENTS = {
  naissance: { label: 'Naissance ou adoption d\'un enfant', accord: '3 jours ouvrés', cc: '3 jours ouvrés' },
  mariage_salarie: { label: 'Mariage ou PACS du salarié', accord: '1 semaine', cc: '4 jours ouvrés (sans condition) ; 1 semaine après 1 an d\'ancienneté (art. 7.5.1 b)' },
  mariage_enfant: { label: 'Mariage ou PACS d\'un enfant / descendant', accord: '2 jours ouvrés', cc: 'Mariage d\'un enfant : 1 jour ouvré ; descendants (après 1 an d\'ancienneté) : 2 jours ouvrés' },
  mariage_parent: { label: 'Mariage ou PACS du père ou de la mère', accord: '1 jour ouvré', cc: 'Information à compléter (non trouvé dans l\'article 7.5.1)' },
  deces_conjoint: { label: 'Décès du conjoint, concubin, partenaire de PACS, enfant', accord: '5 jours ouvrés (enfant à charge)', cc: '5 jours ouvrés (conjoint, partenaire de PACS ou enfant)' },
  deces_parent: { label: 'Décès d\'un frère, d\'une sœur, d\'un parent, d\'un beau-parent…', accord: '4 jours ouvrés', cc: '3 jours ouvrés (père, mère, frère, sœur, beau-fils, belle-fille, beau-parent)' },
  deces_grandparent: { label: 'Décès d\'un grand-parent, petit-enfant, beau-frère, belle-sœur', accord: '1 jour ouvré', cc: '1 jour ouvré' },
  bapteme: { label: 'Baptême ou communion d\'un enfant', accord: '1 jour ouvré', cc: '1 jour ouvré (après 1 an d\'ancienneté)' },
};
export function evenementFamilial({ evenement, distance300 = false }) {
  const e = EVENEMENTS[evenement]; if (!e) return { lignes: [], erreur: 'Choisir un événement.' };
  const l = [L('accord', e.label, e.accord), L('convention', e.label, e.cc)];
  if (distance300 && evenement.startsWith('deces')) l.push(L('accord', 'Déplacement à plus de 300 km (aller)', '+1 jour supplémentaire'), L('convention', 'Obsèques à plus de 500 km', '1 jour sans solde en plus (art. 7.5.5)'));
  return { lignes: l };
}

// ---- 10. Remise sur achats (accord art. 3.2 p.28-29 ; NAO 2026 partie 2 art. 1-2 p.9)
export function remiseAchats({ achats = 0, ancienneteMois = 0 }) {
  if (ancienneteMois < 3) return { lignes: [L('accord', 'Droit à la remise', 'Non : au moins 3 mois d\'ancienneté requis', { brut: 0 })] };
  const a = r2(Math.min(achats, 11000) * 0.10), n = r2(Math.min(achats, 13000) * 0.12);
  return { lignes: [
    L('accord', 'Remise de 10 % (plafond d\'achats 11 000 €/an)', `${a} €`, { brut: a }),
    L('nao', 'Remise de 12 % du 1er avril 2026 au 31 mars 2027 (plafond d\'achats 13 000 € pour 2026)', `${n} €`, { brut: n, note: 'Les deux périodes se chevauchent sur l\'année civile 2026 : calcul indicatif sur la base d\'achats saisie.' }),
  ] };
}

export const CALCULS = { congesPointage, preavis, indemniteLicenciement, primeAnnuelle, interessement2026, abondement, majorationNuit, arretMaladie, evenementFamilial, remiseAchats };
