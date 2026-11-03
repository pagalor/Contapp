// Barra in alto: icona della sincronizzazione (con il suo pannello) e avatar (con il pannello dell'account).
// Il pannello dell'account raccoglie le impostazioni: ogni voce apre solo la sua pagina
// (#sincronizzazione, #conti, #categorie, #ricorrenti, #rate, #budget, #dati, #aspetto).
import * as M from './model.js';
import * as sync from './sync.js';
import * as demo from './demo.js';
import { esc, $, modal } from './ui.js';

const ICO = {
  sync: '<path d="M7.2 18.5h10a4.3 4.3 0 0 0 .7-8.55 6.2 6.2 0 0 0-11.6-1.1A4.9 4.9 0 0 0 7.2 18.5z"/><path d="M9.4 13.4l2 2 3.6-3.7"/>',
  fondi: '<path d="M3.5 9.5L12 4.5l8.5 5M5.5 10.5v7M10 10.5v7M14 10.5v7M18.5 10.5v7M3.5 20h17"/>',
  cat: '<path d="M3.8 12.6V5.3c0-.8.7-1.5 1.5-1.5h7.3c.4 0 .8.2 1.1.4l6.9 6.9c.6.6.6 1.5 0 2.1l-7.3 7.3c-.6.6-1.5.6-2.1 0l-6.9-6.9c-.3-.3-.5-.6-.5-1z"/><circle cx="8.3" cy="8.3" r="1.4"/>',
  ric: '<path d="M17 3.5l3 3-3 3M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5l-3-3 3-3M20 12.5v1a4 4 0 0 1-4 4H4"/>',
  rate: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M3.5 10h17M7 14.5h4"/>',
  budget: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6 6"/>',
  dati: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  aspetto: '<circle cx="12" cy="12" r="3.6"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  utente: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6"/>',
  lucchetto: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  chiudi: '<path d="M6 6l12 12M18 6L6 18"/>',
  freccia: '<path d="M9.5 6l6 6-6 6"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICO[k]}</svg>`;

// "adesso", "5 min fa", "alle 14:05", "ieri, 22:14", "12 ott, 09:30"
export function quando(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const min = Math.round((now - d) / 60000);
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} min fa`;
  if (d.toDateString() === now.toDateString()) return `alle ${ora}`;
  const ieri = new Date(now); ieri.setDate(now.getDate() - 1);
  if (d.toDateString() === ieri.toDateString()) return `ieri, ${ora}`;
  return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}, ${ora}`;
}

// Testo dello stato della sincronizzazione, breve per la barra in alto o completo per il pannello
function statoTesto(st, lungo = false) {
  if (demo.attiva) return 'Solo su questo dispositivo';
  if (st.state === 'ok') {
    const q = quando(sync.lastOk());
    if (!q) return 'Sincronizzato';
    return lungo ? `Tutto aggiornato, ultima sincronizzazione ${q}` : `Sincronizzato ${q}`;
  }
  if (st.state === 'off' && !lungo) return 'Non sincronizzato';
  return st.msg || '';
}

function paintSync() {
  const btn = $('#sync-ind');
  if (!btn) return;
  const st = sync.getStatus();
  const txt = statoTesto(st);
  btn.dataset.state = demo.attiva ? 'off' : st.state;
  btn.title = txt;
  btn.setAttribute('aria-label', 'Sincronizzazione: ' + txt);
  $('.sync-txt', btn).textContent = txt;
  if (syncBox?.isConnected) paintSyncPanel();
}

