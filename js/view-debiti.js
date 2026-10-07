import * as store from './store.js';
import * as M from './model.js';
import { parseAmount, fmt, fmtEur, saldoCls, plain, round2 } from './expr.js';
import { esc, $, $$, modal, toast, confirmBox } from './ui.js';

let root;
const FILTER_KEY = 'contabilita.debitiFiltro';
const filtro = () => { try { return localStorage.getItem(FILTER_KEY) || 'aperti'; } catch { return 'aperti'; } };
const fmtD = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

export function render(el) { root = el; draw(); }
export function redraw() { if (root && root.isConnected) draw(); }

function draw() {
  const t = M.debtTotals();
  const f = filtro();
  const all = M.debts().sort((a, b) => (b.data.data || '').localeCompare(a.data.data || '') || b.data.ord - a.data.ord);
  const list = all.filter((r) => f === 'tutti' || (f === 'aperti' ? M.residuo(r) > 0.005 : M.residuo(r) <= 0.005));
  // raggruppo per persona
  const byP = new Map();
  for (const r of list) {
    const k = r.data.persona || '(senza nome)';
    if (!byP.has(k)) byP.set(k, []);
    byP.get(k).push(r);
  }
  root.innerHTML = `
    <section class="debiti">
      <header class="page-head">
        <h1>Debiti e crediti</h1>
        <button class="btn primary" data-act="new">Nuovo</button>
      </header>
      <dl class="stats">
        <div><dt>Ti devono</dt><dd class="in">${fmtEur(t.crediti)}</dd></div>
        <div><dt>Devi</dt><dd class="out">${fmtEur(t.debiti)}</dd></div>
        <div><dt>Saldo</dt><dd class="${saldoCls(t.netto)}">${t.netto >= 0 ? '+' : '−'}${fmtEur(Math.abs(t.netto))}</dd></div>
      </dl>
      <nav class="chips" aria-label="Filtro">
        ${[['aperti', 'Da saldare'], ['saldati', 'Saldati'], ['tutti', 'Tutti']].map(([k, n]) =>
          `<button class="chip${k === f ? ' on' : ''}" data-filter="${k}">${n}</button>`).join('')}
      </nav>
      ${list.length ? [...byP.entries()].map(([p, items]) => personBlock(p, items)).join('') : `
        <div class="empty-hint"><p>${all.length ? 'Nessuna voce in questo elenco.' : `Qui tieni traccia dei soldi che hai prestato o che ti hanno prestato.
          Per esempio: paghi una cena da 68 € per quattro, segni 17 € come tua uscita e un credito di 51 € verso gli altri.`}</p></div>`}
    </section>`;
  bind();
}

function personBlock(p, items) {
  let net = 0;
  for (const r of items) net += (r.data.tipo === 'credito' ? 1 : -1) * M.residuo(r);
  net = round2(net);
  return `<section class="person">
    <h2>${esc(p)}<span class="${net > 0.005 ? 'in' : net < -0.005 ? 'out' : 'muted'}">${
      net > 0.005 ? `ti deve ${fmtEur(net)}` : net < -0.005 ? `gli devi ${fmtEur(-net)}` : 'in pari'}</span></h2>
    <div class="debt-list">${items.map(item).join('')}</div>
  </section>`;
}

function item(r) {
  const d = r.data;
  const res = M.residuo(r);
  const saldato = res <= 0.005;
  const pct = d.val > 0 ? Math.min(100, ((d.val - res) / d.val) * 100) : 0;
  return `<button class="debt ${d.tipo}${saldato ? ' done' : ''}" data-id="${r.id}">
    <span class="debt-kind">${d.tipo === 'credito' ? 'Ti deve' : 'Devi'}</span>
    <span class="debt-desc">${esc(d.desc || '(senza descrizione)')}<small>${fmtD(d.data)}${d.fondo ? ', ' + esc(M.accName(d.fondo)) : ''}</small></span>
    <span class="debt-amt">${saldato ? 'Saldato' : fmtEur(res)}${!saldato && res < d.val ? `<small>di ${fmtEur(d.val)}</small>` : ''}</span>
    ${(d.rimborsi || []).length && !saldato ? `<span class="debt-track"><span style="width:${pct}%"></span></span>` : ''}
  </button>`;
}

