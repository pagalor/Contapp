import { fmtEur, fmtEur0 } from './expr.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function niceTicks(min, max, count = 4) {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const shortNum = (v) => {
  const a = Math.abs(v);
  if (a >= 1000) return (v / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'k';
  return v.toLocaleString('it-IT', { maximumFractionDigits: 0 });
};

// Barre raggruppate. series: [{ name, cls, values[] }], labels[], tips: (i, s) => string
export function bars({ width, height = 220, labels, series, onClick }) {
  const padL = 40, padR = 8, padT = 10, padB = 24;
  const W = Math.max(width, 280), H = height;
  const all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const sy = (v) => padT + (H - padT - padB) * (1 - (v - y0) / (y1 - y0));
  const groupW = (W - padL - padR) / labels.length;
  const gap = Math.max(2, groupW * 0.22);
  const barW = Math.max(2, (groupW - gap) / series.length);
  let g = '';
  for (const t of ticks) {
    g += `<line class="grid${t === 0 ? ' zero' : ''}" x1="${padL}" x2="${W - padR}" y1="${sy(t)}" y2="${sy(t)}"/>`;
    g += `<text class="axis" x="${padL - 6}" y="${sy(t) + 4}" text-anchor="end">${shortNum(t)}</text>`;
  }
  const every = labels.length > 16 ? Math.ceil(labels.length / 12) : 1;
  labels.forEach((lab, i) => {
    const gx = padL + i * groupW + gap / 2;
    series.forEach((s, k) => {
      const v = s.values[i] || 0;
      const y = sy(Math.max(v, 0)), h = Math.abs(sy(v) - sy(0));
      g += `<rect class="bar ${s.cls}" x="${gx + k * barW}" y="${y}" width="${barW - 1}" height="${Math.max(h, v ? 1 : 0)}" rx="1.5"
        data-tip="${esc(lab + ': ' + s.name + ' ' + fmtEur(v))}"${onClick ? ` data-idx="${i}"` : ''}/>`;
    });
    if (i % every === 0) g += `<text class="axis" x="${gx + (groupW - gap) / 2}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${g}</svg>`;
}

// Linea con area (es. saldo cumulato). points: [{ label, value }]
export function line({ width, height = 200, points, cls = 'line-in' }) {
  const padL = 46, padR = 10, padT = 12, padB = 24;
  const W = Math.max(width, 280), H = height;
  if (!points.length) return '';
  const vals = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const sy = (v) => padT + (H - padT - padB) * (1 - (v - y0) / (y1 - y0));
  const step = points.length > 1 ? (W - padL - padR) / (points.length - 1) : 0;
  const sx = (i) => padL + i * step;
  let g = '';
  for (const t of ticks) {
    g += `<line class="grid${t === 0 ? ' zero' : ''}" x1="${padL}" x2="${W - padR}" y1="${sy(t)}" y2="${sy(t)}"/>`;
    g += `<text class="axis" x="${padL - 6}" y="${sy(t) + 4}" text-anchor="end">${shortNum(t)}</text>`;
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.value).toFixed(1)}`).join('');
  const area = `${d}L${sx(points.length - 1).toFixed(1)},${sy(Math.max(0, y0))}L${sx(0)},${sy(Math.max(0, y0))}Z`;
  g += `<path class="area ${cls}" d="${area}"/><path class="stroke ${cls}" d="${d}"/>`;
  const useShort = points.some((p) => p.short !== undefined);
  const every = points.length > 14 ? Math.ceil(points.length / 10) : 1;
  points.forEach((p, i) => {
    g += `<circle class="dot ${cls}" cx="${sx(i)}" cy="${sy(p.value)}" r="${points.length > 40 ? 2 : 3.2}" data-tip="${esc(p.label + ': ' + fmtEur(p.value))}"/>`;
    const lab = useShort ? p.short : (i % every === 0 ? p.label : '');
    if (lab) g += `<text class="axis" x="${sx(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : 'middle'}">${esc(lab)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${g}</svg>`;
}

// Aree impilate su asse temporale reale. points: [{ date: 'YYYY-MM-DD', parts: [{ key, cls, value, name }] }]
export function stackedTime({ width, height = 230, points, markers = [] }) {
  const padL = 46, padR = 12, padT = 12, padB = 24;
  const W = Math.max(width, 280), H = height;
  if (!points.length) return '';
  const t = points.map((p) => new Date(p.date + 'T12:00:00').getTime());
  const tMin = t[0], tMax = t[t.length - 1] === tMin ? tMin + 864e5 : t[t.length - 1];
  const totals = points.map((p) => p.parts.reduce((s, x) => s + x.value, 0));
  const ticks = niceTicks(0, Math.max(...totals));
  const y1 = ticks[ticks.length - 1];
  const sx = (ms) => padL + (W - padL - padR) * ((ms - tMin) / (tMax - tMin));
  const sy = (v) => padT + (H - padT - padB) * (1 - v / y1);
  let g = '';
  for (const tk of ticks) {
    g += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${sy(tk)}" y2="${sy(tk)}"/>`;
    g += `<text class="axis" x="${padL - 6}" y="${sy(tk) + 4}" text-anchor="end">${shortNum(tk)}</text>`;
  }
  // etichette degli anni
  const y0 = new Date(tMin).getFullYear(), yEnd = new Date(tMax).getFullYear();
  for (let y = y0; y <= yEnd + 1; y++) {
    const ms = new Date(y, 0, 1).getTime();
    if (ms < tMin || ms > tMax) continue;
    g += `<line class="grid year" x1="${sx(ms)}" x2="${sx(ms)}" y1="${padT}" y2="${H - padB}"/>`;
    g += `<text class="axis" x="${sx(ms) + 4}" y="${H - 6}">${y}</text>`;
  }
  for (const mk of markers) {
    const ms = new Date(mk.date + 'T12:00:00').getTime();
    if (ms < tMin || ms > tMax) continue;
    g += `<line class="marker" x1="${sx(ms)}" x2="${sx(ms)}" y1="${padT}" y2="${H - padB}"/>`;
    g += `<text class="axis marker-label" x="${sx(ms) - 4}" y="${padT + 10}" text-anchor="end">${esc(mk.label)}</text>`;
  }
  const keys = points[0].parts.map((p) => p.key);
  let base = points.map(() => 0);
  keys.forEach((key, k) => {
    const top = points.map((p, i) => base[i] + (p.parts[k]?.value || 0));
    const up = points.map((p, i) => `${i ? 'L' : 'M'}${sx(t[i]).toFixed(1)},${sy(top[i]).toFixed(1)}`).join('');
    const down = points.map((p, i) => `L${sx(t[i]).toFixed(1)},${sy(base[i]).toFixed(1)}`).reverse().join('');
    const cls = points[0].parts[k].cls;
    g += `<path class="stack ${cls}" d="${up}${down}Z"/>`;
    g += `<path class="stroke ${cls}" d="${up}"/>`;
    base = top;
  });
  points.forEach((p, i) => {
    const tip = p.label + ': ' + fmtEur0(totals[i]);
    g += `<circle class="dot total" cx="${sx(t[i])}" cy="${sy(totals[i])}" r="3.5" data-tip="${esc(tip)}"/>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${g}</svg>`;
}

// Torta ad anello. slices: [{ label, value, color }]; al centro il totale.
export function donut({ size = 200, slices, center = '' }) {
  const tot = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (!tot) return '';
  const R = size / 2, r0 = R * 0.62, cx = R, cy = R;
  let a = -Math.PI / 2, g = '';
  const pt = (rad, ang) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
  for (const s of slices) {
    if (s.value <= 0) continue;
    const frac = s.value / tot;
    const tip = `${s.label}: ${fmtEur(s.value)} (${(frac * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%)`;
    if (frac > 0.9999) {
      g += `<circle cx="${cx}" cy="${cy}" r="${(R + r0) / 2}" fill="none" stroke="${s.color}" stroke-width="${R - r0}" data-tip="${esc(tip)}"/>`;
      break;
    }
    const b = a + frac * 2 * Math.PI;
    const large = b - a > Math.PI ? 1 : 0;
    g += `<path class="slice" d="M${pt(R, a)} A${R},${R} 0 ${large} 1 ${pt(R, b)} L${pt(r0, b)} A${r0},${r0} 0 ${large} 0 ${pt(r0, a)} Z"
      fill="${s.color}" data-tip="${esc(tip)}"/>`;
    a = b;
  }
  g += `<text class="donut-tot" x="${cx}" y="${cy + 6}" text-anchor="middle">${esc(center)}</text>`;
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">${g}</svg>`;
}
