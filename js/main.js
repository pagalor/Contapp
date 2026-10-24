import * as store from './store.js';
import * as M from './model.js';
import * as sync from './sync.js';
import * as vMese from './view-mese.js';
import * as vRie from './view-riepilogo.js';
import * as vPat from './view-patrimonio.js';
import * as vAltro from './view-altro.js';
import * as vConti from './view-conti.js';
import * as vDebiti from './view-debiti.js';
import * as vRic from './view-ricorrenti.js';
import * as vRate from './view-rate.js';
import * as vBudget from './view-budget.js';
import * as demo from './demo.js';
import { $, $$, setupTooltips, debounce, toast } from './ui.js';
import { fmtEur } from './expr.js';

const checkTargetsSoon = debounce(() => { checkTargets(); checkBudgets(); }, 400);

const view = () => $('#view');
let current = '';
let pendingRemote = false;

const NAV_OF = { mese: 'mese', cerca: 'mese', tag: 'mese', riepilogo: 'riepilogo', patrimonio: 'patrimonio', conti: 'patrimonio', conto: 'patrimonio', debiti: 'debiti', rate: 'debiti', ricorrenti: 'altro', budget: 'altro', altro: 'altro' };
const TITLES = { mese: 'Mese', cerca: 'Cerca', tag: 'Tag', riepilogo: 'Riepilogo', patrimonio: 'Patrimonio', conti: 'Fondi', conto: 'Fondo', debiti: 'Debiti e crediti', rate: 'Pagamenti a rate', ricorrenti: 'Movimenti ricorrenti', budget: 'Budget', altro: 'Altro' };

