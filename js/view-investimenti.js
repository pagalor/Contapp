import * as store from './store.js';
import * as M from './model.js';
import * as C from './charts.js';
import { parseNumber, parseAmount, fmtEur, fmtEur0, fmtSigned, fmtQty, fmtPrice, plain, plainNum, round2 } from './expr.js';
import { esc, $, $$, toast, modal, confirmBox } from './ui.js';

let root;
let page = { id: null }; // id = investimento aperto (null: elenco)
const fmtD = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const pct = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + '%';
const cls = (n) => (n == null || Math.abs(n) < 0.005 ? 'muted' : n > 0 ? 'pos' : 'neg');

export function render(el) { root = el; page = { id: null }; draw(); }
export function renderDetail(el, id) { root = el; page = { id }; draw(); }
export function redraw() { if (root && root.isConnected) draw(); }

function draw() {
  if (page.id) drawDetail(); else drawList();
}

// =============================================================== elenco
function drawList() {
  const { items, tot } = M.invAll();
  const aperte = items.filter((x) => x.pos.aperta);
  const chiuse = items.filter((x) => !x.pos.aperta);
  const tipi = M.INV_TIPI.map(([k]) => k).filter((k) => aperte.some((x) => x.r.data.tipo === k));
  const nuovo = !items.length;
  root.innerHTML = `
    <section class="investimenti">
      <header class="page-head">
        <div><a class="back" href="#patrimonio">Patrimonio</a><h1>Investimenti</h1></div>
        <div class="btn-row">
          ${aperte.length ? '<button class="btn ghost" data-act="prezzi">Aggiorna i prezzi</button>' : ''}
          <button class="btn ${nuovo ? 'primary' : ''}" data-act="new">Nuovo</button>
        </div>
      </header>
      ${nuovo ? `<div class="empty-hint"><p>Qui tieni traccia di ETF, azioni, obbligazioni, crypto e di tutto ciò che hai investito.
        Per ognuno registri gli acquisti, le vendite e i dividendi; il prezzo attuale lo aggiorni tu quando vuoi.
        L'app calcola quanto vale, quanto hai speso e quanto stai guadagnando o perdendo, e lo somma al patrimonio.</p></div>` : `
      <dl class="stats stats-main">
        <div><dt>Valore attuale</dt><dd>${fmtEur(tot.valore)}</dd></div>
        <div><dt>Hai investito</dt><dd>${fmtEur(tot.costo)}</dd></div>
        <div><dt>Utile o perdita</dt><dd class="${cls(tot.utile)}">${fmtSigned(tot.utile)}${tot.utilePct != null ? ` <small>${pct(tot.utilePct)}</small>` : ''}</dd></div>
      </dl>
      ${tot.realizzato || tot.dividendi ? `<dl class="stats stats-sub">
        <div><dt>Già incassato con le vendite</dt><dd class="${cls(tot.realizzato)}">${fmtSigned(tot.realizzato)}</dd></div>
        <div><dt>Dividendi e cedole</dt><dd class="${cls(tot.dividendi)}">${fmtSigned(tot.dividendi)}</dd></div>
      </dl>` : ''}
      ${allocHTML(tot)}
      ${tipi.map((k) => groupHTML(k, aperte.filter((x) => x.r.data.tipo === k), tot)).join('')}
      ${chiuse.length ? `<details class="card history">
        <summary><h2>Posizioni chiuse</h2><span class="muted">${chiuse.length}</span></summary>
        <div class="inv-list flat">${chiuse.map(({ r, pos }) => rowHTML(r, pos, true)).join('')}</div>
      </details>` : ''}`}
    </section>`;
  bindList();
}

