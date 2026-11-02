import * as M from './model.js';
import { titoloConRitorno } from './pannelli.js';
import { fmt, fmtEur } from './expr.js';
import { esc } from './ui.js';
import { ricDialog } from './dialogs.js';
import * as store from './store.js';
import * as G from './gruppi.js';

let root;
const fmtD = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

// root è una sezione nuova a ogni visita della pagina: i click si agganciano qui una volta sola
export function render(el) {
  el.innerHTML = '<section class="ricorrenti"></section>';
  root = el.firstElementChild;
  bind();
  draw();
}
export function redraw() { if (root && root.isConnected) draw(); }

function frase(r) {
  const d = r.data;
  const n = Math.max(1, Math.floor(d.ogni) || 1);
  const [y, m, g] = (d.inizio || '').split('-').map(Number);
  if (d.freq === 'sett') return n === 1 ? 'Ogni settimana' : `Ogni ${n} settimane`;
  if (d.freq === 'anno') return (n === 1 ? 'Ogni anno' : `Ogni ${n} anni`) + `, il ${g} ${M.MESI_BREVI[m - 1].toLowerCase()}`;
  return (n === 1 ? 'Ogni mese' : `Ogni ${n} mesi`) + `, il ${g}`;
}

function item(r) {
  const d = r.data;
  const next = M.ricNext(r);
  const cat = M.catById(d.cat);
  return `<button class="ric ${d.tipo}${next ? '' : ' done'}" data-id="${r.id}">
    <span class="ric-emoji" style="--c:${cat?.data.colore || 'var(--text-3)'}">${esc(cat?.data.emoji || '↻')}</span>
    <span class="ric-desc">${esc(d.desc || '(senza descrizione)')}<small>${esc(frase(r))}${d.conti?.length === 1 ? ', ' + esc(M.accName(d.conti[0].c)) : ''}</small></span>
    <span class="ric-amt">${d.tipo === 'in' ? '+' : '−'}${fmt(d.val)}<small>${next ? 'prossima: ' + fmtD(next) : 'terminata'}</small></span>
  </button>`;
}

// Riga d'anteprima nel gruppo chiuso: descrizione, ripetizione e prossima scadenza, importo con il segno
function anteprima(r) {
  const next = M.ricNext(r);
  return { desc: r.data.desc || '(senza descrizione)', det: `${frase(r)}${next ? ', prossima ' + fmtD(next) : ', terminata'}`,
    amt: (r.data.tipo === 'in' ? '+' : '−') + fmt(r.data.val), cls: r.data.tipo };
}

function draw() {
  const list = M.rics().filter((r) => typeof r.data.val === 'number')
    .sort((a, b) => (M.ricNext(a) || '9').localeCompare(M.ricNext(b) || '9') || (a.data.desc || '').localeCompare(b.data.desc || ''));
  const attive = list.filter((r) => M.ricNext(r));
  const finite = list.filter((r) => !M.ricNext(r));
  let out = 0, inn = 0;
  for (const r of attive) { if (r.data.tipo === 'in') inn += M.ricMensile(r); else out += M.ricMensile(r); }
  root.innerHTML = `
      <header class="page-head">
        ${titoloConRitorno('Movimenti ricorrenti')}
        <button class="btn primary" data-act="new">Nuovo</button>
      </header>
      <p class="muted intro-note">Abbonamenti, affitto, stipendio: li imposti una volta e il movimento viene aggiunto da solo nel giorno della scadenza.
        L'app lo registra quando la apri: se non la apri per qualche giorno, trovi i movimenti arrivati nel frattempo.</p>
      ${attive.length ? `<dl class="stats stats-sub">
        <div><dt>Entrate fisse al mese (circa)</dt><dd class="in">${fmtEur(inn)}</dd></div>
        <div><dt>Uscite fisse al mese (circa)</dt><dd class="out">${fmtEur(out)}</dd></div>
      </dl>` : ''}
      ${G.gruppoHTML({
        id: 'ric-attivi', titolo: 'Attivi', tono: 'prim', n: attive.length, nomi: ['movimento', 'movimenti'],
        anteprima: attive.map(anteprima), corpo: `<div class="ric-list">${attive.map(item).join('')}</div>`,
        vuoto: 'Nessun movimento ricorrente. Per esempio: Netflix da 12,99 € ogni mese il giorno 5. Puoi anche aprire un movimento dal mese e scegliere "Rendi ricorrente".',
      })}
      ${finite.length ? G.gruppoHTML({
        id: 'ric-terminati', titolo: 'Terminati', n: finite.length, nomi: ['movimento', 'movimenti'],
        anteprima: finite.map(anteprima), corpo: `<div class="ric-list">${finite.map(item).join('')}</div>`,
      }) : ''}`;
}

function bind() {
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="new"]')) { ricDialog({ onDone: redraw }); return; }
    const b = e.target.closest('.ric[data-id]');
    if (b) ricDialog({ rec: store.get(b.dataset.id), onDone: redraw });
  });
}