function route() {
  const h = location.hash.replace(/^#/, '');
  const [name, a, b] = h.split('/').map((x) => (x == null ? x : decodeURIComponent(x)));
  current = NAV_OF[name || 'mese'] ? (name || 'mese') : 'mese';
  $$('.nav a').forEach((l) => l.classList.toggle('on', l.dataset.view === NAV_OF[current]));
  window.scrollTo(0, 0);
  if (current === 'mese' || current === 'cerca' || current === 'tag') {
    let y, m;
    if (current === 'mese' && a) [y, m] = a.split('-').map(Number);
    const q = current === 'cerca' ? a || '' : current === 'tag' ? '#' + (a || '') : '';
    vMese.render(view(), { y, m, q, highlight: current === 'mese' ? b : undefined });
  } else if (current === 'riepilogo') vRie.render(view(), { anno: a });
  else if (current === 'patrimonio') vPat.render(view());
  else if (current === 'conti') vConti.renderConfig(view());
  else if (current === 'conto') vConti.renderConto(view(), a);
  else if (current === 'debiti') vDebiti.render(view());
  else if (current === 'ricorrenti') vRic.render(view());
  else if (current === 'rate') vRate.render(view());
  else if (current === 'budget') vBudget.render(view());
  else if (current === 'altro') vAltro.render(view());
  document.title = TITLES[current] + ' · Rationes' + (demo.attiva ? ' (demo)' : '');
  paintTargetDot();
}

// Pallino sulla voce Patrimonio quando un conto è sotto il target
let lastBelow = null;
function paintTargetDot() {
  const below = M.sottoTarget();
  const dot = $('#target-ind');
  if (dot) { dot.hidden = !below.length; dot.title = below.map((x) => `${x.c.data.nome}: mancano ${fmtEur(x.manca)}`).join('\n'); }
  return below;
}
function checkTargets() {
  const below = paintTargetDot();
  const now = new Map(below.map((x) => [x.c.id, x]));
  if (lastBelow) {
    for (const [id, x] of now) {
      if (!lastBelow.has(id)) toast(`${x.c.data.nome} è sotto il target: mancano ${fmtEur(x.manca)}`, { action: 'Vedi', onAction: () => { location.hash = '#conto/' + id; }, ms: 6000 });
    }
  }
  lastBelow = now;
}

// Avvisi sui budget del periodo in corso: un toast quando uno arriva all'80% o viene sforato.
// Come per i target, al primo controllo si prende solo nota dello stato.
const BUDGET_RANGO = { ok: 0, ritmo: 1, vicino: 2, sforato: 3 };
let lastBudget = null;
function checkBudgets() {
  const t = new Date();
  const now = new Map(M.budgetsStato(t.getFullYear(), t.getMonth() + 1, t).map((s) => [s.b.id, s]));
  if (lastBudget) {
    for (const [id, s] of now) {
      const prima = BUDGET_RANGO[lastBudget.get(id)?.stato ?? 'ok'];
      if (BUDGET_RANGO[s.stato] < 2 || BUDGET_RANGO[s.stato] <= prima) continue;
      const nome = M.budgetLabel(s.b);
      const msg = s.stato === 'sforato' ? `Budget sforato: ${nome}, oltre di ${fmtEur(s.ecc)}`
        : `Budget quasi esaurito: ${nome}, usato il ${Math.floor(s.pct * 100)}%`;
      toast(msg, { action: 'Vedi', onAction: () => { location.hash = '#mese'; }, ms: 6000 });
    }
  }
  lastBudget = now;
}

// Aggiorna la vista quando arrivano dati da un altro dispositivo, senza disturbare chi sta scrivendo
function refreshAfterRemote() {
  const ae = document.activeElement;
  // rimando solo se si sta modificando una riga (non per la casella di ricerca)
  const typing = ae && view().contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && ae.id !== 'q';
  if (typing || document.querySelector('dialog[open]')) { pendingRemote = true; return; }
  pendingRemote = false;
  if (current === 'mese' || current === 'cerca' || current === 'tag') vMese.renderBody();
  else if (current === 'riepilogo') vRie.redraw();
  else if (current === 'patrimonio') vPat.redraw();
  else if (current === 'conto') route();
  else if (current === 'debiti') vDebiti.redraw();
  else if (current === 'ricorrenti') vRic.redraw();
  else if (current === 'rate') vRate.redraw();
  else if (current === 'budget') vBudget.redraw();
}

function paintSyncDot(st) {
  const dot = $('#sync-ind');
  if (!dot) return;
  dot.dataset.state = st.state;
  dot.title = st.msg || '';
  dot.setAttribute('aria-label', 'Sincronizzazione: ' + (st.msg || st.state));
}

// Aggiunge i movimenti ricorrenti e le rate arrivati a scadenza. Dopo l'avvio avvisa e aggiorna la vista.
function runScadenze(avvisa = true) {
  const n = M.generaRicorrenti();
  const r = M.generaRate();
  if ((n || r.tot) && avvisa) {
    if (n || r.rate) toast(avvisoScadenze(n, r.rate));
    refreshAfterRemote();
  }
  return { n, r };
}
function avvisoScadenze(n, rate) {
  const parti = [];
  if (n) parti.push(n === 1 ? '1 movimento ricorrente' : `${n} movimenti ricorrenti`);
  if (rate) parti.push(rate === 1 ? '1 rata' : `${rate} rate`);
  return (n + rate === 1 ? (n ? 'Aggiunto ' : 'Aggiunta ') : n ? 'Aggiunti ' : 'Aggiunte ') + parti.join(' e ');
}

async function boot() {
  vAltro.applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', vAltro.applyTheme);
  if (demo.attiva) {
    demo.mostraAvviso();
    await demo.controllaVersione().catch(() => {});
  }
  try {
    // in demo un archivio separato: i dati veri non vengono né letti né modificati
    await store.init(demo.attiva ? demo.DB : undefined);
  } catch (e) {
    view().innerHTML = `<div class="empty-hint"><p>Impossibile aprire l'archivio locale del browser (${e.message}).
      Se stai usando la navigazione privata, aprila in una finestra normale.</p></div>`;
    return;
  }
  if (demo.attiva) await demo.prepara().catch((e) => console.error('Dati di esempio non caricati', e));
  M.ensureCategories();
  M.migrate();
  const avvio = runScadenze(false);
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  setupTooltips();
  store.subscribe((info) => { if (info.remote) { M.migrate(); const g = runScadenze(); if (!g.n && !g.r.tot) refreshAfterRemote(); } checkTargetsSoon(); });
  document.addEventListener('focusout', () => {
    if (pendingRemote) setTimeout(() => { if (!view().contains(document.activeElement)) refreshAfterRemote(); }, 50);
  });
  sync.onStatus(paintSyncDot);
  if (!demo.attiva) sync.start();
  addEventListener('hashchange', route);
  let lastW = innerWidth;
  addEventListener('resize', debounce(() => {
    if (Math.abs(innerWidth - lastW) < 40) return;
    lastW = innerWidth;
    if (current === 'riepilogo') vRie.redraw();
    if (current === 'patrimonio') vPat.redraw();
  }, 200));
  route();
  checkTargets();
  checkBudgets();
  if (avvio.n || avvio.r.rate) toast(avvisoScadenze(avvio.n, avvio.r.rate));
  // le scadenze arrivano anche con l'app aperta (cambio di giorno) o ripresa dopo ore in secondo piano
  document.addEventListener('visibilitychange', () => { if (!document.hidden) runScadenze(); });
  setInterval(() => { if (!document.hidden) runScadenze(); }, 10 * 60 * 1000);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            toast('È disponibile una nuova versione dell\'app', { action: 'Aggiorna', onAction: () => location.reload(), ms: 60000 });
          }
        });
      });
      // Il browser cerca un service worker nuovo solo quando si apre la pagina (o ogni tanto, a caso):
      // con l'app lasciata aperta bisogna chiederlo noi, altrimenti l'avviso non arriva senza riaprirla.
      const cercaAggiornamento = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      document.addEventListener('visibilitychange', () => { if (!document.hidden) cercaAggiornamento(); });
      addEventListener('online', cercaAggiornamento);
      setInterval(() => { if (!document.hidden) cercaAggiornamento(); }, 30 * 60 * 1000);
    }).catch(() => {});
  }
}

boot();
