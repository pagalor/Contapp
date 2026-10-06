import * as store from './store.js';
import * as M from './model.js';
import { parseAmount, fmt, fmtEur, fmtSigned, plain, round2 } from './expr.js';
import { esc, $, $$, toast, confirmBox } from './ui.js';
import { transferDialog, adjustDialog } from './dialogs.js';
import { fmtDate, fmtDateShort } from './view-patrimonio.js';

let root;

// =============================================================== configurazione
export function renderConfig(el) {
  root = el;
  const cfg = M.cfg();
  const snaps = M.snapshots();
  const last = snaps[snaps.length - 1];
  el.innerHTML = `
    <section class="conti">
      <header class="page-head">
        <div><a class="back" href="#patrimonio">Patrimonio</a><h1>Fondi</h1></div>
      </header>

      <section class="card">
        <h2>Situazione di partenza</h2>
        <p class="muted">I saldi iniziali sono quelli che avevi alla fine della data di partenza. Le entrate, le uscite e i trasferimenti
        dei giorni successivi aggiornano i fondi in automatico. I movimenti precedenti restano nello storico ma non toccano i saldi.</p>
        <div class="start-row">
          <label class="field inline"><span>Data di partenza</span><input type="date" id="inizio" value="${cfg.inizio || ''}"></label>
          ${cfg.inizio ? '<button class="btn ghost small" data-act="stop">Disattiva il calcolo automatico</button>' : ''}
        </div>
        ${last ? `<button class="link-btn" data-act="fromsnap">Usa come saldi iniziali i valori della rilevazione del ${fmtDateShort(last.data.date)}</button>` : ''}
      </section>

      <section class="card">
        <h2>I tuoi fondi</h2>
        <p class="muted">Tutto ciò in cui tieni dei soldi: contanti, conti, carte prepagate, PayPal, crypto. Il target è la cifra che vuoi tenere sempre
        su quel fondo: se scendi sotto, l'app ti avvisa e ti dice quanto manca. Lascialo vuoto se non ti serve.</p>
        <div class="acc-table">
          <div class="acc-head"><span>Nome</span><span>Gruppo</span><span>Saldo iniziale</span><span>Target</span><span></span></div>
          <div id="acc-rows"></div>
        </div>
        <button class="add-row" data-act="add">+ Nuovo fondo</button>
      </section>

      <section class="card">
        <h2>Fondi proposti per i nuovi movimenti</h2>
        <p class="muted">Quando scrivi una descrizione già usata, l'app propone il fondo che avevi scelto quella volta; altrimenti usa questi.</p>
        <div class="form-grid">
          <label class="field"><span>Per le uscite</span><select id="def-out">${defOptions(cfg.contoOut)}</select></label>
          <label class="field"><span>Per le entrate</span><select id="def-in">${defOptions(cfg.contoIn)}</select></label>
        </div>
      </section>
    </section>`;
  paintRows();
  bindConfig(last);
}

const defOptions = (sel) => '<option value="">Nessuno</option>' +
  M.accounts().map((c) => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.data.nome)}</option>`).join('');

function paintRows() {
  $('#acc-rows', root).innerHTML = M.accounts(true).map((c) => `
    <div class="acc-row${c.data.archiviato ? ' archived' : ''}" data-id="${c.id}">
      <input data-k="nome" value="${esc(c.data.nome)}" aria-label="Nome">
      <select data-k="gruppo" aria-label="Gruppo">${M.GRUPPI.map(([g, n]) => `<option value="${g}"${g === c.data.gruppo ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <input class="amt" data-k="saldoIniziale" inputmode="decimal" value="${fmt(c.data.saldoIniziale)}" placeholder="Saldo iniziale" aria-label="Saldo iniziale">
      <input class="amt" data-k="obiettivo" inputmode="decimal" value="${fmt(c.data.obiettivo)}" placeholder="Target" aria-label="Target">
      <button class="icon-btn small" data-act="menu" aria-label="Altre azioni">⋯</button>
      <div class="acc-menu" hidden>
        <label class="check"><input type="checkbox" data-k="archiviato"${c.data.archiviato ? ' checked' : ''}> Archiviato (non compare più tra i fondi selezionabili)</label>
        <button class="btn ghost small danger" data-act="del">Elimina fondo</button>
      </div>
    </div>`).join('');
}

const exprKey = { saldoIniziale: 'siEspr', obiettivo: 'obEspr' };

