// Pagina Importa ed esporta (#dati): Excel (.xlsx, importazione guidata ed esportazione), backup JSON e file CSV.
import * as store from './store.js';
import * as M from './model.js';
import { $, esc, toast, confirmBox, download } from './ui.js';
import { testataAccount } from './pannelli.js';
import { cartellaRationes, nomeFile } from './excel-esporta.js';
import { importaDaExcel, importazioni, eliminaImportazione } from './excel-importa.js';

let root;
const SOLO_SYNC = new Set(['disp']); // kind esclusi dal backup esportato e ignorati all'importazione

export function render(el) {
  root = el;
  const imps = importazioni().slice(0, 10);
  el.innerHTML = `
    <section class="impost">
      ${testataAccount('Importa ed esporta')}
      <section class="card">
        <h2>Excel</h2>
        <p class="muted">Importa i movimenti da un file Excel (.xlsx) o CSV: una procedura guidata ti fa scegliere fogli e colonne.
        Un file esportato da Rationes si importa così com'è. L'esportazione crea un vero foglio di lavoro, con formule e un riepilogo per ogni anno.</p>
        <div class="btn-row">
          <label class="btn primary">Importa da Excel<input type="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" id="imp-xl" hidden></label>
          <button class="btn ghost" data-exp="xlsx">Esporta in Excel</button>
        </div>
        ${imps.length ? `<h3 class="xl-h">Ultime importazioni</h3>
        <ul class="xl-imps">${imps.map((r) => `<li class="xl-imp-riga">
          <div><b>${esc(r.data.file || 'File')}</b><small>${esc(quando(r.data.quando))} · ${r.data.n === 1 ? '1 movimento' : `${r.data.n || 0} movimenti`}${r.data.nTrasf ? ` e ${r.data.nTrasf} trasferimenti` : ''}</small></div>
          <button type="button" class="btn ghost danger" data-del-imp="${esc(r.id)}">Elimina questa importazione</button></li>`).join('')}</ul>` : ''}
      </section>
      <section class="card">
        <h2>Backup e CSV</h2>
        <p class="muted">Il backup completo contiene tutti i dati e serve a ripristinarli. Lo storico preparato dal tuo Excel si importa da qui,
        una volta sola, su un solo dispositivo: gli altri lo riceveranno con la sincronizzazione. Reimportare lo stesso file non crea doppioni.</p>
        <div class="btn-row">
          <label class="btn ghost">Importa backup<input type="file" accept=".json,application/json" id="imp" hidden></label>
          <button class="btn ghost" data-exp="json">Esporta backup completo</button>
          <button class="btn ghost" data-exp="csv">Esporta movimenti per Excel</button>
          <button class="btn ghost" data-exp="pat">Esporta patrimonio per Excel</button>
          <button class="btn ghost" data-exp="inv">Esporta investimenti per Excel</button>
        </div>
      </section>
    </section>`;
  $('#imp', root).addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });
  $('#imp-xl', root).addEventListener('change', (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) importaDaExcel(f, { onDone: () => { if (root.isConnected) render(root); } });
  });
  $('.impost', root).addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-imp]');
    if (del) {
      const r = store.get(del.dataset.delImp);
      if (!r) return;
      const ok = await confirmBox(`Eliminare l'importazione di «${r.data.file || 'file'}»? Tolgo i ${r.data.n || 0} movimenti importati, anche se li hai modificati dopo.`, { ok: 'Elimina', danger: true });
      if (!ok) return;
      const n = eliminaImportazione(r.id);
      toast(n === 1 ? 'Tolto 1 movimento' : `Tolti ${n} movimenti`);
      render(root);
      return;
    }
    const exp = e.target.closest('[data-exp]')?.dataset.exp;
    if (exp === 'json') {
      download(`rationes-backup-${stamp()}.json`, JSON.stringify({ format: 'contabilita-v1', creato: stamp(), records: store.exportRecords().filter((r) => !SOLO_SYNC.has(r.kind)) }), 'application/json');
    }
    if (exp === 'xlsx') esportaXlsx(e.target.closest('[data-exp]'));
    if (exp === 'csv') exportCSV();
    if (exp === 'pat') exportPatCSV();
    if (exp === 'inv') exportInvCSV();
  });
}

const quando = (ms) => (ms ? new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

async function esportaXlsx(btn) {
  btn.disabled = true;
  try { download(nomeFile(), await cartellaRationes()); }
  catch (err) { console.error(err); toast('Non sono riuscito a creare il file Excel.'); }
  finally { btn.disabled = false; }
}

async function importFile(file) {
  let json;
  try { json = JSON.parse(await file.text()); } catch { toast('Il file non è un JSON valido.'); return; }
  // i dispositivi collegati (disp) riguardano solo la sincronizzazione: restano fuori dai backup
  const recs = json && json.format === 'contabilita-v1' && Array.isArray(json.records) ? json.records.filter((r) => !SOLO_SYNC.has(r?.kind)) : null;
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
  const head = ['Data', 'Tipo', ...conts.map((c) => c.data.nome), 'Investimenti', 'Totale'];
  const rows = snaps.map((s) => [s.data.date, 'Rilevazione', ...conts.map((c) => num(s.data.vals[c.id]?.val)), '', num(M.snapTotals(s).tot)]);
  for (const p of M.serieAuto()) {
    const fondi = M.totaleGruppi(p.bal).tot;
    rows.push([p.date, 'Calcolato', ...conts.map((c) => num(p.bal.get(c.id) || 0)), num(p.inv), num(Math.round((fondi + p.inv) * 100) / 100)]);
  }
  rows.sort((x, y) => x[0].localeCompare(y[0]));
  download(`rationes-patrimonio-${stamp()}.csv`, '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

// Operazioni e prezzi rilevati degli investimenti, in un solo file (colonna «Record»)
function exportInvCSV() {
  const head = ['Record', 'Data', 'Strumento', 'Codice', 'Tipologia', 'Operazione', 'Quantità', 'Prezzo', 'Prezzo in', 'Commissioni', 'Tasse',
    'Controvalore', 'Netto sul fondo', 'Fondo', 'Origine', 'Nota'];
  const rows = [];
  for (const inv of M.invs()) {
    const d = inv.data;
    const base = [d.nome, d.codice || '', M.tipoInvNome(M.tipoInv(inv), true)];
    const unita = M.percento(inv) ? '% del nominale' : 'euro';
    for (const o of M.invOps(inv.id)) {
      const x = o.data;
      rows.push(['Operazione', x.data, ...base, M.opInvNome(M.opTipo(x)), num(x.qta), num(x.prezzo), unita, num(x.comm), num(x.tasse),
        num(M.controvalore(inv, x)), num(x.fondo ? M.nettoOp(inv, x) : null), x.fondo ? M.accName(x.fondo) : 'Già posseduto', '', x.note || '']);
    }
    for (const p of M.invPrezzi(inv.id)) {
      rows.push(['Prezzo', p.data.date, ...base, '', '', num(p.data.val), unita, '', '', '', '', '', p.data.origine === 'auto' ? 'automatico' : 'manuale', '']);
    }
  }
  rows.sort((x, y) => x[1].localeCompare(y[1]) || x[2].localeCompare(y[2]));
  download(`rationes-investimenti-${stamp()}.csv`, '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
