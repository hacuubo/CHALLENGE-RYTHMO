// Installation de l'application (PWA) sur le téléphone, proposée en haut de l'accueil.
// - Android (Chrome, Edge, Samsung Internet…) : le navigateur émet `beforeinstallprompt` ; on retient l'événement
//   (capté dès l'en-tête de index.html, avant le chargement de ce module) et le bouton « Installer » ouvre la
//   boîte d'installation du système.
// - iPhone et iPad : pas d'installation automatique ; on explique la démarche (Partager → Sur l'écran d'accueil).
// Rien n'est proposé sur ordinateur, ni quand l'application est déjà ouverte en plein écran (installée) ;
// la proposition refermée revient au bout de 30 jours.
import { t } from './i18n.js';
import { toast } from './util.js';

const CLE = 'rythmo.installation';
const JOUR = 86400000;
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
const lire = () => { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return {}; } };
const ecrire = o => { try { localStorage.setItem(CLE, JSON.stringify(o)); } catch { /* stockage indisponible */ } };

// iPhone, iPod et iPad (l'iPad se présente comme un Mac tactile depuis iPadOS 13)
export const surIOS = () => /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
const surAndroid = () => /Android/i.test(ua);
// déjà lancée depuis l'icône de l'écran d'accueil
export const dejaInstallee = () => (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches)
  || (typeof navigator !== 'undefined' && navigator.standalone === true) || !!lire().installee;

let evenement = typeof window === 'undefined' ? null : window.__installationPwa || null; // événement retenu par index.html
let abonne = null; // rappel de l'accueil : l'événement peut arriver après l'affichage de l'accueil
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); evenement = e; if (abonne) abonne(); });
  window.addEventListener('appinstalled', () => {
    ecrire({ installee: true });
    evenement = null;
    document.querySelector('.installation')?.remove();
    toast(t('Application installée : retrouvez Shock & Pace sur votre écran d\'accueil.', 'App installed: find Shock & Pace on your home screen.'), 4000);
  });
}

// Mode de la proposition à afficher : 'bouton' (Android : le navigateur sait installer), 'ios' (démarche expliquée
// sur iPhone et iPad) ou null (rien : ordinateur, déjà installée, refusée récemment).
export function proposition() {
  if (dejaInstallee()) return null;
  const { refusee } = lire();
  if (refusee && Date.now() - refusee < 30 * JOUR) return null;
  if (surIOS()) return 'ios';
  if (surAndroid() && evenement) return 'bouton';
  return null;
}
export const quandInstallable = f => { abonne = f; };
export function refuser() { ecrire({ refusee: Date.now() }); }

// Ouvre la boîte d'installation du système (Android) ; renvoie true si l'utilisateur a accepté.
export async function installer() {
  const e = evenement;
  if (!e) return false;
  evenement = null; // un événement ne sert qu'une fois
  try {
    await e.prompt();
    const choix = await e.userChoice;
    return choix?.outcome === 'accepted';
  } catch { return false; }
}

// Étapes de l'installation manuelle sur iPhone et iPad.
export const etapesIOS = () => [
  t('Touchez le bouton <b>Partager</b> (dans Safari : carré avec une flèche vers le haut ; sous iOS 26, il est dans le menu <b>⋯</b>).',
    'Tap the <b>Share</b> button (in Safari: a square with an arrow pointing up; on iOS 26 it is in the <b>⋯</b> menu).'),
  t('Faites défiler et choisissez <b>Sur l\'écran d\'accueil</b>.', 'Scroll down and choose <b>Add to Home Screen</b>.'),
  t('Touchez <b>Ajouter</b> : l\'icône Shock & Pace apparaît sur l\'écran d\'accueil.', 'Tap <b>Add</b>: the Shock & Pace icon appears on your home screen.'),
];
