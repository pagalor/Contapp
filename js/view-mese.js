import * as store from './store.js';
import * as M from './model.js';
import { parseAmount, fmt, fmtEur, fmtSigned, plain } from './expr.js';
import { esc, $, $$, toast, confirmBox, promptBox, debounce } from './ui.js';
import { catBars, toggleCat } from './catstats.js';
import { splitEditor, transferDialog, tagEditorHTML, tagsDatalist, ricDialog, ricSeedFromMov, movDialog } from './dialogs.js';

let state = { y: 0, m: 0, q: '' };
let root = null;

const daysIn = (y, m) => new Date(y, m, 0).getDate();
const today = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }; };
const ymHash = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const MODE_KEY = 'contabilita.meseView';
const mode = () => { try { return localStorage.getItem(MODE_KEY) === 'cal' ? 'cal' : 'lista'; } catch { return 'lista'; } };
const setMode = (m) => { try { localStorage.setItem(MODE_KEY, m); } catch {} };
let selDay = null;

export function render(el, { y, m, q = '', highlight } = {}) {
  root = el;
  const t = today();
  state = { y: y || t.y, m: m || t.m, q };
  selDay = state.y === t.y && state.m === t.m ? t.d : null;
  if (highlight && mode() === 'cal') setMode('lista');
  const isNow = state.y === t.y && state.m === t.m;
  el.innerHTML = `
    <section class="mese">
      <header class="mese-head">
        <div class="mese-nav">
          <button class="icon-btn" data-act="prev" aria-label="Mese precedente">${chevron('l')}</button>
          <button class="mese-title" data-act="pick" aria-label="Scegli il mese">${M.MESI[state.m - 1]} <span>${state.y}</span></button>
          <input type="month" class="month-picker" value="${ymHash(state.y, state.m)}" tabindex="-1" aria-hidden="true">
          <button class="icon-btn" data-act="next" aria-label="Mese successivo">${chevron('r')}</button>
          ${isNow ? '' : '<button class="btn ghost small" data-act="oggi">Oggi</button>'}
        </div>
        <dl class="sums" id="sums"></dl>
      </header>
      <div class="toolbar">
        <div class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
          <input type="search" id="q" placeholder="Cerca in tutti i movimenti, oppure #tag" value="${esc(q)}" autocomplete="off">
        </div>
        <div class="seg" role="group" aria-label="Visualizzazione">
          <button data-mode="lista" aria-pressed="${mode() === 'lista'}">Elenco</button>
          <button data-mode="cal" aria-pressed="${mode() === 'cal'}">Calendario</button>
        </div>
      </div>
      <div id="alerts"></div>
      <div id="mese-body"></div>
    </section>
    <datalist id="dl-in">${M.frequentDescs('in').map((d) => `<option value="${esc(d)}">`).join('')}</datalist>
    <datalist id="dl-out">${M.frequentDescs('out').map((d) => `<option value="${esc(d)}">`).join('')}</datalist>
    ${tagsDatalist()}`;
  bindHead();
  bindBody($('#mese-body', root)); // una sola volta per pagina: renderBody cambia solo il contenuto
  renderBody(highlight);
}

function chevron(dir) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="${dir === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function go(y, m) { location.hash = `#mese/${ymHash(y, m)}`; }

function bindHead() {
  root.querySelector('.mese-nav').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    let { y, m } = state;
    if (act === 'prev') { m--; if (m < 1) { m = 12; y--; } go(y, m); }
    if (act === 'next') { m++; if (m > 12) { m = 1; y++; } go(y, m); }
    if (act === 'oggi') { const t = today(); go(t.y, t.m); }
    if (act === 'pick') {
      const p = $('.month-picker', root);
      if (p.showPicker) { try { p.showPicker(); return; } catch {} }
      p.focus(); p.click();
    }
  });
  $('.month-picker', root).addEventListener('change', (e) => {
    const [y, m] = e.target.value.split('-').map(Number);
    if (y && m) go(y, m);
  });
  root.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    setMode(b.dataset.mode);
    $$('.seg [data-mode]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderBody();
  });
  const q = $('#q', root);
  q.addEventListener('input', debounce(() => { state.q = q.value.trim(); renderBody(); }, 180));
}

