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
          <button class="btn ghost" data-act="rilev">Rilevazione manuale</button>
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
    if (diff < -0.005) {
      status = `<b>▼ ${fmtEur(-diff)}</b> sotto il target`; cls = 'below';
      tp = t > 0 ? Math.max(0, Math.min(100, (v / t) * 100)) : 0;
    }
    else if (diff > 0.005) {
      status = `<b>▲ ${fmtEur(diff)}</b> oltre il target`; cls = 'over';
      tp = v > 0 ? Math.max(0, Math.min(100, (t / v) * 100)) : 100;
    } else status = 'Al target';
  }
  return `<a class="acc ${cls}" href="#conto/${c.id}">
    <span class="acc-name">${esc(c.data.nome)}</span>
    <span class="acc-bal">${fmtEur(v)}</span>
    ${typeof t === 'number' ? `<span class="acc-track"><span style="width:${cls ? 100 : pct}%${cls ? `;--tp:${tp.toFixed(1)}%` : ''}"></span></span>
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
    <p class="muted">Le fotografie del patrimonio: quelle dell'Excel (restano nel grafico per il periodo prima del calcolo automatico) e le rilevazioni manuali che aggiungi tu.</p>
    <table class="tbl clickable"><thead><tr><th>Data</th><th class="num">Totale</th><th class="num">Variazione</th></tr></thead><tbody>
    ${snaps.slice().reverse().map((s, i, arr) => {
      const t = M.snapTotals(s).tot;
      const p = arr[i + 1] ? M.snapTotals(arr[i + 1]).tot : null;
      const tag = s.data.scelta === 'manuale' ? 'saldi allineati alla rilevazione' : s.data.scelta === 'auto' ? 'solo confronto' : '';
      return `<tr data-snap="${s.id}" tabindex="0"><td>${fmtDateShort(s.data.date)}${tag ? `<small class="snap-tag">${tag}</small>` : ''}</td>
        <td class="num">${fmt(t)}</td><td class="num ${p == null ? '' : t - p >= 0 ? 'pos' : 'neg'}">${p == null ? '' : fmtSigned(t - p)}</td></tr>`;
    }).join('')}
    </tbody></table></details>`;
}

function bind() {
  root.querySelector('[data-act="trasf"]')?.addEventListener('click', () => transferDialog({ onDone: draw }));
  root.querySelector('[data-act="rilev"]')?.addEventListener('click', () => snapDialog(null));
  $$('tr[data-snap]', root).forEach((tr) => {
    const open = () => snapDialog(store.get(tr.dataset.snap));
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  });
}

// Rilevazione manuale del portafoglio (nuova o esistente).
// Dal giorno di partenza in poi si confronta con il calcolo automatico e si sceglie quale dei due vale da quel giorno.
function snapDialog(snap) {
  const id = snap ? snap.id : store.newId();
  const vals = JSON.parse(JSON.stringify(snap?.data.vals || {}));
  const conts = M.accounts(true).filter((c) => vals[c.id] || !c.data.archiviato);
  const scelta0 = snap?.data.scelta || 'auto';
  const dlg = modal(`
    <form class="dlg" method="dialog">
      <header class="dlg-head"><h2>${snap ? 'Rilevazione del ' + fmtDateShort(snap.data.date) : 'Rilevazione manuale'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <p class="muted">Scrivi quanto c'è davvero in ogni fondo in un certo giorno. I fondi che lasci vuoti non vengono rilevati.</p>
      <label class="field inline"><span>Data</span><input type="date" name="date" value="${snap?.data.date || M.todayIso()}" required></label>
      ${conts.map((c) => `<div class="snap-item"><label class="snap-row"><span>${esc(c.data.nome)}</span>
        <input class="amt" data-c="${c.id}" inputmode="decimal" value="${vals[c.id] ? fmt(vals[c.id].val) : ''}" placeholder="–"></label>
        <small class="snap-cmp" data-cmp="${c.id}"></small></div>`).join('')}
      <p class="snap-total">Totale <b></b></p>
      <div class="snap-compare" hidden>
        <p class="snap-sum"></p>
        <fieldset class="snap-choice">
          <legend>Da questa data, quale valore vuoi usare?</legend>
          <label class="check"><input type="radio" name="scelta" value="auto"${scelta0 === 'auto' ? ' checked' : ''}>
            <span><b>Il calcolo automatico</b><small>La rilevazione resta come confronto: i saldi non cambiano.</small></span></label>
          <label class="check"><input type="radio" name="scelta" value="manuale"${scelta0 === 'manuale' ? ' checked' : ''}>
            <span><b>La mia rilevazione</b><small>I fondi che hai compilato ripartono dai valori scritti qui: registro una correzione per ogni differenza.</small></span></label>
        </fieldset>
      </div>
      <p class="snap-note muted" hidden></p>
      <div class="actions">${snap ? '<button type="button" class="btn ghost danger" data-del>Elimina</button>' : ''}<span class="spacer"></span>
        <button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button></div>
    </form>`);
  const f = $('form', dlg);
  const signed = (v) => `<span class="${v >= 0 ? 'pos' : 'neg'}">${fmtSigned(v)}</span>`;
  const update = () => {
    const date = f.date.value;
    const conf = M.snapConfrontabile(date);
    const cmp = conf ? M.confrontaRilevazione(date, vals, snap?.id) : null;
    const bal = conf ? M.balances(date, { senzaSnap: snap?.id }) : null;
    for (const c of conts) {
      const inp = f.querySelector(`input[data-c="${c.id}"]`);
      if (document.activeElement !== inp) inp.placeholder = conf ? fmt(bal.get(c.id) || 0) : '–';
      const x = cmp?.righe.find((r) => r.c.id === c.id);
      f.querySelector(`[data-cmp="${c.id}"]`).innerHTML = x ? `Calcolo automatico ${fmtEur(x.auto)} · ${Math.abs(x.diff) < 0.005 ? 'uguale' : signed(x.diff)}` : '';
    }
    $('.snap-total b', f).textContent = fmtEur(round2(Object.values(vals).reduce((t, v) => t + (v.val || 0), 0)));
    const box = $('.snap-compare', f), note = $('.snap-note', f);
    const hasDiff = !!cmp && cmp.righe.some((r) => Math.abs(r.diff) >= 0.005);
    box.hidden = !hasDiff;
    note.hidden = false;
    if (!date) note.hidden = true;
    else if (!M.autoAttivo()) note.textContent = 'Il calcolo automatico non è attivo: la rilevazione viene salvata come fotografia del patrimonio.';
    else if (!conf) note.textContent = `Prima del ${fmtDateShort(M.cfg().inizio)} (data di partenza) non c'è un calcolo automatico con cui confrontare: la rilevazione resta una fotografia storica.`;
    else if (!cmp.righe.length) note.textContent = 'Scrivi i saldi: l\'app li confronta con il calcolo automatico di quel giorno.';
    else if (!hasDiff) note.textContent = 'La rilevazione coincide con il calcolo automatico.';
    else note.hidden = true;
    if (hasDiff) {
      $('.snap-sum', f).innerHTML = `Rilevato <b>${fmtEur(cmp.rilevato)}</b> · calcolo automatico <b>${fmtEur(cmp.auto)}</b> · differenza ${signed(cmp.diff)}` +
        (cmp.righe.length < conts.length ? '<small>Confronto sui soli fondi compilati.</small>' : '');
    }
  };
  update();
  f.date.addEventListener('input', update);
  f.addEventListener('focusin', (e) => { const c = e.target.dataset.c; if (c) { e.target.value = vals[c] ? (vals[c].espr || plain(vals[c].val)) : ''; e.target.select(); } });
  f.addEventListener('focusout', (e) => {
    const c = e.target.dataset.c; if (!c) return;
    try { const p = parseAmount(e.target.value); if (p) vals[c] = { val: p.val, espr: p.espr }; else delete vals[c]; } catch (err) { toast(err.message); }
    e.target.value = vals[c] ? fmt(vals[c].val) : '';
    update();
  });
  f.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) dlg.close();
    if (e.target.closest('[data-del]')) {
      const msg = M.rettsOfSnap(snap.id).length
        ? 'Eliminare questa rilevazione? Verranno tolte anche le correzioni che ha registrato sui saldi.'
        : 'Eliminare questa rilevazione?';
      if (!(await confirmBox(msg, { ok: 'Elimina', danger: true }))) return;
      M.eliminaRilevazione(snap.id); dlg.close(); draw();
    }
  });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') return;
    document.activeElement?.blur?.();
    if (!Object.keys(vals).length) { e.preventDefault(); toast('Scrivi almeno un saldo.'); return; }
    const r = M.salvaRilevazione(id, { date: f.date.value, vals, note: snap?.data.note ?? null, scelta: f.elements.scelta.value });
    toast(r.scelta === 'manuale' && r.ritocchi ? `Saldi allineati alla rilevazione del ${fmtDateShort(f.date.value)}` : 'Rilevazione salvata');
    draw();
  });
}