// --- Pannello della sincronizzazione ---
let syncBox = null;
function apriSync() {
  const dlg = pannello(`<div class="pan-body" id="pan-sync"></div>`, 'left', $('#sync-ind'));
  syncBox = $('#pan-sync', dlg);
  paintSyncPanel();
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-pan-sync]')) sync.syncNow();
    if (e.target.closest('[data-pan-chiudi]')) dlg.close();
    const a = e.target.closest('a.blk');
    if (a) { e.preventDefault(); dlg.close(); vaiDaPannello(a.getAttribute('href'), 'sync'); }
  });
}
function paintSyncPanel() {
  const st = sync.getStatus();
  const ses = sync.session();
  const pronto = !demo.attiva && ses && sync.getCryptoState() === 'ready';
  let corpo = '';
  if (demo.attiva) {
    corpo = `<p class="pan-note">Nella versione demo la sincronizzazione non è disponibile: i dati di esempio restano solo in questo browser.</p>`;
  } else {
    if (ses) corpo += `<ul class="blocks"><li class="blk">${svg('utente')}<span><b>Account</b><small>${esc(ses.user?.email || '')}</small></span></li></ul>`;
    if (pronto) corpo += `<p class="blk pan-lock">${svg('lucchetto')}<span>Cifratura end-to-end attiva. Sul server arrivano solo dati cifrati.</span></p>`;
  }
  const azione = pronto ? `<button type="button" class="btn primary" data-pan-sync${st.state === 'syncing' ? ' disabled' : ''}>Sincronizza ora</button>` : '';
  // le impostazioni (collegamento, accesso, frase segreta) sono una pagina a sé, aperta da qui
  const impost = `<ul class="blocks pan-list"><li><a class="blk" href="#sincronizzazione">
    <span class="blk-ico">${svg('sync')}</span><span><b>Sincronizzazione e cifratura</b><small>${esc(demo.attiva ? 'Non disponibile nella demo'
      : !sync.config() ? 'Collega il tuo progetto Supabase' : !ses ? 'Accedi per sincronizzare' : pronto ? 'Account, frase segreta, uscita' : 'Inserisci la frase segreta')}</small></span>${svg('freccia')}</a></li></ul>`;
  // come il pannello dell'account: icona, titolo con lo stato sotto e la × per chiudere
  syncBox.innerHTML = `
    <div class="pan-head">
      <span class="pan-avatar">${svg('sync')}</span>
      <span><h2>Sincronizzazione</h2><small class="pan-sub" data-state="${demo.attiva ? 'off' : st.state}">${esc(statoTesto(st, true))}</small></span>
      <button type="button" class="icon-btn" data-pan-chiudi aria-label="Chiudi">${svg('chiudi')}</button>
    </div>
    ${corpo}${impost}
    ${azione ? `<div class="pan-actions">${azione}</div>` : ''}`;
}

// --- Pannello dell'account ---
function sottotitoloAccount() {
  if (demo.attiva) return 'Versione demo: i dati restano in questo browser';
  const ses = sync.session();
  if (!sync.config()) return 'Dati salvati solo su questo dispositivo';
  if (!ses) return 'Progetto collegato: accedi per sincronizzare';
  const cs = sync.getCryptoState();
  return `${ses.user?.email || 'Collegato'}, ${cs === 'ready' ? 'cifratura attiva' : 'frase segreta da inserire'}`;
}
function voci() {
  const n = (x) => (x ? ` (${x})` : '');
  return [
    ['fondi', '#conti', 'Fondi', 'Gruppi, saldi iniziali, target'],
    ['cat', '#categorie', 'Categorie', 'Colori, emoji, sottocategorie'],
    ['ric', '#ricorrenti', 'Movimenti ricorrenti' + n(M.rics().length), 'Abbonamenti, affitto, stipendio'],
    ['rate', '#rate', 'Pagamenti a rate' + n(M.piani().length), 'Acquisti pagati a rate'],
    ['budget', '#budget', 'Budget' + n(M.budgets({ tutti: true }).length), 'Limiti di spesa'],
    ['dati', '#dati', 'Importa ed esporta', 'Backup e file per Excel'],
    ['aspetto', '#aspetto', 'Aspetto', 'Tema chiaro, scuro o di sistema'],
  ];
}
export function apriAccount() {
  const btn = $('#account-btn');
  const dlg = pannello(`
    <div class="pan-body">
      <div class="pan-head">
        <span class="pan-avatar">${svg('utente')}</span>
        <span><h2>Il tuo account</h2><small>${esc(sottotitoloAccount())}</small></span>
        <button type="button" class="icon-btn" data-pan-chiudi aria-label="Chiudi">${svg('chiudi')}</button>
      </div>
      <ul class="blocks pan-list">${voci().map(([ico, dest, tit, sub]) => `
        <li><a class="blk" href="${dest}">
          <span class="blk-ico">${svg(ico)}</span><span><b>${esc(tit)}</b><small>${esc(sub)}</small></span>${svg('freccia')}</a></li>`).join('')}
      </ul>
      <p class="pan-foot">Rationes<span data-ver></span>. I dati sono salvati su questo dispositivo${sync.session() ? ' e sincronizzati, cifrati, sul tuo progetto Supabase' : ''}.</p>
    </div>`, 'right', btn);
  numeroVersione().then((v) => { const el = $('[data-ver]', dlg); if (v && el) el.textContent = `, versione ${v}`; });
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-pan-chiudi]')) { dlg.close(); return; }
    const a = e.target.closest('a.blk');
    if (!a) return;
    e.preventDefault();
    dlg.close();
    vaiDaPannello(a.getAttribute('href'), 'account');
  });
}

