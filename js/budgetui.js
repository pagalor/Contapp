// Riga con barra di un budget, condivisa da Mese e dalla pagina Budget.
import * as M from './model.js';
import { fmt, fmtEur } from './expr.js';
import { esc } from './ui.js';

export function statoTesto(s) {
  if (s.stato === 'sforato') return `Sforato di ${fmtEur(s.ecc)}`;
  if (s.stato === 'vicino') return 'Vicino al limite';
  if (s.stato === 'ritmo') return 'Ritmo troppo veloce';
  return s.tempo >= 1 ? 'Rispettato' : 'Nei limiti';
}

// "400,00 € al mese" e, se c'è, quanto arriva dal periodo prima
function importoTesto(s) {
  const per = s.anno ? 'all\'anno' : 'al mese';
  let t = `${fmtEur(s.val)} ${per}`;
  if (Math.abs(s.riporto) >= 0.005) t += ` ${s.riporto > 0 ? '+' : '−'} ${fmtEur(Math.abs(s.riporto))} riportati`;
  return t;
}

// Barra: la parte oltre il limite è tratteggiata; il segno è il punto del periodo (solo per quello in corso)
function barHTML(s) {
  const limite = Math.max(s.disp, 0);
  const scala = Math.max(limite, s.speso) || 1;
  const pct = (n) => Math.min(100, Math.max(0, n) / scala * 100).toFixed(1);
  const extra = s.speso - limite;
  return `<div class="bud-bar" role="img" aria-label="${esc(`Speso ${fmtEur(s.speso)} su ${fmtEur(s.disp)}`)}">
    <span class="bud-fill" style="width:${pct(Math.min(s.speso, limite))}%"></span>
    ${extra > 0 ? `<span class="bud-extra" style="left:${pct(limite)}%;width:${pct(extra)}%"></span><i class="bud-limit" style="left:${pct(limite)}%"></i>` : ''}
    ${s.inCorso ? `<i class="bud-mark" style="left:${pct(limite * s.tempo)}%" title="${s.anno ? 'Punto dell\'anno' : 'Punto del mese'}"></i>` : ''}
  </div>`;
}

// `movs`: elenco dei movimenti da mostrare aperto sotto la riga; null = riga senza dettaglio
export function rowHTML(s, { open = false, movs = null } = {}) {
  const linea = s.anno && s.inCorso ? ` · In linea a oggi: ${fmtEur(s.inLinea)}` : '';
  return `<div class="bud" data-id="${s.b.id}" data-stato="${s.stato}">
    <button class="bud-head" type="button"${movs === null ? '' : ` aria-expanded="${open}"`}>
      <span class="bud-name">${esc(M.budgetLabel(s.b))}<small>${esc(importoTesto(s))}</small></span>
      <span class="bud-fig"><b>${fmtEur(s.speso)}</b><small>su ${fmtEur(s.disp)}</small></span>
    </button>
    ${barHTML(s)}
    <p class="bud-line"><span class="bud-st">${esc(statoTesto(s))}</span><span class="muted">${s.stato === 'sforato' ? '' : `Disponibile ${fmtEur(s.resta)}`}${esc(linea)}</span></p>
    ${movs === null ? '' : `<div class="bud-det"${open ? '' : ' hidden'}>${open ? movListHTML(movs) : ''}</div>`}
  </div>`;
}

// Riga per un budget che non si può calcolare (non ancora iniziato, o categoria eliminata)
export function rowVuotaHTML(b, nota) {
  return `<div class="bud" data-id="${b.id}" data-stato="vuoto">
    <button class="bud-head" type="button">
      <span class="bud-name">${esc(M.budgetLabel(b))}<small>${esc(nota)}</small></span>
    </button></div>`;
}

export function movListHTML(list) {
  if (!list.length) return '<p class="muted">Nessuna uscita in questo periodo.</p>';
  return `<div class="mini-list bud-movs">${list.map((r) => {
    const d = r.data;
    return `<a href="#mese/${d.y}-${String(d.m).padStart(2, '0')}/${r.id}">
      <span class="muted">${d.d ? d.d + ' ' : ''}${M.MESI_BREVI[d.m - 1].toLowerCase()}</span>
      <span>${esc(d.desc || 'Senza descrizione')}</span><span class="num">${fmt(d.val)}</span></a>`;
  }).join('')}</div>`;
}
