import * as store from './store.js';
import * as M from './model.js';
import * as sync from './sync.js';
import { parseAmount, fmt, plain } from './expr.js';
import { esc, $, $$, toast, confirmBox, download } from './ui.js';

let root;
let unsub;

export function render(el) {
  root = el;
  el.innerHTML = `
    <section class="altro">
      <header class="page-head"><h1>Altro</h1></header>
      <section class="card" id="sync-card"></section>
      <section class="card">
        <h2>Dati</h2>
        <p class="muted">Lo storico preparato dal tuo Excel si importa da qui, una volta sola, su un solo dispositivo:
        gli altri lo riceveranno con la sincronizzazione. Reimportare lo stesso file non crea doppioni.</p>
        <div class="btn-row">
          <label class="btn primary">Importa file<input type="file" accept=".json,application/json" id="imp" hidden></label>
          <button class="btn ghost" data-exp="json">Esporta backup completo</button>
          <button class="btn ghost" data-exp="csv">Esporta movimenti per Excel</button>
          <button class="btn ghost" data-exp="pat">Esporta patrimonio per Excel</button>
        </div>
      </section>
      <section class="card">
        <h2>Movimenti ricorrenti</h2>
        <p class="muted">Abbonamenti, affitto, stipendio: imposta la scadenza una volta sola e il movimento si aggiunge da solo.</p>
        <a class="btn ghost" href="#ricorrenti">Gestisci i movimenti ricorrenti${M.rics().length ? ` (${M.rics().length})` : ''}</a>
      </section>
      <section class="card">
        <h2>Categorie</h2>
        <div class="two tight">
          <div><h3>Uscite</h3><div id="cats-out"></div><button class="add-row" data-addcat="out">+ Nuova categoria di uscita</button></div>
          <div><h3>Entrate</h3><div id="cats-in"></div><button class="add-row" data-addcat="in">+ Nuova categoria di entrata</button></div>
        </div>
      </section>
      <section class="card">
        <h2>Aspetto</h2>
        <label class="field inline"><span>Tema</span>
          <select id="theme">
            <option value="auto">Come il sistema</option><option value="light">Chiaro</option><option value="dark">Scuro</option>
          </select></label>
        <div id="install-box"></div>
      </section>
      <p class="muted version">Contabilità<span id="app-ver"></span>. I dati sono salvati su questo dispositivo${sync.session() ? ' e sincronizzati, cifrati, sul tuo progetto Supabase' : ''}.</p>
    </section>`;
  renderSync();
  renderCats();
  bind();
  showVersion();
  if (unsub) unsub();
  unsub = sync.onStatus(() => { if (root.isConnected) paintStatus(); else unsub(); });
}

// La versione è il numero della cache del service worker (VERSION in sw.js, "contabilita-vN"):
// è quella dei file che l'app sta davvero usando. Se non è disponibile, non si scrive nessun numero.
async function showVersion() {
  try {
    const nums = (await caches.keys()).map((k) => /^contabilita-v(\d+)$/.exec(k)).filter(Boolean).map((m) => +m[1]);
    const el = $('#app-ver', root);
    if (nums.length && el) el.textContent = `, versione ${Math.max(...nums)}`;
  } catch { /* cache non disponibile (es. navigazione privata): nessun numero */ }
}

