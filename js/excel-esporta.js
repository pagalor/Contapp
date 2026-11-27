// Esportazione in Excel (.xlsx): un vero foglio di lavoro, non una stampa. Importi come numeri con il formato valuta,
// date come date, intestazioni bloccate, filtri, larghezze adatte, entrate in verde e uscite in rosso.
// Gli importi scritti come espressione diventano formule; i fogli Riepilogo usano SUMIFS (SOMMA.PIÙ.SE) sui Movimenti,
// con il valore già calcolato accanto per chi non ricalcola.
import * as M from './model.js';
import { scriviXlsx, seriale, rif, colLettera, rifFoglio } from './xlsx.js';
import { exprExcel, round2 } from './expr.js';

// Nomi dei fogli e delle colonne: l'importazione li usa per riconoscere un file di Rationes
export const FOGLIO_MOV = 'Movimenti';
export const COL_MOV = ['Data', 'Tipo', 'Importo', 'Descrizione', 'Categoria', 'Sottocategoria', 'Fondo', 'Tag', 'Nota', 'Escluso dai totali', 'Senza giorno', 'Ripartizione'];
export const FOGLIO_TRASF = 'Trasferimenti';
export const COL_TRASF = ['Data', 'Senza giorno', 'Da', 'A', 'Importo', 'Nota'];
export const FOGLIO_FONDI = 'Fondi';
export const COL_FONDI = ['Nome', 'Gruppo', 'Archiviato', 'Saldo iniziale', 'Saldo iniziale al', 'Saldo attuale', 'Target'];
export const FOGLIO_CAT = 'Categorie';
export const COL_CAT = ['Tipo', 'Categoria', 'Sottocategoria', 'Emoji', 'Colore', 'Movimenti'];
export const TIPO_IN = 'Entrata', TIPO_OUT = 'Uscita', SI = 'sì';

const data = (y, m, d) => ({ v: seriale(y, m, d ?? 1), s: 'data' });
const dataIso = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? data(+iso.slice(0, 4), +iso.slice(5, 7), +iso.slice(8, 10)) : null);
const eur = (v, espr = null, s = 'eur') => (typeof v === 'number' ? { v: round2(v), f: espr ? exprExcel(espr) : null, s } : null);
const stileTipo = (tipo) => (tipo === 'in' ? 'eurIn' : 'eurOut');
const siNo = (b) => (b ? SI : '');
const freqTesto = (freq, ogni) => {
  const n = Math.max(1, Math.floor(ogni) || 1);
  const f = M.FREQ.find((x) => x[0] === freq) || M.FREQ[1];
  return n === 1 ? `Ogni ${f[2]}` : `Ogni ${n} ${f[1]}`;
};

// Larghezza di una colonna in caratteri, dal contenuto (tra 8 e 50)
function larghezze(righe) {
  const w = [];
  for (const riga of righe) {
    riga.forEach((x, c) => {
      if (x == null) return;
      const o = typeof x === 'object' ? x : { v: x };
      let n;
      if (o.s === 'data') n = 11;
      else if (typeof o.v === 'number') n = o.s?.startsWith('eur') ? new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2 }).format(o.v).length + 3 : String(o.v).length;
      else n = String(o.v ?? '').length;
      if (o.s === 'head' || o.s === 'bold') n += 2;
      if (o.s === 'titolo') return;
      w[c] = Math.max(w[c] || 0, n);
    });
  }
  return [...w].map((n) => Math.min(50, Math.max(8, (n || 0) + 2)));
}

// Foglio a tabella: intestazione in grassetto bloccata e filtro automatico su tutta la tabella
function tabella(nome, colonne, righe, { bloccaColonne = 0 } = {}) {
  const tutte = [colonne.map((v) => ({ v, s: 'head' })), ...righe];
  return {
    nome, righe: tutte, larghezze: larghezze(tutte), blocca: { righe: 1, colonne: bloccaColonne },
    filtro: `A1:${rif(Math.max(1, tutte.length - 1), colonne.length - 1)}`,
  };
}

const ordinaMov = (a, b) => a.data.y - b.data.y || a.data.m - b.data.m || (a.data.d ?? 0) - (b.data.d ?? 0) || (a.data.ord ?? 0) - (b.data.ord ?? 0);

