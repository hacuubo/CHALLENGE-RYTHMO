// Courbe d'évolution du classement ELO (une série, un point par jour joué), en SVG,
// avec survol : ligne verticale et infobulle sur le point le plus proche.
import { esc } from './util.js';

const fmtJour = j => new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export function courbeElo(conteneur, points, { depart = 1200 } = {}) {
  if (!points.length) {
    conteneur.innerHTML = '<p class="vide">Jouez une partie compétitive pour voir votre courbe.</p>';
    return;
  }
  // un point de départ la veille du premier jour, pour montrer d'où l'on part
  const serie = [{ jour: null, elo: depart, n: 0 }, ...points];
  // dimensions calées sur la largeur réelle : le texte des axes garde sa taille à l'écran
  const W = Math.max(280, Math.min(900, conteneur.clientWidth || 640)), H = W < 500 ? 200 : 240, m = { h: 16, d: 16, b: 30, g: 44 };
  const valeurs = serie.map(p => p.elo);
  let min = Math.min(...valeurs), max = Math.max(...valeurs);
  const marge = Math.max(40, (max - min) * 0.15);
  min = Math.floor((min - marge) / 50) * 50; max = Math.ceil((max + marge) / 50) * 50;
  const x = i => m.g + (serie.length === 1 ? 0 : (i / (serie.length - 1)) * (W - m.g - m.d));
  const y = v => m.h + (1 - (v - min) / (max - min)) * (H - m.h - m.b);
  const pasY = (max - min) / 4;
  const graduations = Array.from({ length: 5 }, (_, k) => Math.round(min + k * pasY));
  const chemin = serie.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.elo).toFixed(1)}`).join('');
  const etiquettesX = serie.map((p, i) => ({ i, t: p.jour ? fmtJour(p.jour) : 'Départ' }))
    .filter((e, k, arr) => arr.length <= 6 || k === 0 || k === arr.length - 1 || k % Math.ceil(arr.length / 5) === 0);

  conteneur.innerHTML = `
    <div class="courbe">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution du classement ELO, de ${serie[0].elo} à ${serie.at(-1).elo}">
        ${graduations.map(v => `<line class="grille-c" x1="${m.g}" x2="${W - m.d}" y1="${y(v)}" y2="${y(v)}"/><text class="axe" x="${m.g - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
        ${etiquettesX.map(e => `<text class="axe" x="${x(e.i)}" y="${H - 8}" text-anchor="middle">${esc(e.t)}</text>`).join('')}
        <path class="ligne-c" d="${chemin}"/>
        <circle class="point-fin" cx="${x(serie.length - 1)}" cy="${y(serie.at(-1).elo)}" r="5"/>
        <line class="curseur" y1="${m.h}" y2="${H - m.b}" x1="0" x2="0" visibility="hidden"/>
        <circle class="point-survol" r="5" visibility="hidden"/>
        <rect class="zone-survol" x="${m.g}" y="0" width="${W - m.g - m.d}" height="${H}" fill="transparent"/>
      </svg>
      <div class="infobulle" hidden></div>
    </div>`;

  const svg = conteneur.querySelector('svg'), bulle = conteneur.querySelector('.infobulle');
  const curseur = svg.querySelector('.curseur'), point = svg.querySelector('.point-survol');
  const montrer = evt => {
    const r = svg.getBoundingClientRect();
    const px = ((evt.clientX - r.left) / r.width) * W;
    let i = 0;
    serie.forEach((_, k) => { if (Math.abs(x(k) - px) < Math.abs(x(i) - px)) i = k; });
    const p = serie[i], prec = serie[i - 1];
    curseur.setAttribute('x1', x(i)); curseur.setAttribute('x2', x(i)); curseur.setAttribute('visibility', 'visible');
    point.setAttribute('cx', x(i)); point.setAttribute('cy', y(p.elo)); point.setAttribute('visibility', 'visible');
    const d = prec ? p.elo - prec.elo : 0;
    bulle.innerHTML = p.jour
      ? `<b>${fmtJour(p.jour)}</b><br>ELO ${Math.round(p.elo)} <span class="delta ${d >= 0 ? 'plus' : 'moins'}">${d >= 0 ? '+' : ''}${Math.round(d)}</span><br>${p.n} question(s), ${p.gagnees ?? 0} juste(s)`
      : `<b>Départ</b><br>ELO ${p.elo}`;
    bulle.hidden = false;
    const gauche = (x(i) / W) * r.width;
    bulle.style.left = `${Math.min(Math.max(gauche - 70, 0), r.width - 150)}px`;
    bulle.style.top = `${(y(p.elo) / H) * r.height - 70}px`;
  };
  const cacher = () => { curseur.setAttribute('visibility', 'hidden'); point.setAttribute('visibility', 'hidden'); bulle.hidden = true; };
  const zone = svg.querySelector('.zone-survol');
  zone.addEventListener('pointermove', montrer);
  zone.addEventListener('pointerdown', montrer);
  zone.addEventListener('pointerleave', cacher);
}
