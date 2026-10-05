import * as store from './store.js';
import * as M from './model.js';
import * as C from './charts.js';
import { parseAmount, fmt, fmtEur, fmtEur0, fmtSigned, plain, round2 } from './expr.js';
import { esc, $, toast } from './ui.js';

let root, sel; // sel: anno (numero) oppure 'tutto'

export function render(el, { anno } = {}) {
  root = el;
  const ys = M.years();
  const now = new Date().getFullYear();
  sel = anno === 'tutto' ? 'tutto' : Number(anno) || (ys.includes(now) ? now : ys[ys.length - 1] || now);
  el.innerHTML = `
    <section class="riepilogo">
      <header class="page-head">
        <h1>Riepilogo</h1>
        <nav class="chips" aria-label="Periodo">
          ${ys.map((y) => `<a class="chip${y === sel ? ' on' : ''}" href="#riepilogo/${y}">${y}</a>`).join('')}
          <a class="chip${sel === 'tutto' ? ' on' : ''}" href="#riepilogo/tutto">Tutti gli anni</a>
        </nav>
      </header>
      <div id="rie-body"></div>
    </section>`;
  // porta in vista l'anno selezionato nella barra dei periodi
  el.querySelector('.chip.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  draw();
}

export function redraw() { if (root && root.isConnected) draw(); }

const width = (id) => Math.floor($(id, root)?.clientWidth || 600);

function draw() {
  const body = $('#rie-body', root);
  const tutto = sel === 'tutto';
  const list = tutto ? M.movs() : M.movs().filter((r) => r.data.y === sel);
  if (!list.length && !M.buttati(sel).length) {
    body.innerHTML = '<div class="empty-hint"><p>Nessun movimento in questo periodo.</p></div>';
    return;
  }
  const s = M.sums(list);
  const ys = M.years();

  // serie per il grafico principale
  let labels, vin, vout, cum = [];
  if (tutto) {
    labels = ys.map(String);
    const per = ys.map((y) => M.sums(M.movs().filter((r) => r.data.y === y)));
    vin = per.map((p) => p.tin); vout = per.map((p) => p.tout);
    let acc = 0;
    for (const y of ys) {
      M.monthly(y).forEach((o, i) => {
        if (!o.n) return;
        acc += o.saldo;
        cum.push({ label: `${M.MESI[i]} ${y}`, short: i === 0 || !cum.length ? String(y) : '', value: round2(acc) });
      });
    }
  } else {
    labels = M.MESI_BREVI;
    const mo = M.monthly(sel);
    vin = mo.map((o) => o.tin); vout = mo.map((o) => o.tout);
    let acc = 0;
    mo.forEach((o, i) => { if (!o.n) return; acc += o.saldo; cum.push({ label: `${M.MESI[i]} ${sel}`, short: M.MESI_BREVI[i], value: round2(acc) }); });
  }
  const mesiAttivi = tutto
    ? ys.reduce((n, y) => n + M.monthly(y).filter((o) => o.n).length, 0)
    : M.monthly(sel).filter((o) => o.n).length;
  const butt = tutto ? round2(ys.reduce((a, y) => a + M.buttTot(y), 0)) : M.buttTot(sel);

  body.innerHTML = `
    <dl class="stats stats-main">
      <div><dt>Entrate</dt><dd class="in">${fmtEur(s.tin)}</dd></div>
      <div><dt>Uscite</dt><dd class="out">${fmtEur(s.tout)}</dd></div>
      <div><dt>Saldo</dt><dd class="saldo">${fmtSigned(s.saldo)}</dd></div>
    </dl>
    <dl class="stats stats-sub">
      <div><dt>Entrate medie al mese</dt><dd class="in">${fmtEur(mesiAttivi ? s.tin / mesiAttivi : 0)}</dd></div>
      <div><dt>Uscite medie al mese</dt><dd>${fmtEur(mesiAttivi ? s.tout / mesiAttivi : 0)}</dd></div>
      <div><dt>Saldo medio al mese</dt><dd class="saldo">${fmtSigned(mesiAttivi ? s.saldo / mesiAttivi : 0)}</dd></div>
      <div><dt>Risparmio</dt><dd class="saldo">${s.tin > 0 ? (s.saldo / s.tin * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + '%' : '–'}</dd></div>
      <div><dt>Soldi buttati</dt><dd class="butt">${fmtEur(butt)}</dd></div>
    </dl>

    <section class="card">
      <h2>${tutto ? 'Entrate e uscite per anno' : 'Entrate e uscite per mese'}</h2>
      <div class="legend"><span class="lg in">Entrate</span><span class="lg out">Uscite</span></div>
      <div class="chart-box" id="ch-bars"></div>
    </section>

    <section class="card">
      <h2>Saldo accumulato</h2>
      <p class="muted">Quanto hai messo da parte sommando i saldi mese dopo mese${tutto ? ', dal primo mese registrato' : ` nel ${sel}`}.</p>
      <div class="chart-box" id="ch-line"></div>
    </section>

    <section class="card">
      <h2>Uscite per categoria</h2>
      <div id="cat-out"></div>
    </section>
    <section class="card">
      <h2>Entrate per categoria</h2>
      <div id="cat-in"></div>
    </section>

    <div class="two">
      <section class="card">
        <h2>${tutto ? 'Anno per anno' : 'Mese per mese'}</h2>
        ${tutto ? yearTable(ys) : monthTable(sel)}
      </section>
      <section class="card">
        <h2>Le spese più grandi</h2>
        ${topTable(list)}
      </section>
    </div>

    <section class="card">
      <h2>Tag</h2>
      ${tagCard(list)}
    </section>

    <section class="card" id="butt-card">
      <h2>Soldi buttati</h2>
      ${tutto ? buttYears(ys) : buttEditor(sel)}
    </section>`;

  $('#ch-bars', root).innerHTML = C.bars({
    width: width('#ch-bars'), labels,
    series: [{ name: 'Entrate', cls: 'in', values: vin }, { name: 'Uscite', cls: 'out', values: vout }],
  });
  $('#ch-line', root).innerHTML = C.line({ width: width('#ch-line'), points: cum, cls: 'line-saldo' });
  $('#cat-out', root).innerHTML = catBars(list, 'out');
  $('#cat-in', root).innerHTML = catBars(list, 'in');
  bind();
}

function catBars(list, tipo) {
  const rows = M.byCategory(list, tipo);
  const tot = rows.reduce((a, r) => a + r.tot, 0);
  if (!rows.length) return '<p class="muted">Nessun dato.</p>';
  const pie = C.donut({
    size: 190, center: fmtEur0(tot),
    slices: rows.map((r) => ({ label: M.catLabel(r.cat), value: r.tot, color: r.cat?.data.colore || '#999' })),
  });
  return `<div class="cat-split"><div class="pie">${pie}</div><ul class="catbars">${rows.map((r) => {
    const pct = tot ? (r.tot / tot) * 100 : 0;
    return `<li>
      <button class="catbar" data-cat="${r.id}" data-tipo="${tipo}" aria-expanded="false">
        <span class="cb-name"><span class="cb-emoji" style="--c:${r.cat?.data.colore || '#999'}">${esc(r.cat?.data.emoji || '')}</span>${esc(r.cat?.data.nome || 'Senza categoria')}</span>
        <span class="cb-val">${fmtEur(r.tot)} <small>${pct.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</small></span>
        <span class="cb-track"><span style="width:${pct}%;background:${r.cat?.data.colore || '#999'}"></span></span>
      </button>
      <div class="cb-detail" hidden></div>
    </li>`;
  }).join('')}</ul></div>`;
}

function catDetail(catId, tipo) {
  const tutto = sel === 'tutto';
  const map = new Map();
  for (const r of M.movs()) {
    const d = r.data;
    if (d.cat !== catId || d.tipo !== tipo || d.escl || typeof d.val !== 'number') continue;
    if (!tutto && d.y !== sel) continue;
    const k = (d.desc || '(senza descrizione)').trim();
    const key = k.toLowerCase();
    const o = map.get(key) || { k, n: 0, tot: 0 };
    o.n++; o.tot += d.val;
    map.set(key, o);
  }
  const rows = [...map.values()].sort((a, b) => b.tot - a.tot).slice(0, 12);
  return `<table class="mini"><tbody>${rows.map((o) =>
    `<tr><td><a href="#cerca/${encodeURIComponent(o.k)}">${esc(o.k)}</a></td><td class="num muted">${o.n}×</td><td class="num">${fmtEur(o.tot)}</td></tr>`).join('')}</tbody></table>`;
}

function monthTable(y) {
  const mo = M.monthly(y);
  return `<table class="tbl"><thead><tr><th>Mese</th><th class="num">Entrate</th><th class="num">Uscite</th><th class="num">Saldo</th></tr></thead><tbody>
    ${mo.map((o, i) => o.n ? `<tr data-href="#mese/${y}-${String(i + 1).padStart(2, '0')}">
      <td><a href="#mese/${y}-${String(i + 1).padStart(2, '0')}">${M.MESI[i]}</a></td>
      <td class="num in">${fmt(o.tin)}</td><td class="num out">${fmt(o.tout)}</td>
      <td class="num saldo">${fmtSigned(o.saldo)}</td></tr>` : '').join('')}
  </tbody></table>`;
}

function yearTable(ys) {
  return `<table class="tbl"><thead><tr><th>Anno</th><th class="num">Entrate</th><th class="num">Uscite</th><th class="num">Saldo</th></tr></thead><tbody>
    ${ys.map((y) => { const s = M.sums(M.movs().filter((r) => r.data.y === y)); return `<tr>
      <td><a href="#riepilogo/${y}">${y}</a></td><td class="num in">${fmt(s.tin)}</td><td class="num out">${fmt(s.tout)}</td>
      <td class="num saldo">${fmtSigned(s.saldo)}</td></tr>`; }).join('')}
  </tbody></table>`;
}

function topTable(list) {
  const top = list.filter((r) => r.data.tipo === 'out' && !r.data.escl && typeof r.data.val === 'number')
    .sort((a, b) => b.data.val - a.data.val).slice(0, 10);
  if (!top.length) return '<p class="muted">Nessuna uscita.</p>';
  return `<table class="tbl"><tbody>${top.map((r) => {
    const d = r.data; const cat = M.catById(d.cat);
    return `<tr><td><a href="#mese/${d.y}-${String(d.m).padStart(2, '0')}/${r.id}">${esc(d.desc || '(senza descrizione)')}</a>
      <small class="muted">${M.MESI_BREVI[d.m - 1]} ${d.y}${cat ? ', ' + esc(M.catLabel(cat)) : ''}</small></td>
      <td class="num out">${fmt(d.val)}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function tagCard(list) {
  const tags = M.tagStats(list);
  if (!tags.length) return '<p class="muted">Nessun tag in questo periodo. Aggiungili ai movimenti, dal pulsante ⋯ di ogni riga, per raggruppare per esempio tutte le spese di un viaggio.</p>';
  return `<table class="tbl"><tbody>${tags.map((t) => `<tr>
    <td><a class="tag" href="#tag/${encodeURIComponent(t.tag)}">#${esc(t.tag)}</a></td>
    <td class="num muted">${t.n} mov.</td>
    <td class="num out">${fmt(t.tout)}</td></tr>`).join('')}</tbody></table>`;
}

function buttYears(ys) {
  const rows = ys.map((y) => ({ y, tot: M.buttTot(y), n: M.buttati(y).length })).filter((o) => o.n);
  if (!rows.length) return '<p class="muted">Nessuna voce registrata.</p>';
  return `<table class="tbl"><tbody>${rows.map((o) =>
    `<tr><td><a href="#riepilogo/${o.y}">${o.y}</a></td><td class="num muted">${o.n} voci</td><td class="num butt">${fmt(o.tot)}</td></tr>`).join('')}</tbody></table>`;
}

function buttEditor(y) {
  const list = M.buttati(y);
  return `<p class="muted">Le spese che rifaresti volentieri a meno. Anche qui puoi scrivere espressioni come =19,30-16,66.</p>
    <div class="butt-list">${list.map((r) => `
      <div class="butt-row" data-id="${r.id}">
        <input class="c-amt" data-bf="amt" inputmode="decimal" value="${fmt(r.data.val)}" aria-label="Importo">
        <input data-bf="desc" value="${esc(r.data.desc)}" aria-label="Descrizione">
        <button class="icon-btn small" data-bact="del" aria-label="Elimina">×</button>
      </div>`).join('')}
    </div>
    <div class="butt-foot"><button class="add-row" data-bact="add">+ Aggiungi voce</button>
    <span>Totale <b class="butt">${fmtEur(M.buttTot(y))}</b></span></div>`;
}

function bind() {
  root.querySelectorAll('.catbar').forEach((b) => b.addEventListener('click', () => {
    const det = b.nextElementSibling;
    det.hidden = !det.hidden;
    b.setAttribute('aria-expanded', String(!det.hidden));
    if (!det.hidden) det.innerHTML = catDetail(b.dataset.cat, b.dataset.tipo);
  }));
  root.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (!e.target.closest('a')) location.hash = tr.dataset.href;
  }));
  const card = $('#butt-card', root);
  if (sel === 'tutto' || !card) return;
  card.addEventListener('click', (e) => {
    const act = e.target.closest('[data-bact]')?.dataset.bact;
    if (act === 'add') {
      const list = M.buttati(sel);
      store.save('butt', store.newId(), { y: sel, espr: null, val: null, desc: '', ord: (list.at(-1)?.data.ord ?? -1) + 1 });
      draw();
      const rows = root.querySelectorAll('.butt-row');
      rows[rows.length - 1]?.querySelector('[data-bf="amt"]').focus();
    }
    if (act === 'del') {
      const row = e.target.closest('.butt-row');
      const r = store.get(row.dataset.id);
      store.remove(row.dataset.id);
      draw();
      if (r) toast('Voce eliminata', { action: 'Annulla', onAction: () => { store.save('butt', r.id, r.data); draw(); } });
    }
  });
  card.addEventListener('focusin', (e) => {
    if (e.target.dataset.bf !== 'amt') return;
    const r = store.get(e.target.closest('.butt-row').dataset.id);
    if (r) { e.target.value = r.data.espr || plain(r.data.val); e.target.select(); }
  });
  card.addEventListener('focusout', (e) => {
    const f = e.target.dataset.bf;
    const row = e.target.closest('.butt-row');
    if (!f || !row) return;
    const r = store.get(row.dataset.id);
    if (!r) return;
    if (f === 'amt') {
      try {
        const p = parseAmount(e.target.value);
        store.patch(r.id, { val: p?.val ?? null, espr: p?.espr ?? null });
        e.target.value = fmt(p?.val);
      } catch (err) { toast(err.message); e.target.value = fmt(r.data.val); }
    } else {
      store.patch(r.id, { desc: e.target.value.trim() });
    }
    const tot = card.querySelector('.butt-foot b');
    if (tot) tot.textContent = fmtEur(M.buttTot(sel));
  });
}
