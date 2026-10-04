import * as store from './store.js';
import { round2 } from './expr.js';

export const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio',
  'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
export const MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

// Stessi identificativi usati per lo storico importato: così non nascono doppioni
const DEFAULT_CATS = {
  out: [['ristoranti', 'Ristoranti e bar', '#D9822B'], ['spesa', 'Spesa', '#4C9A2A'], ['trasporti', 'Trasporti', '#2F6FB3'],
    ['viaggi', 'Viaggi', '#14A3A3'], ['svago', 'Svago e sport', '#8E44AD'], ['shopping', 'Shopping', '#C2185B'],
    ['regali', 'Regali', '#D4A106'], ['abbonamenti', 'Abbonamenti digitali', '#5C6BC0'], ['telefonia', 'Telefonia', '#00897B'],
    ['cura', 'Cura personale e salute', '#8D6E63'], ['universita', 'Università', '#6D8B1E'],
    ['tasse', 'Tasse e burocrazia', '#78909C'], ['altro-out', 'Altro', '#9E9E9E']],
  in: [['famiglia', 'Famiglia', '#2457A6'], ['interessi', 'Interessi', '#14A3A3'], ['regali-in', 'Regali ricevuti', '#D4A106'],
    ['vendite', 'Vendite', '#C2185B'], ['vincite', 'Vincite', '#8E44AD'], ['rimborsi', 'Rimborsi', '#4C9A2A'],
    ['altro-in', 'Altro', '#9E9E9E']],
};

// Crea le categorie di base se l'archivio non ne ha (primo avvio senza storico)
export function ensureCategories() {
  if (store.all('cat').length) return;
  for (const tipo of ['out', 'in']) {
    DEFAULT_CATS[tipo].forEach(([key, nome, colore], i) =>
      store.saveDefault('cat', 'cat-' + key, { nome, tipo, colore, ord: i }));
  }
}

export function cats(tipo) {
  return store.all('cat').filter((c) => c.data.tipo === tipo)
    .sort((a, b) => a.data.ord - b.data.ord || a.data.nome.localeCompare(b.data.nome));
}

export function catById(id) { return store.get(id); }

export function fallbackCat(tipo) {
  const list = cats(tipo);
  return (list.find((c) => c.data.nome === 'Altro') || list[list.length - 1])?.id || null;
}

// --- Movimenti ---
export const movs = () => store.all('mov');

export function sortMovs(list) {
  return list.sort((a, b) => (a.data.d ?? 0) - (b.data.d ?? 0) || a.data.ord - b.data.ord);
}

export function movsOf(y, m) {
  return sortMovs(movs().filter((r) => r.data.y === y && r.data.m === m));
}

const counts = (r) => !r.data.escl && typeof r.data.val === 'number';

export function sums(list) {
  let tin = 0, tout = 0;
  for (const r of list) {
    if (!counts(r)) continue;
    if (r.data.tipo === 'in') tin += r.data.val; else tout += r.data.val;
  }
  return { tin: round2(tin), tout: round2(tout), saldo: round2(tin - tout) };
}

export function years() {
  const set = new Set(movs().map((r) => r.data.y));
  for (const b of store.all('butt')) set.add(b.data.y);
  return [...set].sort((a, b) => a - b);
}

// Totali per mese in un anno: array di 12 { tin, tout, saldo, n }
export function monthly(y) {
  const out = Array.from({ length: 12 }, () => ({ tin: 0, tout: 0, saldo: 0, n: 0 }));
  for (const r of movs()) {
    if (r.data.y !== y) continue;
    const o = out[r.data.m - 1];
    o.n++;
    if (!counts(r)) continue;
    if (r.data.tipo === 'in') o.tin += r.data.val; else o.tout += r.data.val;
  }
  for (const o of out) { o.tin = round2(o.tin); o.tout = round2(o.tout); o.saldo = round2(o.tin - o.tout); }
  return out;
}

export function byCategory(list, tipo) {
  const map = new Map();
  for (const r of list) {
    if (r.data.tipo !== tipo || !counts(r)) continue;
    map.set(r.data.cat, (map.get(r.data.cat) || 0) + r.data.val);
  }
  return [...map.entries()].map(([id, tot]) => ({ id, cat: catById(id), tot: round2(tot) }))
    .sort((a, b) => b.tot - a.tot);
}

