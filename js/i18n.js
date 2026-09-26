// Langue de l'interface et du contenu : français (par défaut) ou anglais.
// Usage dans le code : t('Texte français', 'English text'). Les deux versions restent côte à côte dans le code.
// Choix mémorisé dans le navigateur ; sinon /en/ dans l'adresse (version anglaise), sinon français.
// Même logique dans le script en tête de index.html (langue posée avant l'affichage de l'écran titre).
const CLE = 'rythmo.langue';
export const LANGUES = { fr: 'Français', en: 'English' };

function initiale() {
  try { const l = localStorage.getItem(CLE); if (LANGUES[l]) return l; } catch { /* stockage indisponible */ }
  // l'adresse fixe la langue par défaut (et non la langue du navigateur) : chaque adresse garde un contenu stable
  // pour les moteurs de recherche ; les visiteurs non francophones se voient proposer l'anglais à l'accueil
  return typeof location !== 'undefined' && /\/en\/(index\.html)?$/.test(location.pathname) ? 'en' : 'fr';
}

export let langue = typeof window === 'undefined' ? 'fr' : initiale();
export const enAnglais = () => langue === 'en';
export const t = (fr, en) => (langue === 'en' ? en : fr);
// locale des dates et nombres
export const locale = () => (langue === 'en' ? 'en-GB' : 'fr-FR');

export function definirLangue(l) {
  if (!LANGUES[l]) return;
  langue = l;
  try { localStorage.setItem(CLE, l); } catch { /* stockage indisponible */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}
if (typeof document !== 'undefined') document.documentElement.lang = langue;

// Visiteur non francophone, sans choix mémorisé, sur la version française : on lui propose l'anglais.
export function proposerAnglais() {
  if (langue !== 'fr' || typeof navigator === 'undefined') return false;
  try { if (localStorage.getItem(CLE)) return false; } catch { return false; }
  return !/^fr\b/i.test(navigator.language || 'fr');
}
