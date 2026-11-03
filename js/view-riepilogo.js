import * as store from './store.js';
import * as M from './model.js';
import * as C from './charts.js';
import { parseAmount, fmt, fmtEur, fmtEur0, fmtSigned, saldoCls, plain, round2 } from './expr.js';
import { esc, $, toast, modal } from './ui.js';
import * as G from './gruppi.js';
import { catBars, toggleCat, tagPies } from './catstats.js';
import { monthInput, setPick } from './datepick.js';

let root, sel; // sel: anno (numero) oppure 'tutto'
let curList = []; // movimenti del periodo mostrato, per il dettaglio delle categorie
let espanso = false; // tabella "Mese per mese" aperta sotto il grafico delle entrate e uscite
let baseScelta = null; // anno scelto per il confronto (null = l'anno prima, o il più recente con movimenti)

// Intervallo di mesi per "Tutti gli anni" ('AAAA-MM' oppure '' se senza limite). Si ricorda su questo dispositivo.
const RANGE_KEY = 'contabilita.riepilogo-periodo';
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const range = (() => {
  try {
    const o = JSON.parse(localStorage.getItem(RANGE_KEY));
    return { from: MONTH_RE.test(o?.from) ? o.from : '', to: MONTH_RE.test(o?.to) ? o.to : '' };
  } catch { return { from: '', to: '' }; }
})();
const saveRange = () => { try { localStorage.setItem(RANGE_KEY, JSON.stringify(range)); } catch {} };
const monthKey = (v) => { const m = MONTH_RE.exec(v); return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null; };
// Estremi dell'intervallo come numero di mese (anno × 12 + mese 0–11); se invertiti vengono scambiati.
function rangeKeys() {
  let lo = monthKey(range.from) ?? -Infinity, hi = monthKey(range.to) ?? Infinity;
  if (lo > hi) [lo, hi] = [hi, lo];
  return [lo, hi];
}

export function render(el, { anno } = {}) {
  root = el;
  const ys = M.years();
  const now = new Date().getFullYear();
  sel = anno === 'tutto' ? 'tutto' : Number(anno) || (ys.includes(now) ? now : ys[ys.length - 1] || now);
  el.innerHTML = `
    <section class="riepilogo">
      <header class="page-head rie-head">
        <h1>Riepilogo</h1>
        ${periodoNav(ys)}
        ${sel === 'tutto' ? rangeBar(ys) : ''}
      </header>
      <div id="rie-body"></div>
    </section>`;
  bindPeriodo(ys);
  bindRange();
  // scelta dell'anno di confronto: un solo ascolto sulla sezione della pagina (nuova a ogni visita)
  root.querySelector('.riepilogo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-base]');
    if (!b) return;
    baseScelta = Number(b.dataset.base);
    const g = root.querySelector('#gr-rie-cmp');
    if (g) { G.ricorda('rie-cmp', true); g.outerHTML = confrontoGroup(); }
  });
  draw();
}

// Periodo: gruppo collegato ‹ anno ›. Le frecce scorrono gli anni con movimenti e, dopo l'ultimo, «Tutti gli anni»;
// il centro apre la scelta di tutti i periodi (un pulsante per anno e «Tutti gli anni»)
function periodi(ys) { return [...ys, 'tutto']; }
function vicini(ys) {
  const lista = periodi(ys);
  const i = lista.indexOf(sel);
  if (i >= 0) return [lista[i - 1] ?? null, lista[i + 1] ?? null];
  return [[...ys].reverse().find((y) => y < sel) ?? null, ys.find((y) => y > sel) ?? 'tutto'];
}
function periodoNav(ys) {
  const [prev, next] = vicini(ys);
  return `<div class="seg rie-anni" role="group" aria-label="Periodo">
    <button type="button" data-periodo="${prev ?? ''}" aria-label="Periodo precedente"${prev === null ? ' disabled' : ''}>${chev('l')}</button>
    <button type="button" class="rie-scegli" data-scegli aria-haspopup="dialog" aria-label="Scegli il periodo">${sel === 'tutto' ? 'Tutti gli anni' : sel}</button>
    <button type="button" data-periodo="${next ?? ''}" aria-label="Periodo successivo"${next === null ? ' disabled' : ''}>${chev('r')}</button>
  </div>`;
}
const chev = (dir) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="${dir === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function bindPeriodo(ys) {
  root.querySelector('.rie-anni').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.periodo) { location.hash = '#riepilogo/' + b.dataset.periodo; return; }
    if (b.hasAttribute('data-scegli')) {
      const dlg = modal(`<div class="dlg rie-scelta">
        <header class="dlg-head"><h2>Periodo</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
        <div class="rie-chips">${periodi(ys).map((p) => `<a class="chip${p === sel ? ' on' : ''}" href="#riepilogo/${p}">${p === 'tutto' ? 'Tutti gli anni' : p}</a>`).join('')}</div>
      </div>`);
      dlg.addEventListener('click', (ev) => { if (ev.target.closest('[data-x], a.chip')) dlg.close(); });
    }
  });
}