// --- Suggerimento categoria dalla descrizione ---
const RULES = {
  out: [
    ['Regali', /^regal/],
    ['Viaggi', /gita|vacanza|^casa |airbnb|booking|hotel|volo|ryanair|escursione|noleggio/],
    ['Ristoranti e bar', /^cen|pranzo|caff|colazione|aperitivo|^bar\b|birra|gelato|kebab|pizza|dopocena|starbucks|glovo|deliveroo|just eat/],
    ['Spesa', /^spes/],
    ['Università', /universit|laurea|libro|libreria|cartoleria|^stampa/],
    ['Trasporti', /flixbus|caputobus|itabus|italo|trenitalia|treno|marinobus|sitbus|trainline|gnv|atac|metro|enjoy|lime|carburante|benzina|autostrada|parcheggio|taxi|uber|bus/],
    ['Telefonia', /^very$|iliad|esim|ricarica/],
    ['Abbonamenti digitali', /prime|google ai|anthropic|claude|chatgpt|dazn|disney|netflix|spotify|youtube/],
    ['Svago e sport', /cinema|bowling|calc|padel|tennis|volley|kart|partita|poker|sisal|eurobet|museo|concerto|festa|steam|palestra/],
    ['Cura personale e salute', /barbiere|farmacia|dr\.? ?max|medic|dentist|tampone/],
    ['Tasse e burocrazia', /passaporto|fototessera|bollettino|pagopa|poste|imposta|bollo|multa|commission/],
    ['Shopping', /amazon|aliexpress|wallapop|decathlon|zalando|adidas|nike|puma|h&m|ebay|ikea|mediaworld|unieuro/],
  ],
  in: [
    ['Famiglia', /pap[aà]|mamma|zio|zia|nonn/],
    ['Interessi', /bbva|revolut|hype|interess|isybank|buono postale/],
    ['Regali ricevuti', /regalo|eredit/],
    ['Vendite', /ebay|vinted|wallapop|vendita/],
    ['Vincite', /sisal|vincita|eurobet/],
    ['Rimborsi', /rimbors/],
  ],
};

export function suggestCat(tipo, desc, excludeId) {
  const d = (desc || '').trim().toLowerCase();
  if (!d) return null;
  // 1. come l'hai già classificata in passato (la scelta più frequente)
  const freq = new Map();
  for (const r of movs()) {
    if (r.id === excludeId || r.data.tipo !== tipo) continue;
    if ((r.data.desc || '').trim().toLowerCase() === d && r.data.cat) {
      freq.set(r.data.cat, (freq.get(r.data.cat) || 0) + 1);
    }
  }
  if (freq.size) return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  // 2. regole di base
  for (const [nome, rx] of RULES[tipo]) {
    if (rx.test(d)) {
      const c = cats(tipo).find((x) => x.data.nome === nome);
      if (c) return c.id;
    }
  }
  return null;
}

