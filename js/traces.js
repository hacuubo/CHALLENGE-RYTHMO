// Visionneuse de tracé : affichage, compas de mesure et plein écran.
// `dessiner(canvas, opts)` dessine le tracé et renvoie { pxmm, x0 } (25 mm/s, 10 mm/mV).

import { t } from './i18n.js';

const MS_PAR_MM = 40;

export function monterTrace(conteneur, dessiner, { titre = t('Tracé', 'Tracing'), legende = '' } = {}) {
  conteneur.innerHTML = `
    <div class="trace-outils">
      <button type="button" class="outil" data-compas aria-pressed="false" title="${t('Mesurer un intervalle', 'Measure an interval')}">📏 ${t('Compas', 'Calipers')}</button>
      <button type="button" class="outil" data-plein title="${t('Afficher en plein écran', 'Show full screen')}">⤢ ${t('Plein écran', 'Full screen')}</button>
    </div>
    <div class="ecg-cadre"><div class="trace-pile"><canvas role="img" aria-label="${titre}"></canvas><canvas class="calque" aria-hidden="true"></canvas></div></div>
    <div class="ecg-legende">${legende}</div>
    <div class="compas-mesure" aria-live="polite"></div>`;
  const cadre = conteneur.querySelector('.ecg-cadre');
  const [fond, calque] = conteneur.querySelectorAll('canvas');
  const mesure = conteneur.querySelector('.compas-mesure');
  let geo = null;
  const rendre = () => {
    geo = dessiner(fond, {});
    calque.width = fond.width; calque.height = fond.height;
    calque.style.width = fond.style.width; calque.style.height = fond.style.height;
    if (fond.clientWidth > cadre.clientWidth + 4) conteneur.querySelector('.ecg-legende').dataset.defiler = '1';
  };
  requestAnimationFrame(rendre);
  const compas = activerCompas(calque, () => geo, mesure);
  const bCompas = conteneur.querySelector('[data-compas]');
  bCompas.onclick = () => { const on = compas.basculer(); bCompas.setAttribute('aria-pressed', on); bCompas.classList.toggle('actif', on); };
  conteneur.querySelector('[data-plein]').onclick = () => pleinEcran(dessiner, titre, legende);
}

function activerCompas(calque, geo, sortie) {
  let actif = false, debut = null, fin = null;
  const ctx = calque.getContext('2d');
  const pos = e => { const r = calque.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const effacer = () => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, calque.width, calque.height); };
  const dessinerMesure = () => {
    effacer();
    if (!debut || !fin) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const h = calque.clientHeight;
    ctx.strokeStyle = '#1d6fa5'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    for (const p of [debut, fin]) { ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, h); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(debut.x, debut.y); ctx.lineTo(fin.x, debut.y); ctx.stroke();
    const { pxmm } = geo();
    const ms = Math.abs(fin.x - debut.x) / pxmm * MS_PAR_MM;
    const mv = (debut.y - fin.y) / pxmm / 10;
    const texte = `${Math.round(ms)} ms${ms > 150 ? ` · ${Math.round(60000 / ms)} bpm` : ''} · ${mv >= 0 ? '+' : ''}${t(mv.toFixed(2).replace('.', ','), mv.toFixed(2))} mV`;
    ctx.font = '600 13px system-ui, sans-serif';
    const lx = Math.min(Math.max(debut.x, fin.x) + 6, calque.clientWidth - ctx.measureText(texte).width - 6);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(lx - 3, debut.y - 18, ctx.measureText(texte).width + 6, 18);
    ctx.fillStyle = '#0f3d5c'; ctx.fillText(texte, lx, debut.y - 5);
    sortie.textContent = `${t('Mesure :', 'Measurement:')} ${texte}`;
  };
  calque.addEventListener('pointerdown', e => {
    if (!actif) return;
    e.preventDefault(); calque.setPointerCapture(e.pointerId);
    debut = pos(e); fin = pos(e); dessinerMesure();
  });
  calque.addEventListener('pointermove', e => { if (actif && debut && e.buttons) { fin = pos(e); dessinerMesure(); } });
  return {
    basculer() {
      actif = !actif;
      calque.classList.toggle('actif', actif);
      if (!actif) { debut = fin = null; effacer(); sortie.textContent = ''; } else sortie.textContent = t('Faites glisser sur le tracé pour mesurer (temps, fréquence, amplitude).', 'Drag across the tracing to measure (time, rate, amplitude).');
      return actif;
    },
  };
}

function pleinEcran(dessiner, titre, legende) {
  const d = document.createElement('div');
  d.className = 'plein';
  d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', titre);
  d.innerHTML = `
    <div class="plein-tete">
      <button type="button" class="outil" data-compas aria-pressed="false">📏 ${t('Compas', 'Calipers')}</button>
      <span class="compas-mesure" aria-live="polite">${legende}</span>
      <button type="button" class="outil" data-fermer aria-label="${t('Fermer', 'Close')}">✕ ${t('Fermer', 'Close')}</button>
    </div>
    <div class="plein-corps"><div class="trace-pile"><canvas></canvas><canvas class="calque"></canvas></div>
      <p class="note plein-astuce">${t('Astuce : tournez le téléphone à l\'horizontale pour une lecture plus confortable.', 'Tip: turn your phone sideways for easier reading.')}</p></div>`;
  document.body.appendChild(d);
  document.body.classList.add('sans-defilement');
  const [fond, calque] = d.querySelectorAll('canvas');
  const largeur = Math.max(window.innerWidth, window.innerHeight);
  const geo = dessiner(fond, { pxmm: Math.max(4, Math.min(7, largeur / 250)) });
  calque.width = fond.width; calque.height = fond.height;
  calque.style.width = fond.style.width; calque.style.height = fond.style.height;
  const compas = activerCompas(calque, () => geo, d.querySelector('.compas-mesure'));
  const b = d.querySelector('[data-compas]');
  b.onclick = () => { const on = compas.basculer(); b.setAttribute('aria-pressed', on); b.classList.toggle('actif', on); };
  const fermer = () => {
    d.remove(); document.body.classList.remove('sans-defilement');
    document.removeEventListener('keydown', echap);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  const echap = e => { if (e.key === 'Escape') fermer(); };
  document.addEventListener('keydown', echap);
  d.querySelector('[data-fermer]').onclick = fermer;
  d.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  d.querySelector('[data-fermer]').focus();
}