function bind() {
  $('[data-act="new"]', root).onclick = () => editor(null);
  $$('[data-filter]', root).forEach((b) => b.addEventListener('click', () => {
    try { localStorage.setItem(FILTER_KEY, b.dataset.filter); } catch {}
    draw();
  }));
  $$('.debt[data-id]', root).forEach((b) => b.addEventListener('click', () => editor(store.get(b.dataset.id))));
}

const fondoOptions = (sel) => '<option value="">Nessuno (non tocca i fondi)</option>' +
  M.accounts().map((c) => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.data.nome)}</option>`).join('');

function amountBinding(input, get, set) {
  input.addEventListener('focus', () => { const v = get(); input.value = v ? (v.espr || plain(v.val)) : ''; input.select(); });
  input.addEventListener('blur', () => {
    try { const p = parseAmount(input.value); set(p); } catch (e) { toast(e.message); }
    const v = get(); input.value = v ? fmt(v.val) : '';
  });
}

function editor(rec) {
  const isNew = !rec;
  const d = rec ? JSON.parse(JSON.stringify(rec.data)) : {
    tipo: 'credito', persona: '', desc: '', val: null, espr: null, data: M.todayIso(), fondo: '', rimborsi: [], note: null, ord: Date.now(),
  };
  const auto = M.autoAttivo();
  const dlg = modal(`
    <form class="dlg" method="dialog">
      <header class="dlg-head"><h2>${isNew ? 'Nuovo debito o credito' : 'Debito o credito'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <div class="seg wide" role="group">
        <button type="button" data-tipo="credito" aria-pressed="${d.tipo === 'credito'}">Mi deve dei soldi</button>
        <button type="button" data-tipo="debito" aria-pressed="${d.tipo === 'debito'}">Devo dei soldi</button>
      </div>
      <div class="form-grid">
        <label class="field"><span>Persona</span><input name="persona" list="dl-persone" value="${esc(d.persona)}" required autocomplete="off"></label>
        <label class="field"><span>Importo</span><input name="val" class="amt" inputmode="decimal" value="${d.val == null ? '' : fmt(d.val)}" required></label>
        <label class="field"><span>Per cosa</span><input name="desc" value="${esc(d.desc)}" placeholder="es. cena di sabato" autocomplete="off"></label>
        <label class="field"><span>Data</span><input name="data" type="date" value="${d.data}" required></label>
      </div>
      ${auto ? `<label class="field"><span data-fondo-label></span><select name="fondo">${fondoOptions(d.fondo)}</select></label>
      <p class="muted small-note">Se i soldi sono usciti o entrati davvero da un tuo fondo, sceglilo: il saldo del fondo resta corretto
        senza contare il prestito come spesa o entrata.</p>` : ''}
      <label class="field"><span>Nota</span><input name="note" value="${esc(d.note || '')}" autocomplete="off"></label>
      ${isNew ? '' : '<div class="rimborsi"><h3>Rimborsi</h3><div data-rimb></div><div class="btn-row"><button type="button" class="btn small" data-addr>+ Registra un rimborso</button><button type="button" class="btn small ghost" data-full>Segna come saldato</button></div></div>'}
      <div class="actions">
        ${isNew ? '' : '<button type="button" class="btn ghost danger" data-del>Elimina</button><span class="spacer"></span>'}
        <button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button>
      </div>
    </form>
    <datalist id="dl-persone">${M.persone().map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`, { wide: true });
  const f = $('form', dlg);
  let amount = d.val == null ? null : { val: d.val, espr: d.espr };
  amountBinding(f.val, () => amount, (p) => { amount = p; paintRimb(); });

  function paintTipo() {
    $$('[data-tipo]', f).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tipo === d.tipo)));
    const lab = $('[data-fondo-label]', f);
    if (lab) lab.textContent = d.tipo === 'credito' ? 'Soldi usciti da' : 'Soldi entrati in';
    paintRimb();
  }
  function paintRimb() {
    const box = $('[data-rimb]', f);
    if (!box) return;
    const res = round2((amount?.val || 0) - d.rimborsi.reduce((s, p) => s + (p.val || 0), 0));
    box.innerHTML = (d.rimborsi.length ? d.rimborsi.map((p, i) => `
      <div class="rimb-row" data-i="${i}">
        <input type="date" data-rk="data" value="${p.data}" aria-label="Data">
        <input class="amt" data-rk="val" inputmode="decimal" value="${p.val == null ? '' : fmt(p.val)}" aria-label="Importo">
        ${auto ? `<select data-rk="fondo" aria-label="${d.tipo === 'credito' ? 'Ricevuto su' : 'Pagato con'}">${fondoOptions(p.fondo).replace('Nessuno (non tocca i fondi)', 'Nessun fondo')}</select>` : ''}
        <button type="button" class="icon-btn small" data-rmr aria-label="Togli">×</button>
      </div>`).join('') : '<p class="muted">Nessun rimborso registrato.</p>') +
      `<p class="rimb-res">${res > 0.005 ? `Ancora da ${d.tipo === 'credito' ? 'ricevere' : 'restituire'}: <b>${fmtEur(res)}</b>` : res < -0.005 ? `Rimborsato ${fmtEur(-res)} in più` : '<b>Saldato</b>'}</p>`;
    $$('.rimb-row', box).forEach((row) => {
      const i = Number(row.dataset.i);
      amountBinding($('[data-rk="val"]', row), () => (d.rimborsi[i].val == null ? null : d.rimborsi[i]), (p) => {
        d.rimborsi[i].val = p?.val ?? null; d.rimborsi[i].espr = p?.espr ?? null; paintRimb();
      });
      $('[data-rk="data"]', row).addEventListener('change', (e) => { d.rimborsi[i].data = e.target.value; });
      $('[data-rk="fondo"]', row)?.addEventListener('change', (e) => { d.rimborsi[i].fondo = e.target.value; });
    });
  }
  paintTipo();

  f.addEventListener('click', async (e) => {
    const tb = e.target.closest('[data-tipo]');
    if (tb) { d.tipo = tb.dataset.tipo; paintTipo(); }
    if (e.target.closest('[data-x]')) dlg.close();
    const res = () => round2((amount?.val || 0) - d.rimborsi.reduce((s, p) => s + (p.val || 0), 0));
    if (e.target.closest('[data-addr]')) {
      d.rimborsi.push({ data: M.todayIso(), val: res() > 0 ? res() : null, espr: null, fondo: M.cfg().contoIn || '' });
      paintRimb();
    }
    if (e.target.closest('[data-full]')) {
      if (res() > 0.005) d.rimborsi.push({ data: M.todayIso(), val: res(), espr: null, fondo: '' });
      paintRimb();
      toast(auto ? 'Indica su quale fondo sono arrivati o da quale sono usciti i soldi, poi salva.' : 'Segnato come saldato: premi Salva.');
    }
    const rm = e.target.closest('[data-rmr]');
    if (rm) { d.rimborsi.splice(Number(rm.closest('.rimb-row').dataset.i), 1); paintRimb(); }
    if (e.target.closest('[data-del]')) {
      if (!(await confirmBox('Eliminare questa voce e i suoi rimborsi?', { ok: 'Elimina', danger: true }))) return;
      store.remove(rec.id); dlg.close(); draw();
      toast('Voce eliminata', { action: 'Annulla', onAction: () => { store.save('debt', rec.id, rec.data); draw(); } });
    }
  });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') return;
    document.activeElement?.blur?.();
    if (!amount || !(amount.val > 0)) { e.preventDefault(); toast("Indica un importo maggiore di zero."); return; }
    if (!f.persona.value.trim()) { e.preventDefault(); toast('Indica la persona.'); return; }
    const data = {
      ...d, persona: f.persona.value.trim(), desc: f.desc.value.trim(), val: amount.val, espr: amount.espr,
      data: f.data.value, fondo: f.fondo ? f.fondo.value : d.fondo || '', note: f.note.value.trim() || null,
      rimborsi: d.rimborsi.filter((p) => typeof p.val === 'number' && p.val > 0 && p.data),
    };
    store.save('debt', rec ? rec.id : store.newId(), data);
    toast(isNew ? 'Registrato' : 'Aggiornato');
    draw();
  });
}