function rangeBar(ys) {
  const min = ys.length ? `${ys[0]}-01` : '', max = ys.length ? `${ys[ys.length - 1]}-12` : '';
  const inp = (id, label, v) => `<label class="field inline"><span>${label}</span>
    ${monthInput({ id, value: v, min, max, vuoto: 'Nessun mese', scegli: id === 'rg-from' ? 'Dall\'inizio' : 'Fino alla fine' })}</label>`;
  return `<div class="rie-range" role="group" aria-label="Intervallo di date">
    ${inp('rg-from', 'Dal', range.from)}${inp('rg-to', 'Al', range.to)}
    <button class="chip" id="rg-reset" type="button"${range.from || range.to ? '' : ' hidden'}>Tutto il periodo</button>
  </div>`;
}

function bindRange() {
  const box = root.querySelector('.rie-range');
  if (!box) return;
  const from = $('#rg-from', box), to = $('#rg-to', box), reset = $('#rg-reset', box);
  const apply = () => {
    range.from = MONTH_RE.test(from.value) ? from.value : '';
    range.to = MONTH_RE.test(to.value) ? to.value : '';
    reset.hidden = !(range.from || range.to);
    saveRange();
    draw();
  };
  from.addEventListener('change', apply);
  to.addEventListener('change', apply);
  reset.addEventListener('click', () => { setPick(from, ''); setPick(to, ''); apply(); });
}

export function redraw() { if (root && root.isConnected) draw(); }

const width = (id) => Math.floor($(id, root)?.clientWidth || 600);

