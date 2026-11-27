// Pagina Sincronizzazione e cifratura (#sincronizzazione): solo le impostazioni (collegamento a Supabase, accesso,
// frase segreta, uscita), con la grafica del pannello della sincronizzazione. Stato, dispositivi e «Sincronizza ora»
// stanno nel pannello (pannelli.js) e qui non si ripetono.
import * as store from './store.js';
import * as sync from './sync.js';
import * as demo from './demo.js';
import { esc, $, $$, toast, confirmBox } from './ui.js';
import { testataAccount, icona } from './pannelli.js';

let root;
let unsub;
let fase = null; // configurazione, accesso e cifratura: la pagina si ridisegna solo quando cambia una di queste

// Intestazione come quella del pannello: icona tonda, titolo e una riga sotto
const testa = (ico, titolo, sotto = '', stato = '') => `
  <div class="pan-head">
    <span class="pan-avatar">${icona(ico)}</span>
    <span><h2>${esc(titolo)}</h2>${sotto ? `<p class="pan-sub"${stato ? ` data-state="${stato}"` : ''}>${esc(sotto)}</p>` : ''}</span>
  </div>`;
const faseAttuale = () => `${!!sync.config()}|${!!sync.session()}|${sync.getCryptoState()}`;

export function render(el) {
  root = el;
  el.innerHTML = `
    <section class="impost sync-page">
      ${testataAccount('Sincronizzazione e cifratura', 'sync')}
      <div id="sync-card"></div>
    </section>`;
  renderSync();
  if (unsub) unsub();
  // se la sessione scade o la cifratura cambia stato altrove, la pagina si aggiorna (ma non mentre si scrive in un campo)
  unsub = sync.onStatus(() => {
    if (!root.isConnected) { unsub(); return; }
    if (faseAttuale() !== fase && !root.contains(document.activeElement)) renderSync();
  });
}