// --- Sincronizzazione ---
function renderSync() {
  const box = $('#sync-card', root);
  const cfg = sync.config();
  const ses = sync.session();
  if (!cfg) {
    box.innerHTML = `
      <h2>Sincronizzazione</h2>
      <p class="muted">Collega il tuo progetto Supabase per avere gli stessi dati su PC e telefono.
      Trovi URL e chiave in Supabase, nelle impostazioni del progetto, alla voce API.</p>
      <form id="cfg-form" class="stack">
        <label class="field"><span>URL del progetto</span><input name="url" placeholder="https://xxxx.supabase.co" autocomplete="off" required></label>
        <label class="field"><span>Chiave pubblica (anon / publishable key)</span><input name="key" autocomplete="off" required></label>
        <button class="btn primary">Collega</button>
      </form>`;
    $('#cfg-form', box).addEventListener('submit', (e) => {
      e.preventDefault();
      try { sync.setConfig(e.target.url.value, e.target.key.value); renderSync(); }
      catch (err) { toast(err.message); }
    });
    return;
  }
  if (!ses) {
    box.innerHTML = `
      <h2>Sincronizzazione</h2>
      <p class="muted">Progetto collegato: ${esc(cfg.url.replace('https://', ''))}. Accedi con il tuo account, oppure crealo la prima volta.</p>
      <form id="auth-form" class="stack">
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
        <div class="btn-row">
          <button class="btn primary" value="in">Accedi</button>
          <button class="btn ghost" value="up">Crea account</button>
          <button class="btn ghost" type="button" data-forget>Scollega progetto</button>
        </div>
      </form>`;
    $('#auth-form', box).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const btns = $$('button', f); btns.forEach((b) => (b.disabled = true));
      try {
        if (e.submitter?.value === 'up') {
          const r = await sync.signUp(f.email.value.trim(), f.password.value);
          if (!r.confirmed) toast("Account creato. Conferma l'email dal link che hai ricevuto, poi torna qui e premi Accedi.", { ms: 9000 });
        } else {
          await sync.signIn(f.email.value.trim(), f.password.value);
          toast('Accesso effettuato: sincronizzo i dati');
        }
        renderSync();
      } catch (err) { toast(err.message, { ms: 6000 }); }
      finally { btns.forEach((b) => (b.disabled = false)); }
    });
    $('[data-forget]', box).onclick = () => { sync.forgetConfig(); renderSync(); };
    return;
  }
  box.innerHTML = `<h2>Sincronizzazione</h2><p class="muted">Verifico la cifratura…</p>`;
  sync.checkCrypto().then((st) => paintSession(box, ses, st)).catch((err) => {
    box.innerHTML = `<h2>Sincronizzazione</h2><p class="muted">Non riesco a contattare Supabase: ${esc(err.message)}</p>
      <div class="btn-row"><button class="btn ghost" data-retry>Riprova</button><button class="btn ghost" data-out>Esci</button></div>`;
    $('[data-retry]', box).onclick = renderSync;
    $('[data-out]', box).onclick = async () => { await sync.signOut(); renderSync(); };
  });
}

function passForm({ title, text, confirm, ok, extra = '' }) {
  return `<h2>${title}</h2><p class="muted">${text}</p>
    <form id="pass-form" class="stack">
      <label class="field"><span>Frase segreta</span><input name="p1" type="password" autocomplete="new-password" required minlength="${confirm ? 10 : 1}"></label>
      ${confirm ? '<label class="field"><span>Ripeti la frase segreta</span><input name="p2" type="password" autocomplete="new-password" required></label>' : ''}
      <div class="btn-row"><button class="btn primary">${ok}</button>${extra}</div>
      <p class="muted pass-wait" hidden>Sto preparando la chiave di cifratura, può richiedere qualche secondo…</p>
    </form>`;
}