function draw() {
  const body = $('#rie-body', root);
  const tutto = sel === 'tutto';
  const [lo, hi] = tutto ? rangeKeys() : [-Infinity, Infinity];
  const inR = (y, i) => y * 12 + i >= lo && y * 12 + i <= hi; // i: mese 0–11
  const filtrato = tutto && (lo > -Infinity || hi < Infinity);
  const list = tutto ? M.movs().filter((r) => inR(r.data.y, r.data.m - 1)) : M.movs().filter((r) => r.data.y === sel);
  curList = list;
  const ysAll = M.years();
  const ys = tutto ? ysAll.filter((y) => y * 12 + 11 >= lo && y * 12 <= hi) : ysAll; // anni che toccano l'intervallo
  // I soldi buttati sono registrati per anno: con un intervallo contano solo gli anni compresi per intero.
  const ysButt = ys.filter((y) => inR(y, 0) && inR(y, 11));
  if (!list.length && !(tutto ? ysButt.some((y) => M.buttati(y).length) : M.buttati(sel).length)) {
    body.innerHTML = '<div class="empty-hint"><p>Nessun movimento in questo periodo.</p></div>';
    return;
  }
  const s = M.sums(list);

  // serie per il grafico principale
  let labels, vin, vout, vsal, cum = [];
  if (tutto) {
    labels = ys.map(String);
    const per = ys.map((y) => M.sums(list.filter((r) => r.data.y === y)));
    vin = per.map((p) => p.tin); vout = per.map((p) => p.tout); vsal = per.map((p) => p.saldo);
    let acc = 0;
    for (const y of ys) {
      M.monthly(y).forEach((o, i) => {
        if (!o.n || !inR(y, i)) return;
        acc += o.saldo;
        cum.push({ label: `${M.MESI[i]} ${y}`, short: i === 0 || !cum.length ? String(y) : '', value: round2(acc) });
      });
    }
  } else {
    labels = M.MESI_BREVI;
    const mo = M.monthly(sel);
    vin = mo.map((o) => o.tin); vout = mo.map((o) => o.tout); vsal = mo.map((o) => o.saldo);
    let acc = 0;
    mo.forEach((o, i) => { if (!o.n) return; acc += o.saldo; cum.push({ label: `${M.MESI[i]} ${sel}`, short: M.MESI_BREVI[i], value: round2(acc) }); });
  }
  const mesiAttivi = tutto
    ? ys.reduce((n, y) => n + M.monthly(y).filter((o, i) => o.n && inR(y, i)).length, 0)
    : M.monthly(sel).filter((o) => o.n).length;
  const butt = tutto ? round2(ysButt.reduce((a, y) => a + M.buttTot(y), 0)) : M.buttTot(sel);

  // Riquadro verde acqua: saldo del periodo, entrate e uscite, e le tre capsule del logo calcolate sui totali (come nel Mese).
  // Il dettaglio mese per mese (o anno per anno) è nel grafico "Entrate e uscite" con la tabella.
  const maxT = Math.max(s.tin, s.tout, Math.abs(s.saldo)) || 1;
  const h = (v) => (Math.abs(v) / maxT * 100).toFixed(1);
  body.innerHTML = `
    <section class="hero-box mese-hero rie-hero">
      <div class="mh-text">
        <p class="hb-label">${tutto ? (filtrato ? 'Saldo del periodo' : 'Saldo di tutti gli anni') : `Saldo del ${sel}`}</p>
        <p class="hb-num ${s.saldo > 0.004 ? 'hb-pos' : s.saldo < -0.004 ? 'hb-neg' : ''}">${fmtSigned(s.saldo)}</p>
        <p class="mh-io"><span><i class="cap in"></i><span class="sr">Entrate </span>${fmtEur(s.tin)}</span><span><i class="cap out"></i><span class="sr">Uscite </span>${fmtEur(s.tout)}</span></p>
      </div>
      <div class="mh-caps" aria-hidden="true"><i class="in" style="--h:${h(s.tin)}%"></i><i class="out" style="--h:${h(s.tout)}%"></i><i class="${s.saldo < 0 ? 'neg' : 'pos'}" style="--h:${h(s.saldo)}%"></i></div>
    </section>
    <dl class="stats stats-sub">
      <div><dt>Entrate medie al mese</dt><dd class="in">${fmtEur(mesiAttivi ? s.tin / mesiAttivi : 0)}</dd></div>
      <div><dt>Uscite medie al mese</dt><dd class="out">${fmtEur(mesiAttivi ? s.tout / mesiAttivi : 0)}</dd></div>
      <div><dt>Saldo medio al mese</dt><dd class="${saldoCls(mesiAttivi ? s.saldo / mesiAttivi : 0)}">${fmtSigned(mesiAttivi ? s.saldo / mesiAttivi : 0)}</dd></div>
      <div><dt>Risparmio</dt><dd>${s.tin > 0 ? (s.saldo / s.tin * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + '%' : '–'}</dd></div>
      <div class="st-butt"><dt>Soldi buttati</dt><dd class="butt">${fmtEur(butt)}</dd></div>
    </dl>

    ${tutto ? '' : proiezioneCard()}

    <section class="card">
      <h2>Saldo accumulato</h2>
      <p class="muted">Quanto hai messo da parte sommando i saldi mese dopo mese${tutto ? (filtrato ? ', nel periodo scelto' : ', dal primo mese registrato') : ` nel ${sel}`}.</p>
      <p class="chart-info" id="ch-line-info"></p>
      <div class="chart-box" id="ch-line"></div>
    </section>

    <section class="card">
      <h2>${tutto ? 'Entrate e uscite per anno' : 'Entrate e uscite per mese'}</h2>
      <div class="legend"><span class="lg in">Entrate</span><span class="lg out">Uscite</span><span class="lg sal-bar">Saldo</span></div>
      <div class="chart-box" id="ch-bars"></div>
      <button class="btn ghost small" id="det-toggle" type="button" aria-expanded="${espanso}" aria-controls="det-body">${espanso ? 'Comprimi ▴' : 'Espandi ▾'}</button>
      <div id="det-body"${espanso ? '' : ' hidden'}>
        ${tutto ? yearTable(ys, list) : monthTable(sel)}
      </div>
    </section>

    <section class="card">
      <h2 class="cap-title"><span class="cap in"></span>Entrate per categoria</h2>
      <div id="cat-in"></div>
    </section>
    <section class="card">
      <h2 class="cap-title"><span class="cap out"></span>Uscite per categoria</h2>
      <div id="cat-out"></div>
    </section>

    ${tutto ? '' : confrontoGroup()}

    ${budgetGroup()}

    <div class="three">
      ${topGroup(list)}
      ${tagGroup(list)}
      ${tutto ? buttYears(ysButt) : buttEditor(sel)}
    </div>`;

  $('#ch-bars', root).innerHTML = C.bars({
    width: width('#ch-bars'), labels,
    series: [{ name: 'Entrate', cls: 'in', values: vin }, { name: 'Uscite', cls: 'out', values: vout }, { name: 'Saldo', values: vsal, clsOf: saldoCls }],
  });
  const lineBox = $('#ch-line', root), lineInfo = $('#ch-line-info', root);
  lineBox.innerHTML = C.line({ width: width('#ch-line'), points: cum, cls: 'line-saldo' });
  // toccando o passando il mouse sul grafico si legge il saldo accumulato di quel mese
  C.bindTimeHover(lineBox, (i) => {
    const p = cum[i ?? cum.length - 1];
    lineInfo.innerHTML = p ? `<b>${p.label}</b> · <span class="${saldoCls(p.value)}">${fmtSigned(p.value)}</span>` : '';
  });
  $('#cat-in', root).innerHTML = catBars(list, 'in');
  $('#cat-out', root).innerHTML = catBars(list, 'out');
  bind();
}

