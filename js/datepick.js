// Scelta di date, mesi e anni: tutta l'app usa questi calendari al posto dei selettori del browser.
// Un campo è composto da un input nascosto (che conserva il valore: AAAA-MM-GG, AAAA-MM o AAAA, e si legge e si
// ascolta come un input normale) e da un pulsante che mostra il valore e apre il calendario. Il pulsante è
// gestito da un solo ascolto sul documento: basta mettere nella pagina il codice di `dateInput`, `monthInput`
// o `yearInput`. Quando si sceglie, l'input nascosto lancia 'input' e 'change'.
import { modal, $, esc } from './ui.js';
import { MESI, MESI_BREVI } from './model.js';

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// Testo mostrato nel pulsante
export function pickText(kind, v, vuoto = '') {
  if (!v) return vuoto;
  if (kind === 'year') return String(v);
  const [y, m, d] = v.split('-').map(Number);
  if (kind === 'month') return `${MESI[m - 1]} ${y}`;
  return `${d} ${MESI[m - 1].toLowerCase()} ${y}`;
}

function fieldHTML(kind, { name, id, value, min, max, vuoto, scegli, label, attrs }) {
  const v = value || '';
  const extra = `${name ? ` name="${name}"` : ''}${id ? ` id="${id}"` : ''}${min ? ` data-min="${min}"` : ''}${max ? ` data-max="${max}"` : ''}${vuoto ? ` data-vuoto="${esc(vuoto)}"` : ''}${scegli ? ` data-scegli="${esc(scegli)}"` : ''}${attrs ? ` ${attrs}` : ''}`;
  return `<span class="date-field"><input type="hidden" data-pick="${kind}"${extra} value="${esc(v)}">` +
    `<button type="button" class="date-btn${v ? '' : ' empty'}" data-pickbtn aria-haspopup="dialog"${label ? ` aria-label="${esc(label)}"` : ''}>${esc(pickText(kind, v, scegli))}</button></span>`;
}
// `value`: ISO; `min` e `max`: ISO (giorni), `vuoto`: testo del pulsante che toglie la data (se si può lasciare vuota),
// `scegli`: testo mostrato quando non c'è nessuna data; `attrs`: attributi in più sull'input nascosto (es. data-rk="data").
export const dateInput = (o) => fieldHTML('date', { scegli: 'Scegli la data', ...o });
export const monthInput = (o) => fieldHTML('month', { scegli: 'Scegli il mese', ...o });
export const yearInput = (o) => fieldHTML('year', { scegli: 'Scegli l\'anno', ...o });

export const pickButton = (inp) => inp?.nextElementSibling;
// Cambia il valore di un campo dal codice (e ne aggiorna il testo)
export function setPick(inp, v) {
  inp.value = v || '';
  const b = pickButton(inp);
  if (b) {
    const kind = inp.dataset.pick;
    b.textContent = pickText(kind, inp.value, inp.dataset.scegli || '');
    b.classList.toggle('empty', !inp.value);
  }
}
export const focusPick = (inp) => pickButton(inp)?.focus();

// ---------------------------------------------------------------- calendario dei giorni
// `y`, `m` e `selected` sono il mese mostrato all'apertura e il giorno scelto (selected può essere null).
// `min` e `max` (ISO) limitano i giorni scelgibili; `vuoto` è il testo del pulsante che toglie la data (assente = non si può togliere).
// `onPick(giorno, anno, mese)`: il giorno è null se si sceglie `vuoto`; il mese è quello mostrato.
export function dayPicker({ y, m, selected = null, min = '', max = '', vuoto = '', onPick }) {
  let cy = y, cm = m; // mese mostrato
  const dlg = modal(`
    <div class="dlg day-picker">
      <header class="dlg-head dp-head">
        <button type="button" class="icon-btn" data-nav="-1" aria-label="Mese precedente">‹</button>
        <h2 class="dp-title" aria-live="polite"></h2>
        <button type="button" class="icon-btn" data-nav="1" aria-label="Mese successivo">›</button>
      </header>
      <div class="dp-grid"></div>
      <div class="actions">${vuoto ? `<button type="button" class="btn ghost" data-none>${esc(vuoto)}</button>` : ''}<button type="button" class="btn ghost" data-x>Annulla</button></div>
    </div>`);
  function paint() {
    const n = new Date(cy, cm, 0).getDate();
    const first = (new Date(cy, cm - 1, 1).getDay() + 6) % 7; // il lunedì è la prima colonna
    const t = new Date();
    const oggi = t.getFullYear() === cy && t.getMonth() + 1 === cm ? t.getDate() : null;
    const scelto = cy === y && cm === m ? selected : null;
    let cells = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((g) => `<div class="cal-h">${g}</div>`).join('');
    cells += '<span></span>'.repeat(first);
    for (let i = 1; i <= n; i++) {
      const iso = isoOf(cy, cm, i);
      const fuori = (min && iso < min) || (max && iso > max);
      cells += `<button type="button" class="dp-day${i === scelto ? ' sel' : ''}${i === oggi ? ' today' : ''}" data-day="${i}"${i === scelto ? ' aria-pressed="true"' : ''}${fuori ? ' disabled' : ''}>${i}</button>`;
    }
    $('.dp-title', dlg).textContent = `${MESI[cm - 1]} ${cy}`;
    $('.dp-grid', dlg).innerHTML = cells;
  }
  dlg.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      cm += Number(nav.dataset.nav);
      if (cm < 1) { cm = 12; cy--; } else if (cm > 12) { cm = 1; cy++; }
      paint();
      return;
    }
    const b = e.target.closest('[data-day]');
    if (b) { dlg.close(); onPick(Number(b.dataset.day), cy, cm); return; }
    if (e.target.closest('[data-none]')) { dlg.close(); onPick(null, cy, cm); return; }
    if (e.target.closest('[data-x]')) dlg.close();
  });
  paint();
  return dlg;
}

