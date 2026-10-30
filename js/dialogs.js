import * as store from './store.js';
import * as M from './model.js';
import { parseAmount, fmt, fmtEur, plain, round2 } from './expr.js';
import { esc, $, $$, modal, toast, confirmBox } from './ui.js';

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
// `rec` può essere una bozza ({ id: null, data }): in quel caso non salva niente e passa la ripartizione a onDone(conti).
export function splitEditor(rec, onDone) {
  const tot = rec.data.val;
  let parts = (rec.data.conti || []).map((x) => ({ c: x.c, val: x.val ?? null, espr: x.espr || null }));
  if (parts.length === 1) parts[0].val = tot;
  if (!parts.length) parts = [{ c: M.suggestConto(rec.data.tipo, rec.data.desc) || '', val: tot, espr: null }];
  if (parts.length < 2) parts.push({ c: '', val: null, espr: null });

  const dlg = modal(`
    <div class="dlg">
      <header class="dlg-head"><h2>Dividi tra più fondi</h2><button class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <p class="muted">${esc(rec.data.desc || 'Movimento')}: <b>${fmtEur(tot)}</b>. Indica quanto è passato da ciascun fondo.</p>
      <div class="split-rows"></div>
      <button class="link-btn" data-add>+ Aggiungi un fondo</button>
      <p class="split-check"></p>
      <div class="actions"><button class="btn ghost" data-x>Annulla</button><button class="btn primary" data-save>Salva</button></div>
    </div>`);

  function paint() {
    $('.split-rows', dlg).innerHTML = parts.map((p, i) => `
      <div class="split-row" data-i="${i}">
        <select data-k="c" aria-label="Conto">${accOptions(p.c, { empty: 'Scegli il fondo' })}</select>
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
      if (parts.some((p) => !p.c && p.val)) { toast('Scegli il fondo per ogni importo.'); return; }
      if (Math.abs(rest()) >= 0.005) { toast('La somma dei fondi deve essere uguale al totale del movimento.'); return; }
      const conti = used.length === 1 ? [{ c: used[0].c }] : used.map((p) => ({ c: p.c, val: p.val, espr: p.espr }));
      if (rec.id) store.patch(rec.id, { conti, contoAuto: false }); // senza id è una bozza: la ripartizione va a chi ha chiamato
      dlg.close();
      onDone && onDone(conti);
    }
  });
  paint();
}

// --- Scelta della data: un piccolo calendario con le frecce per cambiare mese ---
// `y`, `m` e `selected` sono il mese e il giorno attuali (selected può essere null).
// `onPick(giorno, anno, mese)` riceve la scelta; con "Senza giorno" il giorno è null e il mese è quello mostrato.
export function dayPicker({ y, m, selected = null, onPick }) {
  let cy = y, cm = m; // mese mostrato
  const dlg = modal(`
    <div class="dlg day-picker">
      <header class="dlg-head dp-head">
        <button type="button" class="icon-btn" data-nav="-1" aria-label="Mese precedente">‹</button>
        <h2 class="dp-title" aria-live="polite"></h2>
        <button type="button" class="icon-btn" data-nav="1" aria-label="Mese successivo">›</button>
      </header>
      <div class="dp-grid"></div>
      <div class="actions"><button type="button" class="btn ghost" data-none>Senza giorno</button><button type="button" class="btn ghost" data-x>Annulla</button></div>
    </div>`);
  function paint() {
    const n = new Date(cy, cm, 0).getDate();
    const first = (new Date(cy, cm - 1, 1).getDay() + 6) % 7; // il lunedì è la prima colonna
    const t = new Date();
    const oggi = t.getFullYear() === cy && t.getMonth() + 1 === cm ? t.getDate() : null;
    const scelto = cy === y && cm === m ? selected : null;
    let cells = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((g) => `<div class="cal-h">${g}</div>`).join('');
    cells += '<span></span>'.repeat(first);
    for (let i = 1; i <= n; i++) {
      cells += `<button type="button" class="dp-day${i === scelto ? ' sel' : ''}${i === oggi ? ' today' : ''}" data-day="${i}"${i === scelto ? ' aria-pressed="true"' : ''}>${i}</button>`;
    }
    $('.dp-title', dlg).textContent = `${M.MESI[cm - 1]} ${cy}`;
    $('.dp-grid', dlg).innerHTML = cells;
  }
  dlg.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      cm += Number(nav.dataset.nav);
      if (cm < 1) { cm = 12; cy--; } else if (cm > 12) { cm = 1; cy++; }
      paint();
      return;
    }
    const b = e.target.closest('[data-day]');
    if (b) { dlg.close(); onPick(Number(b.dataset.day), cy, cm); return; }
    if (e.target.closest('[data-none]')) { dlg.close(); onPick(null, cy, cm); return; }
    if (e.target.closest('[data-x]')) dlg.close();
  });
  paint();
  return dlg;
}

// --- Movimento: finestra per aggiungerne uno nuovo o modificarne uno esistente ---
// Non salva niente finché non si preme "Aggiungi" (o "Salva"); "Annulla" chiude senza lasciare tracce.
// `rec` è il movimento da modificare; `seed` precompila i campi di un nuovo movimento (serve a "Aggiungi e duplica").
// `sceltaTipo`: mostra il selettore Uscita/Entrata; chi apre la finestra da un riquadro di sole entrate o sole uscite lo toglie, perché il tipo è già deciso.
export function movDialog({ rec = null, tipo = 'out', y, m, d = null, seed = null, sceltaTipo = true, onDone } = {}) {
  const isEdit = !!rec;
  const init = rec ? rec.data : seed;
  if (rec) ({ tipo, y, m, d } = rec.data);
  const cur = { y, m, d }; // data del movimento: anno, mese e giorno (null se ignoto)
  const dataTesto = () => (cur.d ? `${cur.d} ${M.MESI[cur.m - 1].toLowerCase()} ${cur.y}` : `${M.MESI[cur.m - 1]} ${cur.y} · senza giorno`);
  let catAuto = rec ? rec.data.catAuto !== false : !seed, contoAuto = rec ? rec.data.contoAuto !== false : !seed;
  let subManual = !!init?.sub; // la sottocategoria scelta a mano (o copiata) non viene più cambiata dai suggerimenti
  let tags = [...(init?.tags || [])];
  let split = init?.conti?.length > 1 ? init.conti.map((x) => ({ ...x })) : null; // ripartizione su più fondi, se scelta
  const catOpts = (t, sel) => M.cats(t).map((c) => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(M.catLabel(c))}</option>`).join('') +
    (sel && M.catById(sel) && M.catById(sel).data.tipo !== t ? `<option value="${sel}" selected>${esc(M.catLabel(M.catById(sel)))}</option>` : '');
  const dlg = modal(`
    <form class="dlg mov-dlg" method="dialog" novalidate>
      <header class="dlg-head"><h2 data-title></h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      ${sceltaTipo ? `<div class="seg wide" role="group" aria-label="Tipo di movimento">
        <button type="button" data-seg="out">Uscita</button>
        <button type="button" data-seg="in">Entrata</button>
      </div>` : ''}
      <label class="field big-amt"><span>Importo (€)</span>
        <input name="amt" inputmode="decimal" autocomplete="off" placeholder="0,00" enterkeyhint="next">
        <small class="amt-prev muted"></small>
      </label>
      <div class="opkeys-big">
        ${['+', '−', '×', '÷', '(', ')'].map((k) => `<button type="button" tabindex="-1" data-op="${k}">${k}</button>`).join('')}
      </div>
      <label class="field"><span>Descrizione</span><input name="desc" list="dl-out" autocomplete="off" placeholder="Per esempio: spesa, stipendio…" enterkeyhint="done"></label>
      <label class="field"><span>Data</span><input name="d" readonly inputmode="none" autocomplete="off" value="${esc(dataTesto())}" aria-haspopup="dialog"></label>
      <label class="field"><span>Categoria</span><select name="cat"></select></label>
      <label class="field" data-subf hidden><span>Sottocategoria</span><select name="sub"></select></label>
      <label class="field"><span data-accl></span><select name="acc"></select></label>
      <h3 class="mov-more">Altre opzioni</h3>
      <div class="field"><span>Tag</span><div data-tags></div></div>
      <label class="field"><span>Nota</span><textarea name="note" rows="2">${esc(init?.note || '')}</textarea></label>
      <label class="check big-check"><input type="checkbox" name="escl"${init?.escl ? ' checked' : ''}> Escludi dai totali di entrate e uscite (es. entrate straordinarie)</label>
      <div class="detail-actions big-actions">
        <button type="button" class="btn ghost" data-dup>${isEdit ? 'Salva e duplica' : 'Aggiungi e duplica'}</button>
        ${rec?.data.ricId || rec?.data.rataId ? '' : '<button type="button" class="btn ghost" data-ric>Rendi ricorrente…</button>'}
        ${rec?.data.ricId || rec?.data.rataId ? '' : '<button type="button" class="btn ghost" data-rate>Pagato a rate…</button>'}
        ${isEdit ? '<button type="button" class="btn ghost danger" data-del>Elimina</button>' : ''}
      </div>
      <div class="actions sticky-actions">
        <button type="button" class="btn ghost" data-x>Annulla</button>
        <button type="submit" class="btn primary" value="ok">${isEdit ? 'Salva' : 'Aggiungi'}</button>
      </div>
    </form>`);
  const f = $('form', dlg);
  const prev = $('.amt-prev', f);
  const t = () => f.dataset.tipo;

  // Sottocategorie della categoria scelta; il campo compare solo se ce ne sono
  function paintSub(sel) {
    const list = M.subs(f.cat.value);
    $('[data-subf]', f).hidden = !list.length;
    f.sub.innerHTML = '<option value="">Nessuna</option>' +
      list.map((x) => `<option value="${x.id}"${x.id === sel ? ' selected' : ''}>${esc(x.data.nome)}</option>`).join('');
  }

  function paintTags(focus = false) {
    $('[data-tags]', f).innerHTML = tagEditorHTML(tags);
    if (focus) $('[data-tagin]', f).focus();
  }
  function addTags(raw, focus = false) {
    const inp = $('[data-tagin]', f);
    if (inp) inp.value = ''; // se resta scritto, il ridisegno fa scattare di nuovo l'aggiunta
    for (const part of raw.split(',')) {
      const tg = M.normTag(part);
      if (tg && !tags.some((x) => x.toLowerCase() === tg.toLowerCase())) tags.push(tg);
    }
    paintTags(focus);
  }
  // `keep`: si apre un movimento che ha già i suoi valori, quindi niente suggerimenti
  function setTipo(next, keep = false) {
    f.dataset.tipo = next;
    $$('[data-seg]', f).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seg === next)));
    setTitle();
    const rb = $('[data-rate]', f);
    if (rb) rb.hidden = next !== 'out';
    $('[data-accl]', f).textContent = next === 'in' ? 'Ricevuto su' : 'Pagato con';
    f.desc.setAttribute('list', 'dl-' + next);
    if (keep) { f.cat.innerHTML = catOpts(next, M.catById(init.cat) ? init.cat : M.fallbackCat(next)); paintSub(init.sub); return; }
    catAuto = true; contoAuto = true; subManual = false;
    f.cat.innerHTML = catOpts(next, M.fallbackCat(next));
    suggest();
  }
  // Elenco dei fondi; con una ripartizione attiva mostra anche la voce "Diviso tra N fondi"
  function accOpts(sel) {
    const list = M.accounts();
    return '<option value="">Nessun fondo</option>' +
      list.map((a) => `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${esc(a.data.nome)}</option>`).join('') +
      (sel && !list.some((a) => a.id === sel) ? `<option value="${sel}" selected>${esc(M.accName(sel))}</option>` : '') +
      (split ? `<option value="__split" selected>Diviso tra ${split.length} fondi</option>` : '') +
      `<option value="__new">${split ? 'Modifica ripartizione…' : 'Dividi tra più fondi…'}</option>`;
  }
  function suggest() {
    const desc = f.desc.value.trim();
    if (catAuto) { const s = M.suggestCat(t(), desc, rec?.id); if (s) f.cat.value = s; else if (!desc) f.cat.value = M.fallbackCat(t()); }
    if (contoAuto && !split) f.acc.innerHTML = accOpts(M.suggestConto(t(), desc, rec?.id));
    suggestSub();
  }
  // Ridisegna la sottocategoria: propone quella giusta per la descrizione, a meno che non l'abbia scelta tu
  function suggestSub() {
    paintSub(subManual ? f.sub.value : M.suggestSub(f.cat.value, f.desc.value.trim(), rec?.id));
  }
  function preview() {
    try {
      const p = parseAmount(f.amt.value);
      prev.textContent = p && p.espr ? `= ${fmtEur(p.val)}` : '';
      f.amt.classList.remove('err');
    } catch { prev.textContent = ''; }
  }
  // Legge e controlla i campi; mostra l'errore e restituisce null se qualcosa non va
  function read() {
    let p;
    try { p = parseAmount(f.amt.value); } catch (err) { f.amt.classList.add('err'); f.amt.focus(); toast(err.message); return null; }
    if (!p) { f.amt.classList.add('err'); f.amt.focus(); toast("Scrivi l'importo."); return null; }
    const tg = $('[data-tagin]', f);
    if (tg?.value.trim()) addTags(tg.value);
    const conti = f.acc.value === '__split' ? split : f.acc.value ? [{ c: f.acc.value }] : [];
    if (f.acc.value === '__split' && Math.abs(round2(p.val - split.reduce((n, x) => n + (x.val || 0), 0))) >= 0.005) {
      f.acc.focus(); toast("L'importo è cambiato: ripeti la divisione tra i fondi."); return null;
    }
    return {
      y: cur.y, m: cur.m, d: cur.d, tipo: t(), espr: p.espr, val: p.val, desc: f.desc.value.trim(),
      cat: f.cat.value || M.fallbackCat(t()), sub: f.sub.value || null, catAuto, conti, contoAuto,
      tags: [...tags], note: f.note.value.trim() || null, escl: f.escl.checked,
    };
  }
  // Un movimento nuovo (anche come copia di quello aperto)
  function create(data) {
    const id = store.newId();
    store.save('mov', id, { ...M.copiaMov(data), ord: Date.now() }); // la copia è un movimento normale, non una scadenza
    return id;
  }

  f.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) { dlg.close(); return; }
    const tb = e.target.closest('[data-seg]');
    if (tb) { setTipo(tb.dataset.seg); return; }
    const rm = e.target.closest('[data-rmtag]');
    if (rm) { tags = tags.filter((x) => x !== rm.dataset.rmtag); paintTags(); return; }
    if (e.target.closest('[data-dup]')) {
      const data = read();
      if (!data) return;
      if (isEdit) {
        store.patch(rec.id, data);
        const id = create(data);
        dlg.close();
        toast('Movimento duplicato');
        onDone && onDone(id, data);
        return;
      }
      const id = create(data);
      dlg.close();
      toast(data.tipo === 'in' ? 'Entrata aggiunta' : 'Uscita aggiunta');
      onDone && onDone(id, data);
      movDialog({ tipo: data.tipo, y: data.y, m: data.m, d: data.d, seed: data, sceltaTipo, onDone });
      return;
    }
    if (e.target.closest('[data-ric]')) {
      const data = read();
      if (!data) return;
      ricDialog({ seed: ricSeedFromMov({ data }), onDone: () => toast(`Movimento ricorrente salvato. Ricorda di premere ${isEdit ? 'Salva' : 'Aggiungi'}.`) });
      return;
    }
    if (e.target.closest('[data-rate]')) {
      const data = read();
      if (!data) return;
      // Il movimento diventa un piano rateale: saranno il piano e le sue scadenze a creare i movimenti
      rateDialog({ seed: rateSeedFromMov(data), modello: 'pp3', onDone: (pid) => {
        if (isEdit) store.remove(rec.id);
        dlg.close();
        const primo = M.sortMovs(M.movs().filter((r) => r.data.rataId === pid)).sort((a, b) => M.recDate(a).localeCompare(M.recDate(b)))[0];
        onDone && onDone(primo?.id ?? null, primo?.data ?? null);
      } });
      return;
    }
    if (e.target.closest('[data-del]')) {
      const ok = await confirmBox(`Eliminare "${rec.data.desc || 'movimento senza descrizione'}" (${fmtEur(rec.data.val)})?`, { ok: 'Elimina', danger: true });
      if (!ok) return;
      const backup = { ...rec.data };
      store.remove(rec.id);
      dlg.close();
      onDone && onDone(null, null);
      toast('Movimento eliminato', { action: 'Annulla', onAction: () => { store.save('mov', rec.id, backup); onDone && onDone(rec.id, backup); } });
      return;
    }
    const op = e.target.closest('[data-op]');
    if (op) {
      const ch = { '−': '-', '×': '*', '÷': '/' }[op.dataset.op] || op.dataset.op;
      const inp = f.amt;
      const s = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? s;
      let v = inp.value;
      if (!v.startsWith('=') && /[+\-*/]/.test(ch)) v = '=' + v;
      const off = v.length - inp.value.length;
      inp.value = v.slice(0, s + off) + ch + v.slice(en + off);
      inp.focus();
      inp.setSelectionRange(s + off + 1, s + off + 1);
      preview();
    }
  });
  f.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-op]')) e.preventDefault(); });
  f.addEventListener('keydown', (e) => {
    if (e.target.matches?.('[data-tagin]') && (e.key === 'Enter' || e.key === ',')) {
      e.preventDefault();
      const v = e.target.value;
      if (v.trim()) addTags(v, true);
    }
  });
  f.addEventListener('focusout', (e) => {
    if (e.target.matches?.('[data-tagin]') && e.target.value.trim()) addTags(e.target.value);
  });
  f.amt.addEventListener('input', preview);
  f.amt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); f.desc.focus(); } });
  f.desc.addEventListener('change', suggest);
  f.cat.addEventListener('change', () => { catAuto = false; subManual = false; suggestSub(); });
  f.sub.addEventListener('change', () => { subManual = true; });
  f.acc.addEventListener('change', () => {
    contoAuto = false;
    if (f.acc.value === '__split') return;
    if (f.acc.value !== '__new') { split = null; return; }
    // "Dividi tra più fondi…": serve prima l'importo
    let p = null;
    try { p = parseAmount(f.amt.value); } catch (err) { toast(err.message); }
    f.acc.innerHTML = accOpts(split ? null : '');
    if (!p) { f.amt.classList.add('err'); f.amt.focus(); toast("Scrivi prima l'importo."); return; }
    splitEditor({ id: null, data: { val: p.val, tipo: t(), desc: f.desc.value.trim(), conti: split || [] } }, (conti) => {
      split = conti.length > 1 ? conti : null;
      f.acc.innerHTML = accOpts(conti.length === 1 ? conti[0].c : null);
    });
  });
  // Toccando la data si apre il calendario: si sceglie giorno e mese (con le frecce) in un colpo solo
  const scegliData = () => dayPicker({
    y: cur.y, m: cur.m, selected: cur.d,
    onPick: (g, yy, mm) => { Object.assign(cur, { y: yy, m: mm, d: g }); f.d.value = dataTesto(); setTitle(); },
  });
  f.d.addEventListener('click', scegliData);
  f.d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scegliData(); } });
  function setTitle() {
    $('[data-title]', f).textContent = `${isEdit ? (t() === 'in' ? 'Modifica entrata' : 'Modifica uscita') : (t() === 'in' ? 'Nuova entrata' : 'Nuova uscita')} · ${M.MESI_BREVI[cur.m - 1]} ${cur.y}`;
  }

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = read();
    if (!data) return;
    let id;
    if (isEdit) {
      id = rec.id;
      store.patch(id, data);
      toast('Modifiche salvate');
    } else {
      id = create(data);
      toast(data.tipo === 'in' ? 'Entrata aggiunta' : 'Uscita aggiunta');
    }
    dlg.close();
    onDone && onDone(id, data);
  });

  paintTags();
  setTipo(tipo, !!init);
  if (init) {
    f.amt.value = init.espr || plain(init.val);
    f.desc.value = init.desc || '';
    f.acc.innerHTML = accOpts(split ? null : init.conti?.[0]?.c);
    preview();
  }
  if (!isEdit) f.amt.focus();
  return dlg;
}

