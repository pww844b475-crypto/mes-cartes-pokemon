// Calculs des fiches. Fonctions pures : aucune donnée n'est stockée ni envoyée.
// Chaque barème vient d'un texte du dossier sources/ (références dans fiches/fiches.json).
export const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const L = (niveau, label, valeur, extra = {}) => ({ niveau, label, valeur, ...extra });

// ---- 1. Congés payés : décompte des jours à pointer (accord de substitution art. 4.1.2, p.42)
export function congesPointage({ joursHebdo, joursAbsence = 0, semaines = 0, joursFeriesChomes = 0 }) {
  if (!(joursHebdo >= 1 && joursHebdo <= 6) || !(joursAbsence >= 0) || !(semaines >= 0)) return { lignes: [], erreur: 'Renseigner les jours de travail par semaine (1 à 6), les semaines entières et les jours isolés.' };
  const total = joursAbsence + semaines * joursHebdo;   // jours normalement travaillés pendant l'absence
  const aPointer = joursHebdo >= 5 ? (total / joursHebdo) * 6 : (6 * total) / joursHebdo;
  const base = Math.floor(aPointer + 1e-9);
  const feries = Math.max(0, Math.floor(joursFeriesChomes));
  const v = Math.max(0, base - feries);
  const note = feries > 0 ? `${base} jours moins ${feries} jour(s) férié(s) chômé(s) dans l'entreprise, qui ne sont pas décomptés (fiche officielle du Code du travail numérique). Un férié habituellement travaillé dans l'entreprise reste décompté.` : undefined;
  let info;
  if (joursAbsence >= joursHebdo && joursHebdo < 6) info = `Attention : ${joursAbsence} jours isolés = ${joursAbsence} jours que le salarié aurait travaillés, soit ${r2(joursAbsence / joursHebdo)} semaine(s) de travail. Pour une semaine entière, mettre 1 dans « Semaines entières » et 0 dans « Jours isolés ».`;
  return { lignes: [L('accord', 'Jours de congés à pointer', `${v} jour(s)`, { brut: v, note })], info };
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
  const lignes = [];
  const grave = motif === 'faute';
  const ans = ancienneteMois / 12;
  // Accord de substitution (art. 3.4)
  const salRefAccord = r2(salaireMensuel + primeAnnuelle / 12 + indemnitesFonction);
  let mois;
  if (grave || ancienneteMois < 24) mois = 0;
  else if (ancienneteMois < 36) mois = 0.5;
  else if (statut === 'employe') mois = Math.min(6, 0.75 + 0.25 * (Math.floor(ans) - 3));
  else if (ans >= 20) mois = statut === 'cadre' ? 12 : 9;
  else mois = (statut === 'cadre' ? 6 : 3) + 0.25 * (Math.floor(ans) - 3);
  const base = r2(mois * salRefAccord);
  const majPct = (age >= 45 ? 20 : 0) + 10 * enfants;
  lignes.push(L('accord', 'Salaire de référence mensuel (accord)', `${salRefAccord} €`));
  lignes.push(L('accord', 'Indemnité avant majorations', `${r2(mois)} mois = ${base} €`, { brut: base, mois }));
  lignes.push(L('accord', 'Majorations possibles (45 ans : +20 % ; enfants : +10 % chacun)', `+${majPct} %`, { note: 'Base de la majoration non précisée dans le texte : ici appliquée à l\'indemnité.' }));
  lignes.push(L('accord', 'Indemnité avec majorations', `${r2(base * (1 + majPct / 100))} €`, { brut: r2(base * (1 + majPct / 100)), cmp: { g: 'indemnite', v: r2(base * (1 + majPct / 100)), s: 'plus' } }));
  // Convention (annexes I et II : employés et maîtrise ; annexe III : cadres)
  let moisCC = 0;
  if (!grave && ancienneteMois >= 8) {
    if (statut !== 'cadre') moisCC = Math.min(ancienneteMois, 120) * (0.25 / 12) + Math.max(ancienneteMois - 120, 0) * (1 / 3 / 12);
    else if (ancienneteMois <= 60) moisCC = ancienneteMois * (0.25 / 12);
    else {
      const t1 = Math.min(ancienneteMois, 120), t2 = Math.min(Math.max(ancienneteMois - 120, 0), 120), t3 = Math.max(ancienneteMois - 240, 0), t4 = Math.max(ancienneteMois - 480, 0);
      moisCC = Math.min(12, (t1 * 0.3 + t2 * 0.4 + t3 * 0.5) / 12) + t4 / 12 / 3;
    }
  }
  const salCC = Math.max(brut12 / 12, brut3 / 3);
  if (salCC > 0) {
    const b = r2(moisCC * salCC);
    lignes.push(L('convention', 'Salaire « plein tarif » (convention, art. 6)', `${r2(salCC)} €`));
    lignes.push(L('convention', 'Indemnité de licenciement (convention, art. 7.1)', `${r2(moisCC)} mois = ${b} €`, { brut: b, mois: r2(moisCC), cmp: { g: 'indemnite', v: b, s: 'plus' } }));
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
    L('accord', 'Majoration de nuit (21-22 h : 10 % ; 22-5 h : 30 % ; 5-6 h : 10 %)', `${acc} €`, { brut: acc, cmp: { g: 'nuit', v: acc, s: 'plus' } }),
    L('convention', 'Majoration de nuit (21-22 h : 5 % ; 22-5 h : 20 %)', `${cc} €`, { brut: cc, cmp: { g: 'nuit', v: cc, s: 'plus' }, note: 'La convention ne mentionne pas de majoration pour 5-6 h dans cet article.' }),
  ] };
}