// --- Confronti nel tempo ---
const pctFmt = (v) => v.toLocaleString('it-IT', { maximumFractionDigits: 1, signDisplay: 'exceptZero' }) + '%';
// Variazione in percentuale: per le uscite salire è un male (rosso), per le entrate un bene (verde)
function varCell(v, tipo) {
  if (v === null) return '<td class="num muted">–</td>';
  if (Math.abs(v) < 0.05) return '<td class="num muted">0%</td>';
  const bene = tipo === 'in' ? v > 0 : v < 0;
  return `<td class="num ${bene ? 'pos' : 'neg'}">${pctFmt(v)}</td>`;
}

// Uscite stimate a fine anno, continuando al ritmo attuale (solo per l'anno in corso)
function proiezioneCard() {
  if (sel !== new Date().getFullYear()) return '';
  const p = M.proiezioneUscite();
  const head = '<h2>Proiezione a fine anno</h2>';
  if (p.stima === null) return `<section class="card">${head}<p class="muted">Troppo presto per una stima: serve almeno un mese di dati.</p></section>`;
  const conPrev = p.prev > 0 && p.var !== null
    ? `<p class="muted">Nel ${p.y - 1} hai speso ${fmtEur(p.prev)}: a questo ritmo la spesa sarebbe <b class="${p.var > 0 ? 'neg' : 'pos'}">${pctFmt(p.var)}</b>.</p>` : '';
  return `<section class="card">${head}
    <p class="muted">Stima delle uscite dell'intero anno, se continui a spendere come dall'inizio dell'anno a oggi.</p>
    <dl class="stats">
      <div><dt>Uscite finora</dt><dd class="out">${fmtEur(p.speso)}</dd></div>
      <div><dt>Ritmo al mese</dt><dd class="out">${fmtEur(p.ritmo)}</dd></div>
      <div><dt>Stima a fine ${p.y}</dt><dd class="out">${fmtEur(p.stima)}</dd></div>
    </dl>${conPrev}</section>`;
}

