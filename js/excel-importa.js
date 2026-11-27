// Importazione da Excel (.xlsx) e CSV. Un file esportato da Rationes si riconosce dai nomi dei fogli e delle colonne
// e si importa dopo un'anteprima; ogni altro file passa da una procedura guidata in una finestra, un passo alla volta:
// fogli, intestazioni e colonne, categorie e fondi, anteprima finale. Tutto avviene sul dispositivo.
// Ogni record creato ha `impId` (l'id del record `imp` dell'importazione), così l'importazione si può togliere tutta.
import * as store from './store.js';
import * as M from './model.js';
import { leggiFile, ErroreFile, colLettera } from './xlsx.js';
import { esc, $, modal, toast, confirmBox } from './ui.js';
import { fmtEur, round2, exprDaExcel } from './expr.js';
import { FOGLIO_MOV, COL_MOV, FOGLIO_TRASF, FOGLIO_FONDI, FOGLIO_CAT, TIPO_IN, TIPO_OUT } from './excel-esporta.js';

const LS_MAPPE = 'contabilita.excelMappe'; // abbinamento delle colonne per intestazioni già viste (solo su questo dispositivo)
const MAX_MAPPE = 20;
const ANTEPRIMA_RIGHE = 8;

// ---------- Testi, numeri e date ----------

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9€]+/g, ' ').trim();
const chiave = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const pulito = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');
const giorniMese = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dataValida = (y, m, d) => y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= giorniMese(y, m);

const MESI_NOMI = {
  gen: 1, gennaio: 1, jan: 1, january: 1, feb: 2, febbraio: 2, february: 2, mar: 3, marzo: 3, march: 3, apr: 4, aprile: 4, april: 4,
  mag: 5, maggio: 5, may: 5, giu: 6, giugno: 6, jun: 6, june: 6, lug: 7, luglio: 7, jul: 7, july: 7, ago: 8, agosto: 8, aug: 8, august: 8,
  set: 9, sett: 9, settembre: 9, sep: 9, sept: 9, september: 9, ott: 10, ottobre: 10, oct: 10, october: 10, nov: 11, novembre: 11, november: 11,
  dic: 12, dicembre: 12, dec: 12, december: 12,
};
const meseDaNome = (s) => { for (const w of norm(s).split(' ')) if (MESI_NOMI[w]) return MESI_NOMI[w]; return null; };
const annoDaTesto = (s) => { const m = /(?:^|\D)((?:19|20)\d{2})(?!\d)/.exec(String(s)); return m ? +m[1] : null; };

// Testo di una cella così come lo vedrebbe l'utente (anteprime)
function mostra(c) {
  if (c == null || c.v == null) return '';
  if (c.t === 'd') return `${pad(c.v.d)}/${pad(c.v.m)}/${c.v.y}`;
  if (c.t === 'n') return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 10 }).format(c.v);
  if (c.t === 'b') return c.v ? 'VERO' : 'FALSO';
  return String(c.v);
}
const testo = (c) => (c == null || c.v == null ? '' : c.t === 's' ? String(c.v).trim() : mostra(c));
const siCella = (c) => (c?.t === 'b' ? !!c.v : /^(si|sì|vero|true|1|x|yes)$/i.test(testo(c)));

