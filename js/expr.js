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
// `dec`: decimali del risultato (2 per gli importi; di più per prezzi e quantità degli investimenti).
export function parseAmount(input, dec = 2) {
  let s = String(input ?? '').replace(/€/g, '').trim();
  if (!s) return null;
  const hadEq = s.startsWith('=');
  if (hadEq) s = s.slice(1).trim();
  if (!s) return null;
  const tokens = tokenize(s);
  const k = 10 ** dec;
  const val = dec === 2 ? round2(evaluate(tokens)) : Math.round((evaluate(tokens) + Number.EPSILON) * k) / k;
  // È un'espressione se contiene un operatore che non sia il solo segno iniziale
  const ops = tokens.filter((t, i) => t.t !== 'n' && !(i === 0 && t.t === '-'));
  const espr = ops.length ? '=' + s.replace(/\s+/g, '') : null;
  return { val, espr };
}

const nf = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });

export const fmt = (n) => (n == null || isNaN(n) ? '' : nf.format(n));
export const fmtEur = (n) => (n == null || isNaN(n) ? '–' : nf.format(n) + ' €');
export const fmtEur0 = (n) => (n == null || isNaN(n) ? '–' : nf0.format(n) + ' €');
export const fmtSigned = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + nf.format(Math.abs(n)) + ' €';
// Classe di colore del saldo: verde se positivo, rosso se negativo, neutro se in pari (al centesimo)
export const saldoCls = (n) => (Math.round(n * 100) > 0 ? 'sal-pos' : Math.round(n * 100) < 0 ? 'sal-neg' : 'sal-zero');

// Valore "grezzo" da mostrare in modifica quando non c'è un'espressione
export const plain = (n) => (n == null ? '' : String(round2(n)).replace('.', ','));
// Numero con i decimali che servono, fino a `max` (quantità e prezzi degli investimenti): 1.234,5678
export const fmtN = (n, max = 8, min = 0) => (n == null || isNaN(n) ? '' : new Intl.NumberFormat('it-IT', { minimumFractionDigits: min, maximumFractionDigits: max }).format(n));
export const plainN = (n) => (n == null ? '' : String(n).replace('.', ','));

// Espressione dell'app ("=68-17,5", "2×3") → formula di Excel ("68-17.5", "2*3"), senza "=".
// Se il risultato non è già al centesimo la formula si arrotonda, così Excel dà lo stesso importo dell'app. null se non valida.
export function exprExcel(espr) {
  try {
    const toks = tokenize(String(espr ?? '').replace(/€/g, '').replace(/^\s*=/, ''));
    if (!toks.length) return null;
    const f = toks.map((t) => (t.t === 'n' ? String(t.v) : t.t)).join('');
    const v = evaluate(toks);
    return Math.abs(round2(v) - v) > 1e-9 ? `ROUND(${f},2)` : f;
  } catch { return null; }
}

// Formula di Excel fatta solo di numeri e + − × ÷ ( ) → { val, espr } come parseAmount; null per ogni altra formula
export function exprDaExcel(f) {
  let s = String(f ?? '').trim().replace(/^=/, '');
  const m = /^ROUND\((.*),\s*2\)$/i.exec(s);
  if (m) s = m[1];
  if (!/^[\d.\s+\-*/()]+$/.test(s) || !/\d/.test(s)) return null;
  try {
    const p = parseAmount('=' + s.replace(/\s+/g, '').replace(/\./g, ','));
    return p && p.espr ? p : p ? { val: p.val, espr: null } : null;
  } catch { return null; }
}