// ---------------------------------------------------------------- calendario dei mesi
// `y` e `m` sono il mese attuale (m può essere null: nessun mese scelto). `min` e `max` sono AAAA-MM.
// `onPick(anno, mese)`: mese null se si sceglie `vuoto`.
export function monthPicker({ y, m = null, min = '', max = '', vuoto = '', onPick }) {
  let cy = y;
  const dlg = modal(`
    <div class="dlg day-picker">
      <header class="dlg-head dp-head">
        <button type="button" class="icon-btn" data-nav="-1" aria-label="Anno precedente">‹</button>
        <h2 class="dp-title" aria-live="polite"></h2>
        <button type="button" class="icon-btn" data-nav="1" aria-label="Anno successivo">›</button>
      </header>
      <div class="dp-grid dp-months"></div>
      <div class="actions">${vuoto ? `<button type="button" class="btn ghost" data-none>${esc(vuoto)}</button>` : ''}<button type="button" class="btn ghost" data-x>Annulla</button></div>
    </div>`);
  function paint() {
    const t = new Date();
    let cells = '';
    for (let i = 1; i <= 12; i++) {
      const key = `${cy}-${pad(i)}`;
      const fuori = (min && key < min) || (max && key > max);
      const sel = cy === y && i === m;
      cells += `<button type="button" class="dp-day${sel ? ' sel' : ''}${t.getFullYear() === cy && t.getMonth() + 1 === i ? ' today' : ''}" data-month="${i}"${sel ? ' aria-pressed="true"' : ''}${fuori ? ' disabled' : ''}>${MESI_BREVI[i - 1]}</button>`;
    }
    $('.dp-title', dlg).textContent = String(cy);
    $('.dp-grid', dlg).innerHTML = cells;
  }
  dlg.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { cy += Number(nav.dataset.nav); paint(); return; }
    const b = e.target.closest('[data-month]');
    if (b) { dlg.close(); onPick(cy, Number(b.dataset.month)); return; }
    if (e.target.closest('[data-none]')) { dlg.close(); onPick(cy, null); return; }
    if (e.target.closest('[data-x]')) dlg.close();
  });
  paint();
  return dlg;
}

// ---------------------------------------------------------------- calendario degli anni
// Dodici anni per volta; le frecce spostano di dodici anni. `onPick(anno)`.
export function yearPicker({ y, onPick }) {
  let base = y - 5;
  const dlg = modal(`
    <div class="dlg day-picker">
      <header class="dlg-head dp-head">
        <button type="button" class="icon-btn" data-nav="-12" aria-label="Anni precedenti">‹</button>
        <h2 class="dp-title" aria-live="polite"></h2>
        <button type="button" class="icon-btn" data-nav="12" aria-label="Anni successivi">›</button>
      </header>
      <div class="dp-grid dp-months"></div>
      <div class="actions"><button type="button" class="btn ghost" data-x>Annulla</button></div>
    </div>`);
  function paint() {
    const adesso = new Date().getFullYear();
    let cells = '';
    for (let a = base; a < base + 12; a++) {
      cells += `<button type="button" class="dp-day${a === y ? ' sel' : ''}${a === adesso ? ' today' : ''}" data-year="${a}"${a === y ? ' aria-pressed="true"' : ''}>${a}</button>`;
    }
    $('.dp-title', dlg).textContent = `${base} – ${base + 11}`;
    $('.dp-grid', dlg).innerHTML = cells;
  }
  dlg.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { base += Number(nav.dataset.nav); paint(); return; }
    const b = e.target.closest('[data-year]');
    if (b) { dlg.close(); onPick(Number(b.dataset.year)); return; }
    if (e.target.closest('[data-x]')) dlg.close();
  });
  paint();
  return dlg;
}

// ---------------------------------------------------------------- i campi (un solo ascolto per tutta l'app)
function scelto(inp, v) {
  setPick(inp, v);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pickbtn]');
  if (!b) return;
  const inp = b.previousElementSibling;
  if (!inp || inp.dataset.pick == null) return;
  const kind = inp.dataset.pick, v = inp.value;
  const adesso = new Date();
  const { min, max, vuoto } = inp.dataset;
  if (kind === 'date') {
    const [y, m, d] = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').map(Number) : [adesso.getFullYear(), adesso.getMonth() + 1, null];
    dayPicker({ y, m, selected: d, min, max, vuoto, onPick: (g, yy, mm) => scelto(inp, g == null ? '' : isoOf(yy, mm, g)) });
  } else if (kind === 'month') {
    const [y, m] = /^\d{4}-\d{2}$/.test(v) ? v.split('-').map(Number) : [adesso.getFullYear(), null];
    monthPicker({ y, m, min, max, vuoto, onPick: (yy, mm) => scelto(inp, mm == null ? '' : `${yy}-${pad(mm)}`) });
  } else if (kind === 'year') {
    yearPicker({ y: Number(v) || adesso.getFullYear(), onPick: (yy) => scelto(inp, String(yy)) });
  }
});
