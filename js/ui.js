export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer;
export function toast(msg, { action, onAction, ms = 3500 } = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  el.hidden = false;
  el.classList.add('show');
  if (action) $('button', el).onclick = () => { hide(); onAction && onAction(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, ms);
  function hide() { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 200); }
}

// Finestra modale basata su <dialog>. Restituisce il dialog; chiamare dlg.close() per chiudere.
// Con { sheet: true } la finestra occupa tutto lo schermo e segue l'area visibile, così la tastiera non copre i pulsanti.
// cls aggiunge altre classi (per esempio i pannelli dell'account e della sincronizzazione).
export function modal(html, { onClose, wide, sheet, cls } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal' + (wide ? ' wide' : '') + (sheet ? ' sheet' : '') + (cls ? ' ' + cls : '');
  dlg.innerHTML = html;
  document.body.appendChild(dlg);
  // Sul telefono le finestre salgono dal basso (CSS): --kb è l'altezza della tastiera, così il foglio resta sopra
  const vv = window.visualViewport;
  const fit = sheet
    ? () => { dlg.style.height = vv.height + 'px'; dlg.style.top = vv.offsetTop + 'px'; }
    : () => { dlg.style.setProperty('--kb', Math.max(0, innerHeight - vv.height - vv.offsetTop) + 'px'); };
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit(); }
  dlg.addEventListener('close', () => {
    if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
    dlg.remove(); onClose && onClose();
  });
  // Nelle finestre a tutto schermo un tocco accidentale fuori dai campi non deve chiudere nulla
  if (!sheet) dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.showModal();
  return dlg;
}

export function confirmBox(msg, { ok = 'Conferma', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const dlg = modal(`
      <form method="dialog" class="confirm">
        <p>${esc(msg)}</p>
        <div class="actions">
          <button value="no" class="btn ghost">Annulla</button>
          <button value="ok" class="btn primary${danger ? ' danger' : ''}">${esc(ok)}</button>
        </div>
      </form>`, { onClose: () => resolve(result) });
    dlg.querySelector('form').addEventListener('submit', (e) => { result = e.submitter?.value === 'ok'; });
  });
}

export function promptBox(label, value = '', { ok = 'Salva' } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const dlg = modal(`
      <form method="dialog" class="confirm">
        <label class="field"><span>${esc(label)}</span><input name="v" value="${esc(value)}" autocomplete="off"></label>
        <div class="actions">
          <button value="no" class="btn ghost" formnovalidate>Annulla</button>
          <button value="ok" class="btn primary">${esc(ok)}</button>
        </div>
      </form>`, { onClose: () => resolve(result) });
    const inp = dlg.querySelector('input');
    inp.focus(); inp.select();
    dlg.querySelector('form').addEventListener('submit', (e) => {
      if (e.submitter?.value === 'ok' || !e.submitter) result = inp.value.trim();
    });
  });
}

// Finestra di scelta con lo stile dell'app (al posto degli elenchi del sistema): titolo con la × per chiudere,
// voci a blocchi (con i titoli dei gruppi, se ci sono), la voce scelta evidenziata con la spunta.
// voci: [{ value, label, disabled, gruppo }]. Restituisce il valore scelto, oppure null se si chiude senza scegliere.
const SPUNTA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4 4 9-9.5"/></svg>';
export function sceltaBox({ titolo, voci, valore }) {
  return new Promise((resolve) => {
    let scelto = null, gruppo;
    const righe = voci.map((v, i) => {
      const testa = v.gruppo !== gruppo && v.gruppo ? `<li class="scelta-gruppo" role="presentation">${esc(v.gruppo)}</li>` : '';
      gruppo = v.gruppo;
      const on = String(v.value) === String(valore);
      return `${testa}<li role="presentation"><button type="button" class="scelta-voce${on ? ' on' : ''}" role="option" aria-selected="${on}" data-i="${i}"${v.disabled ? ' disabled' : ''}>
        <span>${esc(v.label)}</span>${on ? SPUNTA : ''}</button></li>`;
    }).join('');
    const dlg = modal(`<div class="dlg scelta">
      <header class="dlg-head"><h2>${esc(titolo)}</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
      <ul class="scelta-list" role="listbox" aria-label="${esc(titolo)}">${righe}</ul></div>`, { onClose: () => resolve(scelto) });
    dlg.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) { dlg.close(); return; }
      const b = e.target.closest('.scelta-voce');
      if (b && !b.disabled) { scelto = { value: voci[+b.dataset.i].value }; dlg.close(); }
    });
    const on = dlg.querySelector('.scelta-voce.on') || dlg.querySelector('.scelta-voce:not([disabled])');
    on?.focus({ preventScroll: true });
    on?.scrollIntoView({ block: 'center' });
  }).then((r) => (r ? r.value : null));
}

// Tutti i <select> dell'app si aprono con sceltaBox invece dell'elenco del sistema. Il select resta nella pagina
// (si legge e si scrive come sempre, con .value) ma non riceve i tocchi (CSS: pointer-events: none): il tocco arriva
// all'elemento sotto, e qui si cerca il select che si trova in quel punto. Da tastiera: Invio, Spazio, Alt+↓ o F4.
// Da agganciare una volta all'avvio.
function titoloSelect(sel) {
  return sel.getAttribute('aria-label') || sel.closest('label')?.querySelector('span')?.textContent.trim() || 'Scegli';
}
export async function apriSelect(sel) {
  if (sel.disabled || sel.multiple) return;
  const voci = [...sel.options].filter((o) => !o.hidden).map((o) => ({
    value: o.value, label: o.textContent.trim() || '—', disabled: o.disabled,
    gruppo: o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : '',
  }));
  const v = await sceltaBox({ titolo: titoloSelect(sel), voci, valore: sel.value });
  sel.focus({ preventScroll: true });
  if (v === null || v === sel.value) return;
  sel.value = v;
  sel.dispatchEvent(new Event('input', { bubbles: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}
export function avviaSelect() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || !(e.target instanceof Element)) return;
    const { clientX: x, clientY: y } = e;
    const dentro = (s) => { const r = s.getBoundingClientRect(); return r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    const sel = [e.target, ...e.target.querySelectorAll('select')].find((s) => s instanceof HTMLSelectElement && dentro(s));
    if (!sel) return;
    e.preventDefault();
    e.stopPropagation();
    apriSelect(sel);
  }, true);
  document.addEventListener('keydown', (e) => {
    const s = e.target;
    if (!(s instanceof HTMLSelectElement)) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); apriSelect(s); }
  });
}

export function download(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Tooltip per i grafici (hover su desktop, tocco su telefono)
export function setupTooltips() {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  let current = null;
  const show = (el, x, y) => {
    current = el;
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let left = x - r.width / 2, top = y - r.height - 12;
    left = Math.max(8, Math.min(left, innerWidth - r.width - 8));
    if (top < 8) top = y + 16;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  };
  const hide = () => { tip.hidden = true; current = null; };
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el && e.pointerType === 'mouse') show(el, e.clientX, e.clientY);
  });
  document.addEventListener('pointermove', (e) => {
    if (current && e.pointerType === 'mouse') show(current, e.clientX, e.clientY);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'mouse' && e.target.closest?.('[data-tip]')) hide();
  });
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el) show(el, e.clientX, e.clientY); else if (current) hide();
  });
  addEventListener('scroll', hide, { passive: true });
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