// Pagine aperte da un pannello (pan: 'account' o 'sync'). Le due voci della cronologia vengono segnate:
// la pagina di partenza con riapri (tornandoci con Indietro si riapre quel pannello)
// e la pagina aperta con daPan (il suo «‹» porta al pannello). Le route non cambiano.
const PANNELLI = { account: { nome: 'Account', apri: () => apriAccount() }, sync: { nome: 'Sincronizzazione', apri: () => apriSync() } };
function vaiDaPannello(dest, pan) {
  if (location.hash === dest) return;
  history.replaceState({ ...(history.state || {}), riapri: pan }, '');
  history.pushState({ daPan: pan }, '', dest);
  dispatchEvent(new HashChangeEvent('hashchange'));
}

// Titolo di una pagina con il ritorno sopra, che porta sempre alla schermata precedente:
// «‹ Account» o «‹ Sincronizzazione» se la pagina è stata aperta da un pannello (si torna indietro e il pannello si riapre),
// «‹ <pagina di prima>» se ci si è arrivati da un'altra pagina, altrimenti (pagina aperta da un indirizzo)
// la pagina madre (per esempio Fondi → Patrimonio) o, se non ce n'è una, il pannello predefinito (pan)
export function titoloConRitorno(titolo, madre = null, pan = 'account') {
  const st = history.state || {};
  const daPan = PANNELLI[st.daPan] ? st.daPan : null;
  const back = daPan ? `<button type="button" class="back" data-pannello="${daPan}">${PANNELLI[daPan].nome}</button>`
    : st.da ? `<button type="button" class="back" data-indietro>${esc(st.da.titolo)}</button>`
    : madre ? `<a class="back" href="${madre.href}">${esc(madre.nome)}</a>`
    : `<button type="button" class="back" data-pannello="${pan}">${PANNELLI[pan].nome}</button>`;
  return `<div>${back}<h1>${esc(titolo)}</h1></div>`;
}
export const testataAccount = (titolo, pan = 'account') => `<header class="page-head">${titoloConRitorno(titolo, null, pan)}</header>`;

// «‹ Account» / «‹ Sincronizzazione»: se la pagina è stata aperta da quel pannello si torna indietro
// (e il pannello si riapre sulla pagina di prima), altrimenti il pannello si apre sulla pagina attuale
function tornaPannello(pan) {
  if (history.state?.daPan === pan) history.back();
  else PANNELLI[pan]?.apri();
}

// La versione è il numero della cache del service worker (VERSION in sw.js, "contabilita-vN"):
// è quella dei file che l'app sta davvero usando. Se non è disponibile, il numero è null.
async function numeroVersione() {
  try {
    const nums = (await caches.keys()).map((k) => /^contabilita-v(\d+)$/.exec(k)).filter(Boolean).map((m) => +m[1]);
    return nums.length ? Math.max(...nums) : null;
  } catch { return null; /* cache non disponibile (es. navigazione privata) */ }
}

// Pannello che scende dalla barra in alto, accanto al pulsante che lo apre (lato: left o right)
function pannello(html, lato, btn) {
  btn?.setAttribute('aria-expanded', 'true');
  const dlg = modal(html, { cls: 'panel panel-' + lato, onClose: () => btn?.setAttribute('aria-expanded', 'false') });
  const bar = $('.topbar');
  if (bar) dlg.style.setProperty('--pan-top', Math.max(8, bar.getBoundingClientRect().bottom + 6) + 'px');
  return dlg;
}

// Stato della voce di cronologia mostrata: main.js lo aggiorna dopo ogni cambio di pagina
let statoMostrato = null;
export function ricordaStato() { statoMostrato = history.state; }

// Da chiamare una volta all'avvio
export function avvia() {
  $('#sync-ind')?.addEventListener('click', apriSync);
  $('#account-btn')?.addEventListener('click', apriAccount);
  document.addEventListener('click', (e) => {
    const bp = e.target.closest('[data-pannello]');
    if (bp) tornaPannello(bp.dataset.pannello);
    if (e.target.closest('[data-indietro]')) history.back();
  });
  // Indietro (anche il tasto del telefono) da una pagina aperta da un pannello: si torna alla pagina di prima con il pannello aperto.
  // Vale solo per il passo indietro da quella pagina, non quando ci si ritorna in altri modi.
  addEventListener('popstate', () => {
    const lasciato = statoMostrato;
    statoMostrato = history.state;
    const pan = lasciato?.daPan;
    if (PANNELLI[pan] && history.state?.riapri === pan && history.state.n === lasciato.n - 1 &&
      !document.querySelector('dialog.panel[open]')) setTimeout(PANNELLI[pan].apri, 0);
  });
  sync.onStatus(paintSync);
  // "Sincronizzato 2 min fa" va aggiornato anche senza cambi di stato
  setInterval(() => { if (!document.hidden) paintSync(); }, 60 * 1000);
}
