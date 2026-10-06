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

// --- Nuovo movimento (da telefono): finestra a tutto schermo con campi grandi ---
// Non salva niente finché non si preme "Aggiungi"; "Annulla" chiude senza lasciare tracce.
// `seed` precompila i campi (serve a "Aggiungi e duplica").
export function movDialog({ tipo = 'out', y, m, d = null, seed = null, onDone } = {}) {
  const ymVal = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}`;
  const daysIn = (yy, mm) => new Date(yy, mm, 0).getDate();
  let catAuto = !seed, contoAuto = !seed;
  let tags = [...(seed?.tags || [])];
  let split = seed?.conti?.length > 1 ? seed.conti.map((x) => ({ ...x })) : null; // ripartizione su più fondi, se scelta
  const catOpts = (t, sel) => M.cats(t).map((c) => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(M.catLabel(c))}</option>`).join('');
  const dlg = modal(`
    <form class="dlg mov-dlg" method="dialog" novalidate>
      <header class="dlg-head"><h2 data-title></h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <div class="seg wide" role="group" aria-label="Tipo di movimento">
        <button type="button" data-seg="out">Uscita</button>
        <button type="button" data-seg="in">Entrata</button>
      </div>
      <label class="field big-amt"><span>Importo (€)</span>
        <input name="amt" inputmode="decimal" autocomplete="off" placeholder="0,00" enterkeyhint="next">
        <small class="amt-prev muted"></small>
      </label>
      <div class="opkeys-big">
        ${['+', '−', '×', '÷', '(', ')'].map((k) => `<button type="button" tabindex="-1" data-op="${k}">${k}</button>`).join('')}
      </div>
      <label class="field"><span>Descrizione</span><input name="desc" list="dl-out" autocomplete="off" placeholder="Per esempio: spesa, stipendio…" enterkeyhint="done"></label>
      <div class="form-grid">
        <label class="field"><span>Giorno</span><input name="d" inputmode="numeric" maxlength="2" autocomplete="off" placeholder="1–31" value="${d ?? ''}"></label>
        <label class="field"><span>Categoria</span><select name="cat"></select></label>
      </div>
      <label class="field"><span data-accl></span><select name="acc"></select></label>
      <h3 class="mov-more">Altre opzioni</h3>
      <div class="field"><span>Tag</span><div data-tags></div></div>
      <label class="field"><span>Nota</span><textarea name="note" rows="2">${esc(seed?.note || '')}</textarea></label>
      <label class="check big-check"><input type="checkbox" name="escl"${seed?.escl ? ' checked' : ''}> Escludi dai totali di entrate e uscite (es. entrate straordinarie)</label>
      <label class="field"><span>Mese</span><input type="month" name="month" value="${ymVal(y, m)}"></label>
      <div class="detail-actions big-actions">
        <button type="button" class="btn ghost" data-dup>Aggiungi e duplica</button>
        <button type="button" class="btn ghost" data-ric>Rendi ricorrente…</button>
      </div>
      <div class="actions sticky-actions">
        <button type="button" class="btn ghost" data-x>Annulla</button>
        <button type="submit" class="btn primary" value="ok">Aggiungi</button>
      </div>
    </form>`);
  const f = $('form', dlg);
  const prev = $('.amt-prev', f);
  const t = () => f.dataset.tipo;
  const mese = () => {
    const [yy, mm] = (f.month.value || ymVal(y, m)).split('-').map(Number);
    return { y: yy || y, m: mm || m };
  };

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
  function setTipo(next) {
    f.dataset.tipo = next;
    $$('[data-seg]', f).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seg === next)));
    setTitle();
    $('[data-accl]', f).textContent = next === 'in' ? 'Ricevuto su' : 'Pagato con';
    f.desc.setAttribute('list', 'dl-' + next);
    catAuto = true; contoAuto = true;
    f.cat.innerHTML = catOpts(next, M.fallbackCat(next));
    suggest();
  }
  // Elenco dei fondi; con una ripartizione attiva mostra anche la voce "Diviso tra N fondi"
  function accOpts(sel) {
    return '<option value="">Nessun fondo</option>' +
      M.accounts().map((a) => `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${esc(a.data.nome)}</option>`).join('') +
      (split ? `<option value="__split" selected>Diviso tra ${split.length} fondi</option>` : '') +
      `<option value="__new">${split ? 'Modifica ripartizione…' : 'Dividi tra più fondi…'}</option>`;
  }
  function suggest() {
    const desc = f.desc.value.trim();
    if (catAuto) { const s = M.suggestCat(t(), desc); if (s) f.cat.value = s; else if (!desc) f.cat.value = M.fallbackCat(t()); }
    if (contoAuto && !split) f.acc.innerHTML = accOpts(M.suggestConto(t(), desc));
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
    const mm = mese();
    let giorno = null;
    const dv = f.d.value.trim();
    if (dv) {
      giorno = parseInt(dv, 10);
      const max = daysIn(mm.y, mm.m);
      if (!(giorno >= 1 && giorno <= max)) { f.d.classList.add('err'); f.d.focus(); toast(`Il giorno deve essere tra 1 e ${max}`); return null; }
    }
    const tg = $('[data-tagin]', f);
    if (tg?.value.trim()) addTags(tg.value);
    const conti = f.acc.value === '__split' ? split : f.acc.value ? [{ c: f.acc.value }] : [];
    if (f.acc.value === '__split' && Math.abs(round2(p.val - split.reduce((n, x) => n + (x.val || 0), 0))) >= 0.005) {
      f.acc.focus(); toast("L'importo è cambiato: ripeti la divisione tra i fondi."); return null;
    }
    return {
      y: mm.y, m: mm.m, d: giorno, tipo: t(), espr: p.espr, val: p.val, desc: f.desc.value.trim(),
      cat: f.cat.value || M.fallbackCat(t()), catAuto, conti, contoAuto,
      tags: [...tags], note: f.note.value.trim() || null, escl: f.escl.checked, ord: Date.now(),
    };
  }
  function save(data) {
    const id = store.newId();
    store.save('mov', id, data);
    toast(data.tipo === 'in' ? 'Entrata aggiunta' : 'Uscita aggiunta');
    return id;
  }

  f.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) { dlg.close(); return; }
    const tb = e.target.closest('[data-seg]');
    if (tb) { setTipo(tb.dataset.seg); return; }
    const rm = e.target.closest('[data-rmtag]');
    if (rm) { tags = tags.filter((x) => x !== rm.dataset.rmtag); paintTags(); return; }
    if (e.target.closest('[data-dup]')) {
      const data = read();
      if (!data) return;
      const id = save(data);
      dlg.close();
      onDone && onDone(id, data);
      movDialog({ tipo: data.tipo, y: data.y, m: data.m, d: data.d, seed: data, onDone });
      return;
    }
    if (e.target.closest('[data-ric]')) {
      const data = read();
      if (!data) return;
      ricDialog({ seed: ricSeedFromMov({ data }), onDone: () => toast('Movimento ricorrente salvato. Ricorda di premere Aggiungi.') });
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
  f.cat.addEventListener('change', () => { catAuto = false; });
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
  f.month.addEventListener('change', () => { f.d.placeholder = `1–${daysIn(mese().y, mese().m)}`; setTitle(); });
  function setTitle() {
    $('[data-title]', f).textContent = `${t() === 'in' ? 'Nuova entrata' : 'Nuova uscita'} · ${M.MESI_BREVI[mese().m - 1]} ${mese().y}`;
  }

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = read();
    if (!data) return;
    const id = save(data);
    dlg.close();
    onDone && onDone(id, data);
  });

  paintTags();
  setTipo(tipo);
  f.d.placeholder = `1–${daysIn(y, m)}`;
  if (seed) {
    f.amt.value = seed.espr || String(seed.val).replace('.', ',');
    f.desc.value = seed.desc || '';
    f.cat.value = seed.cat || f.cat.value;
    f.acc.innerHTML = accOpts(split ? null : seed.conti?.[0]?.c);
    preview();
  }
  f.amt.focus();
  return dlg;
}

// --- Trasferimento tra conti (nuovo o esistente) ---
export function transferDialog({ rec = null, da = '', a = '', val = null, date = null, onDone } = {}) {
  const d0 = rec ? M.recDate(rec) : (date || M.todayIso());
  let amount = rec ? { val: rec.data.val, espr: rec.data.espr } : val != null ? { val, espr: null } : null;
  const dlg = modal(`
    <form class="dlg" method="dialog">
      <header class="dlg-head"><h2>${rec ? 'Trasferimento' : 'Nuovo trasferimento'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <p class="muted">Spostare soldi tra i tuoi fondi non è né una spesa né un'entrata: cambia solo dove si trovano.</p>
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
    tipo: d.tipo, desc: d.desc || '', val: d.val ?? null, espr: d.espr || null, cat: d.cat, conti: (d.conti || []).length === 1 ? [{ c: d.conti[0].c }] : [],
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
