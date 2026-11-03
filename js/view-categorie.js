// Pagina Categorie (#categorie): colore, emoji, nome e sottocategorie delle categorie di entrata e di uscita.
import * as store from './store.js';
import * as M from './model.js';
import { esc, $, $$, toast, confirmBox, modal } from './ui.js';
import { testataAccount } from './pannelli.js';

let root;

// Colori proposti per le categorie (sono dati delle categorie, come i colori predefiniti in model.js), in ordine di tinta
const COLORI = ['#B23A48', '#C2185B', '#8E44AD', '#6A4FB3', '#5C6BC0', '#2457A6', '#2F6FB3', '#0288D1',
  '#14A3A3', '#00897B', '#12805C', '#4C9A2A', '#6D8B1E', '#9E9D24', '#D4A106', '#D9822B',
  '#E0602F', '#A1662F', '#8D6E63', '#6B7F99', '#78909C', '#455A64', '#9E9E9E', '#5D4037'];

export function render(el) {
  root = el;
  el.innerHTML = `
    <section class="impost">
      ${testataAccount('Categorie')}
      <p class="muted intro-note">Tocca il cerchio per cambiare il colore, il quadrato per l'emoji e il nome per rinominarla. ↳ apre le sottocategorie.</p>
      <div class="two cat-cols">
        <section><h2 class="cap-title"><span class="cap in"></span>Entrate</h2><div class="cat-list" id="cats-in"></div><button class="add-row" data-addcat="in">+ Nuova categoria di entrata</button></section>
        <section><h2 class="cap-title"><span class="cap out"></span>Uscite</h2><div class="cat-list" id="cats-out"></div><button class="add-row" data-addcat="out">+ Nuova categoria di uscita</button></section>
      </div>
    </section>`;
  renderCats();
  bind();
}

const subsOpen = new Set(); // categorie con l'elenco delle sottocategorie aperto

function subsPanel(c) {
  const list = M.subs(c.id);
  const uso = new Map();
  for (const m of M.movs()) if (m.data.cat === c.id && m.data.sub) uso.set(m.data.sub, (uso.get(m.data.sub) || 0) + 1);
  return `<div class="sub-panel" data-cat="${c.id}">
    ${list.map((s) => `<div class="sub-row" data-id="${s.id}">
      <input value="${esc(s.data.nome)}" data-sf="nome" aria-label="Nome sottocategoria">
      <span class="cat-n" title="Movimenti">${uso.get(s.id) || 0}</span>
      <button class="icon-btn small" data-delsub aria-label="Elimina sottocategoria">×</button>
    </div>`).join('')}
    <button class="add-row" data-addsub="${c.id}">+ Nuova sottocategoria</button>
  </div>`;
}

function renderCats() {
  for (const tipo of ['in', 'out']) {
    const uso = new Map();
    for (const m of M.movs()) if (m.data.tipo === tipo) uso.set(m.data.cat, (uso.get(m.data.cat) || 0) + 1);
    $(`#cats-${tipo}`, root).innerHTML = M.cats(tipo).map((c) => `
      <div class="cat-row" data-id="${c.id}" style="--c:${c.data.colore}">
        <button type="button" class="cat-colore" data-colore aria-label="Colore di ${esc(c.data.nome)}" title="Cambia colore"></button>
        <input class="emoji-in" value="${esc(c.data.emoji || '')}" data-cf="emoji" maxlength="8" aria-label="Emoji" placeholder="🙂">
        <input value="${esc(c.data.nome)}" data-cf="nome" aria-label="Nome categoria">
        <span class="cat-n" title="Movimenti">${uso.get(c.id) || 0}</span>
        <button class="icon-btn small subs-btn" data-togsubs aria-label="Sottocategorie" aria-expanded="${subsOpen.has(c.id)}" title="Sottocategorie">↳${M.subs(c.id).length || ''}</button>
        <button class="icon-btn small" data-delcat aria-label="Elimina categoria">×</button>
      </div>${subsOpen.has(c.id) ? subsPanel(c) : ''}`).join('');
  }
}

