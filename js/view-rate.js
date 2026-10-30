import * as M from './model.js';
import { fmt, fmtEur, round2 } from './expr.js';
import { esc } from './ui.js';
import { rateDialog } from './dialogs.js';
import * as store from './store.js';

let root;
const fmtD = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

// root è una sezione nuova a ogni visita della pagina: i click si agganciano qui una volta sola
export function render(el) {
  el.innerHTML = '<section class="rate-page"></section>';
  root = el.firstElementChild;
  bind();
  draw();
}
export function redraw() { if (root && root.isConnected) draw(); }

function item(p) {
  const d = p.data;
  const st = M.statoPiano(p);
  const cat = M.catById(d.cat);
  const costo = M.costoFinanziamento(p);
  const pct = st.totale ? Math.min(100, (st.pagate / st.totale) * 100) : 0;
  const chiusa = d.chiusura;
  const stato = st.chiuso ? (chiusa?.tipo === 'reso' ? `annullato per reso il ${fmtD(chiusa.data)}` : `saldato il ${fmtD(chiusa?.data || M.todayIso())}`)
    : st.prossima ? `prossima: ${fmtD(st.prossima.date)}, ${fmtEur(st.prossima.val)}` : 'tutte pagate';
  return `<button class="piano${st.chiuso || st.finita ? ' done' : ''}" data-id="${p.id}">
    <span class="ric-emoji" style="--c:${cat?.data.colore || 'var(--text-3)'}">${esc(cat?.data.emoji || '▤')}</span>
    <span class="piano-desc">${esc(d.desc || '(senza descrizione)')}${d.creditore ? `<span class="piano-cred">${esc(d.creditore)}</span>` : ''}
      <small>Pagate ${st.pagate} di ${st.totale}${st.rimanenti ? `, ne ${st.rimanenti === 1 ? 'manca 1' : `mancano ${st.rimanenti}`}` : ''} · ${stato}</small>
      <small>${costo > 0.005 ? `Costo del finanziamento <b class="out">${fmtEur(costo)}</b>` : 'Nessun costo di finanziamento'} · ${M.modalitaPiano(p) === 'acquisto' ? "contato all'acquisto" : 'contato rata per rata'}</small></span>
    <span class="piano-amt">${st.chiuso || st.finita ? fmtEur(round2(st.pagato)) : fmtEur(st.residuo)}<small>${st.chiuso || st.finita ? 'pagato' : `da pagare, di ${fmtEur(round2(M.totaleRate(p) + M.anticipoVal(p)))}`}</small></span>
    ${st.chiuso ? '' : `<span class="debt-track"><span style="width:${pct}%"></span></span>`}
  </button>`;
}

function draw() {
  const list = M.piani().filter(M.pianoValido)
    .sort((a, b) => (M.statoPiano(a).prossima?.date || '9').localeCompare(M.statoPiano(b).prossima?.date || '9') || (b.data.dataAcquisto || '').localeCompare(a.data.dataAcquisto || ''));
  const aperti = list.filter((p) => { const st = M.statoPiano(p); return !st.chiuso && !st.finita; });
  const conclusi = list.filter((p) => !aperti.includes(p));
  const tot = M.rateTotali();
  const mese = round2(M.rateInScadenza(30).reduce((s, x) => s + x.val, 0));
  const costi = round2(aperti.reduce((s, p) => s + Math.max(0, M.costoFinanziamento(p)), 0));
  root.innerHTML = `
      <header class="page-head">
        <h1>Pagamenti a rate</h1>
        <button class="btn primary" data-act="new">Nuovo</button>
      </header>
      <p class="muted intro-note">Acquisti pagati a rate, per esempio con PayPal, Klarna o un finanziamento: le rate vengono aggiunte da sole ai movimenti
        a ogni scadenza, e quanto resta da pagare conta come un debito nel patrimonio.</p>
      ${aperti.length ? `<dl class="stats">
        <div><dt>Ancora da pagare</dt><dd class="out">${fmtEur(tot.residuo)}</dd></div>
        <div><dt>Nei prossimi 30 giorni</dt><dd>${fmtEur(mese)}</dd></div>
        <div><dt>Costo dei finanziamenti</dt><dd>${fmtEur(costi)}</dd></div>
      </dl>` : ''}
      ${aperti.length ? `<div class="ric-list">${aperti.map(item).join('')}</div>` : `
        <div class="empty-hint"><p>Nessun pagamento a rate in corso. Per esempio: un telefono da 300 € pagato con PayPal in 3 rate da 100 €.
          Puoi anche scegliere "Pagato a rate" quando aggiungi un'uscita.</p></div>`}
      ${conclusi.length ? `<h2 class="ric-h">Conclusi</h2><div class="ric-list">${conclusi.map(item).join('')}</div>` : ''}`;
}

function bind() {
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="new"]')) { rateDialog({ onDone: redraw }); return; }
    const b = e.target.closest('.piano[data-id]');
    if (b) rateDialog({ rec: store.get(b.dataset.id), onDone: redraw });
  });
}
