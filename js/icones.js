// Icônes vectorielles au trait (24 × 24, couleur du texte), pour remplacer les émoticônes de l'interface.
const svg = corps => `<svg class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corps}</svg>`;

// Logo « Shock & Pace » : spike de stimulation (orange) suivi du complexe qu'il déclenche.
export const LOGO = '<svg class="logo-marque" viewBox="0 0 70 40" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 28H16L21 31L28 10L37 37L42 28H48C51 28 52 21 57 21C62 21 63 28 67 28" stroke="currentColor" stroke-width="3.4"/><path d="M16 28V3" stroke="#FF6A3D" stroke-width="3.4"/></svg>';

export const ICONES = {
  // cible avec flèche : entraînement
  entrainement: svg('<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4.5"/><circle cx="11" cy="13" r="1"/><path d="M11 13 20 4"/><path d="M16.5 3.5 20 4l.5 3.5"/>'),
  // coupe : compétitif
  competitif: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5a2 2 0 0 0 0 1 3 3 0 0 0 3 3"/><path d="M16 6h3a2 2 0 0 1 0 1 3 3 0 0 1-3 3"/><path d="M12 13v4"/><path d="M8.5 20h7"/><path d="M10 17h4"/>'),
  // moniteur avec tracé : simulateur
  simulateur: svg('<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M5 11h3l1.5-3 2.5 6 2-4.5 1 1.5h4"/><path d="M9 21h6"/><path d="M12 17v4"/>'),
  // fiches empilées : fiches
  fiches: svg('<rect x="6" y="3" width="13" height="16" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h10"/><path d="M9.5 8h6"/><path d="M9.5 11.5h6"/><path d="M9.5 15h4"/>'),
  // courbe ascendante : progression
  progression: svg('<path d="M3 20h18"/><path d="M4 16l5-5 4 3 6-7"/><path d="M15 7h4v4"/>'),
  // domaines d'entraînement
  stim: svg('<rect x="3" y="9" width="10" height="12" rx="4"/><path d="M8 9V6a3 3 0 0 1 3-3h1"/><path d="M12 3c3 0 4 2 5 5l2 7"/><circle cx="19.5" cy="17" r="1.5"/>'),
  ecg: svg('<path d="M2 12h4l2-4 3 9 3-12 2 7h6"/>'),
  ep: svg('<path d="M4 20c2-6 4-9 8-11"/><circle cx="14" cy="8" r="1.4"/><circle cx="17" cy="6.5" r="1.4"/><circle cx="20" cy="5" r="1.4"/><path d="M13 3l-1 3h2l-1 3"/>'),
  tout: svg('<path d="M3 7h3.5c3 0 4.5 10 8 10H21"/><path d="M3 17h3.5c1.5 0 2.5-2 3.5-4"/><path d="M14 9c1-1.3 2-2 3.5-2H21"/><path d="M18.5 4.5 21 7l-2.5 2.5"/><path d="M18.5 14.5 21 17l-2.5 2.5"/>'),
  // actions secondaires
  reglages: svg('<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h4"/><path d="M12 12h8"/><circle cx="10" cy="12" r="2"/><path d="M4 18h12"/><path d="M20 18h0"/><circle cx="18" cy="18" r="2"/>'),
  revoir: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/><path d="M12 8v4l3 2"/>'),
  mystere: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5"/><path d="M12 17.2v.1"/>'),
  baie: svg('<rect x="2.5" y="3.5" width="19" height="17" rx="2"/><path d="M5 8h2l1-2 1.5 4 1.5-3 1 1h7"/><path d="M5 13h3l1-1.5 1.5 3 1-1.5h7.5"/><path d="M5 17.5h14"/>'),
};