function foglioMovimenti() {
  const righe = [];
  let nRip = 0;
  for (const r of M.movs().sort(ordinaMov)) {
    const d = r.data;
    const cat = M.catById(d.cat), sub = M.subOf(r);
    const base = (val, espr, fondo, rip) => [data(d.y, d.m, d.d), d.tipo === 'in' ? TIPO_IN : TIPO_OUT, eur(val, espr, stileTipo(d.tipo)),
      d.desc || '', cat?.data.nome || '', sub?.data.nome || '', fondo, (d.tags || []).join(', '), d.note || '',
      siNo(d.escl), siNo(d.d == null), rip];
    const conti = d.conti || [];
    if (conti.length > 1 && !M.splitMismatch(r)) {
      const rip = 'R' + ++nRip;
      for (const x of conti) righe.push(base(x.val, x.espr, M.accName(x.c), rip));
    } else {
      righe.push(base(d.val, d.espr, conti.map((x) => M.accName(x.c)).join(' + '), ''));
    }
  }
  return tabella(FOGLIO_MOV, COL_MOV, righe);
}

function foglioTrasferimenti() {
  const righe = M.trasfs().sort(ordinaMov).map((r) => {
    const d = r.data;
    return [data(d.y, d.m, d.d), siNo(d.d == null), M.accName(d.da), M.accName(d.a), eur(d.val, d.espr), d.note || ''];
  });
  return tabella(FOGLIO_TRASF, COL_TRASF, righe);
}

function foglioFondi() {
  const auto = M.autoAttivo(), inizio = M.cfg().inizio;
  const bal = auto ? M.balances() : null;
  const righe = M.accounts(true).map((c) => {
    const d = c.data;
    return [d.nome, M.gruppoNome(d.gruppo), siNo(d.archiviato), eur(d.saldoIniziale || 0, d.siEspr),
      auto ? dataIso(inizio) : null, bal ? eur(bal.get(c.id) || 0) : null, eur(d.obiettivo, d.obEspr)];
  });
  return tabella(FOGLIO_FONDI, COL_FONDI, righe);
}

function foglioPatrimonio() {
  const conts = M.accounts(true);
  const nC = conts.length;
  const righe = [];
  for (const s of M.snapshots()) {
    righe.push({ date: s.data.date, cells: [dataIso(s.data.date), 'Rilevazione', ...conts.map((c) => eur(s.data.vals[c.id]?.val)), null], tot: M.snapTotals(s).tot });
  }
  for (const p of M.serieAuto()) {
    const fondi = M.totaleGruppi(p.bal).tot;
    righe.push({ date: p.date, cells: [dataIso(p.date), 'Calcolato', ...conts.map((c) => eur(p.bal.get(c.id) || 0)), eur(p.inv)], tot: round2(fondi + p.inv) });
  }
  righe.sort((a, b) => a.date.localeCompare(b.date));
  const ultimaCol = colLettera(2 + nC); // colonna Investimenti
  const out = righe.map((x, i) => [...x.cells, { v: x.tot, f: `SUM(C${i + 2}:${ultimaCol}${i + 2})`, s: 'eurBold' }]);
  return tabella('Patrimonio', ['Data', 'Tipo', ...conts.map((c) => c.data.nome), 'Investimenti', 'Totale'], out);
}

function foglioDebiti() {
  const righe = M.debts().sort((a, b) => String(a.data.data || '').localeCompare(String(b.data.data || ''))).map((r, i) => {
    const d = r.data;
    const rimb = round2((d.rimborsi || []).reduce((s, p) => s + (p.val || 0), 0));
    return [d.tipo === 'credito' ? 'Mi deve' : 'Devo', d.persona || '', d.desc || '', dataIso(d.data), eur(d.val, d.espr), eur(rimb),
      { v: M.residuo(r), f: `E${i + 2}-F${i + 2}`, s: 'eurBold' }, d.fondo ? M.accName(d.fondo) : '', d.note || ''];
  });
  return tabella('Debiti e crediti', ['Tipo', 'Persona', 'Descrizione', 'Data', 'Importo', 'Rimborsato', 'Residuo', 'Fondo', 'Nota'], righe);
}

