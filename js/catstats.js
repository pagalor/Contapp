// Entrate o uscite per categoria: torta, percentuali e dettaglio. Condiviso da Riepilogo e Mese.
import * as M from './model.js';
import * as C from './charts.js';
import { fmtEur, fmtEur0 } from './expr.js';
import { esc } from './ui.js';

export function catBars(list, tipo) {
  const rows = M.byCategory(list, tipo);
  const tot = rows.reduce((a, r) => a + r.tot, 0);
  if (!rows.length) return '<p class="muted">Nessun dato.</p>';
  const slices = rows.map((r) => ({ label: M.catLabel(r.cat), value: r.tot, color: r.cat?.data.colore || 'var(--text-3)' }));
  const pie = C.donut({
    size: 200, center: fmtEur0(tot), label: tipo === 'in' ? 'Entrate' : 'Uscite', sub: rows.length === 1 ? '1 categoria' : `${rows.length} categorie`, toggle: true, slices,
    key: `${tipo}:${slices.map((s) => s.label).join('|')}`,
  });
  // Si vede solo la torta: toccando il centro si aprono le voci (vedi il gestore in fondo al file)
  return `<div class="cat-split"><div class="pie">${pie}</div><ul class="catbars" hidden>${rows.map((r) => {
    const pct = tot ? (r.tot / tot) * 100 : 0;
    return `<li>
      <button class="catbar riempi" data-cat="${r.id}" data-tipo="${tipo}" aria-expanded="false" style="--c:${r.cat?.data.colore || 'var(--text-3)'};--p:${pct.toFixed(1)}%">
        <span class="cb-name"><span class="cb-emoji" style="--c:${r.cat?.data.colore || 'var(--text-3)'}">${esc(r.cat?.data.emoji || '')}</span>${esc(r.cat?.data.nome || 'Senza categoria')}</span>
        <span class="cb-val">${fmtEur(r.tot)} <small>${pct.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</small></span>
      </button>
      <div class="cb-detail" hidden></div>
    </li>`;
  }).join('')}</ul></div>`;
}

export function catDetail(list, catId, tipo) {
  const map = new Map();
  for (const r of list) {
    const d = r.data;
    if (d.cat !== catId || d.tipo !== tipo || d.escl || typeof d.val !== 'number') continue;
    const k = (d.desc || '(senza descrizione)').trim();
    const key = k.toLowerCase();
    const o = map.get(key) || { k, n: 0, tot: 0 };
    o.n++; o.tot += d.val;
    map.set(key, o);
  }
  const rows = [...map.values()].sort((a, b) => b.tot - a.tot).slice(0, 12);
  return subTable(list, catId, tipo) + `<table class="mini"><tbody>${rows.map((o) =>
    `<tr><td><a href="#cerca/${encodeURIComponent(o.k)}">${esc(o.k)}</a></td><td class="num muted">${o.n}×</td><td class="num">${fmtEur(o.tot)}</td></tr>`).join('')}</tbody></table>`;
}

// Le sottocategorie di una categoria, se ci sono movimenti che ne hanno una
function subTable(list, catId, tipo) {
  const rows = M.bySub(list, catId, tipo);
  if (!rows.some((r) => r.id)) return '';
  const tot = rows.reduce((a, r) => a + r.tot, 0);
  return `<table class="mini subs"><tbody>${rows.map((r) => `<tr>
    <td>${r.sub ? esc(r.sub.data.nome) : '<span class="muted">Senza sottocategoria</span>'}</td>
    <td class="num muted">${r.n}×</td><td class="num muted">${(tot ? (r.tot / tot) * 100 : 0).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</td>
    <td class="num">${fmtEur(r.tot)}</td></tr>`).join('')}</tbody></table>
    <h4 class="sub-h">Voci principali</h4>`;
}

// Torte per categoria dei movimenti di un tag (entrate e uscite), come in Mese e Riepilogo
export function tagPies(list) {
  let html = '';
  for (const [tipo, titolo] of [['in', 'Entrate'], ['out', 'Uscite']]) {
    if (!M.byCategory(list, tipo).length) continue;
    html += `<h4 class="sub-h">${titolo} per categoria</h4>${catBars(list, tipo)}`;
  }
  return html || '<p class="muted">Nessun importo.</p>';
}

// Apre o chiude l'elenco delle voci sotto la torta (split = il suo .cat-split).
// Con anima: il riquadro cambia altezza con la molla dell'app, la torta scivola al suo posto (su schermo largo va
// accanto all'elenco), le voci entrano in cascata e il riempimento di ogni scheda cresce da zero (CSS .pie-entra).
// Niente animazioni con prefers-reduced-motion.
function molla() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--spring').trim();
  try { document.body.animate([], { easing: v }); return v; } catch { return 'cubic-bezier(.3, 1.3, .5, 1)'; }
}
export function setPieOpen(split, open, anima = false) {
  if (!split) return;
  const muovi = anima && !matchMedia('(prefers-reduced-motion: reduce)').matches && split.animate;
  const pie = split.querySelector('.pie');
  const h0 = split.offsetHeight, r0 = pie?.getBoundingClientRect();
  split.classList.toggle('open', open);
  const list = split.querySelector('.catbars');
  if (list) list.hidden = !open;
  split.querySelector('.donut-hit')?.setAttribute('aria-expanded', String(open));
  const chev = split.querySelector('.donut-chev');
  if (chev) chev.textContent = open ? '▴' : '▾';
  if (!muovi) return;
  const easing = molla(), durata = 480;
  const h1 = split.offsetHeight, r1 = pie?.getBoundingClientRect();
  split.animate([{ height: h0 + 'px', overflow: 'hidden' }, { height: h1 + 'px', overflow: 'hidden' }], { duration: durata, easing });
  if (r0 && r1 && (Math.abs(r0.left - r1.left) > 1 || Math.abs(r0.top - r1.top) > 1)) {
    pie.animate([{ transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px)` }, { transform: 'none' }], { duration: durata, easing });
  }
  if (open && list) {
    [...list.children].slice(0, 16).forEach((li, i) => li.style.setProperty('--i', i));
    list.classList.remove('pie-entra');
    void list.offsetWidth;
    list.classList.add('pie-entra');
    setTimeout(() => list.classList.remove('pie-entra'), 1400);
  }
}

// Un solo ascolto per tutta la pagina: il centro della torta apre e chiude le voci.
// Vale per Mese, Riepilogo e per le torte dei tag, anche se vengono ridisegnate.
function togglePie(hit) {
  const split = hit.closest('.cat-split');
  setPieOpen(split, !split.classList.contains('open'), true);
}
document.addEventListener('click', (e) => {
  const hit = e.target.closest?.('.donut-hit');
  if (hit) togglePie(hit);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const hit = e.target.closest?.('.donut-hit');
  if (!hit) return;
  e.preventDefault();
  togglePie(hit);
});

// Apre o chiude il dettaglio di una categoria (il pulsante .catbar è già stato cliccato).
export function toggleCat(btn, list) {
  const det = btn.nextElementSibling;
  det.hidden = !det.hidden;
  btn.setAttribute('aria-expanded', String(!det.hidden));
  if (!det.hidden) det.innerHTML = catDetail(list, btn.dataset.cat, btn.dataset.tipo);
}
