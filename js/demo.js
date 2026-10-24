// Modalità demo: per far provare l'app ad altre persone senza toccare i dati veri.
// - Si attiva aprendo l'app con ?demo; la scelta resta sul dispositivo (anche nell'app installata) finché non si esce.
// - Usa un archivio separato (DB) e non sincronizza mai: sync.js resta spento, contabilita-keys non viene aperto.
// - Al primo avvio carica dati inventati, generati qui in modo deterministico con date relative a oggi.
// - Il codice è lo stesso dell'app normale: ogni aggiornamento vale anche per la demo. In più, quando cambia la versione
//   dell'app (VERSION di sw.js) i dati di esempio vengono rigenerati, così mostrano subito anche le novità.
import * as store from './store.js';
import * as M from './model.js';
import { round2 } from './expr.js';
import { confirmBox, toast } from './ui.js';

const LS = 'contabilita.demo';
const LS_DATI = 'contabilita.demo.dati'; // versione dell'app con cui sono stati generati i dati di esempio
const SENZA_VERSIONE = '?';              // generati quando la versione non era nota (primo avvio, service worker non ancora attivo)
export const DB = 'contabilita-demo';
let versione = null;   // versione dei file in uso, se il service worker la comunica
let rinnovati = false; // dati rigenerati per un aggiornamento dell'app

function leggiScelta() {
  const chiesta = new URLSearchParams(location.search).has('demo');
  try {
    if (chiesta) localStorage.setItem(LS, '1');
    return localStorage.getItem(LS) === '1';
  } catch { return chiesta; }
}
export const attiva = leggiScelta();

// --- Avviso sempre visibile in cima alla pagina ---
export function mostraAvviso() {
  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  bar.setAttribute('role', 'note');
  bar.innerHTML = `<span>Versione demo: i dati sono di esempio</span>
    <span class="demo-act"><button type="button" class="link-btn" data-demo="ricomincia">Ricomincia</button>
    <button type="button" class="link-btn" data-demo="esci">Esci dalla demo</button></span>`;
  document.body.prepend(bar);
  document.documentElement.classList.add('demo');
  bar.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-demo]')?.dataset.demo;
    if (act === 'esci') esci();
    if (act === 'ricomincia') {
      const ok = await confirmBox('Cancellare tutte le modifiche fatte nella demo e ricaricare i dati di esempio?', { ok: 'Ricomincia', danger: true });
      if (ok) ricomincia();
    }
  });
}

export function esci() {
  try { localStorage.removeItem(LS); } catch {}
  // via ?demo dall'indirizzo (altrimenti la demo si riattiva) e ricarica l'app normale
  history.replaceState(null, '', location.pathname + '#mese');
  location.reload();
}

// Cancella solo l'archivio della demo
function cancellaArchivio() {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = req.onerror = resolve;
    req.onblocked = () => toast('Chiudi le altre finestre della demo per ricaricare i dati di esempio.', { ms: 6000 });
  });
}

// Ricarica l'app con l'archivio della demo vuoto: i dati di esempio ripartono da capo
export async function ricomincia() {
  store.close();
  await cancellaArchivio();
  location.reload();
}

// Versione dei file che stanno girando: la chiede al service worker che ha servito la pagina (null se non risponde)
function versioneApp() {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) return Promise.resolve(null);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => resolve(typeof e.data === 'string' ? e.data : null);
    sw.postMessage('versione', [ch.port2]);
    setTimeout(() => resolve(null), 800);
  });
}

// Da chiamare prima di aprire l'archivio: se l'app è stata aggiornata da quando sono stati generati i dati di esempio,
// l'archivio della demo si svuota e prepara() li rigenera con il codice nuovo (le modifiche fatte nella demo si perdono)
export async function controllaVersione() {
  versione = await versioneApp();
  if (!versione) return;
  let prima;
  try { prima = localStorage.getItem(LS_DATI); } catch { return; }
  if (prima === versione) return;
  if (prima === SENZA_VERSIONE) { localStorage.setItem(LS_DATI, versione); return; } // generati proprio con questi file
  await cancellaArchivio();
  rinnovati = !!prima;
}