// Numero scritto come testo: «1.234,56», «1,234.56», «€ 12,50», «-12,50», «(12,50)», «12,50-». Restituisce { neg, corpo } o null
function pezziNumero(s) {
  let t = String(s).replace(/[\s  ]/g, '').replace(/€|eur(o)?|\$|£|usd|chf/gi, '');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/^[-−–]/.test(t)) { neg = !neg; t = t.slice(1); } else if (t.startsWith('+')) t = t.slice(1);
  if (/[-−–]$/.test(t)) { neg = !neg; t = t.slice(0, -1); }
  t = t.replace(/^€|€$/g, '');
  if (!/^\d[\d.,']*$/.test(t) && !/^[.,]\d+$/.test(t)) return null;
  return { neg, corpo: t };
}
// Separatore decimale prevalente in una colonna: voti dalle celle in cui non c'è dubbio
function votoDecimale(corpo) {
  const pv = corpo.lastIndexOf('.'), vg = corpo.lastIndexOf(',');
  if (pv >= 0 && vg >= 0) return pv > vg ? '.' : ',';
  const sep = pv >= 0 ? '.' : vg >= 0 ? ',' : null;
  if (!sep) return null;
  const n = corpo.split(sep).length - 1, dopo = corpo.length - corpo.lastIndexOf(sep) - 1;
  if (n > 1) return sep === '.' ? ',' : '.'; // 1.234.567 → il punto separa le migliaia
  return dopo === 3 ? null : sep; // 1,234 o 1.234: non si sa
}
function numeroDaTesto(s, dec) {
  const p = pezziNumero(s);
  if (!p) return null;
  const c = dec === '.' ? p.corpo.replace(/[,']/g, '') : p.corpo.replace(/[.']/g, '').replace(',', '.');
  const n = Number(c);
  return Number.isFinite(n) ? (p.neg ? -n : n) : null;
}

// Data scritta come testo; ordine 'dmy' (italiano) o 'mdy'. Restituisce { y, m, d } o null
function dataDaTesto(s, ordine = 'dmy') {
  const t = String(s).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(t);
  if (m) return dataValida(+m[1], +m[2], +m[3]) ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T].*)?$/.exec(t);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
    const [d, mm] = ordine === 'mdy' ? [+m[2], +m[1]] : [+m[1], +m[2]];
    return dataValida(y, mm, d) ? { y, m: mm, d } : null;
  }
  const n = norm(t).split(' ');
  if (n.length >= 3 && /^\d{1,2}$/.test(n[0]) && MESI_NOMI[n[1]] && /^\d{4}$/.test(n[2])) {
    const r = { y: +n[2], m: MESI_NOMI[n[1]], d: +n[0] };
    return dataValida(r.y, r.m, r.d) ? r : null;
  }
  if (n.length >= 3 && MESI_NOMI[n[0]] && /^\d{1,2}$/.test(n[1]) && /^\d{4}$/.test(n[2])) {
    const r = { y: +n[2], m: MESI_NOMI[n[0]], d: +n[1] };
    return dataValida(r.y, r.m, r.d) ? r : null;
  }
  return null;
}
function ordineDate(testi) {
  for (const t of testi) { const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(t); if (m && +m[1] > 12) return 'dmy'; }
  for (const t of testi) { const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(t); if (m && +m[2] > 12) return 'mdy'; }
  return 'dmy';
}
// Numero seriale di Excel in una colonna di date senza il formato di data
function dataDaSerialeGrezzo(n) {
  if (!(n > 20000 && n < 80000)) return null;
  const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

// ---------- Riconoscimento delle colonne ----------

// Sinonimi (già normalizzati), dal più probabile
const SINONIMI = {
  data: ['data', 'date', 'data operazione', 'data contabile', 'data movimento', 'data registrazione', 'giorno e data', 'booking date',
    'transaction date', 'data transazione', 'data pagamento', 'data acquisto', 'data valuta', 'value date', 'quando'],
  giorno: ['giorno', 'gg', 'day'],
  mese: ['mese', 'month', 'mm'],
  anno: ['anno', 'year', 'aaaa', 'yyyy'],
  importo: ['importo', 'amount', 'importo eur', 'importo euro', 'importo €', 'euro', 'eur', '€', 'valore', 'cifra', 'ammontare', 'somma',
    'movimento', 'importo movimento', 'prezzo', 'costo', 'value'],
  entrate: ['entrate', 'entrata', 'avere', 'accrediti', 'accredito', 'income', 'credit', 'credits', 'incassi', 'incasso', 'ricavi', 'in', 'entrate €'],
  uscite: ['uscite', 'uscita', 'dare', 'addebiti', 'addebito', 'spese', 'spesa', 'expense', 'expenses', 'debit', 'debits', 'pagamenti', 'out', 'uscite €'],
  tipo: ['tipo', 'type', 'segno', 'entrata uscita', 'entrata o uscita', 'in out', 'e u', 'tipo movimento', 'tipo operazione'],
  desc: ['descrizione', 'description', 'causale', 'dettaglio', 'dettagli', 'descrizione operazione', 'operazione', 'motivo', 'voce', 'oggetto',
    'beneficiario', 'esercente', 'merchant', 'payee', 'memo', 'cosa', 'nome', 'details', 'concetto', 'testo'],
  cat: ['categoria', 'category', 'cat', 'categorie', 'classe', 'tipologia spesa'],
  sub: ['sottocategoria', 'sotto categoria', 'subcategory', 'sub category'],
  fondo: ['fondo', 'conto', 'account', 'pagato con', 'ricevuto su', 'metodo', 'metodo di pagamento', 'pagamento', 'carta', 'portafoglio', 'wallet',
    'payment method', 'fondi', 'conto corrente'],
  nota: ['nota', 'note', 'notes', 'commento', 'commenti', 'comment', 'annotazioni', 'annotazione'],
  tag: ['tag', 'tags', 'etichetta', 'etichette', 'label', 'labels'],
  escl: ['escluso dai totali', 'escluso', 'escludi', 'excluded'],
};
export const RUOLI = [
  ['desc', 'Descrizione'], ['cat', 'Categoria'], ['sub', 'Sottocategoria'], ['fondo', 'Fondo'], ['nota', 'Nota'], ['tag', 'Tag'],
  ['escl', 'Escluso dai totali'],
];

function ruoloDi(intest) {
  const n = norm(intest);
  if (!n) return null;
  let best = null;
  for (const [ruolo, lista] of Object.entries(SINONIMI)) {
    const i = lista.indexOf(n);
    if (i >= 0 && (!best || best.rank > i)) best = { ruolo, rank: i };
  }
  if (best) return best;
  const parole = n.split(' ');
  for (const [ruolo, lista] of Object.entries(SINONIMI)) {
    const i = lista.findIndex((s) => s.length > 2 && !s.includes(' ') && parole.includes(s));
    if (i >= 0 && (!best || best.rank > 100 + i)) best = { ruolo, rank: 100 + i };
  }
  return best;
}

const righePiene = (righe, da) => righe.slice(da).filter((r) => r.some((c) => c && testo(c) !== ''));

// Che cosa contiene una colonna: quote di date, numeri e testi, numeri negativi, separatore decimale
function analizza(righe, c) {
  let date = 0, num = 0, txt = 0, piene = 0, neg = 0, lung = 0;
  const voti = { '.': 0, ',': 0 }, testiData = [];
  for (const r of righe.slice(0, 400)) {
    const x = r[c];
    if (!x || testo(x) === '') continue;
    piene++;
    if (x.t === 'd') { date++; continue; }
    if (x.t === 'n') { num++; if (x.v < 0) neg++; continue; }
    const s = testo(x);
    if (dataDaTesto(s)) { date++; testiData.push(s); continue; }
    const p = pezziNumero(s);
    if (p) { num++; if (p.neg) neg++; const v = votoDecimale(p.corpo); if (v) voti[v]++; continue; }
    txt++; lung += s.length;
  }
  return {
    piene, date: piene ? date / piene : 0, num: piene ? num / piene : 0, txt: piene ? txt / piene : 0, neg,
    lung: txt ? lung / txt : 0, dec: voti['.'] > voti[','] ? '.' : ',', ordine: ordineDate(testiData),
  };
}

// Riga delle intestazioni: la prima delle prime 20 con più celle che somigliano a nomi di colonna
function trovaIntestazione(righe) {
  let best = -1, punti = 1;
  for (let r = 0; r < Math.min(20, righe.length); r++) {
    const celle = righe[r].filter((c) => c && c.t === 's');
    let p = 0;
    for (const c of celle) { const x = ruoloDi(c.v); if (x) p += x.rank < 100 ? 1 : 0.5; }
    if (p > punti) { punti = p; best = r; }
  }
  if (best >= 0) return best;
  const prima = righe.findIndex((r) => r.some((c) => c && testo(c) !== ''));
  if (prima < 0) return -1;
  const r0 = righe[prima];
  const testi = r0.filter((c) => c && c.t === 's' && !pezziNumero(c.v) && !dataDaTesto(c.v)).length;
  return testi >= 2 && testi === r0.filter((c) => c && testo(c) !== '').length ? prima : -1;
}

const firma = (riga) => (riga || []).map((c) => norm(testo(c))).join('|').replace(/\|+$/, '');
const nCol = (righe) => righe.reduce((n, r) => Math.max(n, r.length), 0);

function mappaVuota() {
  return { intest: -1, modoData: 'colonna', data: -1, giorno: -1, mese: -1, anno: -1, modo: 'segno', importo: -1, entrate: -1, uscite: -1,
    tipo: -1, inverti: false, desc: -1, cat: -1, sub: -1, fondo: -1, nota: -1, tag: -1, escl: -1 };
}

// Abbinamento proposto in automatico, dai nomi delle colonne e dal contenuto delle celle
function proponi(fg) {
  const m = mappaVuota();
  m.intest = trovaIntestazione(fg.righe);
  const dati = righePiene(fg.righe, m.intest + 1);
  const n = nCol(fg.righe);
  const info = Array.from({ length: n }, (_, c) => analizza(dati, c));
  const presi = new Set();
  const migliori = {};
  if (m.intest >= 0) {
    (fg.righe[m.intest] || []).forEach((cella, c) => {
      const x = cella && cella.t === 's' ? ruoloDi(cella.v) : null;
      if (!x) return;
      // il contenuto deve essere coerente con il ruolo
      const i = info[c];
      if (x.ruolo === 'data' && i.piene && i.date < 0.5) return;
      if (['importo', 'entrate', 'uscite'].includes(x.ruolo) && i.piene && i.num < 0.5) return;
      if (!migliori[x.ruolo] || migliori[x.ruolo].rank > x.rank) migliori[x.ruolo] = { c, rank: x.rank };
    });
  }
  for (const [ruolo, { c }] of Object.entries(migliori).sort((a, b) => a[1].rank - b[1].rank)) {
    if (presi.has(c)) continue;
    m[ruolo] = c; presi.add(c);
  }
  // dal contenuto, per quello che i nomi non hanno trovato
  if (m.data < 0) {
    const c = info.findIndex((i, k) => !presi.has(k) && i.piene && i.date >= 0.6);
    if (c >= 0) { m.data = c; presi.add(c); }
  }
  if (m.data < 0 && (m.mese >= 0 || meseDaNome(fg.nome))) {
    m.modoData = 'mese';
    if (m.mese < 0) m.mese = -2;
    if (m.anno < 0) m.anno = annoDaTesto(fg.nome) ? -2 : -1;
  }
  if (m.importo < 0 && m.entrate < 0 && m.uscite < 0) {
    const c = info.findIndex((i, k) => !presi.has(k) && i.piene && i.num >= 0.6 && i.date < 0.3);
    if (c >= 0) { m.importo = c; presi.add(c); }
  }
  if (m.desc < 0) {
    let bestC = -1, bestL = 0;
    info.forEach((i, k) => { if (!presi.has(k) && i.txt >= 0.5 && i.lung > bestL) { bestL = i.lung; bestC = k; } });
    if (bestC >= 0) { m.desc = bestC; presi.add(bestC); }
  }
  if (m.entrate >= 0 || m.uscite >= 0) m.modo = 'due';
  else if (m.tipo >= 0) m.modo = 'tipo';
  else m.modo = 'segno';
  if (m.modo === 'segno' && m.importo >= 0 && info[m.importo].piene && !info[m.importo].neg) m.inverti = true;
  return m;
}

// ---------- Abbinamenti ricordati ----------

function leggiMappe() { try { return JSON.parse(localStorage.getItem(LS_MAPPE) || '{}') || {}; } catch { return {}; } }
const chiaveMappa = (fg, intest) => (intest >= 0 ? firma(fg.righe[intest]) : '');
function ricordaMappa(fg, mappa) {
  const k = chiaveMappa(fg, mappa.intest);
  if (!k) return;
  try {
    const tuttiM = leggiMappe();
    tuttiM[k] = { mappa, quando: Date.now() };
    const voci = Object.entries(tuttiM).sort((a, b) => b[1].quando - a[1].quando).slice(0, MAX_MAPPE);
    localStorage.setItem(LS_MAPPE, JSON.stringify(Object.fromEntries(voci)));
  } catch { /* preferenza facoltativa */ }
}
function mappaRicordata(fg, intest) {
  const k = chiaveMappa(fg, intest);
  const x = k ? leggiMappe()[k] : null;
  return x?.mappa ? { ...mappaVuota(), ...x.mappa, intest } : null;
}

// ---------- Interpretazione delle righe ----------

const RE_TOTALE = /^(sub ?totale?|subtot|totale?|tot|totali|somma|riporto|riepilogo)( |$)/;
const RE_SALDO = /^saldo( |$)/;
const RE_FORMULA_SOMMA = /^(SUM|SOMMA|SUBTOTAL|SUBTOTALE|AGGREGATE|AGGREGA|SUMIF|SUMIFS|SOMMA\.SE|SOMMA\.PIÙ\.SE)\s*\(/i;

function tipoDaTesto(s) {
  const n = norm(s);
  if (!n) return null;
  if (/^(trasferiment|giroconto|giro conto|transfer)/.test(n)) return 'trasf';
  if (/^(e|entrat\w*|in|income|accredit\w*|avere|credit\w*|ricav\w*|incass\w*|entrate)$/.test(n) || /^(entrat|accredit|incass|ricav)/.test(n) || String(s).trim() === '+') return 'in';
  if (/^(u|uscit\w*|out|expense\w*|spes\w*|addebit\w*|dare|debit\w*|pagament\w*)$/.test(n) || /^(uscit|addebit|spes|pagament)/.test(n) || /^[-−]$/.test(String(s).trim())) return 'out';
  return null;
}

// Valore numerico di una cella di importo: numero, testo da interpretare o formula aritmetica (che diventa espr)
function importoDi(c, dec) {
  if (!c || c.unita) return null; // copia di una cella unita: conterebbe due volte lo stesso importo
  let val = null;
  if (c.t === 'n') val = c.v;
  else if (c.t === 's') val = numeroDaTesto(c.v, dec);
  let espr = null;
  if (c.f) {
    const p = exprDaExcel(c.f);
    if (p) { if (val == null) val = p.val; if (p.espr && Math.abs(p.val - val) < 0.005) espr = p.espr; }
  }
  if (val == null || !Number.isFinite(val)) return null;
  return { val: round2(val), espr };
}

// Ogni riga dei fogli scelti → movimento candidato oppure riga saltata con il motivo
function interpreta(st, { limite = Infinity } = {}) {
  const m = st.mappa;
  const primo = st.fogli[st.scelti[0]];
  const firmaIntest = m.intest >= 0 ? firma(primo.righe[m.intest]) : null;
  const cands = [], saltate = [];
  // separatore decimale e ordine delle date guardando tutti i fogli scelti
  const tutte = st.scelti.flatMap((i) => righePiene(st.fogli[i].righe, intestDi(st.fogli[i]) + 1));
  const dec = {}, ord = {};
  for (const k of ['importo', 'entrate', 'uscite']) if (m[k] >= 0) dec[k] = analizza(tutte, m[k]).dec;
  if (m.data >= 0) ord.data = analizza(tutte, m.data).ordine;
  function intestDi(fg) {
    if (fg === primo || m.intest < 0) return m.intest;
    for (let r = 0; r < Math.min(30, fg.righe.length); r++) if (firma(fg.righe[r]) === firmaIntest) return r;
    return m.intest;
  }
  const cella = (riga, c) => (c >= 0 ? riga[c] : null);
  for (const i of st.scelti) {
    const fg = st.fogli[i];
    const intest = intestDi(fg);
    const annoFoglio = annoDaTesto(fg.nome), meseFoglio = meseDaNome(fg.nome);
    for (let r = intest + 1; r < fg.righe.length; r++) {
      if (cands.length >= limite) return { cands, saltate };
      const riga = fg.righe[r];
      const testi = riga.map(testo);
      if (!testi.some((t) => t !== '')) continue;
      if (firmaIntest && firma(riga) === firmaIntest) continue; // intestazione ripetuta
      const dove = { foglio: fg.nome, riga: r + 1, testo: testi.filter(Boolean).join(' · ').slice(0, 120) };
      const salta = (motivo) => saltate.push({ ...dove, motivo });
      // righe di totale e subtotale
      const nt = testi.map(norm);
      const celleImp = [m.importo, m.entrate, m.uscite].filter((c) => c >= 0).map((c) => riga[c]);
      if (celleImp.some((c) => c?.f && RE_FORMULA_SOMMA.test(c.f.replace(/^_xlfn\./i, ''))) || nt.some((t) => RE_TOTALE.test(t)) ||
          nt.some((t) => RE_SALDO.test(t) && t.split(' ').length <= 3)) {
        salta('Riga di totale'); continue;
      }
      // data
      let y = null, mm = null, d = null;
      if (m.modoData === 'colonna') {
        const c = cella(riga, m.data);
        let dt = null;
        if (c?.t === 'd') dt = c.v;
        else if (c?.t === 'n') dt = dataDaSerialeGrezzo(c.v);
        else if (c?.t === 's') dt = dataDaTesto(c.v, ord.data);
        if (!dt) { salta(testo(c) ? 'Data non valida' : 'Senza data'); continue; }
        ({ y, m: mm, d } = dt);
      } else {
        const cm = cella(riga, m.mese), ca = cella(riga, m.anno), cg = cella(riga, m.giorno);
        mm = m.mese === -2 ? meseFoglio : cm?.t === 'd' ? cm.v.m : cm?.t === 'n' ? cm.v : cm ? (meseDaNome(cm.v) || (/^\d{1,2}$/.test(testo(cm)) ? +testo(cm) : null)) : null;
        y = m.anno === -2 ? annoFoglio : ca?.t === 'd' ? ca.v.y : ca ? annoDaTesto(testo(ca)) : cm?.t === 'd' ? cm.v.y : annoFoglio;
        if (cg) d = cg.t === 'd' ? cg.v.d : /^\d{1,2}$/.test(testo(cg)) ? +testo(cg) : NaN;
        if (!(mm >= 1 && mm <= 12 && Number.isInteger(mm)) || !y || (d != null && !dataValida(y, mm, d))) { salta('Data non valida'); continue; }
      }
      // importo
      const voci = [];
      if (m.modo === 'due') {
        const e = importoDi(cella(riga, m.entrate), dec.entrate), u = importoDi(cella(riga, m.uscite), dec.uscite);
        if (e && e.val) voci.push({ tipo: e.val < 0 ? 'out' : 'in', val: Math.abs(e.val), espr: e.val < 0 ? null : e.espr });
        if (u && u.val) voci.push({ tipo: u.val < 0 ? 'in' : 'out', val: Math.abs(u.val), espr: u.val < 0 ? null : u.espr });
      } else {
        const a = importoDi(cella(riga, m.importo), dec.importo);
        if (a && a.val) {
          let tipo;
          if (m.modo === 'tipo') {
            tipo = tipoDaTesto(testo(cella(riga, m.tipo)));
            if (tipo === 'trasf') { salta('Trasferimento'); continue; }
            if (!tipo) tipo = a.val < 0 ? 'out' : null;
            if (!tipo) { salta('Tipo non riconosciuto'); continue; }
            voci.push({ tipo, val: Math.abs(a.val), espr: a.val < 0 ? null : a.espr });
          } else {
            const pos = a.val > 0;
            tipo = pos !== m.inverti ? 'in' : 'out';
            voci.push({ tipo, val: Math.abs(a.val), espr: pos ? a.espr : null });
          }
        }
      }
      if (!voci.length) { salta('Senza importo'); continue; }
      const base = {
        ...dove, y, m: mm, d,
        desc: pulito(testo(cella(riga, m.desc))), catNome: pulito(testo(cella(riga, m.cat))), subNome: pulito(testo(cella(riga, m.sub))),
        fondoNome: pulito(testo(cella(riga, m.fondo))), note: pulito(testo(cella(riga, m.nota))),
        tags: testo(cella(riga, m.tag)).split(/[,;#]/).map((t) => M.normTag(t)).filter(Boolean),
        escl: m.escl >= 0 && siCella(cella(riga, m.escl)),
      };
      for (const v of voci) cands.push({ ...base, ...v });
    }
  }
  return { cands, saltate };
}

// ---------- Categorie, fondi e doppioni ----------

// Nomi trovati nel file, abbinati a quelli esistenti senza distinguere maiuscole
function nomiTrovati(cands) {
  const cat = new Map(), fondi = new Map();
  for (const c of cands) {
    if (c.catNome) {
      const k = c.tipo + '|' + chiave(c.catNome);
      if (!cat.has(k)) cat.set(k, { k, tipo: c.tipo, nome: c.catNome, n: 0, id: M.cats(c.tipo).find((x) => chiave(x.data.nome) === chiave(c.catNome))?.id || null });
      cat.get(k).n++;
    }
    if (c.fondoNome) {
      const k = chiave(c.fondoNome);
      if (!fondi.has(k)) fondi.set(k, { k, nome: c.fondoNome, n: 0, id: M.accounts(true).find((x) => chiave(x.data.nome) === k)?.id || null });
      fondi.get(k).n++;
    }
  }
  return { cat: [...cat.values()], fondi: [...fondi.values()] };
}

const chiaveDoppione = (y, m, d, tipo, val, desc) => `${y}|${m}|${d ?? ''}|${tipo}|${Math.round(val * 100)}|${chiave(desc)}`;
// Movimenti del file uguali (data, importo, descrizione) a uno già presente: il confronto è a conteggio,
// così due caffè uguali nel file contro uno in archivio fanno un solo doppione
function segnaDoppioni(cands) {
  const conta = new Map();
  for (const r of M.movs()) {
    if (typeof r.data.val !== 'number') continue;
    const k = chiaveDoppione(r.data.y, r.data.m, r.data.d, r.data.tipo, r.data.val, r.data.desc);
    conta.set(k, (conta.get(k) || 0) + 1);
  }
  for (const c of cands) {
    if (c.val == null) continue;
    const k = chiaveDoppione(c.y, c.m, c.d, c.tipo, c.val, c.desc);
    const n = conta.get(k) || 0;
    c.doppione = n > 0;
    if (n > 0) conta.set(k, n - 1);
  }
}

const gruppoDaNome = (nome) => {
  const n = norm(nome);
  return /contant|cash|portafoglio|monete|salvadanaio/.test(n) ? 'contanti' : /paypal|satispay|revolut|digital|wallet/.test(n) ? 'digitale'
    : /bitcoin|btc|crypto|cripto|eth/.test(n) ? 'crypto' : /deposito|risparmi|libretto/.test(n) ? 'deposito' : 'corrente';
};

// ---------- Salvataggio, annullamento, elenco ----------

const isoMov = (c) => M.isoOf(c.y, c.m, c.d);

// Crea in un colpo solo categorie, sottocategorie, fondi e movimenti (e trasferimenti) dell'importazione
function salva({ file, tipo, fogli, movs, trasf = [], cat = [], sub = [], fondi = [], inizio = null }) {
  const impId = 'imp-' + store.newId();
  const list = [];
  const add = (kind, data) => { const id = store.newId(); list.push({ kind, id, data: { ...data, impId } }); return id; };
  const idCat = new Map(), idSub = new Map(), idFondo = new Map();
  let ordC = Math.max(-1, ...store.all('cat').map((c) => c.data.ord ?? 0));
  for (const c of cat) idCat.set(c.k, add('cat', { nome: c.nome, tipo: c.tipo, colore: c.colore || '#7A8B99', emoji: c.emoji || '', ord: ++ordC }));
  const catId = (k) => idCat.get(k) ?? k;
  for (const s of sub) idSub.set(s.k, add('sub', { nome: s.nome, cat: catId(s.cat), ord: s.ord ?? 0 }));
  let ordF = M.accounts(true).length;
  for (const f of fondi) {
    idFondo.set(f.k, add('cont', { nome: f.nome, gruppo: f.gruppo || gruppoDaNome(f.nome), ord: ordF++, archiviato: !!f.archiviato,
      saldoIniziale: f.saldoIniziale || 0, siEspr: f.siEspr || null, obiettivo: f.obiettivo ?? null, obEspr: f.obEspr || null }));
  }
  const fondoId = (k) => idFondo.get(k) ?? k;
  const base = Date.now();
  movs.forEach((x, i) => {
    add('mov', { y: x.y, m: x.m, d: x.d ?? null, tipo: x.tipo, val: x.val ?? null, espr: x.espr || null, desc: x.desc || '',
      cat: catId(x.cat), sub: x.sub ? idSub.get(x.sub) ?? x.sub : null, catAuto: !!x.catAuto,
      conti: (x.conti || []).map((p) => (p.val == null ? { c: fondoId(p.c) } : { c: fondoId(p.c), val: p.val, espr: p.espr || null })),
      contoAuto: !(x.conti || []).length, tags: x.tags || [], note: x.note || null, escl: !!x.escl, ord: base + i });
  });
  trasf.forEach((x, i) => add('trasf', { y: x.y, m: x.m, d: x.d ?? null, da: fondoId(x.da), a: fondoId(x.a), val: x.val, espr: x.espr || null,
    note: x.note || null, ord: base + i }));
  const prima = M.cfg().inizio || null;
  list.push({ kind: 'imp', id: impId, data: { file, quando: base, tipo, fogli, n: movs.length, nTrasf: trasf.length, inizio: inizio && !prima ? inizio : null } });
  store.saveMany(list);
  if (inizio && !prima) M.setCfg({ inizio });
  return impId;
}

export const importazioni = () => store.all('imp').sort((a, b) => (b.data.quando || 0) - (a.data.quando || 0));

// Toglie tutti i record di un'importazione. Categorie, sottocategorie e fondi creati restano se qualcos'altro li usa.
export function eliminaImportazione(impId) {
  const suoi = [], tenere = new Set();
  for (const kind of ['mov', 'trasf', 'cat', 'sub', 'cont']) for (const r of store.all(kind)) if (r.data.impId === impId) suoi.push(r);
  const ids = new Set(suoi.map((r) => r.id));
  const struttura = suoi.filter((r) => r.kind === 'cat' || r.kind === 'sub' || r.kind === 'cont');
  if (struttura.length) {
    const altri = [];
    for (const kind of ['mov', 'trasf', 'sub', 'debt', 'ric', 'rate', 'budg', 'invop', 'cfg', 'snap', 'rett']) {
      for (const r of store.all(kind)) if (!ids.has(r.id)) altri.push(JSON.stringify(r.data));
    }
    const testoAltri = altri.join('\n');
    for (const r of struttura) if (testoAltri.includes(`"${r.id}"`)) tenere.add(r.id);
  }
  const imp = store.get(impId);
  if (imp?.data.inizio && M.cfg().inizio === imp.data.inizio) M.setCfg({ inizio: null });
  const via = [...ids].filter((id) => !tenere.has(id));
  store.removeMany([...via, impId]);
  return suoi.filter((r) => r.kind === 'mov' && !tenere.has(r.id)).length;
}

function dopoImport(impId, n, onDone) {
  M.migrate();
  onDone && onDone();
  // dopo il controllo di target e budget di main.js (400 ms dopo ogni modifica), che altrimenti coprirebbe «Annulla»
  setTimeout(() => toast(n === 1 ? 'Importato 1 movimento' : `Importati ${n} movimenti`, { ms: 10000, action: 'Annulla', onAction: () => {
    eliminaImportazione(impId);
    toast('Importazione annullata');
    onDone && onDone();
  } }), 600);
}

// ---------- Ingresso ----------

export async function importaDaExcel(file, { onDone } = {}) {
  let letto;
  try { letto = await leggiFile(file); } catch (err) {
    if (err instanceof ErroreFile) toast(err.message, { ms: 7000 });
    else { console.error(err); toast('Non riesco a leggere il file: salvalo come .xlsx o .csv e riprova.', { ms: 7000 }); }
    return;
  }
  const fogli = letto.fogli.filter((f) => f.righe.some((r) => r.some((c) => c && testo(c) !== '')));
  if (!fogli.length) { toast('Il file è vuoto.'); return; }
  if (fileRationes(fogli)) return anteprimaRationes(file.name, fogli, onDone);
  procedura(file.name, fogli, onDone);
}

// ---------- File esportato da Rationes ----------

const intestazioni = (fg) => (fg?.righe[0] || []).map((c) => testo(c));
function fileRationes(fogli) {
  const mov = fogli.find((f) => f.nome === FOGLIO_MOV);
  if (!mov) return false;
  const h = intestazioni(mov);
  return COL_MOV.every((c) => h.includes(c));
}

// Righe di un foglio come oggetti { colonna: cella } (intestazione nella prima riga)
function tabellaOggetti(fg) {
  if (!fg) return [];
  const h = intestazioni(fg);
  return fg.righe.slice(1).map((r, i) => ({ riga: i + 2, ...Object.fromEntries(h.map((k, c) => [k, r[c]])) }))
    .filter((o) => Object.entries(o).some(([k, c]) => k !== 'riga' && c && testo(c) !== ''));
}
const dataCella = (c) => (c?.t === 'd' ? c.v : c?.t === 's' ? dataDaTesto(c.v) : c?.t === 'n' ? dataDaSerialeGrezzo(c.v) : null);
const isoDi = (dt) => (dt ? `${dt.y}-${pad(dt.m)}-${pad(dt.d)}` : null);

function anteprimaRationes(nomeFile, fogli, onDone) {
  const per = (n) => fogli.find((f) => f.nome === n);
  const saltate = [];
  // categorie e sottocategorie del file
  const catNuove = new Map(), subNuove = new Map();
  const catEsistente = (tipo, nome) => M.cats(tipo).find((x) => chiave(x.data.nome) === chiave(nome))?.id || null;
  const catDi = (tipo, nome, extra = {}) => {
    if (!nome) return null;
    const id = catEsistente(tipo, nome);
    if (id) return id;
    const k = tipo + '|' + chiave(nome);
    if (!catNuove.has(k)) catNuove.set(k, { k, tipo, nome, ...extra });
    return k;
  };
  const subDi = (cat, nome) => {
    if (!cat || !nome) return null;
    const es = store.get(cat) ? M.subs(cat).find((s) => chiave(s.data.nome) === chiave(nome)) : null;
    if (es) return es.id;
    const k = cat + '|' + chiave(nome);
    if (!subNuove.has(k)) subNuove.set(k, { k, cat, nome, ord: subNuove.size });
    return k;
  };
  for (const o of tabellaOggetti(per(FOGLIO_CAT))) {
    const tipo = testo(o.Tipo) === TIPO_IN ? 'in' : testo(o.Tipo) === TIPO_OUT ? 'out' : null;
    if (!tipo || !testo(o.Categoria)) continue;
    const c = catDi(tipo, testo(o.Categoria), { emoji: testo(o.Emoji), colore: /^#[0-9a-f]{6}$/i.test(testo(o.Colore)) ? testo(o.Colore) : null });
    subDi(c, testo(o.Sottocategoria));
  }
  // fondi del file
  const fondiNuovi = new Map();
  let inizio = null;
  const fondoEsistente = (nome) => M.accounts(true).find((x) => chiave(x.data.nome) === chiave(nome))?.id || null;
  const fondoDi = (nome, extra = {}) => {
    if (!nome) return null;
    const id = fondoEsistente(nome);
    if (id) return id;
    const k = 'f|' + chiave(nome);
    if (!fondiNuovi.has(k)) fondiNuovi.set(k, { k, nome, ...extra });
    return k;
  };
  for (const o of tabellaOggetti(per(FOGLIO_FONDI))) {
    const nome = testo(o.Nome);
    if (!nome) continue;
    const g = M.GRUPPI.find((x) => x[1] === testo(o.Gruppo))?.[0];
    const si = importoDi(o['Saldo iniziale'], ','), ob = importoDi(o.Target, ',');
    fondoDi(nome, { gruppo: g, archiviato: siCella(o.Archiviato), saldoIniziale: si?.val || 0, siEspr: si?.espr || null, obiettivo: ob?.val ?? null, obEspr: ob?.espr || null });
    inizio = inizio || isoDi(dataCella(o['Saldo iniziale al']));
  }
  // movimenti (le righe con la stessa «Ripartizione» sono un solo movimento diviso su più fondi)
  const movs = [], rip = new Map();
  for (const o of tabellaOggetti(per(FOGLIO_MOV))) {
    const dt = dataCella(o.Data);
    const tipo = testo(o.Tipo) === TIPO_IN ? 'in' : testo(o.Tipo) === TIPO_OUT ? 'out' : null;
    const dove = { foglio: FOGLIO_MOV, riga: o.riga, testo: [testo(o.Descrizione), mostra(o.Importo)].filter(Boolean).join(' · ') };
    if (!dt) { saltate.push({ ...dove, motivo: 'Data non valida' }); continue; }
    if (!tipo) { saltate.push({ ...dove, motivo: 'Tipo non riconosciuto' }); continue; }
    const imp = importoDi(o.Importo, ',');
    const fondoNome = testo(o.Fondo);
    const fondo = fondoNome && !fondoNome.includes(' + ') ? fondoDi(fondoNome) : null;
    const r = testo(o.Ripartizione);
    if (r && rip.has(r)) {
      const m = rip.get(r);
      m.conti.push({ c: fondo, val: imp?.val ?? 0, espr: imp?.espr || null });
      m.val = round2(m.val + (imp?.val ?? 0)); m.espr = null;
      continue;
    }
    const cat = catDi(tipo, testo(o.Categoria));
    const m = {
      ...dove, y: dt.y, m: dt.m, d: siCella(o['Senza giorno']) ? null : dt.d, tipo, val: imp ? imp.val : null, espr: r ? null : imp?.espr || null,
      desc: testo(o.Descrizione), cat: cat || M.fallbackCat(tipo), sub: subDi(cat, testo(o.Sottocategoria)), catAuto: false,
      conti: fondo ? [r ? { c: fondo, val: imp?.val ?? 0, espr: imp?.espr || null } : { c: fondo }] : [],
      tags: testo(o.Tag).split(',').map((t) => M.normTag(t)).filter(Boolean), note: testo(o.Nota), escl: siCella(o['Escluso dai totali']),
    };
    if (r) rip.set(r, m);
    movs.push(m);
  }
  for (const m of rip.values()) m.conti = m.conti.filter((p) => p.c);
  // trasferimenti
  const trasf = [];
  for (const o of tabellaOggetti(per(FOGLIO_TRASF))) {
    const dt = dataCella(o.Data), imp = importoDi(o.Importo, ',');
    const da = fondoDi(testo(o.Da)), a = fondoDi(testo(o.A));
    if (!dt || !imp || !da || !a || da === a) { saltate.push({ foglio: FOGLIO_TRASF, riga: o.riga, testo: [testo(o.Da), testo(o.A), mostra(o.Importo)].join(' · '), motivo: 'Trasferimento incompleto' }); continue; }
    trasf.push({ y: dt.y, m: dt.m, d: siCella(o['Senza giorno']) ? null : dt.d, da, a, val: imp.val, espr: imp.espr, note: testo(o.Nota) });
  }
  segnaDoppioni(movs);
  const dop = movs.filter((m) => m.doppione);
  const nuove = movs.filter((m) => !m.doppione);
  const totali = (lista) => M.sums(lista.map((m) => ({ data: m })));
  const t = totali(nuove);

  const dlg = modal(`<div class="dlg xl-imp">
    <header class="dlg-head"><h2>Importa da Excel</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
    <p class="muted">Questo file è stato esportato da Rationes: lo importo così com'è.</p>
    <dl class="stats xl-stats">
      <div><dt>Movimenti</dt><dd data-n>${nuove.length}</dd></div>
      <div><dt>Entrate</dt><dd class="in" data-tin>${fmtEur(t.tin)}</dd></div>
      <div><dt>Uscite</dt><dd class="out" data-tout>${fmtEur(t.tout)}</dd></div>
    </dl>
    <ul class="xl-note">
      ${trasf.length ? `<li>${trasf.length} trasferimenti tra fondi</li>` : ''}
      ${catNuove.size ? `<li>Categorie nuove: ${esc([...catNuove.values()].map((c) => c.nome).join(', '))}</li>` : ''}
      ${subNuove.size ? `<li>${subNuove.size} sottocategorie nuove</li>` : ''}
      ${fondiNuovi.size ? `<li>Fondi nuovi: ${esc([...fondiNuovi.values()].map((f) => f.nome).join(', '))}</li>` : ''}
      ${inizio && !M.cfg().inizio ? `<li>Data di partenza dei saldi: ${esc(inizio.split('-').reverse().join('/'))}</li>` : ''}
      <li>Debiti, rate, ricorrenti, budget e investimenti non si importano: per un ripristino completo usa il backup.</li>
    </ul>
    ${dop.length ? `<label class="sw-row"><span>Includi i ${dop.length} già presenti<small>Stessa data, importo e descrizione di un movimento che hai già</small></span>
      <input type="checkbox" class="switch" role="switch" data-dop></label>` : ''}
    ${saltate.length ? saltateHTML(saltate) : ''}
    <div class="actions"><button type="button" class="btn ghost" data-x>Annulla</button><button type="button" class="btn primary" data-ok>Importa</button></div>
  </div>`, { wide: true });
  const sw = $('[data-dop]', dlg);
  sw?.addEventListener('change', () => {
    const lista = sw.checked ? movs : nuove, tt = totali(lista);
    $('[data-n]', dlg).textContent = lista.length; $('[data-tin]', dlg).textContent = fmtEur(tt.tin); $('[data-tout]', dlg).textContent = fmtEur(tt.tout);
  });
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) { dlg.close(); return; }
    if (!e.target.closest('[data-ok]')) return;
    const lista = sw?.checked ? movs : nuove;
    if (!lista.length && !trasf.length) { toast('Non c\'è niente di nuovo da importare.'); return; }
    // solo le sottocategorie e i fondi che servono davvero
    const subUsate = new Set(lista.map((m) => m.sub)), fondiUsati = new Set([...lista.flatMap((m) => m.conti.map((p) => p.c)), ...trasf.flatMap((x) => [x.da, x.a])]);
    const impId = salva({ file: nomeFile, tipo: 'rationes', fogli: [FOGLIO_MOV], movs: lista, trasf, cat: [...catNuove.values()],
      sub: [...subNuove.values()].filter((s) => subUsate.has(s.k) || per(FOGLIO_CAT)), fondi: [...fondiNuovi.values()].filter((f) => fondiUsati.has(f.k) || per(FOGLIO_FONDI)),
      inizio });
    dlg.close();
    dopoImport(impId, lista.length, onDone);
  });
}

function saltateHTML(saltate) {
  const motivi = new Map();
  for (const s of saltate) motivi.set(s.motivo, (motivi.get(s.motivo) || 0) + 1);
  return `<details class="xl-saltate"><summary>${saltate.length === 1 ? '1 riga saltata' : `${saltate.length} righe saltate`}:
    ${esc([...motivi].map(([k, n]) => `${k.toLowerCase()} (${n})`).join(', '))}</summary>
    <div class="xl-scroll"><table class="tbl xl-tab"><thead><tr><th>Foglio</th><th>Riga</th><th>Motivo</th><th>Contenuto</th></tr></thead><tbody>
    ${saltate.slice(0, 200).map((s) => `<tr><td>${esc(s.foglio)}</td><td>${s.riga}</td><td>${esc(s.motivo)}</td><td>${esc(s.testo)}</td></tr>`).join('')}
    </tbody></table></div>${saltate.length > 200 ? `<p class="muted small-note">Mostro le prime 200.</p>` : ''}</details>`;
}

// ---------- Procedura guidata ----------

function tabellaAnteprima(righe, { da = 0, n = ANTEPRIMA_RIGHE, evidenzia = -1, etichette = null } = {}) {
  const sel = righe.slice(da, da + n);
  const nc = Math.min(30, Math.max(1, nCol(righe.slice(0, da + n))));
  const head = etichette ? `<thead><tr><th></th>${Array.from({ length: nc }, (_, c) => `<th${etichette[c] ? ' class="xl-ruolo"' : ''}>${colLettera(c)}${etichette[c] ? `<small>${esc(etichette[c])}</small>` : ''}</th>`).join('')}</tr></thead>`
    : `<thead><tr><th></th>${Array.from({ length: nc }, (_, c) => `<th>${colLettera(c)}</th>`).join('')}</tr></thead>`;
  return `<div class="xl-scroll"><table class="tbl xl-tab">${head}<tbody>${sel.map((r, i) =>
    `<tr${da + i === evidenzia ? ' class="xl-intest"' : ''}><th>${da + i + 1}</th>${Array.from({ length: nc }, (_, c) => `<td>${esc(mostra(r[c]).slice(0, 60))}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
}

function procedura(nomeFile, fogli, onDone) {
  const visibili = fogli.map((f, i) => (f.nascosto ? -1 : i)).filter((i) => i >= 0);
  // più fogli con un anno nel nome e la stessa struttura: probabilmente uno per anno, si propongono tutti
  const conAnno = visibili.filter((i) => annoDaTesto(fogli[i].nome));
  const firmaDi = (i) => { const f = fogli[i]; const r = trovaIntestazione(f.righe); return r >= 0 ? firma(f.righe[r]) : ''; };
  let scelti = conAnno.length >= 2 && conAnno.every((i) => firmaDi(i) && firmaDi(i) === firmaDi(conAnno[0])) ? conAnno : [visibili[0] ?? 0];
  const st = { fogli, scelti, mappa: null, vista: scelti[0], passo: fogli.length > 1 ? 'fogli' : 'colonne', scelteCat: new Map(), scelteFondo: new Map(), includi: new Set() };
  const passi = () => (fogli.length > 1 ? ['fogli', 'colonne', 'nomi', 'fine'] : ['colonne', 'nomi', 'fine']);
  const TITOLI = { fogli: 'Fogli', colonne: 'Colonne', nomi: 'Categorie e fondi', fine: 'Anteprima' };
  let ris = null; // risultato dell'interpretazione per i passi 3 e 4

  const preparaMappa = () => {
    const fg = fogli[st.scelti[0]];
    const auto = proponi(fg);
    st.mappa = mappaRicordata(fg, auto.intest) || auto;
    st.ricordata = !!mappaRicordata(fg, auto.intest);
  };
  if (st.passo === 'colonne') preparaMappa();

  const dlg = modal(`<div class="dlg xl-wiz">
    <header class="dlg-head"><h2>Importa da Excel</h2><button type="button" class="icon-btn" data-x aria-label="Chiudi">×</button></header>
    <p class="xl-passo muted"></p><div class="xl-corpo"></div>
    <div class="actions"><button type="button" class="btn ghost" data-indietro>Indietro</button><span class="spacer"></span>
      <button type="button" class="btn ghost" data-x>Annulla</button><button type="button" class="btn primary" data-avanti>Avanti</button></div>
  </div>`, { wide: true, cls: 'xl-modal' });
  const corpo = $('.xl-corpo', dlg);

  function disegna() {
    const ps = passi(), i = ps.indexOf(st.passo);
    $('.xl-passo', dlg).textContent = `Passo ${i + 1} di ${ps.length} · ${TITOLI[st.passo]} · ${nomeFile}`;
    $('[data-indietro]', dlg).hidden = i === 0;
    corpo.innerHTML = st.passo === 'fogli' ? passoFogli() : st.passo === 'colonne' ? passoColonne() : st.passo === 'nomi' ? passoNomi() : passoFine();
    const av = $('[data-avanti]', dlg);
    av.textContent = st.passo === 'fine' ? `Importa ${nDaImportare()}` : 'Avanti';
    av.disabled = st.passo === 'fine' && !nDaImportare();
  }

  function passoFogli() {
    const fg = fogli[st.vista];
    return `<p class="muted">Scegli i fogli da importare (anche più di uno, per esempio uno per anno). Tocca un foglio per vederne le prime righe.</p>
      <div class="xl-fogli" role="group" aria-label="Fogli">${fogli.map((f, i) => `<button type="button" class="chip${st.scelti.includes(i) ? ' on' : ''}${i === st.vista ? ' xl-vista' : ''}" data-foglio="${i}" aria-pressed="${st.scelti.includes(i)}">
        ${st.scelti.includes(i) ? '✓ ' : ''}${esc(f.nome)}${f.nascosto ? ' (nascosto)' : ''}</button>`).join('')}</div>
      <h3 class="xl-h">${esc(fg.nome)} <small class="muted">· ${fg.righe.length} righe</small></h3>
      ${tabellaAnteprima(fg.righe)}`;
  }

  function opzioniColonne(fg, valore, { foglio = false, nessuna = 'Nessuna' } = {}) {
    const m = st.mappa, h = m.intest >= 0 ? fg.righe[m.intest] || [] : [];
    const n = nCol(fg.righe);
    return `<option value="-1"${valore === -1 ? ' selected' : ''}>${nessuna}</option>` +
      (foglio ? `<option value="-2"${valore === -2 ? ' selected' : ''}>Dal nome del foglio</option>` : '') +
      Array.from({ length: n }, (_, c) => `<option value="${c}"${valore === c ? ' selected' : ''}>${colLettera(c)}${h[c] && testo(h[c]) ? ' · ' + esc(testo(h[c]).slice(0, 40)) : ''}</option>`).join('');
  }

  function passoColonne() {
    const m = st.mappa, fg = fogli[st.scelti[0]];
    const sel = (nome, label, valore, opz) => `<label class="field"><span>${label}</span><select data-m="${nome}">${opzioniColonne(fg, valore, opz)}</select></label>`;
    const righeIntest = Math.min(20, fg.righe.length);
    const etichette = {};
    const nomiR = { data: 'data', giorno: 'giorno', mese: 'mese', anno: 'anno', importo: 'importo', entrate: 'entrate', uscite: 'uscite', tipo: 'tipo', desc: 'descrizione', cat: 'categoria', sub: 'sottocategoria', fondo: 'fondo', nota: 'nota', tag: 'tag', escl: 'escluso' };
    for (const [k, v] of Object.entries(nomiR)) {
      if (m[k] < 0) continue;
      if (m.modoData === 'colonna' && ['giorno', 'mese', 'anno'].includes(k)) continue;
      if (m.modoData === 'mese' && k === 'data') continue;
      if (m.modo === 'segno' && ['entrate', 'uscite', 'tipo'].includes(k)) continue;
      if (m.modo === 'due' && ['importo', 'tipo'].includes(k)) continue;
      if (m.modo === 'tipo' && ['entrate', 'uscite'].includes(k)) continue;
      etichette[m[k]] = v;
    }
    const prova = interpreta(st, { limite: 5 });
    return `${st.ricordata ? '<p class="xl-ok">Ho riproposto le colonne usate l\'ultima volta per un file con queste intestazioni.</p>' : '<p class="muted">Ho proposto le colonne in automatico: controlla e correggi se serve.</p>'}
      <label class="field"><span>Riga delle intestazioni</span><select data-m="intest">
        <option value="-1"${m.intest === -1 ? ' selected' : ''}>Nessuna (il file parte subito con i dati)</option>
        ${Array.from({ length: righeIntest }, (_, r) => `<option value="${r}"${m.intest === r ? ' selected' : ''}>Riga ${r + 1}: ${esc((fg.righe[r] || []).map(testo).filter(Boolean).slice(0, 4).join(' · ').slice(0, 60) || '(vuota)')}</option>`).join('')}
      </select></label>
      <h3 class="xl-h">Data</h3>
      <div class="seg wide" role="group" aria-label="Data">
        <button type="button" data-modo-data="colonna" aria-pressed="${m.modoData === 'colonna'}">Una colonna</button>
        <button type="button" data-modo-data="mese" aria-pressed="${m.modoData === 'mese'}">Mese e anno</button>
      </div>
      <div class="form-grid">${m.modoData === 'colonna' ? sel('data', 'Data', m.data)
        : sel('mese', 'Mese', m.mese, { foglio: true }) + sel('anno', 'Anno', m.anno, { foglio: true }) + sel('giorno', 'Giorno (facoltativo)', m.giorno)}</div>
      <h3 class="xl-h">Importo</h3>
      <div class="seg wide xl-seg3" role="group" aria-label="Importo">
        <button type="button" data-modo="segno" aria-pressed="${m.modo === 'segno'}">Con il segno</button>
        <button type="button" data-modo="due" aria-pressed="${m.modo === 'due'}">Entrate e uscite</button>
        <button type="button" data-modo="tipo" aria-pressed="${m.modo === 'tipo'}">Colonna tipo</button>
      </div>
      <div class="form-grid">${m.modo === 'segno' ? sel('importo', 'Importo', m.importo)
        : m.modo === 'due' ? sel('entrate', 'Entrate', m.entrate) + sel('uscite', 'Uscite', m.uscite)
        : sel('importo', 'Importo', m.importo) + sel('tipo', 'Tipo (entrata o uscita)', m.tipo)}</div>
      ${m.modo === 'segno' ? `<label class="sw-row"><span>Inverti il segno<small>${m.inverti ? 'Gli importi positivi diventano uscite (come negli estratti delle carte)' : 'Positivi = entrate, negativi = uscite'}</small></span>
        <input type="checkbox" class="switch" role="switch" data-inverti${m.inverti ? ' checked' : ''}></label>` : ''}
      <h3 class="xl-h">Altre colonne</h3>
      <div class="form-grid">${RUOLI.map(([k, l]) => sel(k, l, m[k])).join('')}</div>
      <h3 class="xl-h">Come le leggo</h3>
      ${prova.cands.length ? `<ul class="xl-prova">${prova.cands.map((c) => `<li><span>${c.d ? pad(c.d) + '/' : ''}${pad(c.m)}/${c.y}</span>
        <b class="${c.tipo === 'in' ? 'in' : 'out'}">${c.tipo === 'in' ? '+' : '−'}${esc(fmtEur(c.val))}</b><span>${esc(c.desc || '—')}</span>
        ${c.catNome ? `<small>${esc(c.catNome)}</small>` : ''}</li>`).join('')}</ul>`
        : `<p class="xl-avviso">Con queste scelte non trovo nessun movimento${prova.saltate[0] ? ` (riga ${prova.saltate[0].riga}: ${esc(prova.saltate[0].motivo.toLowerCase())})` : ''}.</p>`}
      <h3 class="xl-h">${esc(fg.nome)}</h3>
      ${tabellaAnteprima(fg.righe, { da: Math.max(0, m.intest), n: ANTEPRIMA_RIGHE, evidenzia: m.intest, etichette })}`;
  }

  function passoNomi() {
    const { cat, fondi } = nomiTrovati(ris.cands);
    const nuovi = (lista) => lista.filter((x) => !x.id);
    const scelta = (mappa, x) => mappa.get(x.k) || 'crea';
    const riga = (x, mappa, opzioni, tipoNome) => `<div class="xl-nome"><div><b>${esc(x.nome)}</b><small>${x.n === 1 ? '1 movimento' : `${x.n} movimenti`}${tipoNome ? ' · ' + tipoNome : ''}</small></div>
      <label class="field xl-campo"><select data-nome="${esc(x.k)}" data-quale="${mappa === st.scelteCat ? 'cat' : 'fondo'}" aria-label="Cosa fare con ${esc(x.nome)}">${opzioni(x, scelta(mappa, x))}</select></label></div>`;
    const opzCat = (x, v) => `<option value="crea"${v === 'crea' ? ' selected' : ''}>Crea la categoria</option>
      <option value="vuoto"${v === 'vuoto' ? ' selected' : ''}>Lascia vuoto (la propone l'app)</option>
      <optgroup label="Abbina a">${M.cats(x.tipo).map((c) => `<option value="${c.id}"${v === c.id ? ' selected' : ''}>${esc(M.catLabel(c))}</option>`).join('')}</optgroup>`;
    const opzFondo = (x, v) => `<option value="crea"${v === 'crea' ? ' selected' : ''}>Crea il fondo</option>
      <option value="vuoto"${v === 'vuoto' ? ' selected' : ''}>Lascia vuoto</option>
      <optgroup label="Abbina a">${M.accounts(true).map((c) => `<option value="${c.id}"${v === c.id ? ' selected' : ''}>${esc(c.data.nome)}</option>`).join('')}</optgroup>`;
    const giaCat = cat.filter((x) => x.id), giaF = fondi.filter((x) => x.id);
    return `<h3 class="xl-h">Categorie</h3>
      ${st.mappa.cat < 0 ? '<p class="muted">Il file non ha una colonna categoria: l\'app la propone dalla descrizione, come quando scrivi un movimento.</p>'
        : `${giaCat.length ? `<p class="muted">${giaCat.length === 1 ? '1 categoria corrisponde' : `${giaCat.length} categorie corrispondono`} a quelle che hai già${nuovi(cat).length ? '.' : ': non c\'è niente da decidere.'}</p>` : ''}
        ${nuovi(cat).map((x) => riga(x, st.scelteCat, opzCat, x.tipo === 'in' ? 'entrata' : 'uscita')).join('')}`}
      <h3 class="xl-h">Fondi</h3>
      ${st.mappa.fondo < 0 ? '<p class="muted">Il file non ha una colonna fondo: i movimenti restano senza fondo.</p>'
        : `${giaF.length ? `<p class="muted">${giaF.length === 1 ? '1 fondo corrisponde' : `${giaF.length} fondi corrispondono`} a quelli che hai già${nuovi(fondi).length ? '.' : ': non c\'è niente da decidere.'}</p>` : ''}
        ${nuovi(fondi).map((x) => riga(x, st.scelteFondo, opzFondo)).join('')}`}`;
  }

  const inclusi = () => ris.cands.filter((c, i) => !c.doppione || st.includi.has(i));
  const nDaImportare = () => (ris ? inclusi().length : 0);

  function passoFine() {
    const lista = inclusi();
    const t = M.sums(lista.map((c) => ({ data: c })));
    const dop = ris.cands.map((c, i) => [c, i]).filter(([c]) => c.doppione);
    const inizio = M.cfg().inizio;
    const prima = inizio ? lista.filter((c) => isoMov(c) <= inizio).length : 0;
    const senzaFondo = inizio ? lista.filter((c) => isoMov(c) > inizio && !fondoRisolto(c)).length : 0;
    return `<dl class="stats xl-stats">
        <div><dt>Movimenti</dt><dd>${lista.length}</dd></div>
        <div><dt>Entrate</dt><dd class="in">${fmtEur(t.tin)}</dd></div>
        <div><dt>Uscite</dt><dd class="out">${fmtEur(t.tout)}</dd></div>
      </dl>
      <ul class="xl-note">
        ${prima ? `<li>${prima === 1 ? '1 movimento è' : `${prima} movimenti sono`} prima della data di partenza dei saldi: come lo storico, non toccano i fondi.</li>` : ''}
        ${senzaFondo ? `<li class="xl-avviso">${senzaFondo === 1 ? '1 movimento successivo alla partenza non ha' : `${senzaFondo} movimenti successivi alla partenza non hanno`} un fondo: saranno segnalati.</li>` : ''}
        <li>Dopo l'importazione puoi annullarla dal messaggio in basso, o più tardi da «Ultime importazioni».</li>
      </ul>
      ${dop.length ? `<details class="xl-dop" open><summary>${dop.length === 1 ? '1 movimento già presente' : `${dop.length} movimenti già presenti`}, esclusi</summary>
        <p class="muted small-note">Stessa data, importo e descrizione di un movimento che hai già. Attiva quelli da importare comunque.</p>
        <label class="sw-row"><span>Includili tutti</span><input type="checkbox" class="switch" role="switch" data-dop-tutti${dop.every(([, i]) => st.includi.has(i)) ? ' checked' : ''}></label>
        ${dop.slice(0, 100).map(([c, i]) => `<label class="sw-row xl-dop-riga"><span>${esc(c.desc || 'Senza descrizione')}<small>${c.d ? pad(c.d) + '/' : ''}${pad(c.m)}/${c.y} · ${c.tipo === 'in' ? '+' : '−'}${esc(fmtEur(c.val))} · ${esc(c.foglio)}, riga ${c.riga}</small></span>
          <input type="checkbox" class="switch" role="switch" data-dop="${i}"${st.includi.has(i) ? ' checked' : ''}></label>`).join('')}
      </details>` : ''}
      ${ris.saltate.length ? saltateHTML(ris.saltate) : ''}`;
  }

  // Fondo di un candidato secondo le scelte del passo 3
  function fondoRisolto(c) {
    if (!c.fondoNome) return null;
    const x = ris.fondi.find((f) => f.k === chiave(c.fondoNome));
    if (x?.id) return x.id;
    const s = st.scelteFondo.get(chiave(c.fondoNome)) || 'crea';
    return s === 'vuoto' ? null : s;
  }

  function prepara() {
    ris = interpreta(st);
    const n = nomiTrovati(ris.cands);
    ris.cat = n.cat; ris.fondi = n.fondi;
    segnaDoppioni(ris.cands);
  }

  function importa() {
    const lista = inclusi();
    if (!lista.length) return;
    ricordaMappa(fogli[st.scelti[0]], st.mappa);
    const catNuove = [], fondiNuovi = [], subNuove = new Map();
    for (const x of ris.cat) if (!x.id && (st.scelteCat.get(x.k) || 'crea') === 'crea') catNuove.push({ k: x.k, tipo: x.tipo, nome: x.nome });
    for (const x of ris.fondi) if (!x.id && (st.scelteFondo.get(x.k) || 'crea') === 'crea') fondiNuovi.push({ k: x.k, nome: x.nome });
    const suggerite = new Map();
    const movs = lista.map((c) => {
      let cat = null, catAuto = false;
      if (c.catNome) {
        const x = ris.cat.find((z) => z.k === c.tipo + '|' + chiave(c.catNome));
        const s = x.id || st.scelteCat.get(x.k) || 'crea';
        cat = s === 'crea' ? x.k : s === 'vuoto' ? null : s;
      }
      if (!cat) {
        const k = c.tipo + '|' + chiave(c.desc);
        if (!suggerite.has(k)) suggerite.set(k, M.suggestCat(c.tipo, c.desc) || M.fallbackCat(c.tipo));
        cat = suggerite.get(k); catAuto = true;
      }
      let sub = null;
      if (c.subNome && cat) {
        const es = store.get(cat) ? M.subs(cat).find((s) => chiave(s.data.nome) === chiave(c.subNome)) : null;
        if (es) sub = es.id;
        else { const k = cat + '|' + chiave(c.subNome); if (!subNuove.has(k)) subNuove.set(k, { k, cat, nome: c.subNome, ord: subNuove.size }); sub = k; }
      } else if (catAuto && store.get(cat)) sub = M.suggestSub(cat, c.desc) || null;
      const f = fondoRisolto(c) || (c.fondoNome && fondiNuovi.some((x) => x.k === chiave(c.fondoNome)) ? chiave(c.fondoNome) : null);
      return { y: c.y, m: c.m, d: c.d, tipo: c.tipo, val: c.val, espr: c.espr, desc: c.desc, cat, sub, catAuto, conti: f ? [{ c: f }] : [],
        tags: c.tags, note: c.note, escl: !!c.escl };
    });
    const impId = salva({ file: nomeFile, tipo: 'guidata', fogli: st.scelti.map((i) => fogli[i].nome), movs, cat: catNuove, sub: [...subNuove.values()], fondi: fondiNuovi });
    dlg.close();
    dopoImport(impId, movs.length, onDone);
  }

  function vai(passo) { st.passo = passo; disegna(); corpo.scrollTop = 0; dlg.scrollTop = 0; }

  dlg.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-x]')) { dlg.close(); return; }
    const ps = passi(), i = ps.indexOf(st.passo);
    if (t.closest('[data-indietro]')) { vai(ps[Math.max(0, i - 1)]); return; }
    if (t.closest('[data-avanti]')) {
      if (st.passo === 'fogli') {
        if (!st.scelti.length) { toast('Scegli almeno un foglio.'); return; }
        preparaMappa(); vai('colonne'); return;
      }
      if (st.passo === 'colonne') {
        const m = st.mappa;
        if (m.modoData === 'colonna' ? m.data < 0 : m.mese === -1) { toast('Scegli la colonna con la data.'); return; }
        if (m.modo === 'due' ? m.entrate < 0 && m.uscite < 0 : m.importo < 0) { toast('Scegli la colonna con l\'importo.'); return; }
        if (m.modo === 'tipo' && m.tipo < 0) { toast('Scegli la colonna con il tipo.'); return; }
        prepara();
        if (!ris.cands.length) { toast('Non trovo nessun movimento con queste colonne.'); return; }
        vai('nomi'); return;
      }
      if (st.passo === 'nomi') { segnaDoppioni(ris.cands); vai('fine'); return; }
      if (st.passo === 'fine') importa();
      return;
    }
    const bf = t.closest('[data-foglio]');
    if (bf) {
      const k = +bf.dataset.foglio;
      st.scelti = st.scelti.includes(k) ? st.scelti.filter((x) => x !== k) : [...st.scelti, k].sort((a, b) => a - b);
      st.vista = k; disegna(); return;
    }
    const md = t.closest('[data-modo-data]');
    if (md) { st.mappa.modoData = md.dataset.modoData; if (st.mappa.modoData === 'mese' && st.mappa.mese === -1) st.mappa.mese = meseDaNome(fogli[st.scelti[0]].nome) ? -2 : -1; if (st.mappa.modoData === 'mese' && st.mappa.anno === -1 && annoDaTesto(fogli[st.scelti[0]].nome)) st.mappa.anno = -2; disegna(); return; }
    const mo = t.closest('[data-modo]');
    if (mo) { st.mappa.modo = mo.dataset.modo; disegna(); }
  });
  dlg.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-m]')) {
      const k = t.dataset.m, v = +t.value;
      if (k === 'intest') {
        const fg = fogli[st.scelti[0]];
        const ric = mappaRicordata(fg, v);
        st.mappa = ric || { ...st.mappa, intest: v };
        st.ricordata = !!ric;
      } else {
        // una colonna ha un solo ruolo: se era usata altrove, lì si toglie
        if (v >= 0) for (const r of Object.keys(mappaVuota())) if (!['intest', 'modoData', 'modo', 'inverti'].includes(r) && r !== k && st.mappa[r] === v) st.mappa[r] = -1;
        st.mappa[k] = v;
      }
      disegna(); return;
    }
    if (t.matches('[data-inverti]')) { st.mappa.inverti = t.checked; disegna(); return; }
    if (t.matches('[data-nome]')) { (t.dataset.quale === 'cat' ? st.scelteCat : st.scelteFondo).set(t.dataset.nome, t.value); return; }
    if (t.matches('[data-dop-tutti]')) {
      ris.cands.forEach((c, i) => { if (c.doppione) { if (t.checked) st.includi.add(i); else st.includi.delete(i); } });
      disegna(); return;
    }
    if (t.matches('[data-dop]')) { if (t.checked) st.includi.add(+t.dataset.dop); else st.includi.delete(+t.dataset.dop); disegna(); }
  });
  disegna();
}

// Per i test e per la demo
export const _test = { interpreta, proponi, numeroDaTesto, dataDaTesto, pezziNumero, votoDecimale, trovaIntestazione, salva };