function renderSync() {
  fase = faseAttuale();
  const box = $('#sync-card', root);
  if (demo.attiva) {
    box.innerHTML = `${testa('sync', 'Sincronizzazione', 'Non disponibile nella demo')}
      <section class="card"><p class="muted">Nella versione demo sincronizzazione e cifratura non sono disponibili: i dati di esempio restano
      solo in questo browser, separati da quelli veri.</p></section>`;
    return;
  }
  const cfg = sync.config();
  const ses = sync.session();
  if (!cfg) {
    box.innerHTML = `${testa('sync', 'Collega il progetto', 'Sincronizzazione non configurata')}
      <section class="card">
      <p class="muted">Collega il tuo progetto Supabase per avere gli stessi dati su PC e telefono.
      Trovi URL e chiave in Supabase, nelle impostazioni del progetto, alla voce API.</p>
      <form id="cfg-form" class="stack">
        <label class="field"><span>URL del progetto</span><input name="url" placeholder="https://xxxx.supabase.co" autocomplete="off" required></label>
        <label class="field"><span>Chiave pubblica (anon / publishable key)</span><input name="key" autocomplete="off" required></label>
        <div class="btn-row"><button class="btn primary">Collega</button></div>
      </form></section>`;
    $('#cfg-form', box).addEventListener('submit', (e) => {
      e.preventDefault();
      try { sync.setConfig(e.target.url.value, e.target.key.value); renderSync(); }
      catch (err) { toast(err.message); }
    });
    return;
  }
  if (!ses) {
    box.innerHTML = `${testa('utente', 'Accedi', `Progetto collegato: ${cfg.url.replace('https://', '')}`)}
      <section class="card">
      <p class="muted">Accedi con il tuo account, oppure crealo la prima volta.</p>
      <form id="auth-form" class="stack">
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
        <div class="btn-row">
          <button class="btn primary" value="in">Accedi</button>
          <button class="btn ghost" value="up">Crea account</button>
          <button class="btn ghost" type="button" data-forget>Scollega progetto</button>
        </div>
      </form></section>`;
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
  box.innerHTML = testa('sync', 'Sincronizzazione', 'Verifico la cifratura…');
  sync.checkCrypto().then((st) => { fase = faseAttuale(); paintSession(box, ses, st); }).catch((err) => {
    box.innerHTML = `${testa('sync', 'Sincronizzazione', 'Supabase non risponde', 'error')}
      <section class="card"><p class="muted">Non riesco a contattare Supabase: ${esc(err.message)}</p>
      <div class="btn-row"><button class="btn ghost" data-retry>Riprova</button><button class="btn ghost" data-out>Esci</button></div></section>`;
    $('[data-retry]', box).onclick = renderSync;
    $('[data-out]', box).onclick = async () => { await sync.signOut(); renderSync(); };
  });
}

function passForm({ title, sotto = '', text, confirm, ok, extra = '' }) {
  return `${testa('lucchetto', title, sotto)}<section class="card"><p class="muted">${text}</p>
    <form id="pass-form" class="stack">
      <label class="field"><span>Frase segreta</span><input name="p1" type="password" autocomplete="new-password" required minlength="${confirm ? 10 : 1}"></label>
      ${confirm ? '<label class="field"><span>Ripeti la frase segreta</span><input name="p2" type="password" autocomplete="new-password" required></label>' : ''}
      <div class="btn-row"><button class="btn primary">${ok}</button>${extra}</div>
      <p class="muted pass-wait" hidden>Sto preparando la chiave di cifratura, può richiedere qualche secondo…</p>
    </form></section>`;
}

function paintSession(box, ses, st) {
  const email = ses.user?.email || '';
  if (st === 'setup') {
    box.innerHTML = passForm({
      title: 'Crea la frase segreta', sotto: email,
      text: `I dati vengono cifrati su questo dispositivo prima di essere inviati: Supabase vede solo contenuti illeggibili.
        Ti servirà la stessa frase per collegare il telefono o un altro PC. <b>Conservala con cura</b>: se la perdi
        nessuno può recuperare la copia sul cloud (restano i dati sui tuoi dispositivi e i backup).
        Usa almeno 10 caratteri, meglio qualche parola a caso.`,
      confirm: true, ok: 'Attiva la cifratura',
    });
  } else if (st === 'locked') {
    box.innerHTML = passForm({
      title: 'Sblocca i dati cifrati', sotto: email,
      text: 'I dati di questo account sono cifrati. Inserisci la frase segreta che hai creato sul primo dispositivo.',
      confirm: false, ok: 'Sblocca', extra: '<button type="button" class="btn ghost" data-forgot>Ho dimenticato la frase</button>',
    });
  } else {
    // sincronizzazione attiva: solo le impostazioni (stato, dispositivi e «Sincronizza ora» sono nel pannello)
    const host = (sync.config()?.url || '').replace('https://', '');
    box.innerHTML = `${testa('sync', 'Collegata e cifrata', 'Stato e dispositivi sono nel pannello della nuvola')}
      <ul class="blocks">
        <li><div class="blk"><span class="blk-ico">${icona('utente')}</span><span><b>Account</b><small>${esc(email)}</small></span></div></li>
        <li><div class="blk"><span class="blk-ico">${icona('sync')}</span><span><b>Progetto Supabase</b><small>${esc(host)}</small></span></div></li>
        <li><div class="blk"><span class="blk-ico">${icona('lucchetto')}</span><span><b>Frase segreta</b><small>Sbloccata su questo dispositivo. Serve per collegare gli altri: conservala con cura.</small></span></div></li>
      </ul>
      <div class="btn-row">
        <button class="btn tonal" data-out>${icona('esci')}Esci</button>
        <button class="btn ghost" data-scollega>Scollega progetto</button>
      </div>`;
  }
  const scollega = $('[data-scollega]', box);
  if (scollega) scollega.onclick = async () => {
    const pend = store.dirtyList().length;
    const ok = await confirmBox(`Scollegare il progetto Supabase da questo dispositivo? Escono anche account e chiavi di cifratura; i dati restano qui.${pend ? ` Ci sono ${pend} modifiche non ancora inviate: resteranno solo su questo dispositivo.` : ''}`, { ok: 'Scollega', danger: true });
    if (ok) { sync.forgetConfig(); renderSync(); }
  };
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