// Al primo avvio (archivio della demo vuoto) carica i dati di esempio
export async function prepara() {
  if (store.exportRecords().length) return;
  M.ensureCategories();
  M.ensureSubcats();
  await store.importRecords(genera(new Date()));
  // le scadenze dei movimenti ricorrenti e dei pagamenti a rate diventano movimenti con il meccanismo normale dell'app
  M.generaRicorrenti();
  M.generaRate();
  // target del conto deposito poco sopra il saldo di oggi, così si vede l'avviso
  const dep = M.balances().get(F.dep) || 0;
  store.patch(F.dep, { obiettivo: Math.ceil(dep / 1000) * 1000 + 1000, obEspr: null });
  // rilevazione manuale di qualche settimana fa: contanti un po' sotto il calcolo, crypto rivalutate
  const t = new Date(); t.setDate(t.getDate() - 40);
  const date = isoD(t);
  const b = M.balances(date);
  const v = (x) => ({ val: round2(x), espr: null });
  M.salvaRilevazione('snap-demo-rilevazione', {
    date,
    vals: { [F.cont]: v(Math.max(0, (b.get(F.cont) || 0) - 6.5)), [F.conto]: v(b.get(F.conto) || 0),
      [F.dep]: v(b.get(F.dep) || 0), [F.btc]: v(Math.round((b.get(F.btc) || 0) * 1.12)) },
    note: 'Contati i contanti e aggiornato il valore delle crypto',
    scelta: 'manuale',
  });
  preparaBudget();
  try { localStorage.setItem(LS_DATI, versione || SENZA_VERSIONE); } catch {}
  if (rinnovati) toast('App aggiornata: i dati di esempio della demo sono stati rigenerati.', { ms: 5000 });
}

// Tre budget calcolati sui dati di oggi: Ristoranti (sforato questo mese: da questo mese l'importo scende sotto la spesa fatta),
// Spesa (con riporto, così si vede l'avanzo del mese prima) e Viaggi (annuale)
function preparaBudget() {
  const t = new Date(), y = t.getFullYear(), m = t.getMonth() + 1;
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const da = ym(new Date(y, m - 7, 1)), questo = ym(t);
  const spesoIn = (rif, anno, mese) => M.budgetMovs({ data: { su: 'cat', rif, periodo: 'mese' } }, anno, mese).reduce((n, r) => n + r.data.val, 0);
  const speso = (rif) => spesoIn(rif, y, m);
  // spesa media dei 6 mesi conclusi: un importo un po' sopra, così alcuni mesi avanzano e altri no
  const media = (rif) => Array.from({ length: 6 }, (_, k) => { const d = new Date(y, m - 2 - k, 1); return spesoIn(rif, d.getFullYear(), d.getMonth() + 1); }).reduce((n, v) => n + v, 0) / 6;
  const arrotonda = (n, passo) => Math.max(passo, Math.round(n / passo) * passo);
  const salva = (id, ord, data, val, extra = null) => {
    let b = { data: {} }, campi = M.budgetConValore(b, data.da, { val });
    if (extra) { b = { data: campi }; campi = M.budgetConValore(b, extra.da, { val: extra.val }); }
    const { da: _, ...resto } = data;
    store.save('budg', id, { riporto: false, ord, ...resto, ...campi });
  };
  const rist = arrotonda(media(C.rist) * 1.1 || 120, 5);
  const oraRist = Math.floor(speso(C.rist) * 0.8);
  salva('budg-demo-ristoranti', 1, { su: 'cat', rif: C.rist, periodo: 'mese', da }, rist, oraRist >= 5 ? { da: questo, val: oraRist } : null);
  salva('budg-demo-spesa', 2, { su: 'cat', rif: C.spesa, periodo: 'mese', riporto: true, da }, arrotonda(media(C.spesa) * 1.1 || 300, 10));
  salva('budg-demo-viaggi', 3, { su: 'cat', rif: C.viaggi, periodo: 'anno', da: `${y - 1}-01` }, 1200);
}

