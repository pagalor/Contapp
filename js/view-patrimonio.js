import * as store from './store.js';
import * as M from './model.js';
import * as C from './charts.js';
import { parseAmount, fmt, fmtEur, fmtSigned, plain, round2 } from './expr.js';
import { esc, $, $$, toast, modal, confirmBox } from './ui.js';
import { transferDialog } from './dialogs.js';

let root;
export const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateShort = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

export function render(el) { root = el; draw(); }
export function redraw() { if (root && root.isConnected) draw(); }

function groupsIn(ids) {
  return M.GRUPPI.map(([g]) => g).filter((g) => M.accounts(true).some((c) => c.data.gruppo === g && ids.has(c.id)));
}

function draw() {
  const auto = M.autoAttivo();
  root.innerHTML = `
    <section class="patrimonio">
      <header class="page-head">
        <h1>Patrimonio</h1>
        <div class="btn-row">
          ${auto ? '<button class="btn ghost" data-act="trasf">Trasferimento</button>' : ''}
          <a class="btn ${auto ? 'ghost' : 'primary'}" href="#conti">Fondi</a>
        </div>
      </header>
      ${auto ? autoHTML() : setupHint()}
      <div id="pat-chart"></div>
      ${historyHTML()}
    </section>`;
  drawChart();
  bind();
}

function setupHint() {
  return `<div class="card intro">
    <h2>Calcolo automatico non ancora attivo</h2>
    <p>Indica quanto c'è in ogni fondo (contanti, conti, crypto…) a una certa data: da quel giorno in poi ogni entrata, uscita e trasferimento
    li aggiorna da sola, e l'app ti avvisa quando un fondo scende sotto il suo target.</p>
    <a class="btn primary" href="#conti">Configura i fondi</a>
  </div>`;
}

function autoHTML() {
  const inizio = M.cfg().inizio;
  const bal = M.balances();
  const tot = M.totaleGruppi(bal);
  const start = M.totaleGruppi(M.balances(inizio));
  const accs = M.accounts(true).filter((c) => !c.data.archiviato || Math.abs(bal.get(c.id) || 0) > 0.005);
  const groups = groupsIn(new Set(accs.map((c) => c.id)));
  const senza = M.senzaConto();
  const dt = M.debtTotals();
  return `
    <div class="hero">
      <p class="hero-label">Patrimonio oggi</p>
      <p class="hero-num">${fmtEur(tot.tot)}</p>
      <p class="hero-sub"><span class="${tot.tot - start.tot >= 0 ? 'pos' : 'neg'}">${fmtSigned(tot.tot - start.tot)}</span> dalla partenza del ${fmtDateShort(inizio)}</p>
      <dl class="hero-split">
        ${groups.map((g) => `<div><dt><i class="sw ${g}"></i>${M.gruppoNome(g)}</dt><dd>${fmtEur(tot.gruppi[g] || 0)}</dd></div>`).join('')}
      </dl>
      ${dt.crediti || dt.debiti ? `<p class="hero-debt"><a href="#debiti">Contando anche ${[dt.crediti ? `i crediti (+${fmtEur(dt.crediti)})` : '', dt.debiti ? `i debiti (−${fmtEur(dt.debiti)})` : ''].filter(Boolean).join(' e ')}</a>:
        <b>${fmtEur(round2(tot.tot + dt.netto))}</b></p>` : ''}
    </div>
    ${senza.length ? `<details class="alert"><summary>${senza.length === 1 ? 'Un movimento non ha' : senza.length + ' movimenti non hanno'} il fondo indicato:
      finché non lo scegli, non entrano nei saldi.</summary>
      <div class="mini-list">${senza.slice(0, 30).map((r) => `<a href="#mese/${r.data.y}-${String(r.data.m).padStart(2, '0')}/${r.id}">
        <span>${r.data.d ?? '–'} ${M.MESI_BREVI[r.data.m - 1]}</span><span>${esc(r.data.desc || '(senza descrizione)')}</span>
        <span class="${r.data.tipo}">${r.data.tipo === 'in' ? '+' : '−'}${fmt(r.data.val)}</span></a>`).join('')}</div></details>` : ''}
    ${groups.map((g) => `
      <section class="acc-group">
        <h2><i class="sw ${g}"></i>${M.gruppoNome(g)}<span>${fmtEur(tot.gruppi[g] || 0)}</span></h2>
        <div class="acc-list">${accs.filter((c) => c.data.gruppo === g).map((c) => accCard(c, bal.get(c.id) || 0)).join('')}</div>
      </section>`).join('')}`;
}

function accCard(c, v) {
  const t = c.data.obiettivo;
  let status = '', cls = '', pct = 0, tp = 100;
  if (typeof t === 'number') {
    const diff = round2(v - t);
    pct = t > 0 ? Math.max(0, Math.min(100, (v / t) * 100)) : 100;
    if (diff < -0.005) { status = `Mancano ${fmtEur(-diff)}`; cls = 'below'; }
    else if (diff > 0.005) {
      status = `<b>▲ ${fmtEur(diff)}</b> oltre il target`; cls = 'over';
      tp = v > 0 ? Math.max(0, Math.min(100, (t / v) * 100)) : 100;
    } else status = 'Al target';
  }
  return `<a class="acc ${cls}" href="#conto/${c.id}">
    <span class="acc-name">${esc(c.data.nome)}</span>
    <span class="acc-bal">${fmtEur(v)}</span>
    ${typeof t === 'number' ? `<span class="acc-track"><span style="width:${cls === 'over' ? 100 : pct}%${cls === 'over' ? `;--tp:${tp.toFixed(1)}%` : ''}"></span></span>
      <span class="acc-target">Target ${fmtEur(t)}</span><span class="acc-status">${status}</span>` : ''}
  </a>`;
}