function foglioRate() {
  const righe = M.piani().filter(M.pianoValido).sort((a, b) => a.data.dataAcquisto.localeCompare(b.data.dataAcquisto)).map((p) => {
    const d = p.data, st = M.statoPiano(p);
    const stato = st.chiuso ? (d.chiusura?.tipo === 'reso' ? 'Annullato per reso' : 'Saldato') : st.finita ? 'Tutte pagate' : 'In corso';
    return [d.desc || '', d.creditore || '', M.catById(d.cat)?.data.nome || '', dataIso(d.dataAcquisto), eur(d.prezzo, d.prEspr),
      eur(M.anticipoVal(p) || null), M.nRateOf(p), eur(d.importoRata, d.irEspr), eur(d.ultimaRata, d.urEspr), dataIso(d.primaScadenza),
      freqTesto(d.freq, d.ogni), d.fondo ? M.accName(d.fondo) : '', M.modalitaPiano(p) === 'rate' ? 'Rata per rata' : "All'acquisto",
      eur(M.costoFinanziamento(p)), eur(st.pagato), eur(st.residuo), stato];
  });
  return tabella('Pagamenti a rate', ['Descrizione', 'Creditore', 'Categoria', 'Acquisto', 'Prezzo', 'Anticipo', 'Rate', 'Importo rata',
    'Ultima rata', 'Prima scadenza', 'Frequenza', 'Fondo', 'Modalità', 'Costo del finanziamento', 'Pagato', 'Residuo', 'Stato'], righe);
}

function foglioRicorrenti() {
  const righe = M.rics().sort((a, b) => String(a.data.inizio).localeCompare(String(b.data.inizio))).map((r) => {
    const d = r.data, prossima = M.ricNext(r);
    return [d.tipo === 'in' ? TIPO_IN : TIPO_OUT, d.desc || '', eur(d.val, d.espr, stileTipo(d.tipo)), M.catById(d.cat)?.data.nome || '',
      (d.conti || []).map((x) => M.accName(x.c)).join(' + '), freqTesto(d.freq, d.ogni), dataIso(d.inizio), dataIso(d.fine),
      dataIso(prossima), prossima ? 'Attiva' : 'Terminata'];
  });
  return tabella('Ricorrenti', ['Tipo', 'Descrizione', 'Importo', 'Categoria', 'Fondo', 'Frequenza', 'Prima scadenza', 'Ultima scadenza', 'Prossima', 'Stato'], righe);
}

function foglioBudget() {
  const oggi = new Date();
  const SU = { cat: 'Categoria', sub: 'Sottocategoria', tag: 'Tag', tot: 'Tutte le uscite' };
  const righe = M.budgets({ tutti: true }).map((b) => {
    const v = M.budgetValori(b);
    const da = v[0]?.da;
    const st = M.budgetValido(b) ? M.budgetStato(b, oggi.getFullYear(), oggi.getMonth() + 1, oggi) : null;
    return [M.budgetLabel(b).replace(/^\p{Extended_Pictographic}\S*\s/u, ''), SU[M.budgetSu(b)], M.budgetPeriodo(b) === 'anno' ? 'Annuale' : 'Mensile',
      eur(b.data.val, b.data.espr), b.data.riporto ? SI : 'no', da ? data(+da.slice(0, 4), +da.slice(5, 7), 1) : null,
      st ? eur(st.speso) : null, st ? eur(st.disp) : null];
  });
  return tabella('Budget', ['Su cosa', 'Tipo', 'Periodo', 'Importo', 'Riporto', 'Vale dal', 'Speso nel periodo in corso', 'Disponibile'], righe);
}