function paintSession(box, ses, st) {
  const who = `<p class="muted">Account: <b>${esc(ses.user?.email || '')}</b></p>`;
  if (st === 'setup') {
    box.innerHTML = passForm({
      title: 'Crea la frase segreta',
      text: `I dati vengono cifrati su questo dispositivo prima di essere inviati: Supabase vede solo contenuti illeggibili.
        Ti servirà la stessa frase per collegare il telefono o un altro PC. <b>Conservala con cura</b>: se la perdi
        nessuno può recuperare la copia sul cloud (restano i dati sui tuoi dispositivi e i backup).
        Usa almeno 10 caratteri, meglio qualche parola a caso.`,
      confirm: true, ok: 'Attiva la cifratura',
    }).replace('</h2>', '</h2>' + who);
  } else if (st === 'locked') {
    box.innerHTML = passForm({
      title: 'Sblocca i dati cifrati',
      text: 'I dati di questo account sono cifrati. Inserisci la frase segreta che hai creato sul primo dispositivo.',
      confirm: false, ok: 'Sblocca', extra: '<button type="button" class="btn ghost" data-forgot>Ho dimenticato la frase</button>',
    }).replace('</h2>', '</h2>' + who);
  } else {
    box.innerHTML = `
      <h2>Sincronizzazione</h2>
      ${who}
      <p class="sync-line"><i class="sync-dot"></i><span id="sync-msg"></span></p>
      <p class="muted">Cifratura end-to-end attiva: sul cloud arrivano solo dati illeggibili senza la tua frase segreta.</p>
      <div class="btn-row">
        <button class="btn primary" data-sync>Sincronizza ora</button>
        <button class="btn ghost" data-out>Esci</button>
      </div>`;
    $('[data-sync]', box).onclick = () => sync.syncNow();
    paintStatus();
  }
  const out = $('[data-out]', box);
  if (out) out.onclick = async () => {
    const pend = store.dirtyList().length;
    const ok = await confirmBox(pend
      ? `Ci sono ${pend} modifiche non ancora inviate. Se esci restano solo su questo dispositivo finché non accedi di nuovo. Uscire?`
      : 'Uscire dall\'account? I dati restano su questo dispositivo; per ricollegarti serviranno password e frase segreta.', { ok: 'Esci' });
    if (ok) { await sync.signOut(); renderSync(); }
  };
  const form = $('#pass-form', box);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = form.p1.value;
    if (st === 'setup' && p1 !== form.p2.value) { toast('Le due frasi non coincidono.'); return; }
    const btns = $$('button', form); btns.forEach((b) => (b.disabled = true));
    $('.pass-wait', form).hidden = false;
    try {
      if (st === 'setup') { await sync.createPassphrase(p1); toast('Cifratura attivata: invio i dati cifrati'); }
      else { await sync.unlock(p1); toast('Dati sbloccati'); }
      renderSync();
    } catch (err) {
      toast(err.message, { ms: 6000 });
      btns.forEach((b) => (b.disabled = false));
      $('.pass-wait', form).hidden = true;
    }
  });
  const forgot = $('[data-forgot]', box);
  if (forgot) forgot.onclick = async () => {
    const ok = await confirmBox(`Senza la frase segreta i dati sul cloud non si possono leggere. Posso cancellarli e sostituirli con quelli
      presenti su questo dispositivo (${store.exportRecords().length} elementi), cifrati con una nuova frase. Le modifiche fatte solo sugli altri
      dispositivi e non ancora arrivate qui andrebbero perse. Procedere?`, { ok: 'Sostituisci i dati del cloud', danger: true });
    if (!ok) return;
    box.innerHTML = passForm({ title: 'Nuova frase segreta', text: 'Scegli la nuova frase: sostituirà quella dimenticata su tutti i dispositivi.', confirm: true, ok: 'Sostituisci e cifra' });
    const f = $('#pass-form', box);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.p1.value !== f.p2.value) { toast('Le due frasi non coincidono.'); return; }
      $('.pass-wait', f).hidden = false;
      try { await sync.resetCloud(f.p1.value); toast('Dati del cloud sostituiti e cifrati'); renderSync(); }
      catch (err) { toast(err.message, { ms: 6000 }); $('.pass-wait', f).hidden = true; }
    });
  };
}

function paintStatus() {
  const msg = $('#sync-msg', root);
  if (!msg) return;
  const st = sync.getStatus();
  const last = sync.lastOk();
  const when = last ? new Date(last).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  msg.textContent = st.state === 'ok' && when ? `Sincronizzato (ultima volta: ${when})` : st.msg;
  msg.parentElement.dataset.state = st.state;
}