// Entrate, uscite e categorie rispetto a un anno passato (predefinito: l'anno prima; si può scegliere qualsiasi
// anno precedente con movimenti nel periodo). Per l'anno in corso si confronta lo stesso periodo.
// Tutto in un solo gruppo espandibile: i totali, la scelta dell'anno e le categorie di entrate e uscite.
function confrontoGroup() {
  const now = new Date();
  const fino = sel === now.getFullYear() ? now.getMonth() + 1 : 12;
  const anni = M.years().filter((y) => y < sel).reverse().map((y) => ({ y, c: M.confrontoAnno(sel, fino, y) })).filter((o) => o.c);
  if (!anni.length) return '';
  const scelto = anni.find((o) => o.y === baseScelta) || anni.find((o) => o.y === sel - 1) || anni[0];
  const { y: base, c } = scelto;
  const periodo = (y) => fino === 12 ? String(y) : `${fino === 1 ? M.MESI[0] : M.MESI[0] + '–' + M.MESI[fino - 1].toLowerCase()} ${y}`;
  const riga = (nome, o, tipo) => `<tr><td>${nome}</td><td class="num muted">${fmt(o.prev)}</td><td class="num ${tipo}">${fmt(o.cur)}</td>${varCell(o.var, tipo)}</tr>`;
  const bene = (o, tipo) => (o.var === null || Math.abs(o.var) < 0.05 ? '' : (tipo === 'in' ? o.var > 0 : o.var < 0) ? 'pos' : 'neg');
  const testa = `<thead><tr><th></th><th class="num">${base}</th><th class="num">${sel}</th><th class="num">Variazione</th></tr></thead>`;
  // le categorie di entrate e di uscite sono due gruppi espandibili dentro il gruppo del confronto
  const sottogruppo = (titolo, righe, tipo) => righe.length ? G.gruppoHTML({
    id: 'rie-cmp-' + tipo, cls: 'cmp-cat', titolo, tono: tipo, n: righe.length, nomi: ['categoria', 'categorie'],
    anteprima: righe.map((o) => prev(M.catLabel(o.cat), o, tipo)),
    corpo: `<div class="gr-tab"><table class="tbl cmp-tbl">${testa}<tbody>${righe.map((o) => riga(esc(M.catLabel(o.cat)), o, tipo)).join('')}</tbody></table></div>`,
  }) : '';
  const prev = (nome, o, tipo) => ({ desc: nome, det: `${fmt(o.prev)} → ${fmt(o.cur)}`, amt: o.var === null ? '–' : pctFmt(o.var), cls: bene(o, tipo) });
  const quante = (n) => (n === 1 ? '1 categoria' : `${n} categorie`);
  return G.gruppoHTML({
    id: 'rie-cmp', cls: 'rie-cmp', titolo: `Rispetto al ${base}`, tono: 'prim', n: 4, contatore: false,
    anteprima: [prev('Entrate', c.tin, 'in'), prev('Uscite', c.tout, 'out'),
      { desc: 'Entrate per categoria', det: quante(c.in.length) }, { desc: 'Uscite per categoria', det: quante(c.out.length) }],
    corpo: `<div class="cmp-head">
        <p class="muted">${periodo(sel)} confrontato con ${periodo(base).toLowerCase()}.${fino < 12 ? ' L\'ultimo mese è ancora in corso.' : ''}</p>
        ${anni.length > 1 ? `<div class="cmp-anni" role="group" aria-label="Confronta con l'anno"><span>Confronta con</span>
          ${anni.map((o) => `<button type="button" class="chip${o.y === base ? ' on' : ''}" data-base="${o.y}" aria-pressed="${o.y === base}">${o.y}</button>`).join('')}</div>` : ''}
      </div>
      <div class="gr-tab"><table class="tbl cmp-tbl">${testa}<tbody>${riga('Entrate', c.tin, 'in')}${riga('Uscite', c.tout, 'out')}</tbody></table></div>
      ${sottogruppo('Entrate per categoria', c.in, 'in')}${sottogruppo('Uscite per categoria', c.out, 'out')}`,
  });
}