function foglioCategorie() {
  const n = new Map(), nSub = new Map();
  for (const r of M.movs()) {
    n.set(r.data.cat, (n.get(r.data.cat) || 0) + 1);
    if (r.data.sub) nSub.set(r.data.sub, (nSub.get(r.data.sub) || 0) + 1);
  }
  const righe = [];
  for (const tipo of ['in', 'out']) {
    for (const c of M.cats(tipo)) {
      righe.push([tipo === 'in' ? TIPO_IN : TIPO_OUT, c.data.nome, '', c.data.emoji || '', c.data.colore || '', n.get(c.id) || 0]);
      for (const s of M.subs(c.id)) righe.push([tipo === 'in' ? TIPO_IN : TIPO_OUT, c.data.nome, s.data.nome, '', '', nSub.get(s.id) || 0]);
    }
  }
  return tabella(FOGLIO_CAT, COL_CAT, righe);
}

function fogliInvestimenti() {
  const pos = [], ops = [];
  for (const inv of M.invs()) {
    const d = inv.data, p = M.posizione(inv.id);
    const tipo = M.tipoInvNome(M.tipoInv(inv), true);
    pos.push([d.nome, d.codice || '', tipo, p.qta || 0, p.prezzoMedio != null ? round2(p.prezzoMedio) : null, p.prezzo,
      dataIso(p.prezzoData), eur(p.valore), eur(p.costo), eur(p.latente), eur(p.realizzato), eur(p.dividendi), eur(p.versato),
      p.rendimento != null ? { v: Math.round(p.rendimento * 10000) / 10000, s: 'pct' } : null, d.archiviato ? SI : '']);
    const unita = M.percento(inv) ? '% del nominale' : 'euro';
    for (const o of M.invOps(inv.id)) {
      const x = o.data;
      ops.push({ date: x.data, r: ['Operazione', dataIso(x.data), d.nome, d.codice || '', M.opInvNome(M.opTipo(x)), x.qta, x.prezzo, unita,
        eur(x.comm || null), eur(x.tasse || null), eur(M.controvalore(inv, x)), x.fondo ? eur(M.nettoOp(inv, x)) : null,
        x.fondo ? M.accName(x.fondo) : 'Già posseduto', x.note || ''] });
    }
    for (const pr of M.invPrezzi(inv.id)) {
      ops.push({ date: pr.data.date, r: ['Prezzo', dataIso(pr.data.date), d.nome, d.codice || '', '', null, pr.data.val, unita, null, null, null, null, '', ''] });
    }
  }
  ops.sort((a, b) => a.date.localeCompare(b.date));
  return [
    tabella('Investimenti', ['Strumento', 'Codice', 'Tipologia', 'Quantità', 'Prezzo medio di carico', 'Ultimo prezzo', 'Data del prezzo',
      'Valore', 'Costo di carico', 'Latente', 'Realizzato', 'Dividendi e cedole', 'Versato', 'Rendimento', 'Archiviato'], pos),
    tabella('Operazioni investimenti', ['Record', 'Data', 'Strumento', 'Codice', 'Operazione', 'Quantità', 'Prezzo', 'Prezzo in', 'Commissioni',
      'Tasse', 'Controvalore', 'Netto sul fondo', 'Fondo', 'Nota'], ops.map((x) => x.r)),
  ];
}

