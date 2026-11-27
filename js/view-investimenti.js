// Pagina Investimenti (#investimenti) e dettaglio di uno strumento (#investimento/<id>), con le loro finestre:
// strumento (strumentoDialog), operazione (invOpDialog) e prezzi (prezziDialog).
// I calcoli (quantità, costo di carico, plusvalenze, valore, rendimento) sono tutti in model.js.
import * as store from './store.js';
import * as M from './model.js';
import * as C from './charts.js';
import { fmt, fmtEur, fmtEur0, fmtSigned, fmtN, plainN } from './expr.js';
import { esc, $, modal, toast, confirmBox } from './ui.js';
import { bindAmount, movDialog } from './dialogs.js';
import { dateInput } from './datepick.js';
import { titoloConRitorno } from './pannelli.js';
import * as G from './gruppi.js';

let root = null;
let mostra = null; // funzione che ridisegna la pagina aperta (elenco o dettaglio)

const fmtD = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDLong = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const giorniDa = (iso) => Math.round((new Date(M.todayIso() + 'T12:00:00') - new Date(iso + 'T12:00:00')) / 864e5);
const VECCHIO = 30; // giorni dopo i quali l'ultimo prezzo è "vecchio" (in ambra)

// Quantità e prezzi nel formato dello strumento: per le obbligazioni "percento" la quantità è il nominale in euro
// e il prezzo è in % del nominale
export const fmtQta = (inv, q) => (M.percento(inv) ? fmtEur(q) : fmtN(q, 8));
// i decimali che servono: 2 sopra i 100, fino a 4 sopra l'unità, fino a 6 sotto
const decPrezzo = (v) => (Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 4 : 6);
export const fmtPrezzo = (inv, v) => (v == null ? '–' : fmtN(v, decPrezzo(v), 2) + (M.percento(inv) ? ' %' : ' €'));
const etQta = (inv) => (M.percento(inv) ? 'Nominale' : 'Quantità');
const fmtPct = (x) => (x == null ? '–' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%');
const segnoCls = (v) => (v > 0.005 ? 'pos' : v < -0.005 ? 'neg' : '');
// Guadagno o perdita con il colore (mai il verde o il rosso di entrate e uscite)
const gainHTML = (v, pct = null) => `<span class="${segnoCls(v)}">${fmtSigned(v)}${pct != null ? ` <small>${fmtPct(pct)}</small>` : ''}</span>`;
const gainTesto = (v, pct = null) => fmtSigned(v) + (pct != null ? ` (${fmtPct(pct)})` : '');

// root è una sezione nuova a ogni visita: i click si agganciano qui una volta sola
function prepara(el, cls) {
  el.innerHTML = `<section class="${cls}"></section>`;
  root = el.firstElementChild;
  root.addEventListener('click', onClick);
}
export function render(el) { prepara(el, 'inv-page'); mostra = drawElenco; drawElenco(); }
export function renderDettaglio(el, id) { prepara(el, 'inv-page inv-det'); mostra = () => drawDettaglio(id); mostra(); }
export function redraw() { if (root && root.isConnected && mostra) mostra(); }

// ================================================================ elenco
function drawElenco() {
  const r = M.riepilogoInvestimenti();
  const tutti = r.posizioni;
  const aperte = tutti.filter((x) => x.pos.aperta);
  const chiuse = tutti.filter((x) => !x.pos.aperta);
  const scad = M.scadenzeVicine(60);
  const tipi = M.TIPI_INV.map(([t]) => t).filter((t) => aperte.some((x) => M.tipoInv(x.inv) === t))
    .sort((a, b) => (r.perTipo[b] || 0) - (r.perTipo[a] || 0));
  root.innerHTML = `
    <header class="page-head">
      <h1>Investimenti</h1>
      <div class="btn-row">
        <button class="btn ghost" data-act="nuovo-inv">Nuovo strumento</button>
        ${aperte.length ? '<button class="btn ghost" data-act="prezzi">Aggiorna i prezzi</button>' : ''}
        ${tutti.some((x) => !x.inv.data.archiviato) ? '<button class="btn primary" data-act="nuova-op">Nuova operazione</button>' : ''}
      </div>
    </header>
    ${!tutti.length ? `<div class="empty-hint"><p>Qui tieni traccia di azioni, ETF, obbligazioni e crypto: registri acquisti e vendite,
      aggiorni i prezzi quando vuoi e vedi quanto valgono, quanto hai guadagnato o perso e i dividendi incassati.
      Gli acquisti e le vendite spostano i soldi dai fondi, ma non sono entrate né uscite. Tutti gli importi sono in euro.</p>
      <button class="btn primary" data-act="nuovo-inv">Nuovo strumento</button></div>` : `
    ${scad.length ? G.gruppoHTML({
      id: 'inv-scadenze', titolo: scad.length === 1 ? 'Obbligazione in scadenza' : 'Obbligazioni in scadenza', tono: 'warn', n: scad.length, nomi: ['scadenza', 'scadenze'],
      anteprima: scad.map((s) => ({ desc: s.inv.data.nome, det: (s.scaduta ? 'scaduta il ' : 'scade il ') + fmtD(s.scadenza) })),
      corpo: `<div class="gr-blocchi">${scad.map((s) => `<a class="gr-blk" href="#investimento/${s.inv.id}">
        <span><b>${esc(s.inv.data.nome)}</b><small>${s.scaduta ? `Scaduta il ${fmtD(s.scadenza)}: registra il rimborso` : `Scade il ${fmtD(s.scadenza)}`}</small></span>
        <span class="num">${fmtEur(M.posizione(s.inv.id).valore)}</span></a>`).join('')}</div>`,
    }) : ''}
    <section class="hero-box inv-hero">
      <p class="hb-label">Valore degli investimenti</p>
      <p class="hb-num">${fmtEur(r.valore)}</p>
      ${aperte.length ? `<p class="pat-var"><span class="hb-chip ${r.latente >= 0 ? 'hb-pos' : 'hb-neg'}">${gainTesto(r.latente, r.latentePct)}</span> rispetto al costo di carico</p>` : ''}
    </section>
    <dl class="stats stats-sub inv-stats">
      <div><dt>Versato</dt><dd>${fmtEur(r.versato)}</dd><small>Tutti gli acquisti, commissioni comprese</small></div>
      <div><dt>Guadagno o perdita latente</dt><dd>${gainHTML(r.latente)}</dd><small>${r.latentePct != null ? fmtPct(r.latentePct) + ' sul costo di carico' : 'Nessuno strumento posseduto'}</small></div>
      <div><dt>Realizzato</dt><dd>${gainHTML(r.realizzato)}</dd><small>Con vendite e rimborsi</small></div>
      <div><dt>Dividendi e cedole</dt><dd>${fmtEur(r.dividendi)}</dd><small>Netto accreditato</small></div>
      <div><dt>Rendimento</dt><dd class="${segnoCls(r.rendimento)}">${fmtPct(r.rendimento)}</dd><small>(valore + vendite + dividendi − versato) ÷ versato</small></div>
    </dl>
    ${torta(tipi, r.perTipo)}
    ${tipi.map((t) => {
      const lista = aperte.filter((x) => M.tipoInv(x.inv) === t).sort((a, b) => b.pos.valore - a.pos.valore);
      return G.gruppoHTML({
        id: 'inv-t-' + t, titolo: M.tipoInvNome(t), tono: 't-' + t, totale: fmtEur(r.perTipo[t] || 0), n: lista.length, nomi: ['strumento', 'strumenti'],
        anteprima: lista.map(({ inv, pos }) => ({ desc: inv.data.nome, det: gainTesto(pos.latente, pos.latentePct), amt: fmt(pos.valore) })),
        corpo: `<div class="inv-list">${lista.map(rigaStrumento).join('')}</div>`,
      });
    }).join('')}
    ${chiuse.length ? G.gruppoHTML({
      id: 'inv-chiusi', cls: 'gr-attenuato', titolo: 'Chiusi', n: chiuse.length, nomi: ['strumento', 'strumenti'],
      anteprima: chiuse.map(({ inv, pos }) => ({ desc: inv.data.nome, det: pos.operazioni ? 'realizzato ' + fmtSigned(pos.realizzato) : 'nessuna operazione' })),
      corpo: `<div class="inv-list">${chiuse.map(rigaStrumento).join('')}</div>`,
    }) : ''}`}`;
}

// Torta per tipologia: toccando il centro si apre l'elenco (stesso componente delle torte delle categorie)
function torta(tipi, perTipo) {
  const tot = tipi.reduce((s, t) => s + Math.max(0, perTipo[t] || 0), 0);
  if (!tot) return '';
  const pct = (t) => Math.max(0, perTipo[t] || 0) / tot * 100;
  const svg = C.donut({
    size: 200, center: fmtEur0(tot), label: 'Investimenti', sub: tipi.length === 1 ? '1 tipologia' : `${tipi.length} tipologie`, toggle: true,
    slices: tipi.map((t) => ({ label: M.tipoInvNome(t), value: Math.max(0, perTipo[t] || 0), color: `var(--t-${t})` })),
    key: 'investimenti:' + tipi.join('|'),
  });
  return `<section class="card pat-rip" aria-label="Ripartizione per tipologia">
    <h2>Ripartizione</h2>
    <div class="cat-split"><div class="pie">${svg}</div><ul class="catbars" hidden>${tipi.map((t) => `<li>
      <div class="catbar riempi" style="--c:var(--t-${t});--p:${pct(t).toFixed(1)}%">
        <span class="cb-name"><i class="sw" style="background:var(--t-${t})"></i>${M.tipoInvNome(t)}</span>
        <span class="cb-val">${fmtEur(perTipo[t] || 0)} <small>${pct(t).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</small></span>
      </div></li>`).join('')}</ul></div>
  </section>`;
}

function rigaStrumento({ inv, pos }) {
  const d = inv.data;
  const vecchio = pos.prezzoData && giorniDa(pos.prezzoData) > VECCHIO;
  const sotto = pos.aperta
    ? `<small>${etQta(inv)} ${fmtQta(inv, pos.qta)} · prezzo medio ${fmtPrezzo(inv, pos.prezzoMedio)}</small>
       <small class="${vecchio ? 'inv-vecchio' : ''}">Ultimo prezzo ${fmtPrezzo(inv, pos.prezzo)}${pos.prezzoData ? ` al ${fmtD(pos.prezzoData)}` : ''}${vecchio ? ' · da aggiornare' : ''}</small>`
    : `<small>${pos.operazioni ? `Realizzato ${fmtSigned(pos.realizzato)}${pos.dividendi ? ` · dividendi e cedole ${fmtEur(pos.dividendi)}` : ''}` : 'Nessuna operazione'}${d.archiviato ? ' · archiviato' : ''}</small>`;
  return `<a class="inv-row" href="#investimento/${inv.id}" style="--tc:var(--t-${M.tipoInv(inv)})">
    <span class="inv-desc"><b>${esc(d.nome)}</b>${d.codice ? `<span class="inv-cod">${esc(d.codice)}</span>` : ''}${sotto}</span>
    ${pos.aperta ? `<span class="inv-amt">${fmtEur(pos.valore)}${gainHTML(pos.latente, pos.latentePct)}</span>` : ''}
  </a>`;
}

// ================================================================ dettaglio
function drawDettaglio(id) {
  const inv = store.get(id);
  if (!inv || inv.kind !== 'inv') {
    root.innerHTML = '<div class="empty-hint"><p>Questo strumento non esiste più.</p><a class="btn ghost" href="#investimenti">Torna agli investimenti</a></div>';
    return;
  }
  const d = inv.data;
  const pos = M.posizione(id);
  const vecchio = pos.prezzoData && giorniDa(pos.prezzoData) > VECCHIO;
  const bond = M.tipoInv(inv) === 'bond';
  const info = [M.tipoInvNome(M.tipoInv(inv), true), d.codice, d.archiviato ? 'archiviato' : ''].filter(Boolean).join(' · ');
  root.innerHTML = `
    <header class="page-head">
      ${titoloConRitorno(d.nome, { href: '#investimenti', nome: 'Investimenti' })}
      <button class="btn ghost" data-act="modifica">Modifica</button>
    </header>
    <section class="hero-box inv-hero" style="--tc:var(--t-${M.tipoInv(inv)})">
      <p class="hb-label"><i class="cap t-${M.tipoInv(inv)}"></i>Valore · ${esc(info)}</p>
      <p class="hb-num">${fmtEur(pos.valore)}</p>
      ${pos.aperta ? `<p class="pat-var"><span class="hb-chip ${pos.latente >= 0 ? 'hb-pos' : 'hb-neg'}">${gainTesto(pos.latente, pos.latentePct)}</span> guadagno o perdita</p>` : ''}
      <dl class="inv-hero-dl">
        <div><dt>${etQta(inv)}</dt><dd>${pos.aperta ? fmtQta(inv, pos.qta) : '0'}</dd></div>
        <div><dt>Prezzo medio di carico</dt><dd>${fmtPrezzo(inv, pos.prezzoMedio)}</dd></div>
        <div><dt>Ultimo prezzo</dt><dd>${fmtPrezzo(inv, pos.prezzo)}${pos.prezzoData ? `<small class="${vecchio ? 'inv-vecchio' : ''}">al ${fmtD(pos.prezzoData)}${vecchio ? ', da aggiornare' : ''}</small>` : ''}</dd></div>
        ${pos.aperta ? `<div><dt>Stima netta</dt><dd>${fmtSigned(pos.stimaNetta)}<small>stima, con la tassa del ${fmtN(M.aliquotaDi(inv), 2)}%${pos.latente > 0 ? '' : ' (solo sui guadagni)'}</small></dd></div>` : ''}
        <div><dt>Realizzato</dt><dd>${fmtSigned(pos.realizzato)}</dd></div>
        <div><dt>Dividendi e cedole</dt><dd>${fmtEur(pos.dividendi)}</dd></div>
        <div><dt>Rendimento</dt><dd>${fmtPct(pos.rendimento)}</dd></div>
        ${bond && (d.scadenza || d.cedola != null) ? `<div><dt>Obbligazione</dt><dd>${d.cedola != null ? `cedola ${fmtN(d.cedola, 3)}%` : ''}${d.scadenza ? `<small>scade il ${fmtD(d.scadenza)}</small>` : ''}</dd></div>` : ''}
      </dl>
    </section>
    <div class="btn-row conto-azioni">
      ${d.archiviato ? '' : '<button class="btn primary" data-act="acquista">Acquista</button>'}
      ${pos.aperta ? `<button class="btn" data-act="vendi">Vendi</button>${bond ? '<button class="btn" data-act="rimborso">Rimborso</button>' : ''}` : ''}
      <button class="btn" data-act="dividendo">Dividendo o cedola</button>
      <button class="btn" data-act="prezzo">Aggiorna prezzo</button>
    </div>
    <div id="inv-chart"></div>
    ${storico(inv)}
    ${d.note ? `<p class="muted inv-note">${esc(d.note)}</p>` : ''}`;
  drawChart(id);
}

// Grafico del valore nel tempo (aree, come l'Andamento del patrimonio)
function drawChart(id) {
  const box = $('#inv-chart', root);
  const serie = M.serieValore(id);
  if (serie.length < 2) { box.innerHTML = ''; return; }
  box.innerHTML = `<section class="card"><h2>Valore nel tempo</h2><div class="chart-info" aria-live="polite"></div><div class="chart-box"></div></section>`;
  const chart = $('.chart-box', box), info = $('.chart-info', box);
  const points = serie.map((p) => ({ date: p.date, label: fmtD(p.date), parts: [{ key: 'invest', cls: 'invest', value: p.valore }] }));
  chart.innerHTML = C.stackedTime({ width: Math.floor(chart.clientWidth || 600), points });
  const show = (i) => {
    const p = serie[i ?? serie.length - 1];
    info.innerHTML = `<b>${i == null && p.date === M.todayIso() ? 'Oggi' : fmtDLong(p.date)}</b> · Valore <b>${fmtEur(p.valore)}</b>`;
  };
  C.bindTimeHover(chart, show);
  show(null);
}

// Operazioni, dividendi e prezzi rilevati, dal più recente
function storico(inv) {
  const righe = [
    ...M.invOps(inv.id).map((o) => ({ date: o.data.data, ord: o.data.ord || 0, k: 'op', r: o })),
    ...M.invMovs(inv.id).map((r) => ({ date: M.recDate(r), ord: r.data.ord || 0, k: 'mov', r })),
    ...M.invPrezzi(inv.id).map((p) => ({ date: p.data.date, ord: -1, k: 'pr', r: p })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.ord - a.ord);
  const testo = (x) => {
    const d = x.r.data;
    if (x.k === 'op') return { desc: M.opInvNome(M.opTipo(d)), det: `${fmtQta(inv, d.qta)} a ${fmtPrezzo(inv, d.prezzo)}`, amt: fmtSigned(M.nettoOp(inv, d)) };
    if (x.k === 'mov') return { desc: d.desc || 'Dividendo o cedola', det: fmtD(x.date), amt: fmtSigned(d.tipo === 'in' ? d.val : -d.val), cls: 'pos' };
    return { desc: 'Prezzo rilevato', det: fmtD(x.date), amt: fmtPrezzo(inv, d.val) };
  };
  const riga = (x) => {
    const d = x.r.data;
    const date = `<span class="al-date"><b>${esc(fmtD(x.date).replace(/ \d{4}$/, ''))}</b> <small>${x.date.slice(0, 4)}</small></span>`;
    if (x.k === 'op') {
      const fondo = d.fondo ? (M.opVende(d) ? 'Su ' : 'Da ') + M.accName(d.fondo) : 'Già posseduto';
      const extra = [num(d.comm) ? 'commissioni ' + fmtEur(d.comm) : '', M.opVende(d) && num(d.tasse) ? 'tasse ' + fmtEur(d.tasse) : ''].filter(Boolean).join(', ');
      return `<button type="button" class="al-row inv-op" data-op="${x.r.id}">${date}
        <span class="al-desc">${M.opInvNome(M.opTipo(d))} · ${fmtQta(inv, d.qta)} a ${fmtPrezzo(inv, d.prezzo)}<small>${esc(fondo)}${extra ? ' · ' + extra : ''}${d.note ? ' · ' + esc(d.note) : ''}</small></span>
        <span class="al-val">${fmtSigned(M.nettoOp(inv, d))}</span></button>`;
    }
    if (x.k === 'mov') {
      return `<a class="al-row" href="#mese/${d.y}-${String(d.m).padStart(2, '0')}/${x.r.id}">${date}
        <span class="al-desc">${esc(d.desc || 'Dividendo o cedola')}<small>${esc(M.catById(d.cat)?.data.nome || 'Entrata')}${d.conti?.length ? ' · ' + esc(M.contiLabel(x.r)) : ''}</small></span>
        <span class="al-val pos">${fmtSigned(d.tipo === 'in' ? d.val : -d.val)}</span></a>`;
    }
    return `<button type="button" class="al-row inv-pr" data-pr="${x.r.id}">${date}
      <span class="al-desc">Prezzo rilevato<small>${d.origine === 'auto' ? 'automatico' : 'scritto a mano'}</small></span>
      <span class="al-val">${fmtPrezzo(inv, d.val)}</span></button>`;
  };
  return G.gruppoHTML({
    id: 'inv-det', titolo: 'Operazioni, dividendi e prezzi', tono: 'prim', n: righe.length, nomi: ['voce', 'voci'],
    anteprima: righe.map(testo), corpo: `<div class="acc-ledger inv-ledger">${righe.map(riga).join('')}</div>`,
    vuoto: 'Ancora nessuna operazione: registra il primo acquisto con «Acquista».',
  });
}
const num = (v) => (typeof v === 'number' ? v : 0);

// ================================================================ click (un solo ascolto per pagina)
function onClick(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  const id = location.hash.startsWith('#investimento/') ? decodeURIComponent(location.hash.split('/')[1]) : null;
  if (act === 'nuovo-inv') strumentoDialog({ onDone: (nid) => { location.hash = '#investimento/' + nid; } });
  else if (act === 'nuova-op') invOpDialog({ onDone: redraw });
  else if (act === 'prezzi') prezziDialog({ onDone: redraw });
  else if (act === 'modifica') strumentoDialog({ rec: store.get(id), onDone: redraw });
  else if (act === 'acquista') invOpDialog({ inv: id, tipo: 'acquisto', onDone: redraw });
  else if (act === 'vendi') invOpDialog({ inv: id, tipo: 'vendita', onDone: redraw });
  else if (act === 'rimborso') invOpDialog({ inv: id, tipo: 'rimborso', onDone: redraw });
  else if (act === 'dividendo') dividendo(id);
  else if (act === 'prezzo') prezziDialog({ ids: [id], onDone: redraw });
  const op = e.target.closest('[data-op]');
  if (op) invOpDialog({ rec: store.get(op.dataset.op), onDone: redraw });
  const pr = e.target.closest('[data-pr]');
  if (pr) prezziDialog({ rec: store.get(pr.dataset.pr), onDone: redraw });
}

// «Dividendo o cedola»: la finestra del movimento già compilata (entrata, categoria, strumento)
function dividendo(invId) {
  const inv = store.get(invId);
  if (!inv) return;
  const t = new Date();
  const fondo = [...M.invOps(invId)].reverse().find((o) => o.data.fondo)?.data.fondo || M.cfg().contoIn || null;
  const valido = fondo && M.accounts().some((c) => c.id === fondo);
  movDialog({
    tipo: 'in', y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), sceltaTipo: false, onDone: redraw,
    seed: { tipo: 'in', val: null, espr: null, desc: `${M.tipoInv(inv) === 'bond' ? 'Cedola' : 'Dividendo'} ${inv.data.nome}`, cat: M.catDividendi(), sub: null,
      conti: valido ? [{ c: fondo }] : [], tags: [], note: null, escl: false, invId },
  });
}

// ================================================================ finestra: strumento
export function strumentoDialog({ rec = null, onDone } = {}) {
  const isNew = !rec;
  const d = rec ? { ...rec.data } : { nome: '', tipo: 'etf', codice: '', quotazione: 'unita', aliquota: M.ALIQUOTA_STD, scadenza: null, cedola: null, archiviato: false, note: null, ord: Date.now() };
  const usato = !isNew && (M.invOps(rec.id).length > 0 || M.invMovs(rec.id).length > 0);
  const dlg = modal(`
    <form class="dlg inv-dlg" method="dialog" novalidate>
      <header class="dlg-head"><h2>${isNew ? 'Nuovo strumento' : 'Strumento'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <div class="form-grid">
        <label class="field"><span>Nome</span><input name="nome" value="${esc(d.nome)}" placeholder="Per esempio: ETF azionario mondiale" autocomplete="off"></label>
        <label class="field"><span>Tipologia</span><select name="tipo">${M.TIPI_INV.map(([k, , s]) => `<option value="${k}"${k === M.tipoInv({ data: d }) ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="field"><span>Codice (ISIN o ticker, facoltativo)</span><input name="codice" value="${esc(d.codice || '')}" autocomplete="off" autocapitalize="characters"></label>
        <label class="field"><span>Prezzo espresso</span><select name="quotazione">
          <option value="unita"${d.quotazione !== 'percento' ? ' selected' : ''}>In euro per unità</option>
          <option value="percento"${d.quotazione === 'percento' ? ' selected' : ''}>In % del valore nominale</option></select></label>
      </div>
      <p class="muted small-note" data-quot></p>
      <div class="form-grid" data-bond>
        <label class="field"><span>Scadenza</span>${dateInput({ name: 'scadenza', value: d.scadenza || '', vuoto: 'Nessuna data', scegli: 'Nessuna' })}</label>
        <label class="field"><span>Cedola (% annua)</span><input name="cedola" inputmode="decimal" value="${d.cedola != null ? fmtN(d.cedola, 4) : ''}" placeholder="–" autocomplete="off"></label>
      </div>
      <div class="field"><span>Tassa sulla plusvalenza (%, serve solo alla stima)</span>
        <div class="inv-aliq"><input name="aliquota" inputmode="decimal" value="${fmtN(M.aliquotaDi({ data: d }), 2)}" autocomplete="off" aria-label="Aliquota in percentuale">
          <button type="button" class="chip" data-aliq="26">26%</button><button type="button" class="chip" data-aliq="12.5">12,5% titoli di Stato</button></div></div>
      <label class="field"><span>Nota</span><input name="note" value="${esc(d.note || '')}" autocomplete="off"></label>
      ${isNew ? '' : `<label class="sw-row"><span>Archiviato<small>Non compare più tra gli strumenti da scegliere</small></span><input type="checkbox" class="switch" role="switch" name="archiviato"${d.archiviato ? ' checked' : ''}></label>`}
      ${usato ? '<p class="muted small-note">Lo strumento ha delle operazioni o dei dividendi: non si può eliminare, ma puoi archiviarlo.</p>' : ''}
      <div class="actions">
        ${!isNew && !usato ? '<button type="button" class="btn ghost danger" data-del>Elimina</button><span class="spacer"></span>' : ''}
        <button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button>
      </div>
    </form>`, { wide: true });
  const f = $('form', dlg);
  const paint = () => {
    const bond = f.tipo.value === 'bond';
    $('[data-bond]', f).hidden = !bond;
    $('[data-quot]', f).textContent = f.quotazione.value === 'percento'
      ? 'Nelle operazioni la quantità è il valore nominale in euro e il prezzo è in % del nominale (per esempio 98,5).'
      : 'Per i titoli in altre valute scrivi i prezzi già convertiti in euro.';
  };
  paint();
  f.addEventListener('change', (e) => {
    // le obbligazioni si quotano di solito in % del nominale
    if (e.target.name === 'tipo' && isNew) { f.quotazione.value = f.tipo.value === 'bond' ? 'percento' : 'unita'; }
    paint();
  });
  const leggiPct = (s, campo) => {
    const t = String(s || '').trim().replace('%', '');
    if (!t) return null;
    const v = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
    if (!Number.isFinite(v) || v < 0 || v > 100) { toast(`${campo}: scrivi una percentuale tra 0 e 100.`); return undefined; }
    return v;
  };
  f.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) { dlg.close(); return; }
    const a = e.target.closest('[data-aliq]');
    if (a) { f.aliquota.value = fmtN(Number(a.dataset.aliq), 2); return; }
    if (e.target.closest('[data-del]')) {
      if (!(await confirmBox(`Eliminare «${rec.data.nome}»?`, { ok: 'Elimina', danger: true }))) return;
      const backup = { ...rec.data };
      const prezzi = M.invPrezzi(rec.id).map((p) => ({ id: p.id, data: p.data }));
      for (const p of prezzi) store.remove(p.id);
      store.remove(rec.id);
      dlg.close();
      location.hash = '#investimenti';
      toast('Strumento eliminato', { action: 'Annulla', onAction: () => {
        store.save('inv', rec.id, backup);
        for (const p of prezzi) store.save('invpr', p.id, p.data);
        location.hash = '#investimento/' + rec.id;
      } });
    }
  });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') return;
    e.preventDefault();
    const nome = f.nome.value.trim();
    if (!nome) { f.nome.focus(); toast('Scrivi il nome dello strumento.'); return; }
    const aliquota = leggiPct(f.aliquota.value, 'Tassa');
    if (aliquota === undefined) { f.aliquota.focus(); return; }
    const bond = f.tipo.value === 'bond';
    const cedola = bond ? leggiPct(f.cedola.value, 'Cedola') : null;
    if (cedola === undefined) { f.cedola.focus(); return; }
    const id = rec ? rec.id : store.newId();
    store.save('inv', id, {
      ...d, nome, tipo: f.tipo.value, codice: f.codice.value.trim() || null, quotazione: f.quotazione.value === 'percento' ? 'percento' : 'unita',
      aliquota: aliquota ?? M.ALIQUOTA_STD, scadenza: bond && f.scadenza.value ? f.scadenza.value : null, cedola: bond ? cedola : null,
      archiviato: f.archiviato ? f.archiviato.checked : false, note: f.note.value.trim() || null,
    });
    dlg.close();
    toast(isNew ? 'Strumento aggiunto' : 'Modifiche salvate');
    onDone && onDone(id);
  });
  if (isNew) f.nome.focus();
  return dlg;
}

// ================================================================ finestra: operazione
// rec: operazione da modificare; inv e tipo: valori iniziali di una nuova
export function invOpDialog({ rec = null, inv = null, tipo = 'acquisto', onDone } = {}) {
  const isNew = !rec;
  const scelti = M.invs().filter((i) => !i.data.archiviato || i.id === (rec?.data.inv || inv));
  if (!scelti.length) { toast('Aggiungi prima uno strumento.'); return null; }
  const d = rec ? { ...rec.data } : { inv: inv || scelti[0].id, tipo, data: M.todayIso(), qta: null, prezzo: null, prEspr: null,
    comm: null, commEspr: null, tasse: null, tasseEspr: null, fondo: undefined, note: null, ord: Date.now() };
  d.tipo = M.opTipo(d);
  let qta = typeof d.qta === 'number' ? { val: d.qta, espr: null } : null;
  let prezzo = typeof d.prezzo === 'number' ? { val: d.prezzo, espr: d.prEspr } : null;
  let comm = typeof d.comm === 'number' ? { val: d.comm, espr: d.commEspr } : null;
  let tasse = typeof d.tasse === 'number' ? { val: d.tasse, espr: d.tasseEspr } : null;
  let qtaManuale = !isNew, prezzoManuale = !isNew;
  const strumento = () => store.get(d.inv);
  // fondo proposto: l'ultimo usato con questo strumento, altrimenti quello predefinito per le uscite o le entrate
  const fondoProposto = () => {
    const ultimo = [...M.invOps(d.inv)].reverse().find((o) => o.data.fondo)?.data.fondo;
    const def = M.opVende(d) ? M.cfg().contoIn : M.cfg().contoOut;
    return [ultimo, def].find((c) => c && M.accounts().some((a) => a.id === c)) || '';
  };
  if (d.fondo === undefined) d.fondo = fondoProposto();

  const dlg = modal(`
    <form class="dlg inv-dlg" method="dialog" novalidate>
      <header class="dlg-head"><h2>${isNew ? 'Nuova operazione' : 'Operazione'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <div class="seg wide" role="group" aria-label="Tipo di operazione">
        ${M.OP_INV.map(([k, n]) => `<button type="button" data-tipo="${k}">${n}</button>`).join('')}
      </div>
      <div class="form-grid">
        <label class="field"><span>Strumento</span><select name="inv">${scelti.map((i) => `<option value="${i.id}"${i.id === d.inv ? ' selected' : ''}>${esc(i.data.nome)}</option>`).join('')}</select></label>
        <label class="field"><span>Data</span>${dateInput({ name: 'data', value: d.data })}</label>
        <label class="field"><span data-l-qta></span><input name="qta" class="amt" inputmode="decimal" autocomplete="off" placeholder="0"></label>
        <label class="field"><span data-l-prezzo></span><input name="prezzo" class="amt" inputmode="decimal" autocomplete="off" placeholder="0,00"></label>
        <label class="field"><span>Commissioni (€)</span><input name="comm" class="amt" inputmode="decimal" autocomplete="off" placeholder="0,00"></label>
        <label class="field" data-tasse><span>Tasse trattenute (€)</span><input name="tasse" class="amt" inputmode="decimal" autocomplete="off" placeholder="0,00"></label>
        <label class="field"><span data-l-fondo></span><select name="fondo"></select></label>
      </div>
      <p class="muted small-note" data-poss></p>
      <div class="inv-totale" aria-live="polite"></div>
      <label class="field"><span>Nota</span><input name="note" value="${esc(d.note || '')}" autocomplete="off"></label>
      <div class="actions">
        ${isNew ? '' : '<button type="button" class="btn ghost danger" data-del>Elimina</button><span class="spacer"></span>'}
        <button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button>
      </div>
    </form>`, { wide: true });
  const f = $('form', dlg);
  const optQ = { dec: 8, show: (v) => fmtN(v, 8), raw: plainN };
  const optP = { dec: 6, show: (v) => fmtN(v, 6, 2), raw: plainN };
  bindAmount(f.qta, () => qta, (p) => { qta = p; qtaManuale = true; paint(); }, optQ);
  bindAmount(f.prezzo, () => prezzo, (p) => { prezzo = p; prezzoManuale = true; paint(); }, optP);
  bindAmount(f.comm, () => comm, (p) => { comm = p; paint(); });
  bindAmount(f.tasse, () => tasse, (p) => { tasse = p; paint(); });

  const bozza = () => ({ ...d, qta: qta?.val ?? null, prezzo: prezzo?.val ?? null, comm: comm?.val ?? null, tasse: M.opVende(d) ? tasse?.val ?? null : null });
  // Rimborso: proposti tutta la quantità posseduta e, per le obbligazioni in %, il prezzo 100
  function proponi() {
    if (d.tipo !== 'rimborso') return;
    const i = strumento();
    if (!qtaManuale) { const q = M.qtaAl(d.inv, d.data); qta = q > 0 ? { val: q, espr: null } : null; }
    if (!prezzoManuale && M.percento(i)) prezzo = { val: 100, espr: null };
  }
  function paintFondo() {
    const list = M.accounts();
    f.fondo.innerHTML = `<option value="">Già posseduto (non tocca i fondi)</option>` +
      list.map((c) => `<option value="${c.id}"${c.id === d.fondo ? ' selected' : ''}>${esc(c.data.nome)}</option>`).join('') +
      (d.fondo && !list.some((c) => c.id === d.fondo) ? `<option value="${d.fondo}" selected>${esc(M.accName(d.fondo))}</option>` : '');
  }
  function paint() {
    const i = strumento();
    const vende = M.opVende(d);
    $$seg(f).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tipo === d.tipo)));
    $('[data-l-qta]', f).textContent = M.percento(i) ? 'Valore nominale (€)' : 'Quantità';
    $('[data-l-prezzo]', f).textContent = M.percento(i) ? 'Prezzo (% del nominale)' : 'Prezzo per unità (€)';
    $('[data-l-fondo]', f).textContent = vende ? 'Soldi ricevuti su' : 'Soldi pagati con';
    $('[data-tasse]', f).hidden = !vende;
    if (document.activeElement !== f.qta) f.qta.value = qta ? fmtN(qta.val, 8) : '';
    if (document.activeElement !== f.prezzo) f.prezzo.value = prezzo ? fmtN(prezzo.val, 6, 2) : '';
    const poss = M.qtaAl(d.inv, d.data);
    const ultimo = M.prezzoAl(d.inv, d.data);
    $('[data-poss]', f).textContent = [
      vende || poss > 0 ? `Al ${fmtD(d.data)} possiedi ${fmtQta(i, poss)}${rec && rec.data.inv === d.inv && M.opVende(rec.data) && rec.data.data <= d.data ? ' (prima di questa operazione)' : ''}.` : '',
      ultimo ? `Ultimo prezzo ${fmtPrezzo(i, ultimo.val)} al ${fmtD(ultimo.date)}.` : '',
    ].filter(Boolean).join(' ');
    const b = bozza();
    const box = $('.inv-totale', f);
    if (!(b.qta > 0) || typeof b.prezzo !== 'number') { box.innerHTML = '<p class="muted">Scrivi quantità e prezzo per vedere il totale.</p>'; return; }
    const cv = M.controvalore(i, b), netto = M.nettoOp(i, b);
    const dove = d.fondo ? (vende ? `entrano su ${esc(M.accName(d.fondo))}` : `escono da ${esc(M.accName(d.fondo))}`) : 'nessun fondo cambia';
    box.innerHTML = `<p>Controvalore <b>${fmtEur(cv)}</b>${num(b.comm) ? ` · commissioni ${fmtEur(b.comm)}` : ''}${vende && num(b.tasse) ? ` · tasse ${fmtEur(b.tasse)}` : ''}</p>
      <p class="inv-tot-num">${vende ? 'Incasso netto' : 'Totale pagato'} <b>${fmtEur(Math.abs(netto))}</b> <small>${dove}</small></p>`;
  }
  paintFondo(); proponi(); paint();

  f.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) { dlg.close(); return; }
    const tb = e.target.closest('[data-tipo]');
    if (tb && tb.dataset.tipo !== d.tipo) {
      const cambiaVerso = M.opVende(d) !== (tb.dataset.tipo !== 'acquisto');
      d.tipo = tb.dataset.tipo;
      if (isNew && cambiaVerso) { d.fondo = fondoProposto(); paintFondo(); }
      if (d.tipo === 'rimborso') { qtaManuale = false; prezzoManuale = false; }
      proponi(); paint();
      return;
    }
    if (e.target.closest('[data-del]')) {
      const err = M.verificaOps(rec.data.inv, { senza: rec.id });
      if (err) { toast(`Non si può eliminare: la vendita del ${fmtD(err.op.data.data)} supererebbe la quantità posseduta.`); return; }
      if (!(await confirmBox(`Eliminare questa operazione (${M.opInvNome(M.opTipo(rec.data)).toLowerCase()} del ${fmtD(rec.data.data)})?`, { ok: 'Elimina', danger: true }))) return;
      const backup = { ...rec.data };
      store.remove(rec.id);
      dlg.close();
      onDone && onDone();
      toast('Operazione eliminata', { action: 'Annulla', onAction: () => { store.save('invop', rec.id, backup); onDone && onDone(); } });
    }
  });
  f.addEventListener('change', (e) => {
    if (e.target.name === 'inv') { d.inv = e.target.value; if (isNew) { d.fondo = fondoProposto(); paintFondo(); } proponi(); paint(); }
    if (e.target.name === 'data') { d.data = e.target.value; proponi(); paint(); }
    if (e.target.name === 'fondo') { d.fondo = e.target.value || null; paint(); }
  });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') return;
    e.preventDefault();
    document.activeElement?.blur?.();
    if (!d.data) { toast('Scegli la data.'); return; }
    if (!(qta?.val > 0)) { f.qta.focus(); toast('Scrivi una quantità maggiore di zero.'); return; }
    if (!(prezzo?.val >= 0)) { f.prezzo.focus(); toast('Scrivi il prezzo.'); return; }
    if ((comm?.val ?? 0) < 0 || (tasse?.val ?? 0) < 0) { toast('Commissioni e tasse non possono essere negative.'); return; }
    const vende = M.opVende(d);
    const id = rec ? rec.id : store.newId();
    const data = {
      inv: d.inv, tipo: d.tipo, data: d.data, qta: M.q8(qta.val), prezzo: prezzo.val, prEspr: prezzo.espr || null,
      comm: comm?.val ?? null, commEspr: comm?.espr || null, tasse: vende ? tasse?.val ?? null : null, tasseEspr: vende ? tasse?.espr || null : null,
      fondo: d.fondo || null, note: f.note.value.trim() || null, ord: d.ord ?? Date.now(),
    };
    // una vendita non può superare la quantità posseduta, nemmeno dopo aver cambiato un acquisto precedente
    const err = M.verificaOps(data.inv, { con: { id, data } }) || (rec && rec.data.inv !== data.inv ? M.verificaOps(rec.data.inv, { senza: rec.id }) : null);
    if (err) {
      const i = store.get(err.op.data.inv);
      toast(err.op.id === id ? `Al ${fmtD(data.data)} possiedi solo ${fmtQta(i, err.qta)}: non puoi venderne di più.`
        : `Così la vendita del ${fmtD(err.op.data.data)} supererebbe la quantità posseduta (${fmtQta(i, err.qta)}).`);
      return;
    }
    store.save('invop', id, data);
    dlg.close();
    toast(isNew ? `${M.opInvNome(data.tipo)} ${data.tipo === 'vendita' ? 'registrata' : 'registrato'}` : 'Modifiche salvate');
    onDone && onDone(id);
  });
  return dlg;
}
const $$seg = (f) => [...f.querySelectorAll('[data-tipo]')];

// ================================================================ finestra: prezzi
// Senza rec: tutti gli strumenti posseduti (o quelli di `ids`) con la data di oggi; i campi vuoti non cambiano.
// Con rec (un prezzo rilevato): modifica o eliminazione di quel prezzo.
export function prezziDialog({ ids = null, rec = null, onDone } = {}) {
  const lista = rec ? [store.get(rec.data.inv)].filter(Boolean)
    : (ids || M.invs({ archiviati: false }).filter((i) => M.qtaAl(i.id) > 0).map((i) => i.id)).map((id) => store.get(id)).filter(Boolean);
  if (!lista.length) { toast('Nessuno strumento posseduto.'); return null; }
  const vals = {};
  if (rec) vals[rec.data.inv] = { val: rec.data.val, espr: rec.data.espr || null };
  const dlg = modal(`
    <form class="dlg inv-dlg" method="dialog" novalidate>
      <header class="dlg-head"><h2>${rec ? 'Prezzo rilevato' : lista.length === 1 ? 'Aggiorna il prezzo' : 'Aggiorna i prezzi'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <p class="muted">${rec ? 'Un prezzo al giorno per strumento.' : 'Scrivi i prezzi di oggi (o della data scelta). I campi che lasci vuoti non cambiano.'}</p>
      <label class="field inline"><span>Data</span>${dateInput({ name: 'data', value: rec?.data.date || M.todayIso(), max: M.todayIso() })}</label>
      ${lista.map((i) => `<div class="snap-item"><label class="snap-row"><span>${esc(i.data.nome)}<small>${M.percento(i) ? '% del nominale' : '€ per unità'}</small></span>
        <input class="amt" data-inv="${i.id}" inputmode="decimal" autocomplete="off"></label><small class="snap-cmp" data-pv="${i.id}"></small></div>`).join('')}
      <div class="actions">
        ${rec ? '<button type="button" class="btn ghost danger" data-del>Elimina</button><span class="spacer"></span>' : ''}
        <button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button>
      </div>
    </form>`);
  const f = $('form', dlg);
  const opt = { dec: 6, show: (v) => fmtN(v, 6, 2), raw: plainN };
  for (const i of lista) {
    const inp = f.querySelector(`input[data-inv="${i.id}"]`);
    bindAmount(inp, () => vals[i.id] || null, (p) => { if (p) vals[i.id] = p; else delete vals[i.id]; }, opt);
    if (vals[i.id]) inp.value = fmtN(vals[i.id].val, 6, 2);
  }
  // segnaposto: il prezzo che vale a quella data, escluso il giorno stesso se lo si sta riscrivendo
  const paint = () => {
    for (const i of lista) {
      const p = M.prezzoAl(i.id, f.data.value || null);
      const inp = f.querySelector(`input[data-inv="${i.id}"]`);
      inp.placeholder = p ? fmtN(p.val, 6, 2) : '–';
      const giaOggi = !rec && M.invPrezzi(i.id).some((x) => x.data.date === f.data.value);
      f.querySelector(`[data-pv="${i.id}"]`).textContent = p ? `Prima: ${fmtPrezzo(i, p.val)} al ${fmtD(p.date)}${giaOggi ? ' · un nuovo valore lo sostituisce' : ''}` : 'Nessun prezzo precedente';
    }
  };
  paint();
  f.data.addEventListener('change', paint);
  f.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) { dlg.close(); return; }
    if (e.target.closest('[data-del]')) {
      if (!(await confirmBox(`Eliminare il prezzo del ${fmtD(rec.data.date)}?`, { ok: 'Elimina', danger: true }))) return;
      const backup = { ...rec.data };
      store.remove(rec.id);
      dlg.close();
      onDone && onDone();
      toast('Prezzo eliminato', { action: 'Annulla', onAction: () => { store.save('invpr', rec.id, backup); onDone && onDone(); } });
    }
  });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') return;
    e.preventDefault();
    document.activeElement?.blur?.();
    const date = f.data.value;
    if (!date) { toast('Scegli la data.'); return; }
    const scritti = Object.entries(vals).filter(([, v]) => v && v.val > 0);
    if (Object.values(vals).some((v) => !(v.val > 0))) { toast('Un prezzo deve essere maggiore di zero.'); return; }
    if (rec && !scritti.length) { toast('Scrivi il prezzo, oppure eliminalo.'); return; }
    if (rec && rec.data.date !== date) store.remove(rec.id);
    for (const [id, v] of scritti) M.salvaPrezzo(id, date, v, 'manuale');
    dlg.close();
    toast(scritti.length ? (scritti.length === 1 ? 'Prezzo salvato' : `${scritti.length} prezzi salvati`) : 'Nessun prezzo cambiato');
    onDone && onDone();
  });
  return dlg;
}