// ---------------------------------------------------------------- corpo
export function renderBody(highlight) {
  const body = $('#mese-body', root);
  if (!body) return;
  renderAlerts();
  if (state.q.length >= 2) { renderSearch(body); updateSums(); return; }
  if (mode() === 'cal') { renderCalendar(body); updateSums(); return; }
  const list = M.movsOf(state.y, state.m);
  const ins = list.filter((r) => r.data.tipo === 'in');
  const outs = list.filter((r) => r.data.tipo === 'out');
  const trs = M.trasfOf(state.y, state.m);
  body.innerHTML = `
    ${store.isEmpty() ? `<div class="empty-hint">
        <p>Non ci sono ancora movimenti. Puoi iniziare a scriverli qui sotto, oppure importare il tuo storico.</p>
        <a class="btn primary" href="#altro">Importa lo storico</a></div>` : ''}
    ${ledger('in', 'Entrate', ins)}
    ${ledger('out', 'Uscite', outs)}
    ${M.autoAttivo() || trs.length ? transfers(trs) : ''}
    <section class="card"><h2>Uscite per categoria</h2><div id="mese-cat-out"></div></section>
    <section class="card"><h2>Entrate per categoria</h2><div id="mese-cat-in"></div></section>`;
  updateSums();
  if (highlight) {
    const row = body.querySelector(`[data-id="${CSS.escape(highlight)}"]`);
    if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1800); }
  }
}

function renderAlerts() {
  const box = $('#alerts', root);
  if (!box) return;
  const sotto = M.sottoTarget();
  const senza = M.senzaConto().filter((r) => r.data.y === state.y && r.data.m === state.m);
  let html = '';
  if (sotto.length) {
    html += `<div class="alert warn"><span>${sotto.length === 1 ? 'Sotto il target' : sotto.length + ' fondi sotto il target'}:</span>
      <span class="alert-items">${sotto.map((s) => `<button class="pill" data-reint="${s.c.id}" data-val="${s.manca}"
        title="Reintegra ${esc(s.c.data.nome)}">${esc(s.c.data.nome)} <b>−${fmt(s.manca)}</b></button>`).join('')}</span></div>`;
  }
  if (senza.length && state.q.length < 2) {
    html += `<div class="alert"><span>${senza.length === 1 ? 'Un movimento' : senza.length + ' movimenti'} di questo mese non ${senza.length === 1 ? 'indica' : 'indicano'} il fondo:
      scegli da dove sono passati i soldi per tenere aggiornato il patrimonio.</span></div>`;
  }
  box.innerHTML = html;
  $$('[data-reint]', box).forEach((b) => b.addEventListener('click', () =>
    transferDialog({ a: b.dataset.reint, val: Number(b.dataset.val), onDone: () => renderBody() })));
}

function ledger(tipo, title, list) {
  return `
    <section class="ledger ${tipo}" data-tipo="${tipo}">
      <h2><span>${title}</span><span class="ledger-tot" data-tot="${tipo}"></span></h2>
      <div class="cols" aria-hidden="true"><span>Giorno</span><span>Importo</span><span>Descrizione</span><span>Categoria</span><span>${tipo === 'in' ? 'Ricevuto su' : 'Pagato con'}</span><span></span></div>
      <div class="rows">${list.map(rowHTML).join('')}</div>
      <button class="add-row" data-add="${tipo}">+ Aggiungi ${tipo === 'in' ? 'entrata' : 'uscita'}</button>
    </section>`;
}