// Criterio di SUMIFS che vuol dire "uguale a questo testo": senza "=" un nome come "<3" diventerebbe un confronto,
// e * ? ~ sarebbero caratteri jolly
const criterio = (testo) => '"=' + String(testo).replace(/[~*?]/g, '~$&').replace(/"/g, '""') + '"';

// Riepilogo di un anno con formule vere sul foglio Movimenti: entrate, uscite e saldo per mese e per categoria
function foglioRiepilogo(y, nMov) {
  const last = Math.max(2, nMov + 1);
  const mv = rifFoglio(FOGLIO_MOV);
  const col = (k) => `${mv}!$${colLettera(COL_MOV.indexOf(k))}$2:$${colLettera(COL_MOV.indexOf(k))}$${last}`;
  const [cData, cTipo, cImp, cCat, cEscl] = ['Data', 'Tipo', 'Importo', 'Categoria', 'Escluso dai totali'].map(col);
  const somma = (tipo, m1, m2, cat = null) => `SUMIFS(${cImp},${cTipo},"${tipo}",${cData},">="&DATE(${y},${m1},1),${cData},"<"&DATE(${m2 > 12 ? y + 1 : y},${m2 > 12 ? 1 : m2},1),${cEscl},"<>${SI}"` +
    (cat != null ? `,${cCat},${cat === '' ? '""' : criterio(cat)}` : '') + ')';
  const mesi = M.monthly(y);
  const righe = [[{ v: `Riepilogo ${y}`, s: 'titolo' }], [], ['Mese', 'Entrate', 'Uscite', 'Saldo'].map((v) => ({ v, s: 'head' }))];
  mesi.forEach((o, i) => {
    const r = righe.length + 1;
    righe.push([M.MESI[i], { v: o.tin, f: somma(TIPO_IN, i + 1, i + 2), s: 'eurIn' }, { v: o.tout, f: somma(TIPO_OUT, i + 1, i + 2), s: 'eurOut' },
      { v: o.saldo, f: `B${r}-C${r}`, s: 'eurBold' }]);
  });
  const tot = M.sums(M.movs().filter((r) => r.data.y === y));
  const rT = righe.length + 1;
  righe.push([{ v: 'Totale', s: 'bold' }, { v: tot.tin, f: `SUM(B4:B15)`, s: 'eurBold' }, { v: tot.tout, f: `SUM(C4:C15)`, s: 'eurBold' },
    { v: tot.saldo, f: `B${rT}-C${rT}`, s: 'eurBold' }]);
  // categoria × mese
  for (const tipo of ['in', 'out']) {
    const per = new Map(); // nome categoria → 12 mesi
    for (const r of M.movs()) {
      const d = r.data;
      if (d.y !== y || d.tipo !== tipo || d.escl || typeof d.val !== 'number') continue;
      const nome = M.catById(d.cat)?.data.nome || '';
      if (!per.has(nome)) per.set(nome, Array(12).fill(0));
      per.get(nome)[d.m - 1] += d.val;
    }
    if (!per.size) continue;
    righe.push([]);
    righe.push([tipo === 'in' ? 'Entrate per categoria' : 'Uscite per categoria', ...M.MESI_BREVI, 'Totale'].map((v) => ({ v, s: 'head' })));
    const t = tipo === 'in' ? TIPO_IN : TIPO_OUT, st = stileTipo(tipo);
    const nomi = [...per.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b, 'it'));
    const primo = righe.length + 1;
    for (const nome of nomi) {
      const r = righe.length + 1, v = per.get(nome);
      righe.push([nome || 'Senza categoria', ...v.map((x, i) => ({ v: round2(x), f: somma(t, i + 1, i + 2, nome), s: st })),
        { v: round2(v.reduce((s, x) => s + x, 0)), f: `SUM(B${r}:M${r})`, s: 'eurBold' }]);
    }
    const ultimo = righe.length, r = righe.length + 1;
    const totM = Array.from({ length: 12 }, (_, i) => round2(nomi.reduce((s, n) => s + per.get(n)[i], 0)));
    righe.push([{ v: 'Totale', s: 'bold' }, ...totM.map((x, i) => ({ v: x, f: `SUM(${colLettera(i + 1)}${primo}:${colLettera(i + 1)}${ultimo})`, s: 'eurBold' })),
      { v: round2(totM.reduce((s, x) => s + x, 0)), f: `SUM(B${r}:M${r})`, s: 'eurBold' }]);
  }
  const w = larghezze(righe);
  w[0] = Math.max(w[0] || 0, 24);
  return { nome: `Riepilogo ${y}`, righe, larghezze: w.map((x, i) => (i ? Math.max(x, 12) : x)), blocca: { righe: 3, colonne: 1 } };
}

// Tutta la cartella di lavoro, come Blob
export async function cartellaRationes() {
  const mov = foglioMovimenti();
  const anni = [...new Set(M.movs().map((r) => r.data.y))].sort((a, b) => b - a);
  return scriviXlsx([
    mov, foglioTrasferimenti(), foglioFondi(), foglioPatrimonio(), foglioDebiti(), foglioRate(), foglioRicorrenti(), foglioBudget(),
    foglioCategorie(), ...fogliInvestimenti(), ...anni.map((y) => foglioRiepilogo(y, mov.righe.length - 1)),
  ]);
}

export const nomeFile = () => `rationes-${M.todayIso()}.xlsx`;