function used(id) {
  return M.movs().some((r) => (r.data.conti || []).some((x) => x.c === id)) ||
    M.trasfs().some((r) => r.data.da === id || r.data.a === id) ||
    M.retts().some((r) => r.data.c === id) ||
    M.snapshots().some((s) => s.data.vals?.[id]);
}

function bindConfig(last) {
  const sec = root.querySelector('.conti');
  const inizio = $('#inizio', root);
  inizio.addEventListener('change', () => {
    if (!inizio.value) return;
    M.setCfg({ inizio: inizio.value });
    toast(`Calcolo automatico attivo dal ${fmtDate(inizio.value)}`);
    renderConfig(root);
  });
  $('#def-out', root).addEventListener('change', (e) => M.setCfg({ contoOut: e.target.value || null }));
  $('#def-in', root).addEventListener('change', (e) => M.setCfg({ contoIn: e.target.value || null }));

  sec.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'stop') {
      if (!(await confirmBox('Disattivare il calcolo automatico? I fondi, i saldi iniziali e i trasferimenti restano salvati e puoi riattivarlo quando vuoi.', { ok: 'Disattiva' }))) return;
      M.setCfg({ inizio: null });
      renderConfig(root);
    }
    if (act === 'fromsnap' && last) {
      if (!(await confirmBox(`Copiare nei saldi iniziali i valori del ${fmtDateShort(last.data.date)}? I fondi che non compaiono in quella rilevazione partiranno da zero.`, { ok: 'Copia' }))) return;
      for (const c of M.accounts(true)) {
        const v = last.data.vals[c.id];
        store.patch(c.id, { saldoIniziale: v ? v.val : 0, siEspr: v?.espr || null });
      }
      if (!M.cfg().inizio) M.setCfg({ inizio: last.data.date });
      toast('Saldi iniziali aggiornati');
      renderConfig(root);
    }
    if (act === 'add') {
      store.save('cont', store.newId(), { nome: 'Nuovo fondo', gruppo: 'corrente', ord: M.accounts(true).length, archiviato: false, saldoIniziale: 0, siEspr: null, obiettivo: null, obEspr: null });
      paintRows();
      $$('#acc-rows [data-k="nome"]', root).at(-1)?.select();
    }
    if (act === 'menu') {
      const menu = e.target.closest('.acc-row').querySelector('.acc-menu');
      menu.hidden = !menu.hidden;
    }
    if (act === 'del') {
      const id = e.target.closest('.acc-row').dataset.id;
      if (used(id)) { toast('Questo fondo è usato da movimenti o rilevazioni: archivialo invece di eliminarlo.', { ms: 6000 }); return; }
      if (!(await confirmBox(`Eliminare "${M.accName(id)}"?`, { ok: 'Elimina', danger: true }))) return;
      store.remove(id);
      paintRows();
    }
  });
  sec.addEventListener('focusin', (e) => {
    const k = e.target.dataset.k;
    if (!exprKey[k]) return;
    const c = store.get(e.target.closest('.acc-row').dataset.id);
    e.target.value = c.data[exprKey[k]] || plain(c.data[k]);
    e.target.select();
  });
  sec.addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    const row = e.target.closest('.acc-row');
    if (!k || !row) return;
    const id = row.dataset.id;
    if (k === 'nome') { const v = e.target.value.trim(); if (v) store.patch(id, { nome: v }); else e.target.value = M.accName(id); }
    if (k === 'gruppo') store.patch(id, { gruppo: e.target.value });
    if (k === 'archiviato') { store.patch(id, { archiviato: e.target.checked }); row.classList.toggle('archived', e.target.checked); }
    if (exprKey[k]) {
      try {
        const p = parseAmount(e.target.value);
        const val = k === 'saldoIniziale' ? (p?.val ?? 0) : (p?.val ?? null);
        store.patch(id, { [k]: val, [exprKey[k]]: p?.espr || null });
        e.target.value = fmt(p?.val);
      } catch (err) { toast(err.message); }
    }
  });
  sec.addEventListener('focusout', (e) => {
    const k = e.target.dataset.k;
    if (!exprKey[k]) return;
    const c = store.get(e.target.closest('.acc-row').dataset.id);
    if (document.activeElement !== e.target) e.target.value = fmt(c.data[k]);
  });
}