function catOptions(tipo, sel) {
  return M.cats(tipo).map((c) => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(M.catLabel(c))}</option>`).join('') +
    (sel && !M.catById(sel) ? '<option value="" selected>(categoria eliminata)</option>' : '');
}

function accOptions(r) {
  const conti = r.data.conti || [];
  const single = conti.length === 1 ? conti[0].c : null;
  const list = M.accounts();
  const inizio = M.cfg().inizio;
  const serve = inizio && M.recDate(r) > inizio;
  let html = `<option value=""${conti.length ? '' : ' selected'}>${serve ? 'Scegli il fondo' : '—'}</option>`;
  html += list.map((c) => `<option value="${c.id}"${c.id === single ? ' selected' : ''}>${esc(c.data.nome)}</option>`).join('');
  if (single && !list.some((c) => c.id === single)) html += `<option value="${single}" selected>${esc(M.accName(single))}</option>`;
  if (conti.length > 1) html += `<option value="__split" selected>${esc(M.contiLabel(r))}</option>`;
  html += `<option value="__new">${conti.length > 1 ? 'Modifica ripartizione…' : 'Dividi tra più fondi…'}</option>`;
  return html;
}

function rowFlags(r) {
  const d = r.data;
  const inizio = M.cfg().inizio;
  const needAcc = inizio && M.recDate(r) > inizio && typeof d.val === 'number' && !M.allocations(r).length;
  return (d.note ? ' has-note' : '') + (d.escl ? ' excluded' : '') + (d.espr ? ' has-expr' : '') +
    (needAcc ? ' no-acc' : '') + (M.splitMismatch(r) ? ' split-ko' : '') + (d.tags?.length || d.ricId ? ' has-tags' : '');
}

function tagLine(d) {
  return (d.ricId ? '<a class="tag ric" href="#ricorrenti" title="Aggiunto in automatico da un movimento ricorrente">↻ Ricorrente</a>' : '') + (d.tags || []).map((t) => `<a class="tag" href="#tag/${encodeURIComponent(t)}">#${esc(t)}</a>`).join('');
}

function rowHTML(r) {
  const d = r.data;
  const cat = M.catById(d.cat);
  return `
    <div class="row${rowFlags(r)}" data-id="${r.id}" style="--cat:${cat?.data.colore || 'transparent'}">
      <input class="c-day" data-f="d" inputmode="numeric" maxlength="2" placeholder="–" value="${d.d ?? ''}" aria-label="Giorno">
      <input class="c-amt" data-f="amt" inputmode="decimal" autocomplete="off" value="${fmt(d.val)}" aria-label="Importo" title="${esc(d.espr || '')}">
      <input class="c-desc" data-f="desc" list="dl-${d.tipo}" autocomplete="off" value="${esc(d.desc)}" placeholder="Descrizione" aria-label="Descrizione">
      <span class="c-cat"><i></i><select data-f="cat" aria-label="Categoria">${catOptions(d.tipo, d.cat)}</select></span>
      <span class="c-acc"><select data-f="acc" aria-label="${d.tipo === 'in' ? 'Ricevuto su' : 'Pagato con'}">${accOptions(r)}</select></span>
      <button class="c-more" data-act="more" aria-label="Dettagli" aria-expanded="false">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
      </button>
      <div class="tagline">${tagLine(d)}</div>
      <div class="opkeys" aria-hidden="true">
        ${['+', '−', '×', '÷', '(', ')'].map((k) => `<button type="button" tabindex="-1" data-op="${k}">${k}</button>`).join('')}
      </div>
      <div class="details" hidden></div>
    </div>`;
}

function detailsHTML(r) {
  const d = r.data;
  const mism = M.splitMismatch(r);
  return `
    ${mism ? `<p class="warn-text">La ripartizione sui conti non torna con l'importo: differenza di ${fmtEur(Math.abs(mism))}.
      <button class="link-btn" data-act="split">Correggi</button></p>` : ''}
    <label class="field"><span>Tag</span>${tagEditorHTML(d.tags || [])}</label>
    <label class="field"><span>Nota</span><textarea data-f="note" rows="2">${esc(d.note || '')}</textarea></label>
    <label class="check"><input type="checkbox" data-f="escl"${d.escl ? ' checked' : ''}> Escludi dai totali di entrate e uscite (es. entrate straordinarie)</label>
    <div class="detail-actions">
      <button class="btn ghost small" data-act="dup">Duplica</button>
      ${d.ricId || typeof d.val !== 'number' ? '' : '<button class="btn ghost small" data-act="ric">Rendi ricorrente</button>'}
      <label class="btn ghost small move">Sposta in un altro mese<input type="month" data-act="move" value="${ymHash(d.y, d.m)}"></label>
      <button class="btn ghost small danger" data-act="del">Elimina</button>
    </div>`;
}

