// Pagina Importa ed esporta (#dati): backup JSON e file CSV per Excel.
import * as store from './store.js';
import * as M from './model.js';
import { $, toast, confirmBox, download } from './ui.js';
import { testataAccount } from './pannelli.js';

let root;

export function render(el) {
  root = el;
  el.innerHTML = `
    <section class="impost">
      ${testataAccount('Importa ed esporta')}
      <section class="card">
        <p class="muted">Lo storico preparato dal tuo Excel si importa da qui, una volta sola, su un solo dispositivo:
        gli altri lo riceveranno con la sincronizzazione. Reimportare lo stesso file non crea doppioni.</p>
        <div class="btn-row">
          <label class="btn primary">Importa file<input type="file" accept=".json,application/json" id="imp" hidden></label>
          <button class="btn ghost" data-exp="json">Esporta backup completo</button>
          <button class="btn ghost" data-exp="csv">Esporta movimenti per Excel</button>
          <button class="btn ghost" data-exp="pat">Esporta patrimonio per Excel</button>
        </div>
      </section>
    </section>`;
  $('#imp', root).addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });
  $('.impost', root).addEventListener('click', (e) => {
    const exp = e.target.closest('[data-exp]')?.dataset.exp;
    if (exp === 'json') {
      download(`rationes-backup-${stamp()}.json`, JSON.stringify({ format: 'contabilita-v1', creato: stamp(), records: store.exportRecords() }), 'application/json');
    }
    if (exp === 'csv') exportCSV();
    if (exp === 'pat') exportPatCSV();
  });
}

async function importFile(file) {
  let json;
  try { json = JSON.parse(await file.text()); } catch { toast('Il file non è un JSON valido.'); return; }
  const recs = json && json.format === 'contabilita-v1' && Array.isArray(json.records) ? json.records : null;
  if (!recs) { toast('Questo file non è un backup di Rationes.'); return; }
  const n = { mov: 0, snap: 0 };
  for (const r of recs) if (n[r.kind] != null) n[r.kind]++;
  const ok = await confirmBox(`Importare ${n.mov} movimenti e ${n.snap} rilevazioni del patrimonio? I record già presenti con lo stesso identificativo verranno sostituiti.`, { ok: 'Importa' });
  if (!ok) return;
  // categorie di base duplicate: se il file porta le sue, elimino quelle create al primo avvio e non usate
  if (recs.some((r) => r.kind === 'cat')) {
    const usate = new Set(M.movs().map((m) => m.data.cat));
    const fileIds = new Set(recs.map((r) => r.id));
    for (const c of store.all('cat')) if (!fileIds.has(c.id) && !usate.has(c.id)) store.remove(c.id);
  }
  const count = await store.importRecords(recs);
  M.migrate();
  toast(`Importati ${count} elementi`);
  render(root);
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const num = (n) => (n == null ? '' : String(n).replace('.', ','));
const stamp = () => new Date().toISOString().slice(0, 10);

function exportCSV() {
  const head = ['Anno', 'Mese', 'Giorno', 'Tipo', 'Importo', 'Formula', 'Descrizione', 'Categoria', 'Fondi', 'Tag', 'Escluso dai totali', 'Nota'];
  const rows = M.movs().sort((a, b) => a.data.y - b.data.y || a.data.m - b.data.m || (a.data.d ?? 0) - (b.data.d ?? 0) || a.data.ord - b.data.ord)
    .map((r) => { const d = r.data; return [d.y, M.MESI[d.m - 1], d.d ?? '', d.tipo === 'in' ? 'Entrata' : 'Uscita', num(d.val),
      d.espr || '', d.desc, M.catById(d.cat)?.data.nome || '',
      (d.conti || []).map((x) => M.accName(x.c) + (d.conti.length > 1 ? ' ' + num(x.val) : '')).join(' + '),
      (d.tags || []).join(', '), d.escl ? 'sì' : '', d.note || '']; });
  for (const r of M.trasfs()) {
    const d = r.data;
    rows.push([d.y, M.MESI[d.m - 1], d.d ?? '', 'Trasferimento', num(d.val), d.espr || '',
      `Da ${M.accName(d.da)} a ${M.accName(d.a)}`, '', '', '', '', d.note || '']);
  }
  download(`rationes-movimenti-${stamp()}.csv`, '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

function exportPatCSV() {
  const snaps = M.snapshots();
  const conts = M.accounts(true);
  const head = ['Data', 'Tipo', ...conts.map((c) => c.data.nome), 'Totale'];
  const rows = snaps.map((s) => [s.data.date, 'Rilevazione', ...conts.map((c) => num(s.data.vals[c.id]?.val)), num(M.snapTotals(s).tot)]);
  for (const p of M.serieAuto()) {
    rows.push([p.date, 'Calcolato', ...conts.map((c) => num(p.bal.get(c.id) || 0)), num(M.totaleGruppi(p.bal).tot)]);
  }
  rows.sort((x, y) => x[0].localeCompare(y[0]));
  download(`rationes-patrimonio-${stamp()}.csv`, '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
