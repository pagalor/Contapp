// Pagina Sincronizzazione e cifratura (#sincronizzazione): collegamento a Supabase, accesso, frase segreta, stato.
import * as store from './store.js';
import * as sync from './sync.js';
import * as demo from './demo.js';
import { esc, $, $$, toast, confirmBox } from './ui.js';
import { testataAccount } from './pannelli.js';

let root;
let unsub;

export function render(el) {
  root = el;
  el.innerHTML = `
    <section class="impost">
      ${testataAccount('Sincronizzazione e cifratura', 'sync')}
      <section class="card" id="sync-card"></section>
    </section>`;
  renderSync();
  if (unsub) unsub();
  unsub = sync.onStatus(() => { if (root.isConnected) paintStatus(); else unsub(); });
}

function renderSync() {
  const box = $('#sync-card', root);
  if (demo.attiva) {
    box.innerHTML = `
      <h2>Sincronizzazione</h2>
      <p class="muted">Nella versione demo sincronizzazione e cifratura non sono disponibili: i dati di esempio restano
      solo in questo browser, separati da quelli veri.</p>`;
    return;
  }
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