// Per ogni budget: in quanti periodi conclusi è stato rispettato e di quanto si è scostata in media la spesa
function budgetGroup() {
  const [lo, hi] = sel === 'tutto' ? rangeKeys() : [sel * 12, sel * 12 + 11];
  const righe = M.budgets().map((b) => ({ b, r: M.budgetRiepilogo(b, lo, hi) })).filter((x) => x.r);
  if (!righe.length) return '';
  const scost = (n) => (Math.abs(n) < 0.005 ? 'In pari' : `${fmtEur(Math.abs(n))} ${n < 0 ? 'sotto' : 'oltre'}`);
  return G.gruppoHTML({
    id: 'rie-budget', cls: 'rie-budget', titolo: 'Budget', n: righe.length, nomi: ['budget', 'budget'],
    anteprima: righe.map(({ b, r }) => ({ desc: M.budgetLabel(b), det: `rispettato ${r.ok} su ${r.n} ${r.unita}`, amt: scost(r.scost), cls: r.scost > 0.005 ? 'warn' : '' })),
    corpo: `<p class="muted gr-nota">Solo i periodi conclusi. Lo scostamento medio è la differenza tra speso e disponibile.</p>
      <div class="gr-tab"><table class="tbl"><thead><tr><th>Budget</th><th class="num">Rispettato</th><th class="num">Scostamento medio</th></tr></thead>
      <tbody>${righe.map(({ b, r }) => `<tr><td>${esc(M.budgetLabel(b))}<small class="muted">${b.data.periodo === 'anno' ? 'Annuale' : 'Mensile'}</small></td>
        <td class="num">${r.ok} su ${r.n} ${r.unita}</td><td class="num${r.scost > 0 ? ' bud-over-txt' : ''}">${scost(r.scost)}</td></tr>`).join('')}</tbody></table></div>`,
  });
}

function monthTable(y) {
  const mo = M.monthly(y);
  return `<table class="tbl"><thead><tr><th>Mese</th><th class="num">Entrate</th><th class="num">Uscite</th><th class="num">Saldo</th></tr></thead><tbody>
    ${mo.map((o, i) => o.n ? `<tr data-href="#mese/${y}-${String(i + 1).padStart(2, '0')}">
      <td><a href="#mese/${y}-${String(i + 1).padStart(2, '0')}">${M.MESI[i]}</a></td>
      <td class="num in">${fmt(o.tin)}</td><td class="num out">${fmt(o.tout)}</td>
      <td class="num ${saldoCls(o.saldo)}">${fmtSigned(o.saldo)}</td></tr>` : '').join('')}
  </tbody></table>`;
}

function yearTable(ys, list) {
  return `<table class="tbl"><thead><tr><th>Anno</th><th class="num">Entrate</th><th class="num">Uscite</th><th class="num">Saldo</th></tr></thead><tbody>
    ${ys.map((y) => { const s = M.sums(list.filter((r) => r.data.y === y)); return `<tr>
      <td><a href="#riepilogo/${y}">${y}</a></td><td class="num in">${fmt(s.tin)}</td><td class="num out">${fmt(s.tout)}</td>
      <td class="num ${saldoCls(s.saldo)}">${fmtSigned(s.saldo)}</td></tr>`; }).join('')}
  </tbody></table>`;
}

