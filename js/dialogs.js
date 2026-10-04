import * as store from './store.js';
import * as M from './model.js';
import { parseAmount, fmt, fmtEur, plain, round2 } from './expr.js';
import { esc, $, $$, modal, toast } from './ui.js';

const accOptions = (sel, { empty = '' } = {}) =>
  (empty ? `<option value="">${esc(empty)}</option>` : '') +
  M.accounts().map((c) => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.data.nome)}</option>`).join('');

// Campo importo con espressioni: mostra la formula quando è attivo, il risultato quando non lo è
export function bindAmount(input, get, set) {
  input.addEventListener('focus', () => {
    const v = get();
    input.value = v ? (v.espr || plain(v.val)) : '';
    requestAnimationFrame(() => input.select());
  });
  input.addEventListener('blur', () => {
    try {
      const p = parseAmount(input.value);
      set(p);
      input.classList.remove('err');
    } catch (e) {
      toast(e.message);
      input.classList.add('err');
    }
    const v = get();
    input.value = v ? fmt(v.val) : '';
  });
}

// --- Ripartizione di un movimento su più conti ---
export function splitEditor(rec, onDone) {
  const tot = rec.data.val;
  let parts = (rec.data.conti || []).map((x) => ({ c: x.c, val: x.val ?? null, espr: x.espr || null }));
  if (parts.length === 1) parts[0].val = tot;
  if (!parts.length) parts = [{ c: M.suggestConto(rec.data.tipo, rec.data.desc) || '', val: tot, espr: null }];
  if (parts.length < 2) parts.push({ c: '', val: null, espr: null });

  const dlg = modal(`
    <div class="dlg">
      <header class="dlg-head"><h2>Dividi tra più conti</h2><button class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <p class="muted">${esc(rec.data.desc || 'Movimento')}: <b>${fmtEur(tot)}</b>. Indica quanto è passato da ciascun conto.</p>
      <div class="split-rows"></div>
      <button class="link-btn" data-add>+ Aggiungi un conto</button>
      <p class="split-check"></p>
      <div class="actions"><button class="btn ghost" data-x>Annulla</button><button class="btn primary" data-save>Salva</button></div>
    </div>`);

  function paint() {
    $('.split-rows', dlg).innerHTML = parts.map((p, i) => `
      <div class="split-row" data-i="${i}">
        <select data-k="c" aria-label="Conto">${accOptions(p.c, { empty: 'Scegli il conto' })}</select>
        <input class="amt" data-k="val" inputmode="decimal" value="${p.val == null ? '' : fmt(p.val)}" placeholder="0,00" aria-label="Importo">
        <button class="icon-btn small" data-rm aria-label="Togli">×</button>
      </div>`).join('');
    $$('.split-row', dlg).forEach((row) => {
      const i = Number(row.dataset.i);
      bindAmount($('[data-k="val"]', row), () => (parts[i].val == null ? null : parts[i]), (p) => {
        parts[i].val = p?.val ?? null; parts[i].espr = p?.espr ?? null; check();
      });
      $('[data-k="c"]', row).addEventListener('change', (e) => { parts[i].c = e.target.value; check(); });
    });
    check();
  }
  function rest() { return round2(tot - parts.reduce((s, p) => s + (p.val || 0), 0)); }
  function check() {
    const r = rest();
    const el = $('.split-check', dlg);
    el.className = 'split-check ' + (Math.abs(r) < 0.005 ? 'ok' : 'ko');
    el.textContent = Math.abs(r) < 0.005 ? 'La ripartizione torna con il totale.'
      : r > 0 ? `Mancano ${fmtEur(r)} da assegnare.` : `Hai assegnato ${fmtEur(-r)} in più del totale.`;
  }
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) dlg.close();
    if (e.target.closest('[data-add]')) {
      const r = rest();
      parts.push({ c: '', val: r > 0 ? r : null, espr: null });
      paint();
      $$('.split-row select', dlg).at(-1).focus();
    }
    if (e.target.closest('[data-rm]')) {
      parts.splice(Number(e.target.closest('.split-row').dataset.i), 1);
      if (!parts.length) parts.push({ c: '', val: tot, espr: null });
      paint();
    }
    if (e.target.closest('[data-save]')) {
      document.activeElement?.blur?.();
      const used = parts.filter((p) => p.c && p.val != null && Math.abs(p.val) > 0.0001);
      if (parts.some((p) => !p.c && p.val)) { toast('Scegli il conto per ogni importo.'); return; }
      if (Math.abs(rest()) >= 0.005) { toast('La somma dei conti deve essere uguale al totale del movimento.'); return; }
      const conti = used.length === 1 ? [{ c: used[0].c }] : used.map((p) => ({ c: p.c, val: p.val, espr: p.espr }));
      store.patch(rec.id, { conti, contoAuto: false });
      dlg.close();
      onDone && onDone();
    }
  });
  paint();
}

// --- Trasferimento tra conti (nuovo o esistente) ---
export function transferDialog({ rec = null, da = '', a = '', val = null, date = null, onDone } = {}) {
  const d0 = rec ? M.recDate(rec) : (date || M.todayIso());
  let amount = rec ? { val: rec.data.val, espr: rec.data.espr } : val != null ? { val, espr: null } : null;
  const dlg = modal(`
    <form class="dlg" method="dialog">
      <header class="dlg-head"><h2>${rec ? 'Trasferimento' : 'Nuovo trasferimento'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <p class="muted">Spostare soldi tra i tuoi conti non è né una spesa né un'entrata: cambia solo dove si trovano.</p>
      <div class="form-grid">
        <label class="field"><span>Da</span><select name="da" required>${accOptions(rec?.data.da || da, { empty: 'Scegli' })}</select></label>
        <label class="field"><span>A</span><select name="a" required>${accOptions(rec?.data.a || a, { empty: 'Scegli' })}</select></label>
        <label class="field"><span>Importo</span><input name="val" class="amt" inputmode="decimal" value="${amount ? fmt(amount.val) : ''}" required></label>
        <label class="field"><span>Data</span><input name="date" type="date" value="${d0}" required></label>
      </div>
      <label class="field"><span>Nota</span><input name="note" value="${esc(rec?.data.note || '')}" autocomplete="off"></label>
      <div class="actions">
        ${rec ? '<button type="button" class="btn danger" data-del>Elimina</button><span class="spacer"></span>' : ''}
        <button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button>
      </div>
    </form>`);
  const f = $('form', dlg);
  bindAmount(f.val, () => amount, (p) => { amount = p; });
  f.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) dlg.close();
    if (e.target.closest('[data-del]')) { store.remove(rec.id); dlg.close(); toast('Trasferimento eliminato'); onDone && onDone(); }
  });
  f.addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'save' && e.submitter) return;
    f.val.blur();
    if (!amount || !(amount.val > 0)) { e.preventDefault(); toast("Indica un importo maggiore di zero."); return; }
    if (f.da.value === f.a.value) { e.preventDefault(); toast('Scegli due conti diversi.'); return; }
    const [y, m, d] = f.date.value.split('-').map(Number);
    store.save('trasf', rec ? rec.id : store.newId(), {
      y, m, d, da: f.da.value, a: f.a.value, val: amount.val, espr: amount.espr,
      note: f.note.value.trim() || null, ord: rec?.data.ord ?? Date.now(),
    });
    toast(rec ? 'Trasferimento aggiornato' : 'Trasferimento registrato');
    onDone && onDone();
  });
}

// --- Correzione del saldo di un conto ---
export function adjustDialog(contId, onDone) {
  const c = store.get(contId);
  const attuale = M.balances().get(contId) || 0;
  let reale = null;
  const dlg = modal(`
    <form class="dlg" method="dialog">
      <header class="dlg-head"><h2>Correggi il saldo di ${esc(c.data.nome)}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <p class="muted">Per l'app ci sono <b>${fmtEur(attuale)}</b>. Scrivi quanto c'è davvero: la differenza viene registrata come correzione,
      senza toccare entrate e uscite. Utile per interessi non segnati, variazioni delle cripto o piccoli errori.</p>
      <label class="field"><span>Saldo reale</span><input name="val" class="amt" inputmode="decimal" required></label>
      <label class="field"><span>Nota</span><input name="note" placeholder="es. valore Bitcoin aggiornato" autocomplete="off"></label>
      <p class="adj-diff muted"></p>
      <div class="actions"><button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Registra</button></div>
    </form>`);
  const f = $('form', dlg);
  bindAmount(f.val, () => reale, (p) => {
    reale = p;
    $('.adj-diff', f).textContent = p ? `Correzione: ${p.val - attuale >= 0 ? '+' : '−'}${fmtEur(Math.abs(round2(p.val - attuale)))}` : '';
  });
  f.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) dlg.close(); });
  f.addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'save' && e.submitter) return;
    f.val.blur();
    if (!reale) { e.preventDefault(); toast('Scrivi il saldo reale.'); return; }
    const delta = round2(reale.val - attuale);
    if (Math.abs(delta) < 0.005) { toast('Il saldo era già corretto.'); return; }
    store.save('rett', store.newId(), { date: M.todayIso(), c: contId, delta, note: f.note.value.trim() || null });
    toast('Saldo corretto');
    onDone && onDone();
  });
}

// --- Editor dei tag (chip) dentro un contenitore ---
export function tagEditorHTML(tags = []) {
  return `<div class="tags-edit">
    ${tags.map((t) => `<span class="tag">#${esc(t)}<button type="button" data-rmtag="${esc(t)}" aria-label="Togli ${esc(t)}">×</button></span>`).join('')}
    <input data-tagin list="dl-tags" placeholder="${tags.length ? 'Altro tag' : 'Aggiungi un tag, es. Parigi 2026'}" autocomplete="off" enterkeyhint="done">
  </div>`;
}
export function tagsDatalist() {
  return `<datalist id="dl-tags">${M.tagStats().map((t) => `<option value="${esc(t.tag)}">`).join('')}</datalist>`;
}
