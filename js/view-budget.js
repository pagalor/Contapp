import * as M from './model.js';
import * as store from './store.js';
import { fmt, fmtEur } from './expr.js';
import { esc, $, modal, toast, confirmBox } from './ui.js';
import { bindAmount } from './dialogs.js';
import { monthInput, yearInput } from './datepick.js';
import { rowHTML, rowVuotaHTML } from './budgetui.js';

let root;

// root è una sezione nuova a ogni visita della pagina: i click si agganciano qui una volta sola
export function render(el) {
  el.innerHTML = '<section class="budget"></section>';
  root = el.firstElementChild;
  bind();
  draw();
}
export function redraw() { if (root && root.isConnected) draw(); }

const meseDi = (ym) => { const [y, m] = ym.split('-').map(Number); return `${M.MESI[m - 1].toLowerCase()} ${y}`; };

function draw() {
  const t = new Date();
  const items = M.budgets({ tutti: true }).map((b) => {
    if (!M.budgetValido(b)) return rowVuotaHTML(b, 'Categoria o sottocategoria eliminata: modificalo o eliminalo');
    const s = M.budgetStato(b, t.getFullYear(), t.getMonth() + 1, t);
    if (s) return rowHTML(s);
    return rowVuotaHTML(b, `Parte da ${meseDi(M.budgetValori(b)[0].da)}`);
  });
  root.innerHTML = `
    <header class="page-head">
      <h1>Budget</h1>
      <button class="btn primary" data-act="new">Nuovo</button>
    </header>
    <p class="muted intro-note">Quanto vuoi spendere al massimo per una categoria, una sottocategoria, un tag o per tutte le uscite.
      Nella pagina Mese vedi a che punto sei. Contano le uscite, come nei totali.</p>
    ${items.length ? `<div class="bud-list card">${items.join('')}</div>` : `
      <div class="empty-hint"><p>Nessun budget. Per esempio: 400 € al mese per la spesa, oppure 1.500 € all'anno per i viaggi.</p></div>`}`;
}

function bind() {
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="new"]')) { budgetDialog({ onDone: redraw }); return; }
    const b = e.target.closest('.bud[data-id]');
    if (b) budgetDialog({ rec: store.get(b.dataset.id), onDone: redraw });
  });
}