// Descrizioni usate più spesso (per i suggerimenti mentre scrivi)
export function frequentDescs(tipo, limit = 400) {
  const freq = new Map();
  for (const r of movs()) {
    if (r.data.tipo !== tipo || !r.data.desc) continue;
    const k = r.data.desc.trim();
    freq.set(k, (freq.get(k) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => k);
}

// --- Soldi buttati ---
export function buttati(y) {
  return store.all('butt').filter((r) => r.data.y === y).sort((a, b) => a.data.ord - b.data.ord);
}
export const buttTot = (y) => round2(buttati(y).reduce((s, r) => s + (r.data.val || 0), 0));

// --- Patrimonio ---
export function containers(includeArchived = true) {
  return store.all('cont').filter((c) => includeArchived || !c.data.archiviato)
    .sort((a, b) => a.data.ord - b.data.ord);
}

export const GRUPPI = [['contanti', 'Contanti e depositi'], ['conti', 'Conti e cripto'], ['altro', 'Altro']];
export const gruppoNome = (g) => (GRUPPI.find((x) => x[0] === g) || GRUPPI[2])[1];

export function snapshots() {
  return store.all('snap').sort((a, b) => a.data.date.localeCompare(b.data.date));
}

export function snapTotals(snap) {
  const out = { tot: 0, gruppi: {} };
  for (const [cid, v] of Object.entries(snap.data.vals || {})) {
    if (typeof v.val !== 'number') continue;
    const c = store.get(cid);
    const g = c ? c.data.gruppo : 'altro';
    out.gruppi[g] = round2((out.gruppi[g] || 0) + v.val);
    out.tot += v.val;
  }
  out.tot = round2(out.tot);
  return out;
}

// Saldo dei movimenti registrati tra due date (esclusa la prima, inclusa la seconda).
// I movimenti senza giorno valgono come se fossero a metà mese.
export function saldoTra(d1, d2) {
  let s = 0, stimati = 0;
  for (const r of movs()) {
    if (!counts(r)) continue;
    const day = r.data.d ?? 15;
    const iso = `${r.data.y}-${String(r.data.m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (iso > d1 && iso <= d2) {
      s += r.data.tipo === 'in' ? r.data.val : -r.data.val;
      if (r.data.d == null) stimati++;
    }
  }
  return { saldo: round2(s), stimati };
}

// =====================================================================
// Patrimonio automatico: conti con saldo iniziale, aggiornati da movimenti,
// trasferimenti e rettifiche successivi alla data di partenza.
// =====================================================================

const CFG_ID = 'cfg-patrimonio';
export const cfg = () => store.get(CFG_ID)?.data || {};
export function setCfg(changes) { store.save('cfg', CFG_ID, { ...cfg(), ...changes }); }
export const autoAttivo = () => !!cfg().inizio;

const pad = (n) => String(n).padStart(2, '0');
export const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d ?? 1)}`;
export const todayIso = () => { const t = new Date(); return isoOf(t.getFullYear(), t.getMonth() + 1, t.getDate()); };
// I movimenti senza giorno valgono come il 1° del mese
export const recDate = (r) => isoOf(r.data.y, r.data.m, r.data.d);

export const accounts = (includeArchived = false) => containers(includeArchived);
export const accName = (id) => store.get(id)?.data.nome || 'conto eliminato';

// Ripartizione effettiva di un movimento sui conti: [{ c, val }]
export function allocations(r) {
  const d = r.data;
  if (typeof d.val !== 'number' || !Array.isArray(d.conti) || !d.conti.length) return [];
  if (d.conti.length === 1) return [{ c: d.conti[0].c, val: d.val }];
  return d.conti.filter((x) => x.c && typeof x.val === 'number').map((x) => ({ c: x.c, val: x.val }));
}
export function splitMismatch(r) {
  const d = r.data;
  if (!Array.isArray(d.conti) || d.conti.length < 2 || typeof d.val !== 'number') return 0;
  return round2(d.val - d.conti.reduce((s, x) => s + (x.val || 0), 0));
}
export const contiLabel = (r) => (r.data.conti || []).map((x) => accName(x.c)).join(' + ');

export const trasfs = () => store.all('trasf');
export function trasfOf(y, m) {
  return trasfs().filter((r) => r.data.y === y && r.data.m === m)
    .sort((a, b) => (a.data.d ?? 0) - (b.data.d ?? 0) || a.data.ord - b.data.ord);
}
export const retts = () => store.all('rett');

// Tutte le variazioni dei conti dopo la data di partenza
// { date, c, val (con segno), kind, id, desc }
export function ledgerEntries() {
  const inizio = cfg().inizio;
  if (!inizio) return [];
  const out = [];
  for (const r of movs()) {
    const date = recDate(r);
    if (date <= inizio) continue;
    for (const a of allocations(r)) {
      out.push({ date, c: a.c, val: r.data.tipo === 'in' ? a.val : -a.val, kind: 'mov', id: r.id,
        desc: r.data.desc || '(senza descrizione)', ord: r.data.ord, tipo: r.data.tipo });
    }
  }
  for (const r of trasfs()) {
    const date = recDate(r);
    if (date <= inizio || typeof r.data.val !== 'number') continue;
    if (r.data.da) out.push({ date, c: r.data.da, val: -r.data.val, kind: 'trasf', id: r.id, desc: 'Trasferimento verso ' + accName(r.data.a), ord: r.data.ord });
    if (r.data.a) out.push({ date, c: r.data.a, val: r.data.val, kind: 'trasf', id: r.id, desc: 'Trasferimento da ' + accName(r.data.da), ord: r.data.ord });
  }
  for (const r of retts()) {
    if (r.data.date < inizio || typeof r.data.delta !== 'number') continue;
    out.push({ date: r.data.date, c: r.data.c, val: r.data.delta, kind: 'rett', id: r.id,
      desc: 'Correzione del saldo' + (r.data.note ? ': ' + r.data.note : ''), ord: r.updated_at });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.ord || 0) - (b.ord || 0));
}

// Saldo di ogni conto (alla data asOf inclusa, oppure a oggi e oltre se omessa)
export function balances(asOf) {
  const map = new Map();
  for (const c of accounts(true)) map.set(c.id, c.data.saldoIniziale || 0);
  for (const e of ledgerEntries()) {
    if (asOf && e.date > asOf) continue;
    map.set(e.c, (map.get(e.c) || 0) + e.val);
  }
  for (const [k, v] of map) map.set(k, round2(v));
  return map;
}

export function totaleGruppi(bal) {
  const out = { tot: 0, gruppi: {} };
  for (const c of accounts(true)) {
    const v = bal.get(c.id) || 0;
    if (c.data.archiviato && Math.abs(v) < 0.005) continue;
    out.gruppi[c.data.gruppo] = round2((out.gruppi[c.data.gruppo] || 0) + v);
    out.tot += v;
  }
  out.tot = round2(out.tot);
  return out;
}

// Conti sotto il target: [{ c, bal, target, manca }]
export function sottoTarget(bal = balances()) {
  if (!autoAttivo()) return [];
  return accounts().filter((c) => typeof c.data.obiettivo === 'number')
    .map((c) => ({ c, bal: bal.get(c.id) || 0, target: c.data.obiettivo, manca: round2(c.data.obiettivo - (bal.get(c.id) || 0)) }))
    .filter((x) => x.manca > 0.005);
}

// Movimenti dopo la partenza che non dicono da quale conto sono passati
export function senzaConto() {
  const inizio = cfg().inizio;
  if (!inizio) return [];
  return sortMovs(movs().filter((r) => recDate(r) > inizio && typeof r.data.val === 'number' && !allocations(r).length));
}

// Serie per il grafico: saldi a fine mese dalla partenza a oggi
export function serieAuto() {
  const inizio = cfg().inizio;
  if (!inizio) return [];
  const pts = [{ date: inizio, bal: balances(inizio) }];
  let [y, m] = inizio.split('-').map(Number);
  const oggi = todayIso();
  for (;;) {
    const last = new Date(y, m, 0).getDate();
    const iso = isoOf(y, m, last);
    if (iso >= oggi) break;
    if (iso > inizio) pts.push({ date: iso, bal: balances(iso) });
    m++; if (m > 12) { m = 1; y++; }
  }
  if (oggi > inizio) pts.push({ date: oggi, bal: balances(oggi) });
  return pts;
}

// Conto proposto per un nuovo movimento
export function suggestConto(tipo, desc, excludeId) {
  const d = (desc || '').trim().toLowerCase();
  const valid = (id) => { const c = store.get(id); return c && !c.data.archiviato; };
  if (d) {
    const freq = new Map();
    for (const r of movs()) {
      if (r.id === excludeId || r.data.tipo !== tipo || r.data.conti?.length !== 1) continue;
      if ((r.data.desc || '').trim().toLowerCase() === d) freq.set(r.data.conti[0].c, (freq.get(r.data.conti[0].c) || 0) + 1);
    }
    const best = [...freq.entries()].filter(([c]) => valid(c)).sort((a, b) => b[1] - a[1])[0];
    if (best) return best[0];
  }
  const def = tipo === 'in' ? cfg().contoIn : cfg().contoOut;
  if (def && valid(def)) return def;
  return null;
}

// --- Tag ---
export const normTag = (t) => t.trim().replace(/^#/, '').replace(/\s+/g, ' ');
export function tagStats(list = movs()) {
  const map = new Map();
  for (const r of list) {
    for (const t of r.data.tags || []) {
      const k = t.toLowerCase();
      const o = map.get(k) || { tag: t, n: 0, tin: 0, tout: 0, primo: null, ultimo: null };
      o.n++;
      if (!r.data.escl && typeof r.data.val === 'number') {
        if (r.data.tipo === 'in') o.tin += r.data.val; else o.tout += r.data.val;
      }
      const dt = recDate(r);
      if (!o.primo || dt < o.primo) o.primo = dt;
      if (!o.ultimo || dt > o.ultimo) o.ultimo = dt;
      map.set(k, o);
    }
  }
  return [...map.values()].map((o) => ({ ...o, tin: round2(o.tin), tout: round2(o.tout) }))
    .sort((a, b) => (b.ultimo || '').localeCompare(a.ultimo || ''));
}
export const movsWithTag = (tag) => movs().filter((r) => (r.data.tags || []).some((t) => t.toLowerCase() === tag.toLowerCase()));