// Le 10 uscite più grandi del periodo
function topGroup(list) {
  const top = list.filter((r) => r.data.tipo === 'out' && !r.data.escl && typeof r.data.val === 'number')
    .sort((a, b) => b.data.val - a.data.val).slice(0, 10);
  const det = (r) => { const cat = M.catById(r.data.cat); return `${M.MESI_BREVI[r.data.m - 1]} ${r.data.y}${cat ? ', ' + cat.data.nome : ''}`; };
  return G.gruppoHTML({
    id: 'rie-top', titolo: 'Le spese più grandi', tono: 'out', n: top.length, nomi: ['spesa', 'spese'],
    anteprima: top.map((r) => ({ desc: r.data.desc || '(senza descrizione)', det: det(r), amt: fmt(r.data.val), cls: 'out' })),
    corpo: `<div class="gr-blocchi">${top.map((r) => `<a class="gr-blk" href="#mese/${r.data.y}-${String(r.data.m).padStart(2, '0')}/${r.id}">
      <span><b>${esc(r.data.desc || '(senza descrizione)')}</b><small>${esc(det(r))}</small></span><span class="num out">${fmt(r.data.val)}</span></a>`).join('')}</div>`,
    vuoto: 'Nessuna uscita.',
  });
}

// Tag del periodo: toccandone uno si apre sotto il riepilogo per categoria dei suoi movimenti
function tagGroup(list) {
  const tags = M.tagStats(list);
  return G.gruppoHTML({
    id: 'rie-tag', titolo: 'Tag', tono: 'prim', n: tags.length, nomi: ['tag', 'tag'],
    anteprima: tags.map((t) => ({ desc: '#' + t.tag, det: `${t.n} mov.`, amt: fmt(t.tout), cls: 'out' })),
    corpo: `<div class="gr-blocchi">${tags.map((t) => `<div class="tag-blk">
      <button type="button" class="tag-row" data-tagrow="${esc(t.tag)}" aria-expanded="false">
        <span class="tag">#${esc(t.tag)}</span><span class="muted">${t.n} mov.</span><span class="num out">${fmt(t.tout)}</span></button>
      <div class="tag-det" hidden></div></div>`).join('')}</div>`,
    vuoto: 'Nessun tag in questo periodo. Aggiungili ai movimenti, toccando una riga nella pagina Mese, per raggruppare per esempio tutte le spese di un viaggio.',
  });
}

function buttYears(ys) {
  const rows = ys.map((y) => ({ y, tot: M.buttTot(y), n: M.buttati(y).length })).filter((o) => o.n);
  return G.gruppoHTML({
    id: 'rie-butt', cls: 'rie-butt', titolo: 'Soldi buttati', tono: 'butt', n: rows.length, nomi: ['anno', 'anni'],
    totale: fmtEur(round2(rows.reduce((a, o) => a + o.tot, 0))), totCls: 'butt',
    anteprima: rows.map((o) => ({ desc: String(o.y), det: `${o.n} voci`, amt: fmt(o.tot), cls: 'butt' })),
    corpo: `<div class="gr-blocchi">${rows.map((o) => `<a class="gr-blk" href="#riepilogo/${o.y}"><span><b>${o.y}</b><small>${o.n} voci</small></span><span class="num butt">${fmt(o.tot)}</span></a>`).join('')}</div>`,
    vuoto: 'Nessuna voce registrata.',
  });
}

function buttEditor(y) {
  const list = M.buttati(y);
  return G.gruppoHTML({
    id: 'rie-butt', cls: 'rie-butt', titolo: 'Soldi buttati', tono: 'butt', n: list.length, nomi: ['voce', 'voci'],
    totale: fmtEur(M.buttTot(y)), totCls: 'butt',
    anteprima: list.map((r) => ({ desc: r.data.desc || '(senza descrizione)', amt: fmt(r.data.val), cls: 'butt' })),
    corpo: `<p class="muted gr-nota">Le spese che rifaresti volentieri a meno. Anche qui puoi scrivere espressioni come =19,30-16,66.</p>
      <div class="butt-list gr-tab">${list.map((r) => `
        <div class="butt-row" data-id="${r.id}">
          <input class="c-amt" data-bf="amt" inputmode="decimal" value="${fmt(r.data.val)}" aria-label="Importo">
          <input data-bf="desc" value="${esc(r.data.desc)}" aria-label="Descrizione">
          <button class="icon-btn small" data-bact="del" aria-label="Elimina">×</button>
        </div>`).join('')}
        <div class="butt-foot"><span>Totale <b class="butt">${fmtEur(M.buttTot(y))}</b></span></div>
      </div>`,
    piede: '<button class="add-row" data-bact="add">+ Aggiungi voce</button>',
    vuoto: 'Nessuna voce registrata.',
  });
}