function replaceRow(id, open = false) {
  const old = root.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
  const r = store.get(id);
  if (!old || !r || !old.parentNode) return;
  old.outerHTML = rowHTML(r);
  if (open) toggleDetails(root.querySelector(`.row[data-id="${CSS.escape(id)}"]`), true);
}

function toggleDetails(row, force) {
  const det = $('.details', row);
  const open = force ?? det.hidden;
  if (open) det.innerHTML = detailsHTML(store.get(row.dataset.id));
  det.hidden = !open;
  $('[data-act="more"]', row).setAttribute('aria-expanded', String(open));
  row.classList.toggle('open', open);
}

function transfers(list) {
  return `
    <section class="ledger trasf">
      <h2><span>Trasferimenti tra fondi</span><span class="ledger-hint">non contano come entrate o uscite</span></h2>
      <div class="rows">${list.map((r) => `
        <button class="trow" data-trasf="${r.id}">
          <span class="c-day">${r.data.d ?? '–'}</span>
          <span class="t-amt">${fmt(r.data.val)}</span>
          <span class="t-path">${esc(M.accName(r.data.da))} <span class="muted">verso</span> ${esc(M.accName(r.data.a))}${r.data.note ? `<small>${esc(r.data.note)}</small>` : ''}</span>
        </button>`).join('')}</div>
      <button class="add-row" data-addtr>+ Aggiungi trasferimento</button>
    </section>`;
}

function updateSums() {
  const s = M.sums(M.movsOf(state.y, state.m));
  const el = $('#sums', root);
  if (el) {
    el.innerHTML = `
      <div><dt>Entrate</dt><dd class="in">${fmtEur(s.tin)}</dd></div>
      <div><dt>Uscite</dt><dd class="out">${fmtEur(s.tout)}</dd></div>
      <div class="saldo"><dt>Saldo</dt><dd>${fmtSigned(s.saldo)}</dd></div>`;
  }
  for (const t of ['in', 'out']) {
    const e = root.querySelector(`[data-tot="${t}"]`);
    if (e) e.textContent = fmtEur(t === 'in' ? s.tin : s.tout);
  }
  updateCats();
}

// Torte per categoria in fondo all'elenco: si aggiornano a ogni modifica, ricordando i dettagli aperti.
function updateCats() {
  const list = M.movsOf(state.y, state.m);
  for (const t of ['out', 'in']) {
    const box = root.querySelector(`#mese-cat-${t}`);
    if (!box) continue;
    const aperte = [...box.querySelectorAll('.catbar[aria-expanded="true"]')].map((b) => b.dataset.cat);
    box.innerHTML = catBars(list, t);
    for (const b of box.querySelectorAll('.catbar')) {
      if (aperte.includes(b.dataset.cat)) toggleCat(b, list);
    }
  }
}

const rec = (row) => store.get(row.dataset.id);