// --- Generatore dei dati di esempio (tutto inventato) ---
const F = { cont: 'cont-demo-contanti', conto: 'cont-demo-conto', dep: 'cont-demo-deposito', web: 'cont-demo-online', btc: 'cont-demo-crypto' };
const FONDI = [
  [F.cont, 'Contanti', 'contanti', 150],
  [F.conto, 'Conto corrente', 'corrente', 2350],
  [F.dep, 'Conto deposito', 'deposito', 6500],
  [F.web, 'Portafoglio online', 'digitale', 60],
  [F.btc, 'Crypto', 'crypto', 400],
];
const C = {
  casa: 'cat-demo-casa', stip: 'cat-demo-stipendio', rist: 'cat-ristoranti', spesa: 'cat-spesa', trasp: 'cat-trasporti',
  viaggi: 'cat-viaggi', svago: 'cat-svago', shop: 'cat-shopping', regali: 'cat-regali', abb: 'cat-abbonamenti',
  tel: 'cat-telefonia', cura: 'cat-cura', tasse: 'cat-tasse', altro: 'cat-altro-out',
};
const S = {
  affitto: 'sub-demo-casa-affitto', bollette: 'sub-demo-casa-bollette', internet: 'sub-demo-casa-internet',
  bar: 'sub-demo-rist-bar', locali: 'sub-demo-rist-locali', domicilio: 'sub-demo-rist-domicilio',
  treni: 'sub-demo-trasp-treni', citta: 'sub-demo-trasp-citta', sharing: 'sub-demo-trasp-sharing',
};
const SUBS = [
  [S.affitto, 'Affitto', C.casa], [S.bollette, 'Luce e gas', C.casa], [S.internet, 'Internet', C.casa],
  [S.bar, 'Bar e caffè', C.rist], [S.locali, 'Ristoranti e pizzerie', C.rist], [S.domicilio, 'Cibo a domicilio', C.rist],
  [S.treni, 'Treni e pullman', C.trasp], [S.citta, 'Mezzi in città', C.trasp], [S.sharing, 'Monopattini e bici', C.trasp],
];
// Spese che capitano a caso: [descrizioni, categoria, sottocategoria, importi (min-max o valori fissi), volte al mese, fondo]
const CASUALI = [
  [['Caffè'], C.rist, S.bar, [1.2, 1.3, 1.5], 7, F.cont],
  [['Colazione al bar'], C.rist, S.bar, [2.8, 3.2, 3.5, 4.1], 2, F.cont],
  [['Pranzo fuori'], C.rist, S.locali, { min: 9, max: 15 }, 2.5, F.conto],
  [['Cena con amici'], C.rist, S.locali, { min: 22, max: 42 }, 1.6, F.conto],
  [['Pizza'], C.rist, S.locali, { min: 9, max: 16 }, 1.2, F.cont],
  [['Aperitivo'], C.rist, S.bar, { min: 7, max: 14 }, 1.4, F.cont],
  [['Cibo a domicilio'], C.rist, S.domicilio, { min: 15, max: 27 }, 1, F.web],
  [['Spesa', 'Spesa supermercato'], C.spesa, null, { min: 18, max: 72 }, 6, F.conto],
  [['Spesa al mercato'], C.spesa, null, { min: 7, max: 19 }, 2, F.cont],
  [['Biglietto treno'], C.trasp, S.treni, { min: 11, max: 39 }, 0.8, F.conto],
  [['Monopattino in sharing'], C.trasp, S.sharing, { min: 2, max: 6 }, 0.8, F.web],
  [['Cinema'], C.svago, null, [7.5, 8.5, 9.9], 0.9, F.conto],
  [['Calcetto'], C.svago, null, [6], 2.2, F.cont],
  [['Museo'], C.svago, null, [10, 12, 15], 0.25, F.conto],
  [['Libro'], C.svago, null, { min: 12, max: 22 }, 0.4, F.web],
  [['Farmacia'], C.cura, null, { min: 4, max: 19 }, 0.9, F.conto],
  [['Barbiere'], C.cura, null, [16, 18], 0.8, F.cont],
  [['Regalo di compleanno'], C.regali, null, { min: 15, max: 45 }, 0.5, F.conto],
  [['Commissione bonifico'], C.tasse, null, [1.5], 0.2, F.conto],
  [['Lavanderia'], C.altro, null, [4.5, 6, 7.5], 0.5, F.cont],
];
const SHOPPING = [
  ['sub-shopping-elettronica', ['Cuffie bluetooth', 'Caricabatterie', 'Cavo USB-C', 'Mouse senza fili'], 9, 59],
  ['sub-shopping-abbigliamento', ['Maglietta', 'Felpa', 'Jeans', 'Camicia', 'Calzini'], 9, 49],
  ['sub-shopping-casa', ['Lampada da scrivania', 'Cuscini', 'Asciugamani', 'Pentola antiaderente'], 12, 39],
  ['sub-shopping-sport', ['Pallone da calcetto', 'Borraccia', 'Racchetta da padel'], 9, 45],
  ['sub-shopping-altro', ['Cover del telefono', 'Zaino'], 9, 35],
];
const TAG = 'Vacanza a Lisbona';
const STIPENDIO = 1750;