// --- Import / export ---
async function importFile(file) {
  let json;
  try { json = JSON.parse(await file.text()); } catch { toast('Il file non è un JSON valido.'); return; }
  const recs = json && json.format === 'contabilita-v1' && Array.isArray(json.records) ? json.records : null;
  if (!recs) { toast('Questo file non è un backup di Contabilità.'); return; }
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
  download(`contabilita-movimenti-${stamp()}.csv`, '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
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
  download(`contabilita-patrimonio-${stamp()}.csv`, '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

// --- Categorie ---
const subsOpen = new Set(); // categorie con l'elenco delle sottocategorie aperto

function subsPanel(c) {
  const list = M.subs(c.id);
  const uso = new Map();
  for (const m of M.movs()) if (m.data.cat === c.id && m.data.sub) uso.set(m.data.sub, (uso.get(m.data.sub) || 0) + 1);
  return `<div class="sub-panel" data-cat="${c.id}">
    ${list.map((s) => `<div class="sub-row" data-id="${s.id}">
      <input value="${esc(s.data.nome)}" data-sf="nome" aria-label="Nome sottocategoria">
      <span class="muted">${uso.get(s.id) || 0}</span>
      <button class="icon-btn small" data-delsub aria-label="Elimina sottocategoria">×</button>
    </div>`).join('')}
    <button class="add-row" data-addsub="${c.id}">+ Nuova sottocategoria</button>
  </div>`;
}

function renderCats() {
  for (const tipo of ['out', 'in']) {
    const uso = new Map();
    for (const m of M.movs()) if (m.data.tipo === tipo) uso.set(m.data.cat, (uso.get(m.data.cat) || 0) + 1);
    $(`#cats-${tipo}`, root).innerHTML = M.cats(tipo).map((c) => `
      <div class="cat-row" data-id="${c.id}">
        <input type="color" value="${c.data.colore}" data-cf="colore" aria-label="Colore">
        <input class="emoji-in" value="${esc(c.data.emoji || '')}" data-cf="emoji" maxlength="8" aria-label="Emoji" placeholder="🙂">
        <input value="${esc(c.data.nome)}" data-cf="nome" aria-label="Nome categoria">
        <span class="muted">${uso.get(c.id) || 0}</span>
        <button class="icon-btn small subs-btn" data-togsubs aria-label="Sottocategorie" aria-expanded="${subsOpen.has(c.id)}" title="Sottocategorie">↳${M.subs(c.id).length || ''}</button>
        <button class="icon-btn small" data-delcat aria-label="Elimina categoria">×</button>
      </div>${subsOpen.has(c.id) ? subsPanel(c) : ''}`).join('');
  }
}

function bind() {
  const sec = root.querySelector('.altro');
  $('#imp', root).addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });
  sec.addEventListener('click', async (e) => {
    const exp = e.target.closest('[data-exp]')?.dataset.exp;
    if (exp === 'json') {
      download(`contabilita-backup-${stamp()}.json`, JSON.stringify({ format: 'contabilita-v1', creato: stamp(), records: store.exportRecords() }), 'application/json');
    }
    if (exp === 'csv') exportCSV();
    if (exp === 'pat') exportPatCSV();
    const addcat = e.target.closest('[data-addcat]')?.dataset.addcat;
    if (addcat) {
      const list = M.cats(addcat);
      store.save('cat', store.newId(), { nome: 'Nuova categoria', tipo: addcat, colore: '#7A8B99', ord: list.length });
      renderCats();
      const rows = $$(`#cats-${addcat} .cat-row input[data-cf="nome"]`, root);
      rows[rows.length - 1]?.select();
    }
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
  const theme = $('#theme', root);
  theme.value = localStorage.getItem('contabilita.theme') || 'auto';
  theme.addEventListener('change', () => {
    localStorage.setItem('contabilita.theme', theme.value);
    applyTheme();
  });
  paintInstall();
}

export function applyTheme() {
  const t = localStorage.getItem('contabilita.theme') || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0F1012' : '#F4F5F7');
}

// --- Installazione come app ---
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; paintInstall(); });
function paintInstall() {
  const box = root && $('#install-box', root);
  if (!box) return;
  if (matchMedia('(display-mode: standalone)').matches) { box.innerHTML = ''; return; }
  box.innerHTML = installEvt
    ? '<button class="btn ghost" data-install>Installa come app</button>'
    : '<p class="muted">Per installarla: su Android, menu di Chrome e poi "Aggiungi a schermata Home"; su Windows, l\'icona di installazione nella barra degli indirizzi di Edge o Chrome.</p>';
  const b = $('[data-install]', box);
  if (b) b.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; paintInstall(); };
}