// Finestra per creare o modificare un budget. All'inizio propone la mediana mensile degli ultimi 12 mesi.
function budgetDialog({ rec = null, onDone } = {}) {
  const isNew = !rec;
  const d = rec ? { ...rec.data } : { su: 'cat', rif: null, periodo: 'mese', riporto: false, ord: Date.now() };
  const su0 = M.budgetSu({ data: d });
  const last = rec ? M.budgetValori(rec).at(-1) : null;
  let amount = last ? { val: last.val, espr: last.espr } : null;
  let toccato = !isNew; // l'importo l'ha scritto l'utente: la proposta non lo sovrascrive più
  let periodo = M.budgetPeriodo({ data: d });
  const oggi = M.todayIso().slice(0, 7);

  const outCats = M.cats('out');
  const catsConSub = outCats.filter((c) => M.hasSubs(c.id));
  const haTot = M.budgets({ tutti: true }).some((b) => M.budgetSu(b) === 'tot' && b.id !== rec?.id);
  const suOpts = [['cat', 'Una categoria'], ...(catsConSub.length || su0 === 'sub' ? [['sub', 'Una sottocategoria']] : []),
    ['tag', 'Un tag'], ...(haTot && su0 !== 'tot' ? [] : [['tot', 'Tutte le uscite del mese']])];

  const dlg = modal(`
    <form class="dlg" method="dialog">
      <header class="dlg-head"><h2>${isNew ? 'Nuovo budget' : 'Budget'}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <p class="muted">Quanto vuoi spendere al massimo. Contano le uscite, come nei totali.</p>
      <div class="form-grid">
        <label class="field"><span>Su cosa</span><select name="su">${suOpts.map(([k, n]) => `<option value="${k}"${k === su0 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field" data-box="cat"><span>Categoria</span><select name="cat">${outCats.map((c) => `<option value="${c.id}"${c.id === d.rif ? ' selected' : ''}>${esc(M.catLabel(c))}</option>`).join('')}</select></label>
        <label class="field" data-box="sub" hidden><span>Sottocategoria</span><select name="sub">${catsConSub.map((c) => `<optgroup label="${esc(M.catLabel(c))}">${M.subs(c.id).map((s) => `<option value="${s.id}"${s.id === d.rif ? ' selected' : ''}>${esc(s.data.nome)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <label class="field" data-box="tag" hidden><span>Tag</span><input name="tag" list="dl-bud-tags" value="${su0 === 'tag' ? esc(d.rif || '') : ''}" placeholder="es. Parigi 2026" autocomplete="off"></label>
      </div>
      <div class="seg wide" role="group" aria-label="Periodo" data-periodi>
        <button type="button" data-per="mese" aria-pressed="${periodo === 'mese'}">Al mese</button>
        <button type="button" data-per="anno" aria-pressed="${periodo === 'anno'}">All'anno</button>
      </div>
      <div class="form-grid">
        <label class="field"><span>Importo</span><input name="val" class="amt" inputmode="decimal" value="${amount ? fmt(amount.val) : ''}" required></label>
        <label class="field" data-da="mese"><span>Vale dal</span>${monthInput({ name: 'da', value: oggi })}</label>
        <label class="field" data-da="anno" hidden><span>Vale dall'anno</span>${yearInput({ name: 'daY', value: oggi.slice(0, 4) })}</label>
      </div>
      <p class="bud-hint muted"></p>
      <label class="check"><input type="checkbox" name="riporto"${d.riporto ? ' checked' : ''}> <span data-rip></span></label>
      <datalist id="dl-bud-tags">${M.tagStats().map((t) => `<option value="${esc(t.tag)}">`).join('')}</datalist>
      <div class="actions">
        ${isNew ? '' : '<button type="button" class="btn ghost danger" data-del>Elimina</button><span class="spacer"></span>'}
        <button type="button" class="btn ghost" data-x>Annulla</button><button class="btn primary" value="save">Salva</button>
      </div>
    </form>`, { wide: true });
  const f = $('form', dlg);
  const hint = $('.bud-hint', f);
  bindAmount(f.val, () => amount, (p) => { amount = p; paint(); });
  f.val.addEventListener('input', () => { toccato = true; });

  const rifCorrente = () => {
    const su = f.su.value;
    return su === 'cat' ? f.cat.value : su === 'sub' ? f.sub.value : su === 'tag' ? M.normTag(f.tag.value) : null;
  };
  // Importo cambiato rispetto a quello salvato: serve sapere da quando vale
  const cambiato = () => isNew || !amount || amount.val !== last.val;

  function proponi() {
    const su = f.su.value, rif = rifCorrente();
    const med = isNew ? M.medianaMensile(su, rif) : null;
    if (med > 0 && !toccato) {
      amount = { val: periodo === 'anno' ? med * 12 : med, espr: null };
      f.val.value = fmt(amount.val);
    }
    return med;
  }

  function paint() {
    const su = f.su.value;
    for (const box of f.querySelectorAll('[data-box]')) box.hidden = box.dataset.box !== su;
    $('[data-periodi]', f).hidden = su === 'tot';
    if (su === 'tot') periodo = 'mese';
    for (const b of f.querySelectorAll('[data-per]')) b.setAttribute('aria-pressed', String(b.dataset.per === periodo));
    for (const b of f.querySelectorAll('[data-da]')) b.hidden = b.dataset.da !== periodo || !cambiato();
    $('[data-rip]', f).textContent = periodo === 'anno'
      ? "Riporta l'avanzo (o lo sforamento) all'anno dopo" : "Riporta l'avanzo (o lo sforamento) al mese dopo";
    const med = proponi();
    let t = '';
    if (isNew) {
      if (med > 0) t = `Negli ultimi 12 mesi spendi in mediana ${fmtEur(med)} al mese${periodo === 'anno' ? `, cioè ${fmtEur(med * 12)} all'anno` : ''}.`;
      else if (med === 0) t = 'Negli ultimi 12 mesi non hai speso niente qui.';
    }
    if (!isNew && cambiato()) {
      t = periodo === 'anno' ? "Il nuovo importo vale dall'anno scelto: gli anni prima restano con l'importo di allora."
        : 'Il nuovo importo vale dal mese scelto: i mesi prima restano con l\'importo di allora.';
    }
    hint.textContent = t;
  }
  paint();

  f.addEventListener('change', (e) => { if (['su', 'cat', 'sub', 'tag'].includes(e.target.name)) paint(); });
  f.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-per]');
    if (p) { periodo = p.dataset.per; paint(); }
    if (e.target.closest('[data-x]')) dlg.close();
    if (e.target.closest('[data-del]')) {
      if (!(await confirmBox(`Eliminare il budget "${M.budgetLabel(rec)}"? I movimenti non vengono toccati.`, { ok: 'Elimina', danger: true }))) return;
      const backup = rec.data;
      store.remove(rec.id); dlg.close();
      toast('Budget eliminato', { action: 'Annulla', onAction: () => { store.save('budg', rec.id, backup); onDone && onDone(); } });
      onDone && onDone();
    }
  });
  f.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value !== 'save') return;
    document.activeElement?.blur?.();
    const su = f.su.value, rif = rifCorrente();
    if (su !== 'tot' && !rif) { e.preventDefault(); toast(su === 'tag' ? 'Scrivi il nome del tag.' : 'Scegli a cosa si riferisce il budget.'); return; }
    if (!amount || !(amount.val > 0)) { e.preventDefault(); toast('Indica un importo maggiore di zero.'); return; }
    let da = periodo === 'anno' ? `${Math.floor(Number(f.daY.value))}-01` : f.da.value;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(da)) { e.preventDefault(); toast('Indica da quando vale.'); return; }
    const data = { ...d, su, rif, periodo, riporto: f.riporto.checked };
    if (cambiato()) Object.assign(data, M.budgetConValore(rec || { data: {} }, da, amount));
    store.save('budg', rec ? rec.id : store.newId(), data);
    toast('Budget salvato');
    onDone && onDone();
  });
}