function bindBody(body) {
  body.addEventListener('click', async (e) => {
    const cb = e.target.closest('.catbar');
    if (cb) { toggleCat(cb, M.movsOf(state.y, state.m)); return; }
    const add = e.target.closest('[data-add]');
    if (add) { addRow(add.dataset.add); return; }
    if (e.target.closest('[data-addtr]')) {
      const t = today();
      const date = state.y === t.y && state.m === t.m ? M.todayIso() : M.isoOf(state.y, state.m, 1);
      transferDialog({ date, onDone: () => renderBody() });
      return;
    }
    const tr = e.target.closest('[data-trasf]');
    if (tr) { transferDialog({ rec: store.get(tr.dataset.trasf), onDone: () => renderBody() }); return; }
    const op = e.target.closest('[data-op]');
    if (op) { insertOp(op); return; }
    const rmtag = e.target.closest('[data-rmtag]');
    if (rmtag) {
      const row = rmtag.closest('.row'); const r = rec(row);
      store.patch(r.id, { tags: (r.data.tags || []).filter((t) => t !== rmtag.dataset.rmtag) });
      replaceRow(r.id, true);
      return;
    }
    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;
    const row = e.target.closest('.row');
    if (!row || !act || act === 'move') return;
    const r = rec(row);
    if (act === 'more') toggleDetails(row);
    if (act === 'split' && r) splitEditor(r, () => { replaceRow(r.id); renderAlerts(); });
    if (act === 'ric' && r) ricDialog({ seed: ricSeedFromMov(r), onDone: () => renderBody() });
    if (act === 'dup' && r) {
      const id = store.newId();
      const { ricId, ...copia } = r.data; // la copia è un movimento normale, non una scadenza
      store.save('mov', id, { ...copia, ord: Date.now() });
      renderBody(id);
      toast('Movimento duplicato');
    }
    if (act === 'del' && r) {
      const ok = await confirmBox(`Eliminare "${r.data.desc || 'movimento senza descrizione'}" (${fmtEur(r.data.val)})?`, { ok: 'Elimina', danger: true });
      if (!ok) return;
      const backup = { ...r.data };
      store.remove(r.id);
      renderBody();
      toast('Movimento eliminato', { action: 'Annulla', onAction: () => { store.save('mov', r.id, backup); renderBody(r.id); } });
    }
  });

  body.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-op]')) e.preventDefault(); });

  body.addEventListener('focusin', (e) => {
    const inp = e.target;
    if (inp.dataset?.f !== 'amt') return;
    const r = rec(inp.closest('.row'));
    if (!r) return;
    inp.classList.remove('err');
    inp.value = r.data.espr || plain(r.data.val);
    requestAnimationFrame(() => inp.select());
  });

  body.addEventListener('focusout', (e) => {
    const inp = e.target;
    const row = inp.closest?.('.row');
    if (!row || !row.isConnected) return;
    if (inp.dataset?.f === 'amt') commitAmount(inp, row);
    if (inp.matches?.('[data-tagin]') && inp.value.trim()) addTag(row, inp.value);
    if (!row.contains(e.relatedTarget)) {
      setTimeout(() => {
        const r = rec(row);
        if (r && r.data.val == null && !r.data.desc && !r.data.note && !r.data.tags?.length && !row.contains(document.activeElement)) {
          store.remove(r.id);
          row.remove();
          updateSums();
        }
      }, 0);
    }
  });

  body.addEventListener('change', (e) => {
    const f = e.target.dataset?.f;
    const row = e.target.closest('.row');
    if (!row || !f || f === 'amt') return;
    const r = rec(row);
    if (!r) return;
    if (f === 'd') {
      const v = e.target.value.trim();
      if (!v) { store.patch(r.id, { d: null }); refreshRowState(row); return; }
      const n = parseInt(v, 10);
      const max = daysIn(r.data.y, r.data.m);
      if (!(n >= 1 && n <= max)) { e.target.value = r.data.d ?? ''; toast(`Il giorno deve essere tra 1 e ${max}`); return; }
      e.target.value = n;
      store.patch(r.id, { d: n });
      refreshRowState(row);
    }
    if (f === 'desc') {
      const desc = e.target.value.trim();
      const changes = { desc };
      if (r.data.catAuto !== false) {
        const s = M.suggestCat(r.data.tipo, desc, r.id);
        if (s) { changes.cat = s; $('[data-f="cat"]', row).value = s; row.style.setProperty('--cat', M.catById(s)?.data.colore || 'transparent'); }
      }
      if (r.data.contoAuto !== false && (r.data.conti || []).length <= 1) {
        const c = M.suggestConto(r.data.tipo, desc, r.id);
        if (c) { changes.conti = [{ c }]; }
      }
      store.patch(r.id, changes);
      if (changes.conti) $('[data-f="acc"]', row).innerHTML = accOptions(store.get(r.id));
      refreshRowState(row);
    }
    if (f === 'cat') {
      store.patch(r.id, { cat: e.target.value, catAuto: false });
      row.style.setProperty('--cat', M.catById(e.target.value)?.data.colore || 'transparent');
    }
    if (f === 'acc') {
      const v = e.target.value;
      if (v === '__new') {
        e.target.innerHTML = accOptions(r);
        if (typeof r.data.val !== 'number') { toast('Scrivi prima l\'importo.'); return; }
        splitEditor(r, () => { replaceRow(r.id); renderAlerts(); });
        return;
      }
      if (v === '__split') return;
      store.patch(r.id, { conti: v ? [{ c: v }] : [], contoAuto: false });
      e.target.innerHTML = accOptions(store.get(r.id));
      refreshRowState(row);
      renderAlerts();
    }
    if (f === 'note') {
      const note = e.target.value.trim() || null;
      store.patch(r.id, { note });
      row.classList.toggle('has-note', !!note);
    }
    if (f === 'escl') {
      store.patch(r.id, { escl: e.target.checked });
      row.classList.toggle('excluded', e.target.checked);
    }
    updateSums();
  });

  body.addEventListener('input', (e) => {
    if (e.target.dataset?.act !== 'move') return;
    const [y, m] = e.target.value.split('-').map(Number);
    const r = rec(e.target.closest('.row'));
    if (!r || !y || !m || (y === r.data.y && m === r.data.m)) return;
    const d = r.data.d && r.data.d <= daysIn(y, m) ? r.data.d : null;
    store.patch(r.id, { y, m, d });
    renderBody();
    toast(`Spostato in ${M.MESI[m - 1]} ${y}`, { action: 'Vai', onAction: () => { location.hash = `#mese/${ymHash(y, m)}/${r.id}`; } });
  });

  body.addEventListener('keydown', (e) => {
    if (e.target.matches?.('[data-tagin]') && (e.key === 'Enter' || e.key === ',')) {
      e.preventDefault();
      const v = e.target.value;
      e.target.value = '';
      if (v.trim()) addTag(e.target.closest('.row'), v, true);
      return;
    }
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
    const f = e.target.dataset?.f;
    const row = e.target.closest('.row');
    if (!row || !f) return;
    e.preventDefault();
    if (f === 'd') $('.c-amt', row).focus();
    else if (f === 'amt') $('.c-desc', row).focus();
    else if (f === 'desc' || f === 'cat' || f === 'acc') {
      e.target.dispatchEvent(new Event('change', { bubbles: true }));
      const next = row.nextElementSibling;
      if (next) $('.c-amt', next).focus();
      else addRow(row.closest('.ledger').dataset.tipo);
    }
  });
}