const pad = (n) => String(n).padStart(2, '0');
const isoD = (t) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
const num = (n) => String(n).replace('.', ',');

// Numeri pseudo-casuali ripetibili (mulberry32): a parità di giorno di partenza i dati sono sempre gli stessi
function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function genera(oggi) {
  const r = rng(20240611);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const importo = (x) => (Array.isArray(x) ? pick(x) : round2(x.min + r() * (x.max - x.min)));
  const out = [];
  const add = (kind, id, data) => out.push({ kind, id, data });
  let ord = 1;
  let nMov = 0, nTrasf = 0;

  const fine = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  // da gennaio dell'anno scorso (13-24 mesi): così il confronto con l'anno prima e la proiezione hanno un anno intero
  const inizioMesi = new Date(fine.getFullYear() - 1, 0, 1);
  const partenza = new Date(inizioMesi); partenza.setDate(0); // fine del mese precedente
  const meseOggi = fine.getFullYear() * 12 + fine.getMonth();

  // Fondi, configurazione, categorie e sottocategorie in più
  FONDI.forEach(([id, nome, gruppo, si], i) => add('cont', id,
    { nome, gruppo, ord: i, archiviato: false, saldoIniziale: si, siEspr: null, obiettivo: null, obEspr: null }));
  add('cfg', 'cfg-patrimonio', { inizio: isoD(partenza), contoOut: F.conto, contoIn: F.conto });
  add('cat', C.casa, { nome: 'Casa e bollette', tipo: 'out', colore: '#6B7F99', emoji: '🏠', ord: 1.5 });
  add('cat', C.stip, { nome: 'Stipendio', tipo: 'in', colore: '#12805C', emoji: '💼', ord: -1 });
  SUBS.forEach(([id, nome, cat], i) => add('sub', id, { nome, cat, ord: i % 3 }));

  // Saldi seguiti giorno per giorno, per prelevare contanti o ricaricare il portafoglio online quando servono
  const bal = Object.fromEntries(FONDI.map(([id, , , si]) => [id, si]));
  const debiti = {};

  const trasf = (t, da, a, val, note = null) => {
    bal[da] = round2(bal[da] - val); bal[a] = round2(bal[a] + val);
    add('trasf', `trasf-demo-${++nTrasf}`, { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), da, a, val, espr: null, note, ord: ord++ });
  };
  const copri = (t, f, val) => {
    if (bal[f] - val >= 5) return;
    if (f === F.cont) trasf(t, F.conto, F.cont, Math.max(50, Math.ceil((val - bal[f] + 40) / 50) * 50), 'Prelievo al bancomat');
    if (f === F.web) trasf(t, F.conto, F.web, Math.max(50, Math.ceil((val - bal[f] + 20) / 50) * 50), 'Ricarica');
  };
  // conti: id di un fondo oppure ripartizione [{ c, val }]
  const mov = (t, tipo, desc, val, cat, { sub = null, conti = F.conto, espr = null, tags = [], note = null, escl = false } = {}) => {
    const parts = Array.isArray(conti) ? conti : [{ c: conti, val }];
    for (const p of parts) {
      if (tipo === 'out') { copri(t, p.c, p.val); bal[p.c] = round2(bal[p.c] - p.val); } else bal[p.c] = round2(bal[p.c] + p.val);
    }
    add('mov', `mov-demo-${++nMov}`, {
      y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), tipo, val, espr, desc, cat, sub, catAuto: false,
      conti: parts.length === 1 ? [{ c: parts[0].c }] : parts.map((p) => ({ c: p.c, val: p.val, espr: null })), contoAuto: false,
      tags, note, escl, ord: ord++,
    });
  };
  const prestito = (t, id, tipo, persona, desc, val, fondo, note = null) => {
    bal[fondo] = round2(bal[fondo] + (tipo === 'credito' ? -val : val));
    debiti[id] = { tipo, persona, desc, val, espr: null, data: isoD(t), fondo, rimborsi: [], note, ord: ord++ };
  };
  const rimborso = (t, id, val, fondo) => {
    const d = debiti[id];
    if (!d) return;
    bal[fondo] = round2(bal[fondo] + (d.tipo === 'credito' ? val : -val));
    d.rimborsi.push({ data: isoD(t), val, espr: null, fondo });
  };

  for (const t = new Date(inizioMesi); t <= fine; t.setDate(t.getDate() + 1)) {
    const g = t.getDate(), m = t.getMonth() + 1;
    const fineMese = new Date(t.getFullYear(), m, 0).getDate() === g;
    const indietro = meseOggi - (t.getFullYear() * 12 + t.getMonth()); // mesi prima di quello in corso

    // Scadenze fisse
    if (g === 1) mov(t, 'out', 'Affitto', 520, C.casa, { sub: S.affitto });
    if (g === 2) mov(t, 'out', 'Abbonamento mezzi', 35, C.trasp, { sub: S.citta });
    if (g === 3) trasf(t, F.conto, F.dep, 250, 'Risparmio del mese');
    if (g === 5) mov(t, 'out', 'Ricarica telefono', 9.99, C.tel);
    if (g === 10) mov(t, 'out', 'Internet casa', 27.9, C.casa, { sub: S.internet });
    if (g === 18 && m % 2 === 0) {
      const luce = importo({ min: 30, max: 55 });
      const gas = importo([11, 12, 1, 2, 3].includes(m) ? { min: 50, max: 95 } : { min: 12, max: 25 });
      mov(t, 'out', 'Bolletta luce e gas', round2(luce + gas), C.casa, { sub: S.bollette, espr: `=${num(luce)}+${num(gas)}` });
    }
    if (g === 20 && m % 3 === 0) trasf(t, F.conto, F.btc, 100, 'Acquisto crypto');
    if (g === 16 && (m === 5 || m === 11)) mov(t, 'out', 'Tassa rifiuti', 78, C.tasse, { note: 'Rata semestrale' });
    if (g === 9 && m === 4) mov(t, 'in', 'Regalo dei nonni', 100, 'cat-regali-in', { conti: F.cont });
    if (g === 15 && m === 12) mov(t, 'in', 'Tredicesima', 1640, 'cat-altro-in');
    if ([12, 16, 19, 21].includes(g) && m === 12) mov(t, 'out', 'Regalo di Natale', importo({ min: 20, max: 60 }), C.regali, { conti: r() < 0.5 ? F.web : F.conto });
    // movimenti ricorrenti (li crea l'app): qui si aggiornano solo i saldi seguiti
    if (g === 15) { copri(t, F.web, 10.99); bal[F.web] = round2(bal[F.web] - 10.99); }
    if (g === 27) bal[F.conto] = round2(bal[F.conto] + STIPENDIO);

    // Eventi singoli, a una certa distanza da oggi
    if (indietro === 14 && g === 19) mov(t, 'out', "Rinnovo carta d'identità", 22.21, C.tasse, { conti: F.cont });
    if (indietro === 13 && g === 7) mov(t, 'out', 'Spesa settimanale', 64.3, C.spesa, { conti: [{ c: F.cont, val: 15 }, { c: F.conto, val: 49.3 }] });
    if (indietro === 11 && g === 20) mov(t, 'in', 'Vendita bici usata', 120, 'cat-vendite', { conti: F.web });
    if (indietro === 10 && g === 3) mov(t, 'out', 'Dentista', 90, C.cura, { note: 'Pulizia dei denti' });
    if (indietro === 9 && g === 6) prestito(t, 'debt-demo-andrea', 'debito', 'Andrea', 'Prestito per il portatile', 300, F.conto);
    if (indietro === 9 && g === 8) mov(t, 'out', 'Portatile', 649, C.shop, { sub: 'sub-shopping-elettronica' });
    if (indietro === 8 && g === 14) mov(t, 'in', 'Restituzione deposito cauzionale', 400, 'cat-altro-in', { escl: true, note: 'Non è un guadagno: esclusa dai totali' });
    if ((indietro === 7 || indietro === 5) && g === 6) rimborso(t, 'debt-demo-andrea', 100, F.conto);
    if (indietro === 6 && g === 11) mov(t, 'out', 'Spesa grande per la festa', 86.4, C.spesa, { conti: [{ c: F.cont, val: 20 }, { c: F.conto, val: 66.4 }] });
    if (indietro === 5) {
      const v = { tags: [TAG] };
      if (g === 2) {
        mov(t, 'out', 'Volo andata e ritorno', 148.6, C.viaggi, { ...v, conti: F.web });
        mov(t, 'out', 'Casa vacanza', 120, C.viaggi, { ...v, espr: '=240/2', note: 'Pagata tutta io: metà è un credito verso Giulia' });
        prestito(t, 'debt-demo-giulia', 'credito', 'Giulia', 'Metà della casa vacanza', 120, F.conto);
      }
      if (g === 12) { mov(t, 'out', "Treno per l'aeroporto", 8.9, C.trasp, { ...v, sub: S.treni }); mov(t, 'out', 'Cena tipica', 31.5, C.rist, { ...v, sub: S.locali }); }
      if (g === 13) {
        mov(t, 'out', 'Biglietto tram giornaliero', 6.8, C.trasp, { ...v, sub: S.citta, conti: F.cont });
        mov(t, 'out', 'Museo', 12, C.svago, { ...v, conti: F.cont });
        mov(t, 'out', 'Pranzo', 14.2, C.rist, { ...v, sub: S.locali, conti: F.cont });
      }
      if (g === 14) { mov(t, 'out', 'Gita in barca', 25, C.viaggi, { ...v, conti: F.web }); mov(t, 'out', 'Cena di pesce', 38.4, C.rist, { ...v, sub: S.locali }); }
      if (g === 15) { mov(t, 'out', 'Souvenir', 18, C.shop, { ...v, sub: 'sub-shopping-altro', conti: F.cont }); mov(t, 'out', 'Pasticceria', 5.6, C.rist, { ...v, sub: S.bar, conti: F.cont }); }
      if (g === 16) mov(t, 'out', 'Treno per casa', 8.9, C.trasp, { ...v, sub: S.treni });
      if (g === 24) rimborso(t, 'debt-demo-giulia', 60, F.conto);
    }
    if (indietro === 4 && g === 21) mov(t, 'out', 'Scarpe da corsa', 89.9, C.shop, { sub: 'sub-shopping-scarpe', conti: F.web });
    if (indietro === 3 && g === 25) mov(t, 'in', 'Rimborso spese di lavoro', 46.8, 'cat-rimborsi');
    if (indietro === 2 && g === 9) {
      mov(t, 'out', 'Biglietto concerto', 42, C.svago);
      prestito(t, 'debt-demo-sara', 'credito', 'Sara', 'Biglietto del concerto', 42, F.conto);
    }
    if (indietro === 1 && g === 3) rimborso(t, 'debt-demo-sara', 42, F.cont);

    // Spese di tutti i giorni
    for (const [descs, cat, sub, imp, alMese, fondo] of CASUALI) {
      if (r() < alMese / 30) mov(t, 'out', pick(descs), importo(imp), cat, { sub, conti: fondo });
    }
    if (r() < 1.8 / 30) {
      const [sub, descs, min, max] = pick(SHOPPING);
      mov(t, 'out', pick(descs), importo({ min, max }), C.shop, { sub, conti: r() < 0.6 ? F.web : F.conto });
    }
    if (r() < 0.12 / 30) mov(t, 'in', 'Vendita usato online', importo({ min: 10, max: 60 }), 'cat-vendite', { conti: F.web });
    if (fineMese && m % 3 === 0) mov(t, 'in', 'Interessi conto deposito', round2(bal[F.dep] * 0.025 / 4), 'cat-interessi', { conti: F.dep });
  }

  for (const [id, d] of Object.entries(debiti)) add('debt', id, d);

  // Movimenti ricorrenti: i movimenti delle scadenze passate li genera l'app al primo avvio
  // (ord alto: nello stesso giorno vengono dopo un'eventuale ricarica del portafoglio)
  const y0 = inizioMesi.getFullYear(), m0 = inizioMesi.getMonth() + 1;
  add('ric', 'ric-demo-stipendio', { tipo: 'in', desc: 'Stipendio', val: STIPENDIO, espr: null, cat: C.stip, sub: null, conti: [{ c: F.conto }],
    tags: [], note: null, escl: false, inizio: M.isoOf(y0, m0, 27), freq: 'mese', ogni: 1, fine: null, ord: 10001 });
  add('ric', 'ric-demo-musica', { tipo: 'out', desc: 'Abbonamento musica', val: 10.99, espr: null, cat: C.abb, sub: null, conti: [{ c: F.web }],
    tags: [], note: null, escl: false, inizio: M.isoOf(y0, m0, 15), freq: 'mese', ogni: 1, fine: null, ord: 10002 });

  // Pagamenti a rate: le rate scadute le genera l'app al primo avvio.
  // Uno con interessi, contato all'acquisto (anticipo e 10 rate: il costo del finanziamento va in "Interessi e commissioni")…
  const acq1 = new Date(fine.getFullYear(), fine.getMonth() - 4, 12);
  add('rate', 'rate-demo-lavatrice', { desc: 'Lavatrice', cat: C.casa, sub: null, tags: [], prezzo: 549, prEspr: null,
    anticipo: { val: 49, espr: null, data: isoD(acq1), fondo: F.conto }, nRate: 10, importoRata: 52.9, irEspr: null, ultimaRata: null, urEspr: null,
    fondo: F.conto, creditore: 'Finanziaria del negozio', dataAcquisto: isoD(acq1), primaScadenza: isoD(new Date(acq1.getFullYear(), acq1.getMonth() + 1, 12)),
    freq: 'mese', ogni: 1, modalita: 'acquisto', chiuso: false, chiusura: null, gen: 1, note: null, ord: 10003 });
  // …e uno a tasso zero in 3 rate, la prima il giorno dell'acquisto, contato rata per rata (la prossima scade entro una settimana)
  const acq2 = new Date(fine); acq2.setDate(acq2.getDate() - 26);
  add('rate', 'rate-demo-telefono', { desc: 'Smartphone', cat: C.shop, sub: 'sub-shopping-elettronica', tags: [], prezzo: 299.99, prEspr: null,
    anticipo: null, nRate: 3, importoRata: 100, irEspr: null, ultimaRata: 99.99, urEspr: null, fondo: F.conto, creditore: 'PayPal',
    dataAcquisto: isoD(acq2), primaScadenza: isoD(acq2), freq: 'mese', ogni: 1, modalita: 'rate', chiuso: false, chiusura: null, gen: 1, note: null, ord: 10004 });

  // Rilevazioni storiche, precedenti alla data di partenza (per il grafico del patrimonio)
  [[6, [90, 1900, 5800, 40, 300]], [3, [130, 2150, 6200, 25, 350]]].forEach(([mesi, vals], i) => {
    const d = new Date(partenza.getFullYear(), partenza.getMonth() - mesi + 1, 0);
    add('snap', `snap-demo-storico-${i + 1}`, { date: isoD(d), vals: Object.fromEntries(FONDI.map(([id], k) => [id, { val: vals[k], espr: null }])), note: null });
  });

  // Soldi buttati
  const anno = fine.getFullYear();
  [[anno - 1, 'Multa per sosta vietata', 42, null], [anno - 1, 'Abbonamento in palestra mai usato', 117, '=3*39'],
    [anno, 'Biglietto del treno perso', 19.9, null], [anno, 'Cibo scaduto in frigo', 12, null]]
    .forEach(([y, desc, val, espr], i) => add('butt', `butt-demo-${i + 1}`, { y, espr, val, desc, ord: i }));

  return out;
}