function allocHTML(tot) {
  const slices = M.INV_TIPI.map(([k, nome, color]) => ({ label: nome, value: tot.perTipo.get(k) || 0, color })).filter((s) => s.value > 0);
  if (slices.length < 2) return '';
  const somma = slices.reduce((s, x) => s + x.value, 0);
  return `<section class="card">
    <h2>Come sono ripartiti</h2>
    <div class="inv-alloc">
      <div class="pie">${C.donut({ size: 170, slices, center: fmtEur0(somma) })}</div>
      <ul class="inv-legend">${slices.map((s) => `<li><span><i class="sw" style="background:${s.color}"></i>${esc(s.label)}</span>
        <b>${fmtEur(s.value)}</b><small>${(s.value / somma * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</small></li>`).join('')}</ul>
    </div>
  </section>`;
}

function groupHTML(k, list, tot) {
  return `<section class="inv-group">
    <h2><i class="sw" style="background:${M.invTipoColore(k)}"></i>${esc(M.invTipoNome(k))}<span>${fmtEur(tot.perTipo.get(k) || 0)}</span></h2>
    <div class="inv-list">${list.map(({ r, pos }) => rowHTML(r, pos)).join('')}</div>
  </section>`;
}

function rowHTML(r, pos, chiusa = false) {
  const d = r.data;
  return `<a class="inv-row" href="#investimento/${r.id}">
    <span class="inv-name">${esc(d.nome)}${d.ticker ? ` <small class="tk">${esc(d.ticker)}</small>` : ''}
      <small>${chiusa ? 'Venduto tutto' : `${fmtQty(pos.qta)} × ${pos.prezzo != null ? fmtPrice(pos.prezzo) + ' €' : 'prezzo mancante'}`}</small></span>
    <span class="inv-val">${chiusa ? `<span class="${cls(pos.realizzato)}">${fmtSigned(pos.realizzato)}</span>` : pos.valore == null ? '–' : fmtEur(pos.valore)}
      ${!chiusa && pos.utile != null ? `<small class="${cls(pos.utile)}">${fmtSigned(pos.utile)}${pos.utilePct != null ? ' · ' + pct(pos.utilePct) : ''}</small>` : ''}</span>
  </a>`;
}

function bindList() {
  $('[data-act="new"]', root).onclick = () => editor(null);
  $('[data-act="prezzi"]', root)?.addEventListener('click', pricesDialog);
}

// =============================================================== dettaglio
function drawDetail() {
  const r = store.get(page.id);
  if (!r) { root.innerHTML = '<div class="empty-hint"><p>Questo investimento non esiste più.</p><a class="btn ghost" href="#investimenti">Torna agli investimenti</a></div>'; return; }
  const d = r.data;
  const ops = M.invOps(r.id);
  const pos = M.invPos(r, ops);
  const auto = M.autoAttivo();
  root.innerHTML = `
    <section class="investimento">
      <header class="page-head">
        <div><a class="back" href="#investimenti">Investimenti</a>
          <h1>${esc(d.nome)}</h1>
          <p class="muted inv-sub">${esc(M.invTipoNome(d.tipo))}${d.ticker ? ' · ' + esc(d.ticker) : ''}</p></div>
        <button class="btn ghost" data-act="edit">Modifica</button>
      </header>
      <div class="hero">
        <p class="hero-label">Valore attuale</p>
        <p class="hero-num">${pos.valore == null ? '–' : fmtEur(pos.valore)}</p>
        ${pos.utile != null && pos.aperta ? `<p class="hero-sub"><span class="${cls(pos.utile)}">${fmtSigned(pos.utile)}${pos.utilePct != null ? ' (' + pct(pos.utilePct) + ')' : ''}</span> rispetto a quanto hai speso</p>`
          : !pos.aperta && ops.length ? '<p class="hero-sub">Non ne hai più.</p>' : '<p class="hero-sub">Registra un acquisto per cominciare.</p>'}
        <dl class="hero-split">
          <div><dt>Quantità</dt><dd>${fmtQty(pos.qta)}</dd></div>
          <div><dt>Prezzo medio d'acquisto</dt><dd>${pos.pmc == null ? '–' : fmtPrice(Math.round(pos.pmc * 1e4) / 1e4) + ' €'}</dd></div>
          <div><dt>Prezzo attuale${d.prezzoData ? ` <small>(${fmtD(d.prezzoData)})</small>` : ''}</dt><dd>${pos.prezzo == null ? '–' : fmtPrice(pos.prezzo) + ' €'}</dd></div>
          <div><dt>Hai speso</dt><dd>${fmtEur(pos.costo)}</dd></div>
          ${pos.realizzato ? `<div><dt>Incassato con le vendite</dt><dd class="${cls(pos.realizzato)}">${fmtSigned(pos.realizzato)}</dd></div>` : ''}
          ${pos.dividendi ? `<div><dt>Dividendi e cedole</dt><dd class="pos">${fmtSigned(pos.dividendi)}</dd></div>` : ''}
        </dl>
        <div class="btn-row">
          <button class="btn primary small" data-op="acq">Acquisto</button>
          <button class="btn small" data-op="vend">Vendita</button>
          <button class="btn small" data-op="div">Dividendo o cedola</button>
          <button class="btn small ghost" data-act="prezzo">Aggiorna il prezzo</button>
        </div>
      </div>
      ${pos.eccesso ? '<p class="alert-line">Le vendite registrate superano la quantità acquistata: controlla le operazioni.</p>' : ''}
      ${d.note ? `<p class="muted inv-note">${esc(d.note)}</p>` : ''}
      <section class="card">
        <h2>Operazioni</h2>
        ${ops.length ? `<div class="acc-ledger">${ops.slice().reverse().map((o) => opRow(o, auto)).join('')}</div>`
          : '<p class="muted">Ancora nessuna operazione.</p>'}
      </section>
    </section>`;
  $('[data-act="edit"]', root).onclick = () => editor(r);
  $('[data-act="prezzo"]', root).onclick = () => priceDialog(r);
  $$('[data-op]', root).forEach((b) => b.addEventListener('click', () => opDialog(r, null, b.dataset.op)));
  $$('[data-opid]', root).forEach((b) => b.addEventListener('click', () => opDialog(r, store.get(b.dataset.opid))));
}

const OP_NOME = { acq: 'Acquisto', vend: 'Vendita', div: 'Dividendo o cedola' };

function opRow(o, auto) {
  const d = o.data;
  const v = M.invOpVal(o);
  return `<button class="al-row inv-op" data-opid="${o.id}">
    <span class="al-date">${fmtD(d.data)}</span>
    <span class="al-desc">${OP_NOME[d.tipo]}${d.tipo === 'div' ? '' : `<small>${fmtQty(d.qta)} × ${fmtPrice(d.prezzo)} €${d.comm ? ` · commissioni ${fmtEur(d.comm)}` : ''}</small>`}${
      d.fondo && auto ? `<small>${d.tipo === 'acq' ? 'Pagato con' : 'Ricevuto su'} ${esc(M.accName(d.fondo))}</small>` : ''}${d.note ? `<small>${esc(d.note)}</small>` : ''}</span>
    <span class="al-val ${d.tipo === 'acq' ? 'out' : 'in'}">${v == null ? '–' : fmtSigned(v)}</span>
  </button>`;
}

// =============================================================== nuovo investimento / modifica
function editor(rec) {
  const isNew = !rec;
  const d = rec ? rec.data : { nome: '', ticker: '', tipo: 'etf', prezzo: null, prezzoData: null, note: '' };
  const dlg = modal(`
    <form class="dlg" method="dialog">
      <header class="dlg-head"><h2>${isNew ? 'Nuovo investimento' : 'Modifica investimento'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <div class="form-grid">
        <label class="field"><span>Nome</span><input name="nome" value="${esc(d.nome)}" placeholder="es. Vanguard FTSE All-World" required autocomplete="off"></label>
        <label class="field"><span>Sigla o codice (facoltativo)</span><input name="ticker" value="${esc(d.ticker || '')}" placeholder="es. VWCE" autocomplete="off"></label>
        <label class="field"><span>Di che tipo è</span><select name="tipo">${M.INV_TIPI.map(([k, n]) => `<option value="${k}"${k === d.tipo ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>Prezzo attuale (per unità)</span><input name="prezzo" class="amt" inputmode="decimal" value="${plainNum(d.prezzo)}" placeholder="–"></label>
      </div>
      ${isNew ? `<fieldset class="inv-start">
        <legend>Quello che hai già (facoltativo)</legend>
        <p class="muted small-note">Se lo possiedi da prima, indica quanto ne hai e a che prezzo medio lo hai pagato. Poi registrerai solo le novità.</p>
        <div class="form-grid">
          <label class="field"><span>Quantità</span><input name="qta" class="amt" inputmode="decimal" placeholder="es. 12,5"></label>
          <label class="field"><span>Prezzo medio d'acquisto</span><input name="carico" class="amt" inputmode="decimal" placeholder="per unità"></label>
        </div>
      </fieldset>` : ''}
      <label class="field"><span>Nota</span><input name="note" value="${esc(d.note || '')}" autocomplete="off"></label>
      <div class="actions">
        ${isNew ? '' : '<button type="button" class="btn ghost danger" data-del>Elimina</button><span class="spacer"></span>'}
        <button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button>
      </div>
    </form>`, { wide: true });
  const f = $('form', dlg);
  f.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) dlg.close();
    if (e.target.closest('[data-del]')) {
      if (!(await confirmBox('Eliminare questo investimento e tutte le sue operazioni?', { ok: 'Elimina', danger: true }))) return;
      const ops = M.invOps(rec.id);
      const prev = { inv: rec.data, ops: ops.map((o) => [o.id, o.data]) };
      ops.forEach((o) => store.remove(o.id));
      store.remove(rec.id);
      dlg.close();
      location.hash = '#investimenti';
      toast('Investimento eliminato', { action: 'Annulla', onAction: () => {
        store.save('inv', rec.id, prev.inv); prev.ops.forEach(([id, data]) => store.save('invop', id, data)); redraw();
      } });
    }
  });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') return;
    let prezzo, qta, carico;
    try { prezzo = parseNumber(f.prezzo.value); qta = f.qta ? parseNumber(f.qta.value) : null; carico = f.carico ? parseNumber(f.carico.value) : null; }
    catch (err) { e.preventDefault(); toast(err.message); return; }
    if (!f.nome.value.trim()) { e.preventDefault(); toast('Indica il nome.'); return; }
    if ((prezzo != null && prezzo < 0) || (qta != null && qta < 0) || (carico != null && carico < 0)) { e.preventDefault(); toast('Quantità e prezzi non possono essere negativi.'); return; }
    if (qta > 0 && carico == null) { e.preventDefault(); toast("Indica anche a che prezzo medio l'hai pagato (anche una stima)."); return; }
    const today = M.todayIso();
    const data = {
      ...d, nome: f.nome.value.trim(), ticker: f.ticker.value.trim(), tipo: f.tipo.value, note: f.note.value.trim(),
      prezzo: prezzo ?? (isNew && qta > 0 ? carico : null),
      prezzoData: prezzo != null ? (prezzo === d.prezzo ? d.prezzoData : today) : isNew && qta > 0 ? today : null,
      ord: isNew ? Date.now() : d.ord,
    };
    const id = rec ? rec.id : store.newId();
    store.save('inv', id, data);
    if (isNew && qta > 0) {
      store.save('invop', store.newId(), { inv: id, data: today, tipo: 'acq', qta, prezzo: carico, comm: 0, val: null, fondo: '', note: 'Quanto già posseduto', ord: Date.now() });
    }
    toast(isNew ? 'Investimento aggiunto' : 'Aggiornato');
    if (isNew) location.hash = '#investimento/' + id; else draw();
  });
}

// =============================================================== prezzi
function savePrice(r, prezzo) {
  store.patch(r.id, { prezzo, prezzoData: M.todayIso() });
}

function priceDialog(r) {
  const dlg = modal(`
    <form class="dlg" method="dialog">
      <header class="dlg-head"><h2>Prezzo di ${esc(r.data.nome)}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <label class="field"><span>Prezzo attuale per unità</span><input name="prezzo" class="amt" inputmode="decimal" value="${plainNum(r.data.prezzo)}" required></label>
      <div class="actions"><button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button></div>
    </form>`);
  const f = $('form', dlg);
  f.prezzo.focus(); f.prezzo.select();
  f.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) dlg.close(); });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') return;
    let p;
    try { p = parseNumber(f.prezzo.value); } catch (err) { e.preventDefault(); toast(err.message); return; }
    if (p == null || p < 0) { e.preventDefault(); toast('Indica il prezzo.'); return; }
    savePrice(r, p);
    toast('Prezzo aggiornato');
    draw();
  });
}

// Tutti i prezzi in una volta
function pricesDialog() {
  const aperte = M.invAll().items.filter((x) => x.pos.aperta);
  const dlg = modal(`
    <form class="dlg" method="dialog">
      <header class="dlg-head"><h2>Aggiorna i prezzi</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <p class="muted">Scrivi il prezzo di oggi per unità. Quelli che non cambi restano come sono.</p>
      ${aperte.map(({ r, pos }) => `<label class="snap-row"><span>${esc(r.data.nome)}${r.data.ticker ? ` <small class="muted">${esc(r.data.ticker)}</small>` : ''}
        ${r.data.prezzoData ? `<small class="muted block">aggiornato il ${fmtD(r.data.prezzoData)}</small>` : ''}</span>
        <input class="amt" data-id="${r.id}" inputmode="decimal" value="${plainNum(pos.prezzo)}" placeholder="–"></label>`).join('')}
      <div class="actions"><button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button></div>
    </form>`);
  const f = $('form', dlg);
  f.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) dlg.close(); });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') return;
    const changes = [];
    for (const inp of $$('input[data-id]', f)) {
      const x = aperte.find((a) => a.r.id === inp.dataset.id);
      let p;
      try { p = parseNumber(inp.value); } catch (err) { e.preventDefault(); toast(`${x.r.data.nome}: ${err.message}`); return; }
      if (p != null && p >= 0 && p !== x.pos.prezzo) changes.push([x.r, p]);
    }
    changes.forEach(([r, p]) => savePrice(r, p));
    toast(changes.length ? 'Prezzi aggiornati' : 'Nessun prezzo cambiato');
    draw();
  });
}

// =============================================================== operazioni
function opDialog(r, rec, tipoNuovo) {
  const isNew = !rec;
  const ops = M.invOps(r.id);
  const last = ops[ops.length - 1];
  const auto = M.autoAttivo();
  const d = rec ? rec.data : {
    inv: r.id, data: M.todayIso(), tipo: tipoNuovo, qta: null, prezzo: tipoNuovo !== 'div' ? r.data.prezzo : null, comm: null, val: null,
    fondo: last?.data.fondo || '', note: '', ord: Date.now(),
  };
  const fondoOptions = (sel) => '<option value="">Nessuno (non tocca i fondi)</option>' +
    M.accounts().map((c) => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.data.nome)}</option>`).join('');
  let tipo = d.tipo;
  const dlg = modal(`
    <form class="dlg" method="dialog">
      <header class="dlg-head"><h2>${isNew ? 'Nuova operazione' : 'Operazione'}: ${esc(r.data.nome)}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <div class="seg wide" role="group">
        ${Object.entries(OP_NOME).map(([k, n]) => `<button type="button" data-tipo="${k}" aria-pressed="${k === tipo}">${n}</button>`).join('')}
      </div>
      <div class="form-grid">
        <label class="field"><span>Data</span><input type="date" name="data" value="${d.data}" required></label>
        <label class="field" data-for="acq vend"><span>Quantità</span><input name="qta" class="amt" inputmode="decimal" value="${plainNum(d.qta)}"></label>
        <label class="field" data-for="acq vend"><span>Prezzo per unità</span><input name="prezzo" class="amt" inputmode="decimal" value="${plainNum(d.prezzo)}"></label>
        <label class="field" data-for="acq vend"><span>Commissioni e tasse</span><input name="comm" class="amt" inputmode="decimal" value="${d.comm ? plain(d.comm) : ''}" placeholder="0"></label>
        <label class="field" data-for="div"><span>Importo ricevuto</span><input name="val" class="amt" inputmode="decimal" value="${d.val == null ? '' : plain(d.val)}"></label>
      </div>
      <p class="snap-total" data-for="acq vend">Totale <b data-tot></b></p>
      ${auto ? `<label class="field"><span data-fondo-label></span><select name="fondo">${fondoOptions(d.fondo)}</select></label>
      <p class="muted small-note">Se i soldi sono usciti o entrati davvero da un tuo fondo, sceglilo: il saldo si aggiorna senza contarlo come spesa o entrata.</p>` : ''}
      <label class="field"><span>Nota</span><input name="note" value="${esc(d.note || '')}" autocomplete="off"></label>
      <div class="actions">
        ${isNew ? '' : '<button type="button" class="btn ghost danger" data-del>Elimina</button><span class="spacer"></span>'}
        <button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button>
      </div>
    </form>`, { wide: true });
  const f = $('form', dlg);
  const num = (name) => { try { return parseNumber(f[name].value); } catch { return NaN; } };
  function paint() {
    $$('[data-tipo]', f).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tipo === tipo)));
    $$('[data-for]', f).forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(tipo); });
    const lab = $('[data-fondo-label]', f);
    if (lab) lab.textContent = tipo === 'acq' ? 'Pagato con' : 'Ricevuto su';
    const q = num('qta'), p = num('prezzo'), c = num('comm') || 0;
    const tot = $('[data-tot]', f);
    tot.textContent = q > 0 && p >= 0 ? fmtEur(round2(tipo === 'acq' ? q * p + c : q * p - c)) : '–';
  }
  paint();
  f.addEventListener('input', paint);
  f.addEventListener('click', async (e) => {
    const tb = e.target.closest('[data-tipo]');
    if (tb) { tipo = tb.dataset.tipo; paint(); }
    if (e.target.closest('[data-x]')) dlg.close();
    if (e.target.closest('[data-del]')) {
      if (!(await confirmBox('Eliminare questa operazione?', { ok: 'Elimina', danger: true }))) return;
      store.remove(rec.id); dlg.close(); draw();
      toast('Operazione eliminata', { action: 'Annulla', onAction: () => { store.save('invop', rec.id, rec.data); draw(); } });
    }
  });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') return;
    const fail = (msg) => { e.preventDefault(); toast(msg); };
    let qta, prezzo, val, comm;
    try { qta = parseNumber(f.qta.value); prezzo = parseNumber(f.prezzo.value); comm = parseAmount(f.comm.value)?.val ?? 0; val = parseAmount(f.val.value)?.val ?? null; }
    catch (err) { return fail(err.message); }
    if (!f.data.value) return fail('Indica la data.');
    if (tipo === 'div') {
      if (!(val > 0)) return fail('Indica quanto hai ricevuto.');
    } else {
      if (!(qta > 0)) return fail('Indica la quantità.');
      if (prezzo == null || prezzo < 0) return fail('Indica il prezzo per unità.');
      if (comm < 0) return fail('Le commissioni non possono essere negative.');
    }
    const data = {
      inv: r.id, data: f.data.value, tipo, ord: d.ord,
      qta: tipo === 'div' ? null : qta, prezzo: tipo === 'div' ? null : prezzo, comm: tipo === 'div' ? 0 : comm,
      val: tipo === 'div' ? val : null, fondo: f.fondo ? f.fondo.value : d.fondo || '', note: f.note.value.trim(),
    };
    const id = rec ? rec.id : store.newId();
    // non si può vendere più di quanto si possiede
    const altre = ops.filter((o) => o.id !== id).concat([{ id, data }])
      .sort((a, b) => a.data.data.localeCompare(b.data.data) || (a.data.ord ?? 0) - (b.data.ord ?? 0));
    const sim = M.invPos(r, altre);
    if (sim.eccesso) return fail('Con questa vendita risulterebbero venduti più pezzi di quelli che avevi in quel giorno.');
    store.save('invop', id, data);
    // l'ultimo prezzo conosciuto diventa il prezzo attuale, se non c'è già uno più recente
    if (tipo !== 'div' && (typeof r.data.prezzo !== 'number' || !r.data.prezzoData || data.data >= r.data.prezzoData)) {
      store.patch(r.id, { prezzo, prezzoData: data.data });
    }
    toast(isNew ? 'Operazione registrata' : 'Aggiornata');
    draw();
  });
}
