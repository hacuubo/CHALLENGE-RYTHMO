// Petits utilitaires partagés par les vues.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const paragraphes = s => String(s ?? '').split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
export const melanger = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
export const lettre = i => String.fromCharCode(65 + i);
export const diffBarres = d => `<span class="diff" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i class="${i < d ? 'on' : ''}"></i>`).join('')}</span>`;
export const moisAnnee = aaaamm => {
  const [a, m] = String(aaaamm).split('-').map(Number);
  return a && m ? new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '';
};
export function toast(msg, duree = 2400) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), duree);
}
export function aleaDuJour(seed) { let x = seed; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }
export const duree = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