function refreshRowState(row) {
  const r = rec(row);
  if (!r) return;
  const keepOpen = row.classList.contains('open');
  row.className = 'row' + rowFlags(r) + (keepOpen ? ' open' : '');
}

function addTag(row, raw, refocus = false) {
  const r = rec(row);
  if (!r) return;
  const tags = [...(r.data.tags || [])];
  for (const part of raw.split(',')) {
    const t = M.normTag(part);
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
  }
  store.patch(r.id, { tags });
  replaceRow(r.id, true);
  if (refocus) root.querySelector(`.row[data-id="${CSS.escape(r.id)}"] [data-tagin]`)?.focus();
}

function insertOp(op) {
  const inp = op.closest('.row').querySelector('.c-amt');
  const ch = { '−': '-', '×': '*', '÷': '/' }[op.dataset.op] || op.dataset.op;
  const s = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? s;
  let v = inp.value;
  if (!v.startsWith('=') && /[+\-*/]/.test(ch)) v = '=' + v;
  const off = v.length - inp.value.length;
  inp.value = v.slice(0, s + off) + ch + v.slice(en + off);
  const pos = s + off + ch.length;
  inp.setSelectionRange(pos, pos);
}

function commitAmount(inp, row) {
  const r = rec(row);
  if (!r) return;
  let parsed;
  try { parsed = parseAmount(inp.value); } catch (err) {
    inp.classList.add('err');
    toast(err.message + '. Il valore precedente è stato mantenuto.');
    inp.value = fmt(r.data.val);
    return;
  }
  const val = parsed ? parsed.val : null;
  const espr = parsed ? parsed.espr : null;
  if (val !== r.data.val || espr !== (r.data.espr || null)) {
    store.patch(r.id, { val, espr });
    inp.title = espr || '';
    refreshRowState(row);
    updateSums();
    renderAlerts();
  }
  inp.value = fmt(val);
}

// Su telefono un movimento nuovo si scrive in una finestra con campi grandi e i pulsanti Annulla e Aggiungi
const compact = () => matchMedia('(max-width: 700px)').matches;