// =============================================================== dettaglio conto
export function renderConto(el, id) {
  root = el;
  const c = store.get(id);
  if (!c) { el.innerHTML = '<div class="empty-hint"><p>Questo fondo non esiste più.</p><a class="btn ghost" href="#patrimonio">Torna al patrimonio</a></div>'; return; }
  const draw = () => renderConto(el, id);
  const auto = M.autoAttivo();
  const inizio = M.cfg().inizio;
  const bal = auto ? (M.balances().get(id) || 0) : null;
  const t = c.data.obiettivo;
  const diff = typeof t === 'number' && auto ? round2(bal - t) : null;
  const entries = M.ledgerEntries().filter((x) => x.c === id);
  let run = c.data.saldoIniziale || 0;
  const rows = entries.map((x) => { run = round2(run + x.val); return { ...x, run }; }).reverse();

  el.innerHTML = `
    <section class="conto">
      <header class="page-head">
        <div><a class="back" href="#patrimonio">Patrimonio</a><h1>${esc(c.data.nome)}</h1></div>
        <a class="btn ghost" href="#conti">Modifica fondi</a>
      </header>
      ${auto ? `
      <div class="hero">
        <p class="hero-label">Saldo attuale</p>
        <p class="hero-num">${fmtEur(bal)}</p>
        ${typeof t === 'number' ? `<p class="hero-sub ${diff < -0.005 ? 'neg' : diff > 0.005 ? 'over' : ''}">Target ${fmtEur(t)}:
          ${diff < -0.005 ? `mancano <b>${fmtEur(-diff)}</b>` : diff > 0.005 ? `<b>▲ ${fmtEur(diff)}</b> oltre il target` : 'al target'}</p>` : ''}
        <div class="btn-row">
          ${diff != null && diff < -0.005 ? '<button class="btn primary small" data-act="reint">Reintegra</button>' : ''}
          <button class="btn small" data-act="tr-in">Trasferisci qui</button>
          <button class="btn small" data-act="tr-out">Trasferisci da qui</button>
          <button class="btn small" data-act="adj">Correggi il saldo</button>
        </div>
      </div>
      <section class="card">
        <h2>Movimenti</h2>
        ${rows.length ? `<div class="acc-ledger">${rows.map((x) => `
          <a class="al-row" href="${x.kind === 'mov' ? movHref(x.id) : x.kind === 'trasf' ? movHref(x.id, true) : x.kind === 'debt' ? '#debiti' : '#conto/' + id}" ${x.kind === 'rett' ? `data-rett="${x.id}"` : ''}>
            <span class="al-date">${fmtDateShort(x.date)}</span>
            <span class="al-desc">${esc(x.desc)}${x.kind === 'mov' ? '' : `<small>${x.kind === 'trasf' ? 'Trasferimento' : x.kind === 'debt' ? 'Debiti e crediti' : 'Correzione'}</small>`}</span>
            <span class="al-val ${x.val >= 0 ? 'in' : 'out'}">${fmtSigned(x.val)}</span>
            <span class="al-run">${fmt(x.run)}</span>
          </a>`).join('')}</div>` : '<p class="muted">Ancora nessun movimento su questo fondo dopo la data di partenza.</p>'}
        <p class="al-start">Saldo iniziale al ${fmtDateShort(inizio)}: <b>${fmtEur(c.data.saldoIniziale || 0)}</b></p>
      </section>` : `<div class="card intro"><p>Il calcolo automatico dei saldi non è attivo.</p><a class="btn primary" href="#conti">Configura i fondi</a></div>`}
    </section>`;

  el.querySelector('[data-act="reint"]')?.addEventListener('click', () => transferDialog({ a: id, val: -diff, onDone: draw }));
  el.querySelector('[data-act="tr-in"]')?.addEventListener('click', () => transferDialog({ a: id, onDone: draw }));
  el.querySelector('[data-act="tr-out"]')?.addEventListener('click', () => transferDialog({ da: id, onDone: draw }));
  el.querySelector('[data-act="adj"]')?.addEventListener('click', () => adjustDialog(id, draw));
  $$('[data-rett]', el).forEach((a) => a.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!(await confirmBox('Eliminare questa correzione del saldo?', { ok: 'Elimina', danger: true }))) return;
    store.remove(a.dataset.rett);
    draw();
  }));
}

function movHref(recId, isTrasf = false) {
  const r = store.get(recId);
  if (!r) return '#';
  return `#mese/${r.data.y}-${String(r.data.m).padStart(2, '0')}${isTrasf ? '' : '/' + recId}`;
}
