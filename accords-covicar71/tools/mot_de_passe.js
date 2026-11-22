// Usage : node tools/mot_de_passe.js "nouveau mot de passe"  → affiche la ligne à mettre dans config.js
import { createHash } from 'node:crypto';
const mdp = process.argv[2];
if (!mdp) { console.error('Donner le mot de passe entre guillemets.'); process.exit(1); }
console.log(`export const EMPREINTE_MDP = '${createHash('sha256').update(mdp).digest('hex')}';`);