// ---- 8. Arrêt maladie : carence et durée du complément (accord art. 3.11 ; convention annexe I art. 3)
export function arretMaladie({ statut, ancienneteAns = 0, hospitalisation = false, plus23j = false, plus2mois = false, accidentTravail = false }) {
  const lignes = [];
  const carenceAccord = (hospitalisation || accidentTravail || plus23j) ? 0 : 2;
  lignes.push(L('accord', 'Délai de carence', carenceAccord === 0 ? 'Aucun' : '2 jours', { brut: carenceAccord, cmp: { g: 'carence', v: carenceAccord, s: 'moins' } }));
  let duree;
  if (statut === 'cadre') duree = ancienneteAns >= 1 ? 540 : null;
  else duree = ancienneteAns < 1 ? null : ancienneteAns < 10 ? 180 : ancienneteAns < 25 ? 360 : 540;
  lignes.push(L('accord', 'Durée du complément de salaire', duree ? `${duree} jours calendaires` : (accidentTravail ? 'Droit sans condition d\'ancienneté pour AT/trajet ; durée sous 1 an : Information à compléter' : 'Pas de complément avant 1 an d\'ancienneté (maladie)'), { brut: duree }));
  if (statut === 'employe') {
    const carenceCC = (hospitalisation || accidentTravail || plus2mois) ? 0 : 7;
    lignes.push(L('convention', 'Délai de carence (début du complément au 8e jour)', carenceCC === 0 ? 'Aucun' : '7 jours calendaires', { brut: carenceCC, cmp: { g: 'carence', v: carenceCC, s: 'moins' } }));
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

// ---- 11. Journée de solidarité (accord de substitution art. 5.9, p.59 ; horaire de référence art. 5.1.2, p.64)
export function journeeSolidarite({ statut = 'employe', horaireSalarie = 0, horaireConv = '35', arriveeEnCours = false }) {
  if (statut === 'encadrement') return { lignes: [L('accord', 'Journée de solidarité (encadrement)', '1 unité sur le quota annuel de jours de RTT', { brut: 1 })] };
  const conv = Number(horaireConv);
  if (!(horaireSalarie > 0) || !(conv > 0)) return { lignes: [], erreur: 'Renseigner l\'horaire hebdomadaire du salarié.' };
  const minutes = Math.round((7 * 60 * horaireSalarie) / conv);
  const hm = `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
  const lignes = [L('accord', 'Heures de solidarité à ajouter sur l\'année', `${hm} (formule : 7 h × ${horaireSalarie} ÷ ${conv})`, { brut: minutes })];
  if (arriveeEnCours) lignes.unshift(L('pratique', 'Salarié arrivé en cours d\'année', 'Pas de journée de solidarité selon la pratique RH', { brut: 0, note: 'Pratique à confirmer : non écrite dans les textes du dossier (l\'accord cite la présence au 1er juin pour les CDD de plus de 4 mois).' }));
  return { lignes };
}

// ---- 12. Prime annuelle d'un salarié en arrêt (accord art. 3.2 p.24-25 ; art. 3.11.2 p.38 ; convention art. 3.6.2 p.14)
const jour = d => new Date(Date.UTC(...d.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x))));
const iso = dt => dt.toISOString().slice(0, 10);
export function primeEtArret({ statut = 'employe', ancienneteAns = 0, accidentTravail = false, dateDebut, annee }) {
  if (!dateDebut || !annee) return { lignes: [], erreur: 'Renseigner la date de début de l\'arrêt et l\'année de la prime.' };
  const debut = jour(dateDebut), l = [];
  const duree = statut === 'cadre' ? (ancienneteAns >= 1 ? 540 : 0) : ancienneteAns < 1 ? 0 : ancienneteAns < 10 ? 180 : ancienneteAns < 25 ? 360 : 540;
  const finCompl = duree ? new Date(debut.getTime() + (duree - 1) * 86400000) : null;
  const j1 = Date.UTC(annee, 0, 1), d31 = Date.UTC(annee, 11, 31);
  l.push(L('accord', 'Fin approximative du complément de l\'employeur (jours calendaires, carence non déduite)', finCompl ? iso(finCompl) : 'Pas de complément (ancienneté insuffisante)', { brut: finCompl ? iso(finCompl) : null }));
  const jusque = finCompl ? finCompl.getTime() : -Infinity;
  if (jusque < j1) l.push(L('accord', `Complément de l'employeur versé en ${annee}`, 'Aucun : la base de calcul de la prime est nulle', { brut: 0, note: 'Les indemnités de la Sécurité sociale et de la prévoyance ne comptent pas dans la base (art. 3.2).' }));
  else { const jours = Math.min(jusque, d31) - j1; l.push(L('accord', `Complément de l'employeur versé en ${annee}`, `Environ ${Math.floor(jours / 86400000) + 1} jours : prime proportionnelle à ces sommes`, { brut: Math.floor(jours / 86400000) + 1 })); }
  if (accidentTravail) l.push(L('accord', 'Accident du travail / maladie professionnelle', 'Compte dans la base « dans la limite ininterrompue d\'un an » (jusqu\'au ' + iso(new Date(Date.UTC(debut.getUTCFullYear() + 1, debut.getUTCMonth(), debut.getUTCDate() - 1))) + ')', { brut: 'at' }));
  const unAn = Date.UTC(debut.getUTCFullYear() + 1, debut.getUTCMonth(), debut.getUTCDate());
  const versement = Date.UTC(annee, 11, 1);
  l.push(L('convention', 'Contrat suspendu depuis moins de 1 an au moment du versement (début décembre)', unAn > versement ? 'Oui : condition remplie' : 'Non : condition non remplie (art. 3.6.2)', { brut: unAn > versement }));
  return { lignes: l };
}

// ---- 13. Retraite progressive (accord art. 3.13, p.38-39)
export function retraiteProgressive({ age = 0, moisAvantAgeLegal = 999, trimestres = 0, horaire = 0 }) {
  const ok = (b, t) => L('accord', t, b ? 'Oui' : 'Non', { brut: b });
  const lignes = [ok(age >= 60, 'Avoir 60 ans'), ok(moisAvantAgeLegal < 24, 'Être à moins de 2 ans avant l\'âge minimum légal'), ok(trimestres >= 150, 'Totaliser 150 trimestres validés (tous régimes)')];
  const tout = lignes.every(l => l.brut);
  lignes.push(L('accord', 'Conditions d\'âge et de trimestres', tout ? 'Réunies (reste la demande écrite 4 mois avant et la validation RH/manager)' : 'Non réunies', { brut: tout }));
  if (horaire > 0) lignes.push(L('accord', 'Horaire pendant la retraite progressive (50 % ou 60 % d\'un temps complet)', `${r2(horaire * 0.5)} h (50 %) ou ${r2(horaire * 0.6)} h (60 %) par semaine`, { note: 'Pourcentage d\'un temps complet : exemple de l\'accord = 36 h → 18 h ou 21,6 h.' }));
  return { lignes };
}

// ---- 14. Enfant malade / hospitalisé (accord art. 4.2.1 p.45 ; convention art. 7.6.9 p.53-54)
export function enfantMalade({ situation = 'hospitalise', ageEnfant = 0, nbEnfantsMoins16 = 1 }) {
  const l = [];
  const hosp = situation === 'hospitalise';
  if (hosp) l.push(L('accord', 'Enfant hospitalisé ou en convalescence après hospitalisation', ageEnfant < 16 ? '6 jours ouvrables rémunérés par année civile, sur justificatifs' : 'Non prévu pour un enfant de 16 ans ou plus', { brut: ageEnfant < 16 ? 6 : 0 }));
  else {
    const max = (nbEnfantsMoins16 >= 3 || ageEnfant < 1) ? 5 : 3;
    l.push(L('accord', 'Enfant malade (non hospitalisé)', `Absence avec récupération, autant de fois que nécessaire, ${max} jours consécutifs maximum`, { brut: max, note: 'Récupération en accord avec l\'encadrement ; elle ne peut pas être compensée par la suppression du temps de pause.' }));
  }
  if (ageEnfant < 12) l.push(L('convention', 'Enfant de moins de 12 ans (hospitalisé ou à soigner)', '5 jours ouvrés payés par année civile, quel que soit le nombre d\'enfants', { brut: 5 }));
  else if (ageEnfant < 16) l.push(L('convention', 'Enfant de 12 à moins de 16 ans (malade ou convalescence après hospitalisation)', '5 jours ouvrés maximum, non rémunérés ; possibilité de les récupérer', { brut: 5 }));
  else l.push(L('convention', 'Enfant de 16 ans ou plus', 'Non prévu par ces articles', { brut: 0 }));
  return { lignes: l };
}

// ---- 15. Délai de protection en cas de maladie (accord art. 3.12 p.38 ; convention art. 7.3.1 p.49-50)
export function delaiProtection({ statut = 'employe', ancienneteAns = 0, accidentTrajet = false }) {
  const l = [];
  if (statut !== 'employe') l.push(L('accord', 'Agents de maîtrise et cadres (maladie ou accident de trajet)', '2 ans', { brut: '2 ans' }));
  else if (accidentTrajet) l.push(L('accord', 'Employé, accident de trajet', '2 ans', { brut: '2 ans' }));
  else if (ancienneteAns < 0.5) l.push(L('accord', 'Employé, maladie', 'Pas de délai prévu (moins de 6 mois d\'ancienneté)', { brut: null }));
  else if (ancienneteAns < 1) l.push(L('accord', 'Employé, maladie (6 mois à 1 an)', '4 mois', { brut: '4 mois' }));
  else { const j = ancienneteAns < 10 ? 180 : ancienneteAns < 25 ? 360 : 540; l.push(L('accord', 'Employé, maladie (plus de 1 an)', `durée du complément (${j} jours) + 1 mois`, { brut: j })); }
  if (ancienneteAns < 0.5) l.push(L('convention', 'Maladie ou accident non professionnel', 'Pas de délai prévu (6 mois de présence effective requis)', { brut: null }));
  else { const maj = ancienneteAns >= 15 ? 5 : ancienneteAns >= 12 ? 4 : ancienneteAns >= 8 ? 3 : ancienneteAns >= 4 ? 2 : 0; l.push(L('convention', 'Maladie ou accident non professionnel (accident de trajet compris)', `4 mois, majoré de ${maj} mois = ${4 + maj} mois`, { brut: 4 + maj, note: 'Majoration lue comme un palier (2, 3, 4 ou 5 mois), pas comme un cumul.' })); }
  return { lignes: l };
}

// ---- 16. Capital décès (livret CGT p.30, tableau lu sur l'image ; contrat APGIS non fourni)
export function capitalDeces({ situation = 'seul', nbEnfants = 0, salaireReference = 0 }) {
  let pct;
  if (nbEnfants >= 1) pct = 185 + 35 * Math.min(Math.max(nbEnfants - 1, 0), 2) + 50 * Math.max(nbEnfants - 3, 0);
  else pct = situation === 'couple' ? 150 : 100;
  const l = [L('accord', 'Capital décès, toutes causes (% du salaire de référence, tranches 1 et 2)', `${pct} %`, { brut: pct })];
  if (salaireReference > 0) {
    const cap = r2(salaireReference * pct / 100);
    l.push(L('accord', 'Capital décès', `${cap} €`, { brut: cap }), L('accord', 'Capital supplémentaire si décès par accident (+ 50 % du capital)', `${r2(cap / 2)} €`, { brut: r2(cap / 2) }));
  }
  return { lignes: l };
}

// ---- 17. Absence pour déménagement (accord art. 4.2.3 p.46)
export const MOTIFS_DEMENAGEMENT = { handicap: 12, divorce: 12, garde: 12, deces: 12, ascendant: 12, naissance: 6, mariage: 6 };
export function demenagement({ motif = 'handicap', moisEcart = 0 }) {
  const g = MOTIFS_DEMENAGEMENT[motif];
  const ok = g === 12 ? (moisEcart >= 0 && moisEcart <= 12) : (moisEcart >= -6 && moisEcart <= 6);
  return { lignes: [L('accord', 'Absence rémunérée de 1 jour ouvré pour déménagement', ok ? 'Oui, si les justificatifs sont fournis' : 'Non : en dehors du délai', { brut: ok, note: g === 12 ? 'Délai : dans les 12 mois suivant l\'événement.' : 'Délai : dans les 6 mois précédant ou suivant l\'événement.' })] };
}

// ---- 18. Congés payés acquis (Code du travail L3141-3, L3141-5, L3141-5-1, L3141-7)
export function congesAcquis({ moisTravail = 0, moisMaladieNonPro = 0 }) {
  const a = 2.5 * moisTravail, b = Math.min(2 * moisMaladieNonPro, 24);
  const total = Math.min(Math.ceil(a + b - 1e-9), 30);
  return { lignes: [L('code', 'Jours ouvrables de congés acquis sur la période de référence', `${total} jours ouvrables (${r2(total / 6)} semaines de 6 jours)`, { brut: total, note: 'Calcul légal : 2,5 jours ouvrables par mois de travail effectif (et assimilé) ; 2 jours par mois d\'arrêt maladie non professionnel, dans la limite de 24 jours ; arrondi à l\'entier supérieur ; 30 jours maximum.' })] };
}

// ---- 19. Jours de fractionnement (accord art. 4.1.4 p.43 ; Code du travail L3141-23)
export function fractionnement({ joursHorsPeriode = 0 }) {
  const j = joursHorsPeriode >= 6 ? 2 : joursHorsPeriode >= 3 ? 1 : 0;
  return { lignes: [L('accord', 'Jours supplémentaires de fractionnement', j === 0 ? 'Aucun' : `${j} jour(s) ouvrable(s)`, { brut: j, note: 'La 5e semaine de congés payés est exclue du calcul (accord).' })] };
}

// ---- 20. Congé supplémentaire d'ancienneté (accord art. 4.2 p.43 ; convention art. 7.1.2 p.49)
export function congeAnciennete({ ancienneteAns = 0 }) {
  const acc = ancienneteAns >= 40 ? 5 : ancienneteAns >= 30 ? 4 : ancienneteAns >= 20 ? 3 : ancienneteAns >= 15 ? 2 : ancienneteAns >= 10 ? 1 : 0;
  const cc = ancienneteAns >= 20 ? 3 : ancienneteAns >= 15 ? 2 : ancienneteAns >= 10 ? 1 : 0;
  return { lignes: [L('accord', 'Congé supplémentaire d\'ancienneté (ancienneté acquise au 1er juin)', acc ? `${acc} jour(s)` : 'Aucun', { brut: acc, cmp: { g: 'anc', v: acc, s: 'plus' } }), L('convention', 'Congé supplémentaire d\'ancienneté', cc ? `${cc} jour(s)` : 'Aucun', { brut: cc, cmp: { g: 'anc', v: cc, s: 'plus' }, note: 'La convention s\'arrête à 3 jours (20 ans) ; l\'accord va jusqu\'à 5 jours (40 ans).' })] };
}

// ---- 21. Indemnité de congés payés (Code du travail L3141-24)
export function indemniteConges({ remunerationReference = 0, maintienSalaire = 0 }) {
  const dixieme = r2(remunerationReference / 10), m = r2(maintienSalaire), v = Math.max(dixieme, m);
  return { lignes: [L('code', 'Règle du dixième (1/10 de la rémunération brute de la période de référence)', `${dixieme} €`, { brut: dixieme }), L('code', 'Règle du maintien de salaire (ce qu\'aurait perçu le salarié en travaillant)', `${m} €`, { brut: m }), L('code', 'Indemnité due (la plus élevée des deux)', `${v} €`, { brut: v })] };
}

// ---- 22. Grossesse : réduction d'horaire (accord art. 4.3 p.48 ; convention art. 7.6.4 d)
export function grossesse({ moisGrossesse = 0 }) {
  const l = [];
  l.push(L('accord', 'Réduction d\'horaire par journée travaillée, sans perte de rémunération', moisGrossesse >= 4 ? '30 minutes (ou 2 fois 15 minutes), en prise de travail retardée ou en fin anticipée au choix de la salariée' : 'Pas avant le 1er jour du 4e mois', { brut: moisGrossesse >= 4 ? 30 : 0 }));
  l.push(L('accord', 'Plage horaire de travail (certificat, à sa demande)', moisGrossesse >= 5 ? 'Pas avant 7 h 30, pas après 19 h, jusqu\'à la première année de l\'enfant' : 'Pas avant le 5e mois', { brut: moisGrossesse >= 5 }));
  l.push(L('convention', 'Entrée 1/4 d\'heure plus tard ou sortie 1/4 d\'heure plus tôt', moisGrossesse > 4 ? 'Oui (à l\'expiration du 4e mois)' : 'Pas avant l\'expiration du 4e mois', { brut: moisGrossesse > 4 }));
  return { lignes: l };
}

// ---- 23. Durée du congé de maternité et maintien de salaire (L1225-17 à 19 ; accord titre 6 p.99 ; convention art. 7.6.6 a)
export function maternite({ rang = 1, multiples = 'non', ancienneteAns = 0 }) {
  let avant, apres;
  if (multiples === 'jumeaux') { avant = 12; apres = 22; } else if (multiples === 'triples') { avant = 24; apres = 22; }
  else if (rang >= 3) { avant = 8; apres = 18; } else { avant = 6; apres = 10; }
  const l = [L('code', 'Congé de maternité légal', `${avant + apres} semaines (${avant} avant et ${apres} après l'accouchement)`, { brut: avant + apres })];
  if (rang >= 3 && multiples === 'non') l.push(L('accord', 'Maintien du salaire (3e enfant)', 'Pendant la totalité des 26 semaines', { brut: 26, cmp: { g: 'mat', v: 26, s: 'plus' } }));
  let cc = ancienneteAns >= 3 ? 16 : ancienneteAns >= 2 ? 10 : ancienneteAns >= 1 ? 6 : 0;
  if (cc && multiples !== 'non') cc += 2;
  l.push(L('convention', 'Complément de salaire de l\'employeur (maintien du net)', cc ? `${cc} semaines` : 'Aucun (moins de 1 an de présence à la déclaration de grossesse)', { brut: cc, cmp: { g: 'mat', v: cc, s: 'plus' }, note: 'Après 1 an : 6 semaines ; 2 ans : 10 semaines ; 3 ans : 16 semaines ; plus 2 semaines en cas de naissances multiples. Ancienneté appréciée à la déclaration de grossesse.' }));
  return { lignes: l };
}

// ---- 24. Congé de paternité (L1225-35 ; accord titre 6 p.99)
export function paternite({ multiples = 'non' }) {
  const m = multiples !== 'non', total = m ? 32 : 25;
  return { lignes: [L('code', 'Congé de paternité et d\'accueil de l\'enfant', `${total} jours calendaires (4 jours consécutifs après le congé de naissance, puis ${m ? 28 : 21} jours)`, { brut: total }), L('accord', 'Maintien du salaire', `${total} jours`, { brut: total })] };
}

// ---- 25. Congé parental et ancienneté (accord titre 6 p.100 ; L1225-54 ; convention art. 7.6.7)
export function congeParentalAnciennete({ moisCongeParental = 0 }) {
  const m = moisCongeParental;
  const accord = m < 12 ? m : m <= 24 ? 12 : m / 2;
  const l = [L('accord', 'Mois pris en compte dans l\'ancienneté', `${r2(accord)} mois`, { brut: accord, note: m === 24 ? 'Exactement 24 mois : le texte ne tranche pas entre « 12 mois » et « la moitié », qui donnent ici le même résultat (12 mois).' : undefined })];
  l.push(L('code', 'Congé parental à temps plein (légal, convention)', `${r2(m / 2)} mois (la moitié)`, { brut: r2(m / 2), note: 'Code du travail L1225-54 et convention art. 7.6.7 : prise en compte pour moitié.' }));
  return { lignes: l };
}

// ---- 26. Allocation de départ à la retraite (accord art. 3.5 p.26-27 ; convention annexes I à III art. 8.2)
export function allocationRetraite({ statut = 'employe', ancienneteAns = 0, salaireReference = 0, plafondSecu = 0 }) {
  const a = ancienneteAns, l = [];
  let m;
  if (statut === 'employe') m = a > 20 ? 5 : a > 16 ? 4 : a > 13 ? 3 : a > 10 ? 2.5 : 0;
  else if (a >= 10) m = Math.min(2.5 + 0.2 * Math.floor(a - 10), statut === 'cadre' ? 6 : 5); else m = 0;
  const sr = statut === 'employe' && plafondSecu > 0 ? Math.min(salaireReference, plafondSecu) : salaireReference;
  l.push(L('accord', 'Allocation de départ à la retraite', m ? `${r2(m)} mois de salaire de référence` : 'Aucune (moins de 10 ans d\'ancienneté ou seuil non atteint)', { brut: r2(m), cmp: { g: 'alloc', v: r2(m), s: 'plus' }, note: statut === 'employe' ? 'Salaire de référence limité au plafond de la Sécurité sociale.' : 'Au-delà de 64 ans au départ, les années de présence ne font plus augmenter l\'allocation.' }));
  if (m && sr > 0) l.push(L('accord', 'Montant', `${r2(m * sr)} €`, { brut: r2(m * sr) }));
  let cc = 0;
  if (statut === 'cadre') cc = a >= 5 ? Math.min(6, Math.min(a, 10) * 2 / 20 + Math.max(Math.min(a, 20) - 10, 0) * 3 / 20 + Math.max(a - 20, 0) * 5 / 20) : 0;
  else cc = a >= 10 ? Math.min(4, 10 * 2 / 20 + (a - 10) * 3 / 20) : 0;
  l.push(L('convention', 'Allocation de départ en retraite (salaire « plein tarif »)', cc ? `${r2(cc)} mois` : 'Aucune (ancienneté minimale non atteinte)', { brut: r2(cc), cmp: { g: 'alloc', v: r2(cc), s: 'plus' }, note: statut === 'cadre' ? 'Cadres : au moins 5 ans de présence, maximum 6 mois.' : 'Employés et maîtrise : au moins 10 ans d\'ancienneté, maximum 4 mois.' }));
  return { lignes: l };
}

// ---- 27. Période d'essai (convention annexes I à III art. 2 ; L1221-19, L1221-21, L1221-25)
export function periodeEssai({ statut = 'employe', joursPresence = 0 }) {
  const dur = statut === 'employe' ? '2 mois' : statut === 'maitrise' ? '3 mois, renouvelable une fois d\'un commun accord dans la limite de 2 mois' : '4 mois (jusqu\'à 6 mois par accord), renouvelable une fois dans la limite de 8 mois, accord écrit signé';
  const j = joursPresence;
  const emp = j < 8 ? '24 heures' : j <= 30 ? '48 heures' : (statut === 'employe' || j <= 90) ? '2 semaines' : '1 mois';
  const emp_loi = j < 8 ? '24 heures' : j <= 30 ? '48 heures' : j <= 90 ? '2 semaines' : '1 mois';
  return { lignes: [
    L('convention', 'Durée de la période d\'essai', dur),
    L('convention', 'Délai de prévenance si l\'employeur met fin à l\'essai', emp, { brut: emp, note: statut === 'employe' ? 'Annexe I : 3 paliers (24 h, 48 h, 2 semaines après 1 mois). Le palier « 1 mois après 3 mois » est dans la loi.' : undefined }),
    L('convention', 'Délai de prévenance si le salarié met fin à l\'essai', j < 8 ? '24 heures' : '48 heures', { brut: j < 8 ? 24 : 48 }),
    L('code', 'Délai de prévenance de l\'employeur selon la loi (L1221-25)', emp_loi, { brut: emp_loi }),
  ] };
}

// ---- 28. Heures supplémentaires (accord art. 5.2.1 p.65 ; Code du travail L3121-27, L3121-36)
export function heuresSup({ heuresEffectives = 0, heuresPresence = 0, tauxHoraire = 0 }) {
  const hs = Math.max(0, heuresEffectives - 35), h25 = Math.min(hs, 8), h50 = Math.max(hs - 8, 0);
  const l = [L('accord', 'Lecture « 35 h de travail effectif » : heures supplémentaires', `${r2(hs)} h dont ${r2(h25)} h à 25 % et ${r2(h50)} h à 50 %`, { brut: r2(hs) })];
  if (tauxHoraire > 0 && hs > 0) { const maj = r2(tauxHoraire * (h25 * 0.25 + h50 * 0.5)); l.push(L('accord', 'Majoration correspondante', `${maj} €`, { brut: maj }), L('accord', 'Total pour ces heures (taux de base + majoration)', `${r2(tauxHoraire * hs + maj)} €`, { brut: r2(tauxHoraire * hs + maj) })); }
  const hp = Math.max(0, heuresPresence - 36);
  l.push(L('accord', 'Lecture « 36 h de temps de présence » : heures supplémentaires', `${r2(hp)} h`, { brut: r2(hp), note: 'L\'accord cite les deux seuils (36 h de présence et 35 h de travail effectif) : écart à vérifier, non tranché. Les majorations (25 % puis 50 %) sont écrites pour le seuil de 35 h de travail effectif.' }));
  l.push(L('code', 'Selon la loi : heures au-delà de 35 h (25 % les 8 premières, 50 % ensuite)', `${r2(hs)} h dont ${r2(h25)} h à 25 % et ${r2(h50)} h à 50 %`, { brut: r2(hs) }));
  return { lignes: l };
}

// ---- 29. Annualisation, temps complet (accord art. 5.1.4 à 5.1.5 p.67-68)
export function annualisation({ presenceSemaine = 0 }) {
  const p = presenceSemaine, ecart = r2(p - 36);
  const pos = p > 39 ? 'Au-dessus de la limite haute de 39 h : les heures au-delà sont des heures supplémentaires' : p < 33 ? 'En dessous de la limite basse de 33 h' : 'Dans la plage de 33 h à 39 h';
  return { lignes: [
    L('accord', 'Écart avec la moyenne de 36 h de présence (compteur de modulation)', `${ecart > 0 ? '+' : ''}${ecart} h`, { brut: ecart, note: 'Les heures entre 36 h et 39 h ne sont ni supplémentaires ni majorées : elles se compensent sur l\'année.' }),
    L('accord', 'Position dans la plage de l\'annualisation', pos),
    L('accord', 'Heures supplémentaires cette semaine (au-delà de 39 h)', `${r2(Math.max(0, p - 39))} h`, { brut: r2(Math.max(0, p - 39)) }),
  ] };
}

// ---- 30. Heures complémentaires à temps partiel (accord art. 5.1.5 p.81-82 ; Code du travail L3123-9, L3123-21)
export function heuresComplementaires({ horaireContrat = 0, heuresCompl = 0 }) {
  const tiers = r2(horaireContrat / 3), dixieme = r2(horaireContrat / 10), total = r2(horaireContrat + heuresCompl);
  const maj = r2(Math.max(0, heuresCompl - dixieme)), sans = r2(Math.min(heuresCompl, dixieme));
  return { lignes: [
    L('accord', 'Limite : un tiers de la durée du contrat', `${tiers} h par semaine`, { brut: tiers, note: heuresCompl > tiers ? 'Limite dépassée.' : undefined }),
    L('accord', 'Heures complémentaires sans majoration (jusqu\'à 1/10 du contrat)', `${sans} h`, { brut: sans }),
    L('accord', 'Heures complémentaires majorées de 25 % (au-delà de 1/10)', `${maj} h`, { brut: maj }),
    L('accord', 'Durée totale de la semaine', `${total} h`, { brut: total, note: 'Elle ne doit pas atteindre la durée légale (35 h) ou conventionnelle (36 h de présence selon l\'accord) : ' + (total >= 35 ? 'seuil atteint ou dépassé.' : 'seuil respecté.') }),
  ] };
}

// ---- 31. Modulation du temps partiel (accord art. 5.2 p.82)
export function modulationTempsPartiel({ horaire = 0 }) {
  if (horaire < 26) return { lignes: [L('accord', 'Modulation des horaires', 'Pas de modulation prévue pour un contrat inférieur à 26 h', { brut: null })] };
  const tab = { 26: [30, 22], 28: [32, 24], 30: [34, 26] };
  const [haut, bas] = tab[horaire] || [horaire + 4, horaire - 4];
  return { lignes: [L('accord', 'Limite haute de la semaine', `${haut} h`, { brut: haut }), L('accord', 'Limite basse de la semaine', `${bas} h`, { brut: bas, note: tab[horaire] ? undefined : 'Le tableau de l\'accord ne donne que 26 h, 28 h et 30 h ; la règle générale est de plus ou moins 4 h.' })] };
}

// ---- 32. Participation : base de répartition et plafonds (accord de participation signé, art. 4 p.5)
export function participationRepartition({ salaireAnnuel = 0, plafondSecu = 0, moisPresence = 12 }) {
  if (!(plafondSecu > 0)) return { lignes: [], erreur: 'Renseigner le plafond annuel de la Sécurité sociale (48 060 € en 2026, source Urssaf ; vérifier la valeur de l\'année concernée).' };
  const k = Math.min(Math.max(moisPresence, 0), 12) / 12;
  const plafondSalaire = r2(3 * plafondSecu * k), plafondDroits = r2(0.75 * plafondSecu * k);
  const base = r2(Math.min(salaireAnnuel, plafondSalaire));
  return { lignes: [
    L('accord', 'Salaire pris en compte pour la répartition', `${base} €`, { brut: base, note: salaireAnnuel > plafondSalaire ? 'Salaire plafonné à 3 fois le plafond annuel de la Sécurité sociale (au prorata de la présence).' : 'Dans la limite de 3 fois le plafond annuel de la Sécurité sociale (au prorata de la présence).' }),
    L('accord', 'Plafond individuel des droits à participation (75 % du plafond annuel)', `${plafondDroits} €`, { brut: plafondDroits, note: 'Le montant réel dépend de la réserve de participation de l\'entreprise et du total des salaires : il ne peut pas être calculé ici.' }),
  ] };
}

export const CALCULS = { participationRepartition, heuresSup, annualisation, heuresComplementaires, modulationTempsPartiel, allocationRetraite, periodeEssai, congesAcquis, fractionnement, congeAnciennete, indemniteConges, grossesse, maternite, paternite, congeParentalAnciennete, delaiProtection, capitalDeces, demenagement, enfantMalade, retraiteProgressive, primeEtArret, journeeSolidarite, congesPointage, preavis, indemniteLicenciement, primeAnnuelle, interessement2026, abondement, majorationNuit, arretMaladie, evenementFamilial, remiseAchats };
