// Importi: accetta numeri e espressioni stile Excel ("=68-17-17-17", "2,2*2+5", "(30-10)/2").
// La virgola è il separatore decimale; il punto è accettato come decimale se non c'è virgola.

function normalizeNumber(tok) {
  if (tok.includes(',')) return tok.replace(/\./g, '').replace(',', '.');
  if ((tok.match(/\./g) || []).length > 1) return tok.replace(/\./g, '');
  return tok;
}

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.,]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.,]/.test(src[j])) j++;
      const raw = src.slice(i, j);
      const n = Number(normalizeNumber(raw));
      if (!isFinite(n)) throw new Error('Numero non valido: ' + raw);
      out.push({ t: 'n', v: n });
      i = j; continue;
    }
    if ('+-*/()'.includes(c)) { out.push({ t: c }); i++; continue; }
    if (c === 'x' || c === 'X' || c === '×') { out.push({ t: '*' }); i++; continue; }
    if (c === '÷' || c === ':') { out.push({ t: '/' }); i++; continue; }
    if (c === '−' || c === '–') { out.push({ t: '-' }); i++; continue; }
    throw new Error('Carattere non valido: ' + c);
  }
  return out;
}

function evaluate(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const eat = (t) => { if (peek() && peek().t === t) { p++; return true; } return false; };
  function expr() {
    let v = term();
    for (;;) {
      if (eat('+')) v += term();
      else if (eat('-')) v -= term();
      else return v;
    }
  }
  function term() {
    let v = factor();
    for (;;) {
      if (eat('*')) v *= factor();
      else if (eat('/')) {
        const d = factor();
        if (d === 0) throw new Error('Divisione per zero');
        v /= d;
      } else return v;
    }
  }
  function factor() {
    if (eat('-')) return -factor();
    if (eat('+')) return factor();
    if (eat('(')) {
      const v = expr();
      if (!eat(')')) throw new Error('Parentesi non chiusa');
      return v;
    }
    const tk = peek();
    if (tk && tk.t === 'n') { p++; return tk.v; }
    throw new Error('Espressione incompleta');
  }
  const v = expr();
  if (p < tokens.length) throw new Error('Espressione non valida');
  return v;
}

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Restituisce { val, espr } oppure null se vuoto. Lancia un errore se non valido.
export function parseAmount(input) {
  let s = String(input ?? '').replace(/€/g, '').trim();
  if (!s) return null;
  const hadEq = s.startsWith('=');
  if (hadEq) s = s.slice(1).trim();
  if (!s) return null;
  const tokens = tokenize(s);
  const val = round2(evaluate(tokens));
  // È un'espressione se contiene un operatore che non sia il solo segno iniziale
  const ops = tokens.filter((t, i) => t.t !== 'n' && !(i === 0 && t.t === '-'));
  const espr = ops.length ? '=' + s.replace(/\s+/g, '') : null;
  return { val, espr };
}

// Come parseAmount ma per quantità e prezzi unitari (fino a 8 decimali, per le crypto). Restituisce un numero oppure null se vuoto.
export function parseNumber(input, decimals = 8) {
  let s = String(input ?? '').replace(/€/g, '').trim();
  if (s.startsWith('=')) s = s.slice(1).trim();
  if (!s) return null;
  const f = 10 ** decimals;
  return Math.round((evaluate(tokenize(s)) + Number.EPSILON) * f) / f;
}

const nf = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfQty = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 8 });
const nfPrice = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const nf0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });

export const fmt = (n) => (n == null || isNaN(n) ? '' : nf.format(n));
export const fmtQty = (n) => (n == null || isNaN(n) ? '' : nfQty.format(n));
export const fmtPrice = (n) => (n == null || isNaN(n) ? '' : nfPrice.format(n));
export const fmtEur = (n) => (n == null || isNaN(n) ? '–' : nf.format(n) + ' €');
export const fmtEur0 = (n) => (n == null || isNaN(n) ? '–' : nf0.format(n) + ' €');
export const fmtSigned = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + nf.format(Math.abs(n)) + ' €';

// Valore "grezzo" da mostrare in modifica quando non c'è un'espressione
export const plain = (n) => (n == null ? '' : String(round2(n)).replace('.', ','));
// Lo stesso per quantità e prezzi, senza arrotondare ai centesimi
export const plainNum = (n) => (n == null ? '' : String(n).replace('.', ','));
