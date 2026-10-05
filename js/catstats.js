// Entrate o uscite per categoria: torta, percentuali e dettaglio. Condiviso da Riepilogo e Mese.
import * as M from './model.js';
import * as C from './charts.js';
import { fmtEur, fmtEur0 } from './expr.js';
import { esc } from './ui.js';

export function catBars(list, tipo) {
  const rows = M.byCategory(list, tipo);
  const tot = rows.reduce((a, r) => a + r.tot, 0);
  if (!rows.length) return '<p class="muted">Nessun dato.</p>';
  const pie = C.donut({
    size: 190, center: fmtEur0(tot),
    slices: rows.map((r) => ({ label: M.catLabel(r.cat), value: r.tot, color: r.cat?.data.colore || '#999' })),
  });
  return `<div class="cat-split"><div class="pie">${pie}</div><ul class="catbars">${rows.map((r) => {
    const pct = tot ? (r.tot / tot) * 100 : 0;
    return `<li>
      <button class="catbar" data-cat="${r.id}" data-tipo="${tipo}" aria-expanded="false">
        <span class="cb-name"><span class="cb-emoji" style="--c:${r.cat?.data.colore || '#999'}">${esc(r.cat?.data.emoji || '')}</span>${esc(r.cat?.data.nome || 'Senza categoria')}</span>
        <span class="cb-val">${fmtEur(r.tot)} <small>${pct.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</small></span>
        <span class="cb-track"><span style="width:${pct}%;background:${r.cat?.data.colore || '#999'}"></span></span>
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
  return `<table class="mini"><tbody>${rows.map((o) =>
    `<tr><td><a href="#cerca/${encodeURIComponent(o.k)}">${esc(o.k)}</a></td><td class="num muted">${o.n}×</td><td class="num">${fmtEur(o.tot)}</td></tr>`).join('')}</tbody></table>`;
}

// Apre o chiude il dettaglio di una categoria (il pulsante .catbar è già stato cliccato).
export function toggleCat(btn, list) {
  const det = btn.nextElementSibling;
  det.hidden = !det.hidden;
  btn.setAttribute('aria-expanded', String(!det.hidden));
  if (!det.hidden) det.innerHTML = catDetail(list, btn.dataset.cat, btn.dataset.tipo);
}