function bind() {
  const sec = $('.impost', root);
  sec.addEventListener('click', async (e) => {
    const addcat = e.target.closest('[data-addcat]')?.dataset.addcat;
    if (addcat) {
      const list = M.cats(addcat);
      store.save('cat', store.newId(), { nome: 'Nuova categoria', tipo: addcat, colore: '#7A8B99', ord: list.length });
      renderCats();
      const rows = $$(`#cats-${addcat} .cat-row input[data-cf="nome"]`, root);
      rows[rows.length - 1]?.select();
    }
    if (e.target.closest('[data-colore]')) { sceltaColore(store.get(e.target.closest('.cat-row').dataset.id)); return; }
    if (e.target.closest('[data-togsubs]')) {
      const id = e.target.closest('.cat-row').dataset.id;
      if (!subsOpen.delete(id)) subsOpen.add(id);
      renderCats();
      return;
    }
    const addsub = e.target.closest('[data-addsub]')?.dataset.addsub;
    if (addsub) {
      store.save('sub', store.newId(), { nome: 'Nuova sottocategoria', cat: addsub, ord: M.subs(addsub).length });
      renderCats();
      const rows = $$(`.sub-panel[data-cat="${addsub}"] input`, root);
      rows[rows.length - 1]?.select();
      return;
    }
    if (e.target.closest('[data-delsub]')) {
      const s = store.get(e.target.closest('.sub-row').dataset.id);
      const used = M.movs().filter((m) => m.data.sub === s.id);
      const ok = await confirmBox(used.length
        ? `Eliminare "${s.data.nome}"? I suoi ${used.length} movimenti restano nella categoria, senza sottocategoria.`
        : `Eliminare "${s.data.nome}"?`, { ok: 'Elimina', danger: true });
      if (!ok) return;
      for (const m of used) store.patch(m.id, { sub: null });
      store.remove(s.id);
      renderCats();
      return;
    }
    if (e.target.closest('[data-delcat]')) {
      const row = e.target.closest('.cat-row');
      const c = store.get(row.dataset.id);
      const used = M.movs().filter((m) => m.data.cat === c.id);
      const dest = M.cats(c.data.tipo).find((x) => x.data.nome === 'Altro' && x.id !== c.id) || M.cats(c.data.tipo).find((x) => x.id !== c.id);
      if (used.length && !dest) { toast('Serve almeno un\'altra categoria in cui spostare i movimenti.'); return; }
      const ok = await confirmBox(used.length
        ? `Eliminare "${c.data.nome}"? I suoi ${used.length} movimenti passeranno in "${dest.data.nome}".`
        : `Eliminare "${c.data.nome}"?`, { ok: 'Elimina', danger: true });
      if (!ok) return;
      for (const m of used) store.patch(m.id, { cat: dest.id, sub: null });
      for (const s of M.subs(c.id)) store.remove(s.id);
      store.remove(c.id);
      renderCats();
    }
  });
  sec.addEventListener('change', (e) => {
    if (e.target.dataset.sf) {
      const id = e.target.closest('.sub-row').dataset.id;
      const v = e.target.value.trim();
      if (!v) e.target.value = store.get(id).data.nome; else store.patch(id, { nome: v });
      return;
    }
    const cf = e.target.dataset.cf;
    if (cf) {
      const id = e.target.closest('.cat-row').dataset.id;
      const v = e.target.value.trim();
      if (cf === 'nome' && !v) { e.target.value = store.get(id).data.nome; return; }
      if (cf === 'emoji') {
        // tengo un solo simbolo (anche le emoji composte, come le famiglie)
        const first = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('it', { granularity: 'grapheme' }).segment(v)][0]?.segment : [...v][0];
        store.patch(id, { emoji: first || '' }); e.target.value = first || ''; return;
      }
      store.patch(id, { [cf]: v });
    }
  });
}

// Finestra del colore, con lo stile delle altre finestre di scelta: anteprima della categoria e i colori in cerchi
function sceltaColore(c) {
  const att = (c.data.colore || '').toUpperCase();
  const lista = COLORI.includes(att) ? COLORI : [att, ...COLORI]; // un colore scelto prima, fuori elenco, resta disponibile
  const dlg = modal(`<div class="dlg scelta">
    <header class="dlg-head"><h2>Colore</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
    <div class="col-anteprima" style="--c:${att}"><span class="cat-ico">${esc(c.data.emoji || '')}</span><b>${esc(c.data.nome)}</b></div>
    <div class="col-griglia" role="listbox" aria-label="Colori">${lista.map((col) => `<button type="button" class="col-cerchio${col === att ? ' on' : ''}" role="option"
      aria-selected="${col === att}" aria-label="Colore ${col}" data-col="${col}" style="--c:${col}"></button>`).join('')}</div>
  </div>`);
  const prev = dlg.querySelector('.col-anteprima');
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) { dlg.close(); return; }
    const b = e.target.closest('[data-col]');
    if (!b) return;
    if (b.dataset.col !== att) store.patch(c.id, { colore: b.dataset.col });
    dlg.close();
    renderCats();
  });
  // passando sopra un colore l'anteprima lo mostra
  dlg.addEventListener('pointerover', (e) => { const b = e.target.closest('[data-col]'); if (b) prev.style.setProperty('--c', b.dataset.col); });
  dlg.querySelector('.col-cerchio.on')?.focus({ preventScroll: true });
}
