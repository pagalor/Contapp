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
export function modal(html, { onClose, wide } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal' + (wide ? ' wide' : '');
  dlg.innerHTML = html;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => { dlg.remove(); onClose && onClose(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
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
          <button value="ok" class="btn ${danger ? 'danger' : 'primary'}">${esc(ok)}</button>
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