// Apre o chiude, sotto la riga di un tag, le torte per categoria dei suoi movimenti
function toggleTagRow(btn) {
  const det = btn.nextElementSibling;
  const open = det.hidden;
  if (open) {
    const tag = btn.dataset.tagrow.toLowerCase();
    const list = curList.filter((r) => (r.data.tags || []).some((x) => x.toLowerCase() === tag));
    det.innerHTML = `${tagPies(list)}<a class="btn ghost small" href="#tag/${encodeURIComponent(btn.dataset.tagrow)}">Vedi i movimenti</a>`;
    det.querySelectorAll('.catbar').forEach((b) => b.addEventListener('click', () => toggleCat(b, list)));
  } else det.innerHTML = '';
  det.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
}

function bind() {
  const tog = $('#det-toggle', root);
  tog?.addEventListener('click', () => {
    espanso = $('#det-body', root).hidden;
    $('#det-body', root).hidden = !espanso;
    tog.setAttribute('aria-expanded', String(espanso));
    tog.textContent = espanso ? 'Comprimi ▴' : 'Espandi ▾';
  });
  root.querySelectorAll('.tag-row').forEach((b) => b.addEventListener('click', () => toggleTagRow(b)));
  root.querySelectorAll('.catbar').forEach((b) => b.addEventListener('click', () =>
    toggleCat(b, curList)));
  root.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (!e.target.closest('a')) location.hash = tr.dataset.href;
  }));
  const card = $('#gr-rie-butt', root);
  if (sel === 'tutto' || !card) return;
  card.addEventListener('click', (e) => {
    const act = e.target.closest('[data-bact]')?.dataset.bact;
    if (act === 'add') {
      const list = M.buttati(sel);
      store.save('butt', store.newId(), { y: sel, espr: null, val: null, desc: '', ord: (list.at(-1)?.data.ord ?? -1) + 1 });
      G.ricorda('rie-butt', true); // la voce nuova si scrive nel gruppo aperto
      draw();
      const rows = root.querySelectorAll('.butt-row');
      rows[rows.length - 1]?.querySelector('[data-bf="amt"]').focus();
    }
    if (act === 'del') {
      const row = e.target.closest('.butt-row');
      const r = store.get(row.dataset.id);
      store.remove(row.dataset.id);
      draw();
      if (r) toast('Voce eliminata', { action: 'Annulla', onAction: () => { store.save('butt', r.id, r.data); draw(); } });
    }
  });
  card.addEventListener('focusin', (e) => {
    if (e.target.dataset.bf !== 'amt') return;
    const r = store.get(e.target.closest('.butt-row').dataset.id);
    if (r) { e.target.value = r.data.espr || plain(r.data.val); e.target.select(); }
  });
  card.addEventListener('focusout', (e) => {
    const f = e.target.dataset.bf;
    const row = e.target.closest('.butt-row');
    if (!f || !row) return;
    const r = store.get(row.dataset.id);
    if (!r) return;
    if (f === 'amt') {
      try {
        const p = parseAmount(e.target.value);
        store.patch(r.id, { val: p?.val ?? null, espr: p?.espr ?? null });
        e.target.value = fmt(p?.val);
      } catch (err) { toast(err.message); e.target.value = fmt(r.data.val); }
    } else {
      store.patch(r.id, { desc: e.target.value.trim() });
    }
    const tot = card.querySelector('.butt-foot b');
    if (tot) tot.textContent = fmtEur(M.buttTot(sel));
    const grTot = card.querySelector('[data-gr-tot]');
    if (grTot) grTot.textContent = fmtEur(M.buttTot(sel));
  });
}
