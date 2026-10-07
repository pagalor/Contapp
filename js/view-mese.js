import * as store from './store.js';
import * as M from './model.js';
import { fmt, fmtEur, fmtSigned, saldoCls } from './expr.js';
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
const openCal = new Set(); // movimenti del calendario con le voci extra aperte
const ROW = '.row'; // una riga dei movimenti, nell'elenco o nel calendario (qui senza il giorno, classe `nodate`)

export function render(el, { y, m, q = '', highlight } = {}) {
  root = el;
  const t = today();
  state = { y: y || t.y, m: m || t.m, q };
  selDay = state.y === t.y && state.m === t.m ? t.d : null;
  openCal.clear();
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
  const oltre = M.oltreTarget();
  const senza = M.senzaConto().filter((r) => r.data.y === state.y && r.data.m === state.m);
  let html = '';
  if (sotto.length) {
    html += `<div class="alert warn"><span>${sotto.length === 1 ? 'Sotto il target' : sotto.length + ' fondi sotto il target'}:</span>
      <span class="alert-items">${sotto.map((s) => `<button class="pill" data-reint="${s.c.id}" data-val="${s.manca}"
        title="Reintegra ${esc(s.c.data.nome)}">${esc(s.c.data.nome)} <b>−${fmt(s.manca)}</b></button>`).join('')}</span></div>`;
  }
  if (oltre.length) {
    html += `<div class="alert good"><span>${oltre.length === 1 ? 'Oltre il target' : oltre.length + ' fondi oltre il target'}:</span>
      <span class="alert-items">${oltre.map((s) => `<a class="pill" href="#conto/${s.c.id}"
        title="Apri ${esc(s.c.data.nome)}">${esc(s.c.data.nome)} <b>+${fmt(s.extra)}</b></a>`).join('')}</span></div>`;
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

const PENCIL = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';

// `nodate`: nel calendario il giorno è già indicato dalla data scelta; `open`: voci extra già aperte
function rowHTML(r, { nodate = false, open = false } = {}) {
  const d = r.data;
  const cat = M.catById(d.cat);
  const flags = rowFlags(r);
  const fondo = d.conti?.length ? M.contiLabel(r) : flags.includes('no-acc') ? 'Scegli il fondo' : '—';
  return `
    <div class="row t-${d.tipo}${nodate ? ' nodate' : ''}${flags}${open ? ' open' : ''}" data-id="${r.id}" style="--cat:${cat?.data.colore || 'transparent'}" tabindex="0" aria-expanded="${open}">
      ${nodate ? '' : `<span class="c-day">${d.d ?? '–'}</span>`}
      <span class="c-amt"${d.espr ? ` title="${esc(d.espr)}"` : ''}>${fmt(d.val)}</span>
      <span class="c-desc${d.desc ? '' : ' empty'}">${esc(d.desc || 'Senza descrizione')}</span>
      <span class="c-cat"><i></i><span class="c-lbl">${esc(cat ? M.catLabel(cat) : '(categoria eliminata)')}</span></span>
      <span class="c-acc"><span class="c-lbl">${esc(fondo)}</span></span>
      <button class="c-more" data-act="edit" aria-label="Modifica" title="Modifica">${PENCIL}</button>
      <div class="tagline">${tagLine(d)}</div>
      <div class="details"${open ? '' : ' hidden'}>${open ? detailsHTML(r) : ''}</div>
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
  const nodate = old.classList.contains('nodate');
  old.outerHTML = rowHTML(r, { nodate, open });
  if (nodate) { if (open) openCal.add(id); else openCal.delete(id); }
}

// Mostra o nasconde le voci extra (tag, nota, duplica…) di un movimento
function toggleDetails(row, force) {
  const det = $('.details', row);
  const open = force ?? det.hidden;
  if (open) det.innerHTML = detailsHTML(store.get(row.dataset.id));
  det.hidden = !open;
  row.setAttribute('aria-expanded', String(open));
  row.classList.toggle('open', open);
  if (row.classList.contains('nodate')) { if (open) openCal.add(row.dataset.id); else openCal.delete(row.dataset.id); }
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
      <div class="saldo"><dt>Saldo</dt><dd class="${saldoCls(s.saldo)}">${fmtSigned(s.saldo)}</dd></div>`;
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
    const rmtag = e.target.closest('[data-rmtag]');
    if (rmtag) {
      const row = rmtag.closest(ROW); const r = rec(row);
      store.patch(r.id, { tags: (r.data.tags || []).filter((t) => t !== rmtag.dataset.rmtag) });
      replaceRow(r.id, true);
      return;
    }
    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;
    const row = e.target.closest(ROW);
    // Un tocco sulla riga (fuori dai pulsanti e dai link) apre o chiude le voci extra
    if (row && !act && !e.target.closest('.details, button, a, input, select, textarea, label')) { toggleDetails(row); return; }
    if (!row || !act || act === 'move') return;
    const r = rec(row);
    if (act === 'edit' && r) {
      movDialog({
        rec: r,
        onDone: (id, data) => {
          if (!data || (data.y === state.y && data.m === state.m)) { renderBody(id ?? undefined); return; }
          renderBody();
          toast(`Spostato in ${M.MESI[data.m - 1]} ${data.y}`, { action: 'Vai', onAction: () => { location.hash = `#mese/${ymHash(data.y, data.m)}/${id}`; } });
        },
      });
    }
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

  // Il tag scritto nelle voci extra si aggiunge quando si lascia il campo
  body.addEventListener('focusout', (e) => {
    const inp = e.target;
    const row = inp.closest?.(ROW);
    if (row?.isConnected && inp.matches?.('[data-tagin]') && inp.value.trim()) addTag(row, inp.value);
  });

  body.addEventListener('change', (e) => {
    const f = e.target.dataset?.f;
    const row = e.target.closest(ROW);
    if (!row || !f) return;
    const r = rec(row);
    if (!r) return;
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
    if (f === 'escl' && row.classList.contains('nodate')) renderBody(); // il calendario mostra i totali di ogni giorno
  });

  body.addEventListener('input', (e) => {
    if (e.target.dataset?.act !== 'move') return;
    const [y, m] = e.target.value.split('-').map(Number);
    const r = rec(e.target.closest(ROW));
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
      if (v.trim()) addTag(e.target.closest(ROW), v, true);
      return;
    }
    // Da tastiera la riga si apre con Invio o Spazio
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.row')) { e.preventDefault(); toggleDetails(e.target); }
  });
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

// "+ Aggiungi uscita/entrata" apre una finestra come quella dei trasferimenti, con i pulsanti Annulla e Aggiungi
function addRow(tipo, day) {
  const t = today();
  movDialog({
    tipo, y: state.y, m: state.m, d: day ?? (state.y === t.y && state.m === t.m ? t.d : null),
    onDone: (id, data) => {
      if (data.y === state.y && data.m === state.m) { renderBody(id); return; }
      renderBody();
      toast(`Aggiunto in ${M.MESI[data.m - 1]} ${data.y}`, { action: 'Vai', onAction: () => { location.hash = `#mese/${ymHash(data.y, data.m)}/${id}`; } });
    },
  });
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
      ${o.tin && o.tout ? calSaldo(o.tin - o.tout) : ''}
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

// Saldo del giorno nella cella del calendario (solo se ci sono sia entrate sia uscite)
const calSaldo = (v) => {
  const r = Math.round(v * 100) / 100;
  const sg = r > 0 ? '+' : r < 0 ? '−' : '';
  return `<span class="cal-sal ${saldoCls(r)}"><span class="full">${sg}${fmt(Math.abs(r))}</span><span class="short">${sg}${Math.round(Math.abs(r)).toLocaleString('it-IT')}</span></span>`;
};

// Voce del calendario: identica alla riga dell'elenco, senza il giorno
const calItem = (r) => rowHTML(r, { nodate: true, open: openCal.has(r.id) });

function paintDay(per) {
  const panel = $('#cal-panel', root);
  if (!panel) return;
  if (!selDay) { panel.innerHTML = '<p class="muted">Tocca un giorno per vedere i movimenti.</p>'; return; }
  const o = per[selDay];
  const nome = new Date(state.y, state.m - 1, selDay).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  panel.innerHTML = `
    <h2>${nome.charAt(0).toUpperCase() + nome.slice(1)}
      <span>${o.tin || o.tout ? `<b class="${saldoCls(o.tin - o.tout)}" title="Saldo del giorno">${fmtSigned(o.tin - o.tout)}</b>` : ''}</span></h2>
    ${o.items.length ? o.items.map(calItem).join('') : '<p class="muted">Nessun movimento in questo giorno.</p>'}
    <div class="btn-row"><button class="btn small" data-calnew="out">+ Uscita</button><button class="btn small ghost" data-calnew="in">+ Entrata</button></div>`;
  $$('[data-calnew]', panel).forEach((b) => b.addEventListener('click', () => {
    addRow(b.dataset.calnew, selDay);
  }));
}