// --- Trasferimento tra conti (nuovo o esistente) ---
export function transferDialog({ rec = null, da = '', a = '', val = null, date = null, onDone } = {}) {
  const d0 = rec ? M.recDate(rec) : (date || M.todayIso());
  let amount = rec ? { val: rec.data.val, espr: rec.data.espr } : val != null ? { val, espr: null } : null;
  const dlg = modal(`
    <form class="dlg mov-dlg trf-dlg" method="dialog">
      <header class="dlg-head"><h2>${rec ? 'Trasferimento' : 'Nuovo trasferimento'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <p class="muted">Spostare soldi tra i tuoi fondi non è né una spesa né un'entrata: cambia solo dove si trovano.</p>
      <div class="trf-route">
        <label class="field"><span>Da</span><select name="da" required>${accOptions(rec?.data.da || da, { empty: 'Scegli' })}</select></label>
        <span class="trf-arrow" aria-hidden="true">→</span>
        <label class="field"><span>A</span><select name="a" required>${accOptions(rec?.data.a || a, { empty: 'Scegli' })}</select></label>
      </div>
      <label class="field"><span>Importo (€)</span><input name="val" class="amt trf-amt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${amount ? fmt(amount.val) : ''}" required></label>
      <label class="field"><span>Data</span><input name="date" type="date" value="${d0}" required></label>
      <label class="field"><span>Nota</span><input name="note" value="${esc(rec?.data.note || '')}" autocomplete="off"></label>
      <div class="actions sticky-actions">
        ${rec ? '<button type="button" class="btn ghost danger" data-del>Elimina</button>' : ''}
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
    if (f.da.value === f.a.value) { e.preventDefault(); toast('Scegli due fondi diversi.'); return; }
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

// --- Movimento ricorrente (nuovo, esistente, oppure precompilato da un movimento) ---
const fmtDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

// Frase che spiega quando verrà aggiunto il movimento
export function ricSummary({ inizio, freq, ogni, fine }) {
  if (!inizio) return '';
  const n = Math.max(1, Math.floor(ogni) || 1);
  const [y, m, d] = inizio.split('-').map(Number);
  let s;
  if (freq === 'sett') {
    const g = new Date(y, m - 1, d).toLocaleDateString('it-IT', { weekday: 'long' });
    s = n === 1 ? `Ogni settimana, di ${g}` : `Ogni ${n} settimane, di ${g}`;
  } else if (freq === 'anno') {
    s = (n === 1 ? 'Ogni anno' : `Ogni ${n} anni`) + `, il ${d} ${M.MESI[m - 1].toLowerCase()}`;
  } else {
    s = (n === 1 ? 'Ogni mese' : `Ogni ${n} mesi`) + `, il giorno ${d}` + (d > 28 ? ' (o l\'ultimo giorno se il mese è più corto)' : '');
  }
  return `${s}, a partire dal ${fmtDay(inizio)}${fine ? ` fino al ${fmtDay(fine)}` : ''}.`;
}

// Proposta di ricorrenza a partire da un movimento già registrato: la prima ripetizione è il mese dopo
export function ricSeedFromMov(r) {
  const d = r.data;
  const rec = { data: { inizio: M.recDate(r), freq: 'mese', ogni: 1 } };
  return {
    tipo: d.tipo, desc: d.desc || '', val: d.val ?? null, espr: d.espr || null, cat: d.cat, sub: d.sub || null, conti: (d.conti || []).length === 1 ? [{ c: d.conti[0].c }] : [],
    note: d.note || null, tags: d.tags || [], escl: !!d.escl, inizio: M.ricDate(rec, 1), freq: 'mese', ogni: 1, fine: null, ord: Date.now(),
  };
}

export function ricDialog({ rec = null, seed = null, onDone } = {}) {
  const isNew = !rec;
  const d = rec ? JSON.parse(JSON.stringify(rec.data)) : {
    tipo: 'out', desc: '', val: null, espr: null, cat: null, conti: [], note: null, tags: [], escl: false,
    inizio: M.todayIso(), freq: 'mese', ogni: 1, fine: null, ord: Date.now(), ...(seed ? JSON.parse(JSON.stringify(seed)) : {}),
  };
  if (!d.cat || !M.catById(d.cat)) d.cat = M.fallbackCat(d.tipo);
  if (isNew && !seed) d.conti = M.suggestConto(d.tipo, '') ? [{ c: M.suggestConto(d.tipo, '') }] : [];
  let amount = typeof d.val === 'number' ? { val: d.val, espr: d.espr } : null;
  let catManual = !isNew || !!seed;

  const dlg = modal(`
    <form class="dlg" method="dialog">
      <header class="dlg-head"><h2>${isNew ? 'Nuovo movimento ricorrente' : 'Movimento ricorrente'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <p class="muted">Viene aggiunto da solo ai movimenti, ogni volta che arriva la scadenza.</p>
      <div class="seg wide" role="group">
        <button type="button" data-tipo="out" aria-pressed="${d.tipo === 'out'}">Uscita</button>
        <button type="button" data-tipo="in" aria-pressed="${d.tipo === 'in'}">Entrata</button>
      </div>
      <div class="form-grid">
        <label class="field"><span>Descrizione</span><input name="desc" list="dl-ric-${d.tipo}" value="${esc(d.desc)}" placeholder="es. Netflix" autocomplete="off" required></label>
        <label class="field"><span>Importo</span><input name="val" class="amt" inputmode="decimal" value="${amount ? fmt(amount.val) : ''}" required></label>
        <label class="field"><span>Categoria</span><select name="cat"></select></label>
        <label class="field"><span data-conto-label></span><select name="conto"></select></label>
      </div>
      <div class="form-grid">
        <label class="field"><span>Prima scadenza</span><input name="inizio" type="date" value="${d.inizio}" required></label>
        <div class="field"><span>Si ripete ogni</span>
          <div class="ric-every"><input name="ogni" type="number" min="1" max="99" step="1" value="${Math.max(1, d.ogni || 1)}" inputmode="numeric" aria-label="Ogni quante volte">
            <select name="freq" aria-label="Unità">${M.FREQ.map(([k, p]) => `<option value="${k}"${k === d.freq ? ' selected' : ''}>${p}</option>`).join('')}</select></div></div>
        <label class="field"><span>Ultima scadenza (facoltativa)</span><input name="fine" type="date" value="${d.fine || ''}"></label>
      </div>
      <p class="ric-sum muted small-note"></p>
      <label class="field"><span>Nota</span><input name="note" value="${esc(d.note || '')}" autocomplete="off"></label>
      <datalist id="dl-ric-in">${M.frequentDescs('in').map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <datalist id="dl-ric-out">${M.frequentDescs('out').map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <div class="actions">
        ${isNew ? '' : '<button type="button" class="btn ghost danger" data-del>Elimina</button><span class="spacer"></span>'}
        <button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button>
      </div>
    </form>`, { wide: true });
  const f = $('form', dlg);
  bindAmount(f.val, () => amount, (p) => { amount = p; });

  function paintOptions() {
    f.cat.innerHTML = M.cats(d.tipo).map((c) => `<option value="${c.id}"${c.id === d.cat ? ' selected' : ''}>${esc(M.catLabel(c))}</option>`).join('');
    const single = d.conti.length === 1 ? d.conti[0].c : '';
    f.conto.innerHTML = `<option value="">—</option>` + accOptions(single) +
      (single && !M.accounts().some((c) => c.id === single) ? `<option value="${single}" selected>${esc(M.accName(single))}</option>` : '');
    $('[data-conto-label]', f).textContent = d.tipo === 'in' ? 'Ricevuto su' : 'Pagato con';
    f.desc.setAttribute('list', 'dl-ric-' + d.tipo);
    $$('[data-tipo]', f).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tipo === d.tipo)));
  }
  const scheduleChanged = () => !isNew && (f.inizio.value !== rec.data.inizio || f.freq.value !== rec.data.freq || (Number(f.ogni.value) || 1) !== (rec.data.ogni || 1));
  function paintSummary() {
    const extra = scheduleChanged() ? ' Il nuovo calendario vale da oggi: i movimenti già aggiunti restano come sono.'
      : isNew && f.inizio.value && f.inizio.value <= M.todayIso() ? ' Le scadenze già passate vengono aggiunte subito.' : '';
    $('.ric-sum', f).textContent = ricSummary({ inizio: f.inizio.value, freq: f.freq.value, ogni: f.ogni.value, fine: f.fine.value }) + extra;
  }
  paintOptions(); paintSummary();

  f.addEventListener('input', (e) => { if (['inizio', 'ogni', 'fine'].includes(e.target.name)) paintSummary(); });
  f.addEventListener('change', (e) => {
    if (e.target.name === 'freq') paintSummary();
    if (e.target.name === 'cat') { d.cat = e.target.value; catManual = true; }
    if (e.target.name === 'conto') d.conti = e.target.value ? [{ c: e.target.value }] : [];
    if (e.target.name === 'desc' && !catManual) {
      const sug = M.suggestCat(d.tipo, e.target.value.trim());
      if (sug) { d.cat = sug; f.cat.value = sug; }
      const c = M.suggestConto(d.tipo, e.target.value.trim());
      if (c && !d.conti.length) { d.conti = [{ c }]; paintOptions(); }
    }
  });
  f.addEventListener('click', async (e) => {
    const tb = e.target.closest('[data-tipo]');
    if (tb && tb.dataset.tipo !== d.tipo) {
      d.tipo = tb.dataset.tipo; catManual = false; d.cat = M.fallbackCat(d.tipo);
      d.conti = M.suggestConto(d.tipo, f.desc.value.trim()) ? [{ c: M.suggestConto(d.tipo, f.desc.value.trim()) }] : [];
      paintOptions();
    }
    if (e.target.closest('[data-x]')) dlg.close();
    if (e.target.closest('[data-del]')) {
      if (!(await confirmBox('Eliminare questo movimento ricorrente? Quelli già aggiunti restano dove sono, ma non ne verranno aggiunti altri.', { ok: 'Elimina', danger: true }))) return;
      const backup = rec.data;
      store.remove(rec.id); dlg.close();
      toast('Ricorrenza eliminata', { action: 'Annulla', onAction: () => { store.save('ric', rec.id, backup); onDone && onDone(); } });
      onDone && onDone();
    }
  });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') return;
    document.activeElement?.blur?.();
    if (!amount || !(amount.val > 0)) { e.preventDefault(); toast('Indica un importo maggiore di zero.'); return; }
    if (!f.desc.value.trim()) { e.preventDefault(); toast('Scrivi una descrizione.'); return; }
    if (!f.inizio.value) { e.preventDefault(); toast('Indica la prima scadenza.'); return; }
    if (f.fine.value && f.fine.value < f.inizio.value) { e.preventDefault(); toast("L'ultima scadenza non può essere prima della prima."); return; }
    const ogni = Math.min(99, Math.max(1, Math.floor(Number(f.ogni.value)) || 1));
    const changed = scheduleChanged();
    const ieri = new Date(); ieri.setDate(ieri.getDate() - 1);
    store.save('ric', rec ? rec.id : store.newId(), {
      ...d, ...(changed ? { da: M.isoOf(ieri.getFullYear(), ieri.getMonth() + 1, ieri.getDate()) } : {}), desc: f.desc.value.trim(), val: amount.val, espr: amount.espr, cat: f.cat.value, conti: d.conti,
      inizio: f.inizio.value, freq: f.freq.value, ogni, fine: f.fine.value || null, note: f.note.value.trim() || null,
    });
    const n = M.generaRicorrenti();
    toast(n ? `Salvato: ${n === 1 ? 'aggiunto 1 movimento' : `aggiunti ${n} movimenti`} già scaduti` : 'Ricorrenza salvata');
    onDone && onDone();
  });
}

// --- Pagamento a rate (piano rateale): nuovo, esistente, oppure precompilato da un movimento ---
// Modelli precompilati: [chiave, nome, valori]. `subito`: la prima rata si paga il giorno dell'acquisto;
// `auto`: senza interessi, l'importo della rata si calcola dal prezzo (altrimenti va inserito).
export const MODELLI_RATE = [
  ['pp3', 'PayPal 3 rate', { creditore: 'PayPal', nRate: 3, subito: true, auto: true }],
  ['pp6', 'PayPal 6 rate', { creditore: 'PayPal', nRate: 6, subito: false, auto: false }],
  ['pp12', 'PayPal 12 rate', { creditore: 'PayPal', nRate: 12, subito: false, auto: false }],
  ['pp24', 'PayPal 24 rate', { creditore: 'PayPal', nRate: 24, subito: false, auto: false }],
  ['custom', 'Personalizzato', null],
];
const unMeseDopo = (iso) => M.ricDate({ data: { inizio: iso, freq: 'mese', ogni: 1 } }, 1);

// Dati di un movimento (anche non ancora salvato) da cui partire per un piano rateale
export function rateSeedFromMov(d) {
  const t = new Date();
  const giorno = d.d ?? (d.y === t.getFullYear() && d.m === t.getMonth() + 1 ? t.getDate() : 1);
  return {
    desc: d.desc || '', prezzo: d.val ?? null, prEspr: d.espr || null, cat: d.cat, sub: d.sub || null, tags: [...(d.tags || [])],
    note: d.note || null, dataAcquisto: M.isoOf(d.y, d.m, giorno), fondo: (d.conti || []).length === 1 ? d.conti[0].c : '',
  };
}

const fmtRata = (n) => `${n} ${n === 1 ? 'rata' : 'rate'}`;

export function rateDialog({ rec = null, seed = null, modello = 'custom', onDone } = {}) {
  const isNew = !rec;
  const oggi = M.todayIso();
  const d = rec ? JSON.parse(JSON.stringify(rec.data)) : {
    desc: '', cat: null, sub: null, tags: [], prezzo: null, prEspr: null, anticipo: null, nRate: 3, importoRata: null, irEspr: null,
    ultimaRata: null, urEspr: null, fondo: M.cfg().contoOut || '', creditore: '', dataAcquisto: oggi, primaScadenza: unMeseDopo(oggi),
    freq: 'mese', ogni: 1, modalita: M.modalitaRate(), chiuso: false, chiusura: null, gen: 1, note: null, ord: Date.now(),
    ...(seed ? JSON.parse(JSON.stringify(seed)) : {}),
  };
  if (!d.cat || !M.catById(d.cat)) d.cat = M.suggestCat('out', d.desc) || M.fallbackCat('out');
  if (!d.fondo && isNew) d.fondo = M.suggestConto('out', d.desc) || '';
  const modOrig = rec ? M.modalitaPiano(rec) : null;
  d.modalita = rec ? modOrig : d.modalita;
  let tags = [...(d.tags || [])];
  let prezzo = typeof d.prezzo === 'number' ? { val: d.prezzo, espr: d.prEspr } : null;
  let rata = typeof d.importoRata === 'number' ? { val: d.importoRata, espr: d.irEspr } : null;
  let ultima = typeof d.ultimaRata === 'number' ? { val: d.ultimaRata, espr: d.urEspr } : null;
  let ant = typeof d.anticipo?.val === 'number' ? { val: d.anticipo.val, espr: d.anticipo.espr || null } : null;
  let rataAuto = isNew;   // senza interessi la rata si ricalcola dal prezzo finché non la scrivi a mano
  let scadAuto = isNew;   // la prima scadenza segue la data di acquisto finché non la scegli a mano
  let modSubito = false;  // il modello scelto vuole la prima rata il giorno dell'acquisto
  let catManual = !isNew || !!seed;
  const st = rec ? M.statoPiano(rec) : null;
  const fondoOpts = (sel, vuoto = 'Nessun fondo') => `<option value="">${vuoto}</option>` + accOptions(sel) +
    (sel && !M.accounts().some((c) => c.id === sel) ? `<option value="${sel}" selected>${esc(M.accName(sel))}</option>` : '');

  const dlg = modal(`
    <form class="dlg rate-dlg" method="dialog" novalidate>
      <header class="dlg-head"><h2>${isNew ? 'Nuovo pagamento a rate' : 'Pagamento a rate'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      ${isNew ? `<label class="field"><span>Modello</span><select name="modello">${MODELLI_RATE.map(([k, n]) => `<option value="${k}"${k === modello ? ' selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
      ${st ? `<div class="rate-stato${d.chiuso ? ' chiuso' : ''}">${statoHTML(rec, st)}</div>` : ''}
      <div class="form-grid">
        <label class="field"><span>Descrizione</span><input name="desc" list="dl-rate-desc" value="${esc(d.desc)}" placeholder="es. Lavatrice" autocomplete="off" required></label>
        <label class="field"><span>Prezzo del bene</span><input name="prezzo" class="amt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${prezzo ? fmt(prezzo.val) : ''}" required></label>
        <label class="field"><span>Categoria</span><select name="cat"></select></label>
        <label class="field" data-subf hidden><span>Sottocategoria</span><select name="sub"></select></label>
        <label class="field"><span>Data di acquisto</span><input name="acq" type="date" value="${d.dataAcquisto}" required></label>
        <label class="field"><span>Creditore (facoltativo)</span><input name="cred" list="dl-cred" value="${esc(d.creditore || '')}" placeholder="es. Klarna" autocomplete="off"></label>
      </div>
      <h3 class="rate-h">Rate</h3>
      <div class="form-grid">
        <label class="field"><span>Numero di rate</span><input name="n" type="number" min="1" max="360" step="1" inputmode="numeric" value="${d.nRate || ''}" required></label>
        <label class="field"><span>Importo della rata</span><input name="rata" class="amt" inputmode="decimal" autocomplete="off" placeholder="da inserire" value="${rata ? fmt(rata.val) : ''}" required></label>
        <label class="field"><span>Ultima rata, se diversa</span><input name="ultima" class="amt" inputmode="decimal" autocomplete="off" placeholder="come le altre" value="${ultima ? fmt(ultima.val) : ''}"></label>
        <label class="field"><span>Prima scadenza</span><input name="prima" type="date" value="${d.primaScadenza}" required></label>
        <div class="field"><span>Si ripete ogni</span>
          <div class="ric-every"><input name="ogni" type="number" min="1" max="99" step="1" value="${Math.max(1, d.ogni || 1)}" inputmode="numeric" aria-label="Ogni quante volte">
            <select name="freq" aria-label="Unità">${M.FREQ.map(([k, pl]) => `<option value="${k}"${k === d.freq ? ' selected' : ''}>${pl}</option>`).join('')}</select></div></div>
      </div>
      <label class="field"><span>Fondo da cui escono le rate</span><select name="fondo">${fondoOpts(d.fondo)}</select>
        <small class="muted">Il fondo da cui escono davvero le rate (es. la carta collegata a PayPal)</small></label>
      <h3 class="rate-h">Anticipo <span class="muted">(facoltativo)</span></h3>
      <div class="form-grid">
        <label class="field"><span>Importo</span><input name="ant" class="amt" inputmode="decimal" autocomplete="off" placeholder="nessuno" value="${ant ? fmt(ant.val) : ''}"></label>
        <label class="field" data-antf><span>Data</span><input name="antData" type="date" value="${d.anticipo?.data || d.dataAcquisto}"></label>
        <label class="field" data-antf><span>Pagato con</span><select name="antFondo">${fondoOpts(d.anticipo?.fondo || d.fondo, 'Come le rate')}</select></label>
      </div>
      <p class="rate-sum"></p>
      <div class="field"><span>Come contarlo nelle uscite</span>
        <div class="seg wide" role="group" aria-label="Modalità">
          ${M.RATE_MODALITA.map(([k, n]) => `<button type="button" data-mod="${k}"${d.chiuso ? ' disabled' : ''}>${n}</button>`).join('')}
        </div>
        <small class="muted" data-modnote></small></div>
      <div class="field"><span>Tag</span><div data-tags></div></div>
      <label class="field"><span>Nota</span><input name="note" value="${esc(d.note || '')}" autocomplete="off"></label>
      <datalist id="dl-cred">${M.creditori().map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <datalist id="dl-rate-desc">${M.frequentDescs('out').map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      ${tagsDatalist()}
      ${st ? `<div class="detail-actions">${d.chiuso ? '<button type="button" class="btn ghost" data-riapri>Riapri il piano</button>'
        : `<button type="button" class="btn ghost" data-salda>Salda il residuo…</button><button type="button" class="btn ghost" data-reso>Annulla per reso…</button>`}</div>` : ''}
      <div class="actions">
        ${isNew ? '' : '<button type="button" class="btn ghost danger" data-del>Elimina</button><span class="spacer"></span>'}
        <button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button>
      </div>
    </form>`, { wide: true });
  const f = $('form', dlg);

  const num = () => Math.max(1, Math.min(360, Math.floor(Number(f.n.value)) || 1));
  // Bozza del piano con i valori scritti finora (per i calcoli del riepilogo)
  const bozza = () => ({ id: rec?.id || 'nuovo', data: {
    ...d, prezzo: prezzo?.val ?? 0, importoRata: rata?.val ?? 0, ultimaRata: ultima?.val ?? null, nRate: num(),
    anticipo: ant?.val > 0 ? { val: ant.val, data: f.antData.value || f.acq.value } : null,
    dataAcquisto: f.acq.value, primaScadenza: f.prima.value || f.acq.value, freq: f.freq.value, ogni: Number(f.ogni.value) || 1,
  } });
  const showAmt = (inp, v) => { if (document.activeElement !== inp) inp.value = v ? fmt(v.val) : ''; };
  function autoRata() {
    if (!rataAuto) return;
    const r = M.rataSenzaInteressi(prezzo?.val, ant?.val, num());
    rata = r ? { val: r.rata, espr: null } : null;
    ultima = r?.ultima != null ? { val: r.ultima, espr: null } : null;
    showAmt(f.rata, rata); showAmt(f.ultima, ultima);
  }
  function autoScadenza() {
    if (scadAuto && f.acq.value) f.prima.value = modSubito ? f.acq.value : unMeseDopo(f.acq.value);
  }
  function paintCat() {
    f.cat.innerHTML = M.cats('out').map((c) => `<option value="${c.id}"${c.id === d.cat ? ' selected' : ''}>${esc(M.catLabel(c))}</option>`).join('');
    const list = M.subs(d.cat);
    $('[data-subf]', f).hidden = !list.length;
    f.sub.innerHTML = '<option value="">Nessuna</option>' + list.map((x) => `<option value="${x.id}"${x.id === d.sub ? ' selected' : ''}>${esc(x.data.nome)}</option>`).join('');
  }
  function paintTags(focus = false) {
    $('[data-tags]', f).innerHTML = tagEditorHTML(tags);
    if (focus) $('[data-tagin]', f).focus();
  }
  function addTags(raw, focus = false) {
    const inp = $('[data-tagin]', f);
    if (inp) inp.value = '';
    for (const part of raw.split(',')) {
      const tg = M.normTag(part);
      if (tg && !tags.some((x) => x.toLowerCase() === tg.toLowerCase())) tags.push(tg);
    }
    paintTags(focus);
  }
  function paintMod() {
    $$('[data-mod]', f).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mod === d.modalita)));
    const cambio = rec && !d.chiuso && d.modalita !== modOrig;
    $('[data-modnote]', f).textContent = (d.modalita === 'acquisto'
      ? "Il prezzo conta come uscita il giorno dell'acquisto; le rate tolgono i soldi dal fondo senza contare di nuovo nelle uscite. Gli interessi, se ci sono, sono uscite a parte."
      : 'Ogni rata conta come uscita nel giorno in cui la paghi, interessi compresi.') +
      (cambio ? ' Salvando, i movimenti già aggiunti e non modificati a mano vengono rifatti in questo modo.' : '');
  }
  function paintSum() {
    $$('[data-antf]', f).forEach((el) => { el.hidden = !(ant?.val > 0); });
    const box = $('.rate-sum', f);
    if (!rata?.val || !f.prima.value) { box.textContent = prezzo?.val && !rata ? "Scrivi l'importo della rata." : ''; box.className = 'rate-sum muted'; return; }
    const p = bozza();
    const n = num(), costo = M.costoFinanziamento(p), tot = round2(M.totaleRate(p) + M.anticipoVal(p));
    const ult = n > 1 && ultima && Math.abs(ultima.val - rata.val) >= 0.005 ? ` (l'ultima ${fmtEur(ultima.val)})` : '';
    const quando = ricSummary({ inizio: p.data.primaScadenza, freq: p.data.freq, ogni: p.data.ogni, fine: n > 1 ? M.rataDate(p, n) : p.data.primaScadenza })
      .replace(/^Ogni/, 'ogni').replace(/\.$/, '');
    const subito = p.data.primaScadenza === p.data.dataAcquisto ? ' La prima rata si paga il giorno dell\'acquisto.' : '';
    box.className = 'rate-sum' + (costo > 0.005 ? ' costo' : '');
    box.innerHTML = `${n === 1 ? '1 rata' : `${n} rate`} da <b>${fmtEur(rata.val)}</b>${ult}, ${n === 1 ? `il ${fmtDay(p.data.primaScadenza)}` : esc(quando)}.${subito}<br>
      Totale pagato <b>${fmtEur(tot)}</b>${prezzo?.val ? ` · ${costo > 0.005 ? `costo del finanziamento <b>${fmtEur(costo)}</b> (interessi e commissioni)`
        : costo < -0.005 ? `${fmtEur(-costo)} meno del prezzo` : 'nessun costo di finanziamento'}` : ''}.`;
  }
  function applyModello(k) {
    const m = MODELLI_RATE.find((x) => x[0] === k)?.[2];
    if (!m) { modSubito = false; rataAuto = true; autoRata(); autoScadenza(); paintSum(); return; }
    f.cred.value = m.creditore; f.n.value = m.nRate; f.freq.value = 'mese'; f.ogni.value = 1;
    modSubito = m.subito; scadAuto = true; rataAuto = m.auto;
    if (!m.auto) { rata = null; ultima = null; showAmt(f.rata, null); showAmt(f.ultima, null); }
    autoRata(); autoScadenza(); paintSum();
  }

  bindAmount(f.prezzo, () => prezzo, (p) => { prezzo = p; autoRata(); paintSum(); });
  bindAmount(f.rata, () => rata, (p) => { if ((p?.val ?? null) !== (rata?.val ?? null)) { rataAuto = false; if (ultima && !p) ultima = null; } rata = p; paintSum(); });
  bindAmount(f.ultima, () => ultima, (p) => { if ((p?.val ?? null) !== (ultima?.val ?? null)) rataAuto = false; ultima = p; paintSum(); });
  bindAmount(f.ant, () => ant, (p) => { ant = p; autoRata(); paintSum(); });
  paintCat(); paintTags(); paintMod();
  if (isNew && modello !== 'custom') applyModello(modello);
  else { if (isNew) autoScadenza(); autoRata(); paintSum(); }

  f.addEventListener('input', (e) => {
    const n = e.target.name;
    if (n === 'n') { autoRata(); paintSum(); }
    if (n === 'ogni' || n === 'antData') paintSum();
  });
  f.addEventListener('change', (e) => {
    const n = e.target.name;
    if (n === 'modello') applyModello(e.target.value);
    if (n === 'acq') { autoScadenza(); if (!d.anticipo?.data) f.antData.value = f.acq.value; paintSum(); }
    if (n === 'prima') { scadAuto = false; paintSum(); }
    if (n === 'freq') paintSum();
    if (n === 'cat') { d.cat = e.target.value; d.sub = M.suggestSub(d.cat, f.desc.value.trim()); catManual = true; paintCat(); }
    if (n === 'sub') d.sub = e.target.value || null;
    if (n === 'desc' && !catManual) {
      const sug = M.suggestCat('out', e.target.value.trim());
      if (sug) { d.cat = sug; d.sub = M.suggestSub(sug, e.target.value.trim()); paintCat(); }
    }
  });
  f.addEventListener('keydown', (e) => {
    if (e.target.matches?.('[data-tagin]') && (e.key === 'Enter' || e.key === ',')) {
      e.preventDefault();
      if (e.target.value.trim()) addTags(e.target.value, true);
    }
  });
  f.addEventListener('focusout', (e) => { if (e.target.matches?.('[data-tagin]') && e.target.value.trim()) addTags(e.target.value); });
  f.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) { dlg.close(); return; }
    const rm = e.target.closest('[data-rmtag]');
    if (rm) { tags = tags.filter((x) => x !== rm.dataset.rmtag); paintTags(); return; }
    const mb = e.target.closest('[data-mod]');
    if (mb && !mb.disabled) { d.modalita = mb.dataset.mod; paintMod(); return; }
    if (e.target.closest('[data-salda]')) { chiusuraDialog(rec, 'saldo', () => { dlg.close(); onDone && onDone(rec.id); }); return; }
    if (e.target.closest('[data-reso]')) { chiusuraDialog(rec, 'reso', () => { dlg.close(); onDone && onDone(rec.id); }); return; }
    if (e.target.closest('[data-riapri]')) {
      if (!(await confirmBox('Riaprire il piano? I movimenti della chiusura vengono tolti e le rate ricominciano a essere aggiunte alle scadenze.', { ok: 'Riapri' }))) return;
      M.riapriPiano(rec.id); dlg.close(); toast('Piano riaperto'); onDone && onDone(rec.id);
      return;
    }
    if (e.target.closest('[data-del]')) {
      if (!(await confirmBox('Eliminare questo pagamento a rate? I movimenti già aggiunti restano dove sono, ma non ne verranno aggiunti altri.', { ok: 'Elimina', danger: true }))) return;
      const backup = rec.data;
      store.remove(rec.id); dlg.close();
      toast('Pagamento a rate eliminato', { action: 'Annulla', onAction: () => { store.save('rate', rec.id, backup); onDone && onDone(rec.id); } });
      onDone && onDone(null);
    }
  });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') { e.preventDefault(); return; }
    e.preventDefault();
    document.activeElement?.blur?.();
    const tg = $('[data-tagin]', f);
    if (tg?.value.trim()) addTags(tg.value);
    const err = (msg, el) => { toast(msg); el?.focus(); };
    if (!f.desc.value.trim()) return err('Scrivi una descrizione.', f.desc);
    if (!(prezzo?.val > 0)) return err('Indica il prezzo del bene.', f.prezzo);
    if (!(rata?.val > 0)) return err("Indica l'importo della rata.", f.rata);
    if (ultima && !(ultima.val > 0)) return err("L'ultima rata deve essere maggiore di zero.", f.ultima);
    if (ant && ant.val < 0) return err("L'anticipo non può essere negativo.", f.ant);
    if (!f.acq.value) return err("Indica la data di acquisto.", f.acq);
    if (!f.prima.value) return err('Indica la prima scadenza.', f.prima);
    if (f.prima.value < f.acq.value) return err("La prima scadenza non può essere prima dell'acquisto.", f.prima);
    const n = num();
    const data = {
      ...d, desc: f.desc.value.trim(), cat: f.cat.value, sub: f.sub.value || null, tags: [...tags],
      prezzo: prezzo.val, prEspr: prezzo.espr, nRate: n, importoRata: rata.val, irEspr: rata.espr,
      ultimaRata: n > 1 && ultima && Math.abs(ultima.val - rata.val) >= 0.005 ? ultima.val : null,
      urEspr: n > 1 && ultima && Math.abs(ultima.val - rata.val) >= 0.005 ? ultima.espr : null,
      anticipo: ant?.val > 0 ? { val: ant.val, espr: ant.espr, data: f.antData.value || f.acq.value, fondo: f.antFondo.value || '' } : null,
      fondo: f.fondo.value, creditore: f.cred.value.trim(), dataAcquisto: f.acq.value, primaScadenza: f.prima.value,
      freq: f.freq.value, ogni: Math.min(99, Math.max(1, Math.floor(Number(f.ogni.value)) || 1)),
      note: f.note.value.trim() || null, chiuso: !!d.chiuso, chiusura: d.chiusura || null,
      gen: Math.max(1, Math.floor(d.gen) || 1) + (rec && !d.chiuso && d.modalita !== modOrig ? 1 : 0),
    };
    const id = rec ? rec.id : store.newId();
    store.save('rate', id, data);
    const g = M.generaRate();
    dlg.close();
    toast(g.rate ? `Salvato: ${g.rate === 1 ? 'aggiunta 1 rata già scaduta' : `aggiunte ${g.rate} rate già scadute`}` : isNew ? 'Pagamento a rate salvato' : 'Modifiche salvate');
    onDone && onDone(id);
  });
  if (isNew && !seed) f.desc.focus();
  return dlg;
}

// Riga di stato del piano (rate pagate, residuo, prossima scadenza)
function statoHTML(p, st) {
  const c = p.data.chiusura;
  if (st.chiuso) {
    return c?.tipo === 'reso' ? `Annullato per reso il ${fmtDay(c.data)}${c.val ? `, rimborso di ${fmtEur(c.val)}` : ''}.`
      : `Saldato il ${fmtDay(c?.data || M.todayIso())}${c?.val ? ` con ${fmtEur(c.val)}` : ''}.`;
  }
  return `Pagate <b>${st.pagate}</b> di ${fmtRata(st.totale)}${st.residuo > 0.005 ? ` · ancora da pagare <b>${fmtEur(st.residuo)}</b>` : ' · tutte pagate'}` +
    (st.prossima ? ` · prossima il ${fmtDay(st.prossima.date)}` : '');
}

// "Salda il residuo" o "Annulla per reso": data, importo (proposto) e fondo, poi il piano si chiude
export function chiusuraDialog(p, tipo, onDone) {
  const oggi = M.todayIso();
  const reso = tipo === 'reso';
  const acquisto = M.modalitaPiano(p) === 'acquisto';
  const proposto = (date) => (reso ? M.pagatoAl(p, date) : M.residuoAl(p, date));
  let amount = { val: proposto(oggi), espr: null };
  let manuale = false;
  const dlg = modal(`
    <form class="dlg" method="dialog" novalidate>
      <header class="dlg-head"><h2>${reso ? 'Annulla per reso' : 'Salda il residuo'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <p class="muted">${reso
        ? `Il piano si chiude e non vengono aggiunte altre rate. Alla data scelta il fondo riceve il rimborso di quanto hai già pagato (per un reso parziale cambia l'importo).
          ${acquisto ? "Il rimborso non conta come entrata e l'uscita del prezzo si riduce di quanto ti viene restituito: sparisce se il reso è totale." : 'Il rimborso è un\'entrata nella categoria del piano.'}`
        : `Registra il pagamento finale: il piano si chiude e non vengono aggiunte altre rate.${acquisto ? ' Se paghi più del capitale ancora da restituire, la differenza conta come interessi e commissioni.' : ''}`}</p>
      <div class="form-grid">
        <label class="field"><span>Data</span><input name="date" type="date" value="${oggi}" max="${oggi}" required></label>
        <label class="field"><span>${reso ? 'Rimborso' : 'Importo pagato'}</span><input name="val" class="amt" inputmode="decimal" autocomplete="off" value="${fmt(amount.val)}"></label>
      </div>
      <label class="field"><span>${reso ? 'Ricevuto su' : 'Pagato con'}</span><select name="fondo"><option value="">Nessun fondo</option>${accOptions(p.data.fondo)}</select></label>
      <div class="actions"><button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="ok">${reso ? 'Annulla il piano' : 'Salda'}</button></div>
    </form>`);
  const f = $('form', dlg);
  bindAmount(f.val, () => amount, (v) => { if ((v?.val ?? null) !== amount?.val) manuale = true; amount = v; });
  f.date.addEventListener('change', () => {
    if (manuale || !f.date.value) return;
    amount = { val: proposto(f.date.value), espr: null };
    f.val.value = fmt(amount.val);
  });
  f.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) dlg.close(); });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.submitter && e.submitter.value !== 'ok') return;
    document.activeElement?.blur?.();
    if (!f.date.value || f.date.value > oggi) { toast('Scegli una data di oggi o passata.'); f.date.focus(); return; }
    const val = amount?.val ?? 0;
    if (val < 0 || (!reso && !(val > 0))) { toast(reso ? 'Il rimborso non può essere negativo.' : 'Indica quanto hai pagato.'); f.val.focus(); return; }
    const args = { data: f.date.value, val, espr: amount?.espr || null, fondo: f.fondo.value };
    if (reso) M.resoPiano(p.id, args); else M.saldaPiano(p.id, args);
    dlg.close();
    toast(reso ? 'Piano annullato per reso' : 'Piano saldato', { action: 'Annulla', ms: 6000, onAction: () => { M.riapriPiano(p.id); onDone && onDone(); } });
    onDone && onDone();
  });
}