function drawChart() {
  const box = $('#pat-chart', root);
  const inizio = M.cfg().inizio;
  const snaps = M.snapshots().filter((s) => !inizio || s.data.date < inizio);
  const auto = M.serieAuto();
  const groups = groupsIn(new Set(M.accounts(true).map((c) => c.id)));
  const pt = (date, t) => ({ date, label: fmtDateShort(date), parts: groups.map((g) => ({ key: g, cls: g, value: t.gruppi[g] || 0 })) });
  const points = [
    ...snaps.map((s) => pt(s.data.date, M.snapTotals(s))),
    ...auto.map((p) => pt(p.date, M.totaleGruppi(p.bal))),
  ];
  if (points.length < 2) { box.innerHTML = ''; return; }
  box.innerHTML = `<section class="card">
    <h2>Andamento</h2>
    <div class="legend">${groups.map((g) => `<span class="lg ${g}">${M.gruppoNome(g)}</span>`).join('')}</div>
    <div class="chart-box" id="ch-pat"></div>
  </section>`;
  $('#ch-pat', root).innerHTML = C.stackedTime({
    width: Math.floor($('#ch-pat', root).clientWidth || 600), points,
    markers: inizio && snaps.length ? [{ date: inizio, label: 'calcolo automatico' }] : [],
  });
}

function historyHTML() {
  const snaps = M.snapshots();
  if (!snaps.length) return '';
  return `<details class="card history">
    <summary><h2>Rilevazioni storiche</h2><span class="muted">${snaps.length}</span></summary>
    <p class="muted">Le fotografie del patrimonio che segnavi nell'Excel. Restano nel grafico per il periodo prima del calcolo automatico.</p>
    <table class="tbl clickable"><thead><tr><th>Data</th><th class="num">Totale</th><th class="num">Variazione</th></tr></thead><tbody>
    ${snaps.slice().reverse().map((s, i, arr) => {
      const t = M.snapTotals(s).tot;
      const p = arr[i + 1] ? M.snapTotals(arr[i + 1]).tot : null;
      return `<tr data-snap="${s.id}" tabindex="0"><td>${fmtDateShort(s.data.date)}</td>
        <td class="num">${fmt(t)}</td><td class="num ${p == null ? '' : t - p >= 0 ? 'pos' : 'neg'}">${p == null ? '' : fmtSigned(t - p)}</td></tr>`;
    }).join('')}
    </tbody></table></details>`;
}

function bind() {
  root.querySelector('[data-act="trasf"]')?.addEventListener('click', () => transferDialog({ onDone: draw }));
  $$('tr[data-snap]', root).forEach((tr) => {
    const open = () => snapEditor(store.get(tr.dataset.snap));
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  });
}

// Modifica di una rilevazione storica
function snapEditor(snap) {
  const vals = JSON.parse(JSON.stringify(snap.data.vals || {}));
  const conts = M.accounts(true).filter((c) => vals[c.id] || !c.data.archiviato);
  const dlg = modal(`
    <form class="dlg" method="dialog">
      <header class="dlg-head"><h2>Rilevazione del ${fmtDateShort(snap.data.date)}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <label class="field inline"><span>Data</span><input type="date" name="date" value="${snap.data.date}" required></label>
      ${conts.map((c) => `<label class="snap-row"><span>${esc(c.data.nome)}</span>
        <input class="amt" data-c="${c.id}" inputmode="decimal" value="${vals[c.id] ? fmt(vals[c.id].val) : ''}" placeholder="–"></label>`).join('')}
      <p class="snap-total">Totale <b></b></p>
      <div class="actions"><button type="button" class="btn ghost danger" data-del>Elimina</button><span class="spacer"></span>
        <button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button></div>
    </form>`);
  const f = $('form', dlg);
  const total = () => { $('.snap-total b', f).textContent = fmtEur(round2(Object.values(vals).reduce((s, v) => s + (v.val || 0), 0))); };
  total();
  f.addEventListener('focusin', (e) => { const c = e.target.dataset.c; if (c) { e.target.value = vals[c] ? (vals[c].espr || plain(vals[c].val)) : ''; e.target.select(); } });
  f.addEventListener('focusout', (e) => {
    const c = e.target.dataset.c; if (!c) return;
    try { const p = parseAmount(e.target.value); if (p) vals[c] = { val: p.val, espr: p.espr }; else delete vals[c]; } catch (err) { toast(err.message); }
    e.target.value = vals[c] ? fmt(vals[c].val) : ''; total();
  });
  f.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) dlg.close();
    if (e.target.closest('[data-del]')) {
      if (!(await confirmBox('Eliminare questa rilevazione?', { ok: 'Elimina', danger: true }))) return;
      store.remove(snap.id); dlg.close(); draw();
    }
  });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') return;
    document.activeElement?.blur?.();
    store.save('snap', snap.id, { ...snap.data, date: f.date.value, vals });
    draw();
  });
}