function addRow(tipo, day) {
  const t = today();
  if (compact()) {
    movDialog({
      tipo, y: state.y, m: state.m, d: day ?? (state.y === t.y && state.m === t.m ? t.d : null),
      onDone: (id) => renderBody(id),
    });
    return;
  }
  const id = store.newId();
  const c = M.suggestConto(tipo, '');
  store.save('mov', id, {
    y: state.y, m: state.m, d: day ?? (state.y === t.y && state.m === t.m ? t.d : null),
    tipo, espr: null, val: null, desc: '', cat: M.fallbackCat(tipo), catAuto: true,
    conti: c ? [{ c }] : [], contoAuto: true, tags: [], note: null, escl: false, ord: Date.now(),
  });
  const rows = root.querySelector(`.ledger[data-tipo="${tipo}"] .rows`);
  rows.insertAdjacentHTML('beforeend', rowHTML(store.get(id)));
  $('.c-amt', rows.lastElementChild).focus();
}

// ---------------------------------------------------------------- ricerca
function renderSearch(body) {
  const raw = state.q.trim();
  const isTag = raw.startsWith('#');
  const q = (isTag ? M.normTag(raw) : raw).toLowerCase();
  const qNum = q.replace(',', '.');
  const res = M.movs().filter((r) => {
    const d = r.data;
    const tags = (d.tags || []).map((t) => t.toLowerCase());
    if (isTag) return tags.includes(q);
    const cat = M.catById(d.cat)?.data.nome || '';
    return (d.desc || '').toLowerCase().includes(q) || (d.note || '').toLowerCase().includes(q) ||
      cat.toLowerCase().includes(q) || tags.some((t) => t.includes(q)) ||
      M.contiLabel(r).toLowerCase().includes(q) || (d.val != null && String(d.val).includes(qNum));
  }).sort((a, b) => b.data.y - a.data.y || b.data.m - a.data.m || (b.data.d ?? 0) - (a.data.d ?? 0));
  const s = M.sums(res);
  let html = `<div class="search-res"><div class="search-sum"><p>${res.length} ${res.length === 1 ? 'movimento' : 'movimenti'}`;
  if (res.length) html += `: uscite <b class="out">${fmtEur(s.tout)}</b>, entrate <b class="in">${fmtEur(s.tin)}</b>`;
  html += `</p>${res.length ? '<button class="btn ghost small" data-bulktag>Aggiungi un tag a tutti</button>' : ''}</div>`;
  let lastKey = '';
  for (const r of res.slice(0, 400)) {
    const d = r.data;
    const key = `${d.y}-${d.m}`;
    if (key !== lastKey) { html += `<h3>${M.MESI[d.m - 1]} ${d.y}</h3>`; lastKey = key; }
    const cat = M.catById(d.cat);
    html += `<a class="res-row t-${d.tipo}${d.escl ? ' excluded' : ''}" href="#mese/${ymHash(d.y, d.m)}/${r.id}">
      <span class="res-day">${d.d ?? ''}</span>
      <span class="res-desc">${esc(d.desc || '(senza descrizione)')}${d.note ? `<small>${esc(d.note)}</small>` : ''}</span>
      <span class="res-meta">${esc(M.catLabel(cat))}${d.conti?.length ? ', ' + esc(M.contiLabel(r)) : ''}
        ${(d.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</span>
      <span class="res-amt">${d.tipo === 'in' ? '+' : '−'}${fmt(d.val)}</span>
    </a>`;
  }
  if (res.length > 400) html += '<p class="muted">Mostro i 400 più recenti: affina la ricerca per vedere gli altri.</p>';
  body.innerHTML = html + '</div>';
  const bulk = $('[data-bulktag]', body);
  if (bulk) bulk.onclick = async () => {
    const t = M.normTag((await promptBox(`Tag da aggiungere a ${res.length} movimenti`, '', { ok: 'Aggiungi' })) || '');
    if (!t) return;
    for (const r of res) {
      const tags = r.data.tags || [];
      if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) store.patch(r.id, { tags: [...tags, t] });
    }
    toast(`Tag #${t} aggiunto`);
    renderBody();
  };
}

// ---------------------------------------------------------------- calendario
const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function renderCalendar(body) {
  const { y, m } = state;
  const list = M.movsOf(y, m);
  const n = daysIn(y, m);
  const first = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const per = Array.from({ length: n + 1 }, () => ({ tin: 0, tout: 0, items: [] }));
  for (const r of list) {
    if (r.data.d == null) continue;
    const o = per[r.data.d];
    o.items.push(r);
    if (r.data.escl || typeof r.data.val !== 'number') continue;
    if (r.data.tipo === 'in') o.tin += r.data.val; else o.tout += r.data.val;
  }
  const max = Math.max(1, ...per.map((o) => o.tout));
  const t = today();
  const isNow = y === t.y && m === t.m;
  let cells = GIORNI.map((g) => `<div class="cal-h">${g}</div>`).join('');
  for (let i = 0; i < first; i++) cells += '<div class="cal-pad"></div>';
  for (let d = 1; d <= n; d++) {
    const o = per[d];
    const heat = o.tout ? (0.08 + 0.5 * (o.tout / max)).toFixed(3) : 0;
    cells += `<button class="cal-day${isNow && d === t.d ? ' today' : ''}${d === selDay ? ' sel' : ''}" data-day="${d}" style="--heat:${heat}">
      <span class="cal-n">${d}</span>
      ${o.tout ? `<span class="cal-out"><span class="full">−${fmt(o.tout)}</span><span class="short">${Math.round(o.tout).toLocaleString('it-IT')}</span></span>` : ''}
      ${o.tin ? `<span class="cal-in"><span class="full">+${fmt(o.tin)}</span><span class="short">+${Math.round(o.tin).toLocaleString('it-IT')}</span></span>` : ''}
    </button>`;
  }
  const senza = list.filter((r) => r.data.d == null);
  body.innerHTML = `
    <section class="cal-card">
      <div class="cal-grid">${cells}</div>
    </section>
    <section class="cal-panel" id="cal-panel"></section>
    ${senza.length ? `<section class="cal-panel">
      <h2>Senza giorno <span class="muted">${senza.length}</span></h2>
      ${senza.map(calItem).join('')}
    </section>` : ''}`;
  paintDay(per);
  body.querySelector('.cal-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    selDay = Number(b.dataset.day);
    $$('.cal-day', body).forEach((x) => x.classList.toggle('sel', x === b));
    paintDay(per);
  });
}

function calItem(r) {
  const d = r.data;
  const cat = M.catById(d.cat);
  return `<a class="cal-item t-${d.tipo}${d.escl ? ' excluded' : ''}" href="#mese/${ymHash(d.y, d.m)}/${r.id}">
    <span class="ci-emoji" style="--c:${cat?.data.colore || '#999'}">${esc(cat?.data.emoji || '')}</span>
    <span class="ci-desc">${esc(d.desc || '(senza descrizione)')}<small>${esc(cat?.data.nome || '')}${d.conti?.length ? ', ' + esc(M.contiLabel(r)) : ''}</small></span>
    <span class="ci-amt">${d.tipo === 'in' ? '+' : '−'}${fmt(d.val)}</span>
  </a>`;
}

function paintDay(per) {
  const panel = $('#cal-panel', root);
  if (!panel) return;
  if (!selDay) { panel.innerHTML = '<p class="muted">Tocca un giorno per vedere i movimenti.</p>'; return; }
  const o = per[selDay];
  const nome = new Date(state.y, state.m - 1, selDay).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  panel.innerHTML = `
    <h2>${nome.charAt(0).toUpperCase() + nome.slice(1)}
      <span>${o.tout ? `<b class="out">−${fmtEur(o.tout)}</b>` : ''}${o.tin ? ` <b class="in">+${fmtEur(o.tin)}</b>` : ''}</span></h2>
    ${o.items.length ? o.items.map(calItem).join('') : '<p class="muted">Nessun movimento in questo giorno.</p>'}
    <div class="btn-row"><button class="btn small" data-calnew="out">+ Uscita</button><button class="btn small ghost" data-calnew="in">+ Entrata</button></div>`;
  $$('[data-calnew]', panel).forEach((b) => b.addEventListener('click', () => {
    if (compact()) { addRow(b.dataset.calnew, selDay); return; }
    setMode('lista');
    $$('.seg [data-mode]', root).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mode === 'lista')));
    renderBody();
    addRow(b.dataset.calnew, selDay);
  }));
  $$('.cal-item', panel.parentElement).forEach((a) => a.addEventListener('click', () => setMode('lista')));
}
