// File Excel (.xlsx) e CSV, senza dipendenze e senza rete: tutto avviene sul dispositivo.
// Scrittura: archivio zip fatto a mano (CRC32, compressione "deflate-raw" se il browser la offre) con le parti minime
// di una cartella di lavoro (fogli, stili, stringhe condivise). Lettura: indice dello zip, decompressione, XML con DOMParser.
// Non si eseguono macro e non si seguono collegamenti esterni: si leggono solo fogli, stringhe e stili.

export const MAX_BYTES = 20 * 1024 * 1024;

// Errore con un messaggio da mostrare così com'è all'utente
export class ErroreFile extends Error {}

// ---------- Utilità comuni ----------

const enc = new TextEncoder();

let crcTab;
function crc32(buf) {
  if (!crcTab) {
    crcTab = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      crcTab[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTab[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function viaStream(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

async function comprimi(bytes) {
  try {
    if (typeof CompressionStream === 'undefined') return null;
    return await viaStream(bytes, new CompressionStream('deflate-raw'));
  } catch { return null; }
}

async function decomprimi(bytes) {
  let ds;
  try { ds = new DecompressionStream('deflate-raw'); } catch {
    throw new ErroreFile('Questo browser non riesce a leggere i file .xlsx: aggiornalo e riprova.');
  }
  try { return await viaStream(bytes, ds); } catch { throw new ErroreFile('Il file è danneggiato: aprilo in Excel, salvalo di nuovo come .xlsx e riprova.'); }
}

// Numeri di colonna ↔ lettere (0 → A, 26 → AA)
export function colLettera(i) {
  let s = '';
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
function colNumero(lettere) {
  let n = 0;
  for (const ch of lettere) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
export const rif = (r, c) => colLettera(c) + (r + 1); // riga e colonna da 0

// Date ↔ numero seriale di Excel (sistema 1900, con il finto 29 febbraio 1900 al numero 60)
const GIORNO = 86400000;
export function seriale(y, m, d) {
  const t = Date.UTC(y, m - 1, d);
  const s = (t - Date.UTC(1899, 11, 30)) / GIORNO;
  return s < 61 ? s - 1 : s;
}
export function dataDaSeriale(n, sistema1904 = false) {
  if (!Number.isFinite(n) || n < 0 || n > 2958465) return null;
  const giorni = Math.floor(n + 1e-7);
  let t;
  if (sistema1904) t = Date.UTC(1904, 0, 1) + giorni * GIORNO;
  else if (giorni === 60) return { y: 1900, m: 2, d: 29 };
  else if (giorni < 60) t = Date.UTC(1899, 11, 31) + giorni * GIORNO;
  else t = Date.UTC(1899, 11, 30) + giorni * GIORNO;
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

// ---------- Scrittura ----------

const xmlEsc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Stili disponibili per le celle (chiave → indice in cellXfs)
const STILI = { testo: 0, head: 1, data: 2, eur: 3, eurIn: 4, eurOut: 5, int: 6, bold: 7, eurBold: 8, titolo: 9, pct: 10 };
const STYLES_XML = HEAD + `<styleSheet xmlns="${NS}">` +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;;\\-#,##0.00\\ &quot;€&quot;"/></numFmts>' +
  '<fonts count="5">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><sz val="11"/><color rgb="FF1E7B34"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><sz val="11"/><color rgb="FFC0392B"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDCEFEF"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FF7FA9AC"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="11">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

// Nome del foglio come compare nei riferimenti delle formule ('Debiti e crediti'!A1)
export const rifFoglio = (nome) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(nome) ? nome : `'${nome.replace(/'/g, "''")}'`);
export const nomeFoglioValido = (s) => String(s).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Foglio';

// fogli: [{ nome, righe: [[cella]], larghezze: [n], blocca: { righe, colonne }, filtro: 'A1:L20' | null }]
// cella: null | numero | testo | booleano | { v, f, s } (v valore, f formula senza '=', s chiave di STILI)
export async function scriviXlsx(fogli) {
  const stringhe = new Map();
  const sst = (s) => { let i = stringhe.get(s); if (i == null) { i = stringhe.size; stringhe.set(s, i); } return i; };
  const files = [];
  const nomi = [];
  let nRif = 0;
  fogli.forEach((fg, idx) => {
    let maxC = 0;
    const righe = fg.righe.map((riga, r) => {
      maxC = Math.max(maxC, riga.length);
      const celle = [];
      riga.forEach((x, c) => {
        if (x == null || x === '') return;
        const o = typeof x === 'object' ? x : { v: x };
        const s = o.s ? STILI[o.s] ?? 0 : 0;
        const ref = rif(r, c), sAttr = s ? ` s="${s}"` : '';
        const f = o.f ? `<f>${xmlEsc(o.f)}</f>` : '';
        const v = o.v;
        if (typeof v === 'number' && Number.isFinite(v)) celle.push(`<c r="${ref}"${sAttr}>${f}<v>${v}</v></c>`);
        else if (typeof v === 'boolean') celle.push(`<c r="${ref}"${sAttr} t="b">${f}<v>${v ? 1 : 0}</v></c>`);
        else if (v == null || v === '') celle.push(`<c r="${ref}"${sAttr}>${f}</c>`);
        else if (f) celle.push(`<c r="${ref}"${sAttr} t="str">${f}<v>${xmlEsc(v)}</v></c>`);
        else { nRif++; celle.push(`<c r="${ref}"${sAttr} t="s"><v>${sst(String(v).slice(0, 32767))}</v></c>`); } // Excel: al massimo 32.767 caratteri
      });
      return celle.length ? `<row r="${r + 1}">${celle.join('')}</row>` : '';
    }).join('');
    const ultima = rif(Math.max(0, fg.righe.length - 1), Math.max(0, maxC - 1));
    const br = fg.blocca?.righe || 0, bc = fg.blocca?.colonne || 0;
    let vista = `<sheetView workbookViewId="0"${idx === 0 ? ' tabSelected="1"' : ''}>`;
    if (br || bc) {
      const tl = rif(br, bc);
      const pane = br && bc ? 'bottomRight' : br ? 'bottomLeft' : 'topRight';
      vista += `<pane${bc ? ` xSplit="${bc}"` : ''}${br ? ` ySplit="${br}"` : ''} topLeftCell="${tl}" activePane="${pane}" state="frozen"/>` +
        `<selection pane="${pane}" activeCell="${tl}" sqref="${tl}"/>`;
    }
    vista += '</sheetView>';
    const cols = (fg.larghezze || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.round(w * 100) / 100}" customWidth="1"/>`).join('');
    const xml = HEAD + `<worksheet xmlns="${NS}" xmlns:r="${NS_R}"><dimension ref="A1:${ultima}"/>` +
      `<sheetViews>${vista}</sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
      (cols ? `<cols>${cols}</cols>` : '') + `<sheetData>${righe}</sheetData>` +
      (fg.filtro ? `<autoFilter ref="${fg.filtro}"/>` : '') +
      '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
    files.push([`xl/worksheets/sheet${idx + 1}.xml`, xml]);
    if (fg.filtro) {
      const [a, b] = fg.filtro.split(':');
      const ass = (x) => x.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2');
      nomi.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${idx}" hidden="1">${xmlEsc(rifFoglio(fg.nome))}!${ass(a)}:${ass(b)}</definedName>`);
    }
  });
  const sstXml = HEAD + `<sst xmlns="${NS}" count="${nRif}" uniqueCount="${stringhe.size}">` +
    [...stringhe.keys()].map((s) => `<si><t${/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : ''}>${xmlEsc(s)}</t></si>`).join('') + '</sst>';
  const wb = HEAD + `<workbook xmlns="${NS}" xmlns:r="${NS_R}"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>` +
    fogli.map((fg, i) => `<sheet name="${xmlEsc(fg.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
    (nomi.length ? `<definedNames>${nomi.join('')}</definedNames>` : '') + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
  const n = fogli.length;
  const wbRels = HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${n + 1}" Type="${NS_R}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId${n + 2}" Type="${NS_R}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const ct = HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  const rels = HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="${NS_R}/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const app = HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Rationes</Application></Properties>';
  return zip([['[Content_Types].xml', ct], ['_rels/.rels', rels], ['docProps/app.xml', app], ['xl/workbook.xml', wb],
    ['xl/_rels/workbook.xml.rels', wbRels], ['xl/styles.xml', STYLES_XML], ['xl/sharedStrings.xml', sstXml], ...files]);
}

// Archivio zip: [[nome, testo]] → Blob
async function zip(voci) {
  const now = new Date();
  const ora = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const data = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parti = [], centrale = [];
  let off = 0;
  for (const [nome, testo] of voci) {
    const raw = enc.encode(testo), nb = enc.encode(nome);
    const crc = crc32(raw);
    const compr = await comprimi(raw);
    const usa = compr && compr.length < raw.length ? compr : raw;
    const metodo = usa === raw ? 0 : 8;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, metodo, true);
    h.setUint16(10, ora, true); h.setUint16(12, data, true); h.setUint32(14, crc, true);
    h.setUint32(18, usa.length, true); h.setUint32(22, raw.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    parti.push(new Uint8Array(h.buffer), nb, usa);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, metodo, true); c.setUint16(12, ora, true); c.setUint16(14, data, true); c.setUint32(16, crc, true);
    c.setUint32(20, usa.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, nb.length, true);
    c.setUint32(42, off, true);
    centrale.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + usa.length;
  }
  const lenC = centrale.reduce((s, b) => s + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, voci.length, true); e.setUint16(10, voci.length, true);
  e.setUint32(12, lenC, true); e.setUint32(16, off, true);
  return new Blob([...parti, ...centrale, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------- Lettura ----------

// Legge un file scelto dall'utente: .xlsx oppure .csv/.txt. Restituisce { fogli: [{ nome, nascosto, righe }] }
// dove ogni riga è un array di celle { v, t, f } (t: 'n' numero, 's' testo, 'b' vero/falso, 'd' data con v = { y, m, d }) o null.
export async function leggiFile(file) {
  if (file.size > MAX_BYTES) throw new ErroreFile('Il file è più grande di 20 MB: dividilo in più file (per esempio un anno per file) e riprova.');
  const buf = new Uint8Array(await file.arrayBuffer());
  const nome = (file.name || '').toLowerCase();
  if (buf[0] === 0x50 && buf[1] === 0x4B) return leggiXlsx(buf);
  if (buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0) {
    if (contieneUtf16(buf, 'EncryptedPackage')) throw new ErroreFile('Il file è protetto da password: aprilo in Excel, togli la password (File › Informazioni › Proteggi cartella di lavoro) e riprova.');
    throw new ErroreFile('È un file .xls del vecchio formato: aprilo in Excel o LibreOffice, salvalo come .xlsx e riprova.');
  }
  if (/\.(xlsx|xlsm|xls|xlsb|ods|numbers)$/.test(nome)) throw new ErroreFile('Il file non è un .xlsx valido: aprilo in Excel o LibreOffice, salvalo come .xlsx e riprova.');
  if (buf.subarray(0, 4096).some((b) => b === 0)) throw new ErroreFile('Il file non è un foglio Excel né un CSV: scegli un file .xlsx o .csv.');
  return { fogli: [{ nome: file.name.replace(/\.[^.]+$/, '') || 'CSV', nascosto: false, righe: leggiCsv(decodifica(buf)) }], csv: true };
}

function contieneUtf16(buf, testo) {
  const ago = [...testo].flatMap((ch) => [ch.charCodeAt(0), 0]);
  outer: for (let i = 0; i <= buf.length - ago.length; i++) {
    for (let j = 0; j < ago.length; j++) if (buf[i + j] !== ago[j]) continue outer;
    return true;
  }
  return false;
}

function decodifica(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

// CSV: separatore riconosciuto (punto e virgola, virgola o tabulazione) contando fuori dalle virgolette nelle prime righe
export function leggiCsv(testo) {
  const sep = indovinaSeparatore(testo);
  const righe = [];
  let riga = [], cella = '', virg = false, i = 0, quotata = false;
  const chiudiCella = () => { riga.push(cella === '' && !quotata ? null : { v: cella, t: 's' }); cella = ''; quotata = false; };
  while (i < testo.length) {
    const ch = testo[i];
    if (virg) {
      if (ch === '"') { if (testo[i + 1] === '"') { cella += '"'; i += 2; continue; } virg = false; i++; continue; }
      cella += ch; i++; continue;
    }
    if (ch === '"' && cella === '') { virg = true; quotata = true; i++; continue; }
    if (ch === sep) { chiudiCella(); i++; continue; }
    if (ch === '\r' || ch === '\n') {
      chiudiCella(); righe.push(riga); riga = [];
      i += ch === '\r' && testo[i + 1] === '\n' ? 2 : 1; continue;
    }
    cella += ch; i++;
  }
  if (cella !== '' || riga.length) { chiudiCella(); righe.push(riga); }
  return righe.map((r) => (r.every((c) => c == null || c.v.trim() === '') ? [] : r));
}

function indovinaSeparatore(testo) {
  const righe = [];
  let virg = false, cur = { ';': 0, ',': 0, '\t': 0 };
  for (let i = 0; i < testo.length && righe.length < 30; i++) {
    const ch = testo[i];
    if (ch === '"') virg = !virg;
    else if (!virg && ch in cur) cur[ch]++;
    else if (!virg && ch === '\n') { righe.push(cur); cur = { ';': 0, ',': 0, '\t': 0 }; }
  }
  righe.push(cur);
  let best = ';', score = 0;
  for (const s of [';', '\t', ',']) {
    const conti = righe.map((r) => r[s]).filter((n) => n > 0);
    if (!conti.length) continue;
    const freq = new Map();
    for (const n of conti) freq.set(n, (freq.get(n) || 0) + 1);
    const [moda, volte] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    const sc = volte * 10 + Math.min(moda, 9);
    if (sc > score) { score = sc; best = s; }
  }
  return best;
}

// Indice dello zip (dalla directory centrale) → { nome: { metodo, off, csize } }
function indiceZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ErroreFile('Il file è danneggiato o incompleto: scaricalo o salvalo di nuovo come .xlsx e riprova.');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let k = 0; k < n; k++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) throw new ErroreFile('Il file è danneggiato: salvalo di nuovo come .xlsx e riprova.');
    const flag = dv.getUint16(p + 8, true), metodo = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const nome = dec.decode(buf.subarray(p + 46, p + 46 + ln));
    out[nome] = { metodo, off, csize, cifrato: !!(flag & 1) };
    p += 46 + ln + le + lc;
  }
  return { out, dv };
}

async function estrai(buf, idx, nome) {
  const e = idx.out[nome];
  if (!e) return null;
  if (e.cifrato) throw new ErroreFile('Il file è protetto da password: togli la password in Excel e riprova.');
  const dv = idx.dv;
  if (dv.getUint32(e.off, true) !== 0x04034b50) throw new ErroreFile('Il file è danneggiato: salvalo di nuovo come .xlsx e riprova.');
  const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
  const dati = buf.subarray(start, start + e.csize);
  if (e.metodo === 0) return dati;
  if (e.metodo === 8) return decomprimi(dati);
  throw new ErroreFile('Il file usa una compressione che non conosco: salvalo di nuovo come .xlsx e riprova.');
}

async function xmlDi(buf, idx, nome) {
  const b = await estrai(buf, idx, nome);
  if (!b) return null;
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(b), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new ErroreFile('Il file è danneggiato: aprilo in Excel, salvalo di nuovo come .xlsx e riprova.');
  return doc;
}

const tutti = (n, tag) => [...n.getElementsByTagNameNS('*', tag)];
const figli = (n, tag) => [...n.children].filter((c) => c.localName === tag);
const attr = (n, a) => n.getAttribute(a);
const attrR = (n, a) => n.getAttributeNS(NS_R, a) ?? n.getAttribute('r:' + a);

// Testo di una stringa condivisa o in linea, anche con parti formattate (<r>); salta la pronuncia fonetica (<rPh>)
const testoSi = (si) => tutti(si, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join('');

// Il formato numerico è una data? Formati predefiniti 14–22 e 45–47, oppure personalizzati con g/m/a fuori da virgolette e parentesi
function formatoData(id, codice) {
  if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return true;
  if (!codice) return false;
  const s = codice.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '').replace(/_.|\*./g, '');
  if (/^general$/i.test(s.trim())) return false;
  return /[dmyhs]/i.test(s.split(';')[0]) && !/^[#0.,\s%E+-]*$/i.test(s);
}

export async function leggiXlsx(buf) {
  const idx = indiceZip(buf);
  if (idx.out['EncryptionInfo'] || idx.out['EncryptedPackage']) throw new ErroreFile('Il file è protetto da password: togli la password in Excel e riprova.');
  if (idx.out['xl/workbook.bin']) throw new ErroreFile('È un file .xlsb (binario): aprilo in Excel, salvalo come .xlsx e riprova.');
  if (idx.out['content.xml'] && !idx.out['xl/workbook.xml']) throw new ErroreFile('È un file .ods: aprilo in LibreOffice, salvalo come .xlsx e riprova.');
  const wb = await xmlDi(buf, idx, 'xl/workbook.xml');
  if (!wb) throw new ErroreFile('Il file non è una cartella di lavoro Excel: salvalo come .xlsx e riprova.');
  const pr = tutti(wb, 'workbookPr')[0];
  const s1904 = !!pr && /^(1|true)$/i.test(attr(pr, 'date1904') || '');
  // relazioni della cartella: id → percorso
  const relsDoc = await xmlDi(buf, idx, 'xl/_rels/workbook.xml.rels');
  const rels = {}, perTipo = {};
  for (const r of relsDoc ? tutti(relsDoc, 'Relationship') : []) {
    if (/external/i.test(attr(r, 'TargetMode') || '')) continue; // collegamenti esterni: mai seguiti
    let t = attr(r, 'Target') || '';
    t = t.startsWith('/') ? t.slice(1) : 'xl/' + t;
    t = t.replace(/[^/]+\/\.\.\//g, '');
    rels[attr(r, 'Id')] = t;
    perTipo[(attr(r, 'Type') || '').split('/').pop()] = t;
  }
  // stringhe condivise
  const sstDoc = await xmlDi(buf, idx, perTipo.sharedStrings || 'xl/sharedStrings.xml');
  const sst = sstDoc ? figli(sstDoc.documentElement, 'si').map(testoSi) : [];
  // stili: quali formati di cella sono date
  const stDoc = await xmlDi(buf, idx, perTipo.styles || 'xl/styles.xml');
  const xfData = [];
  if (stDoc) {
    const codici = {};
    for (const f of tutti(stDoc, 'numFmt')) codici[attr(f, 'numFmtId')] = attr(f, 'formatCode');
    const xfs = tutti(stDoc, 'cellXfs')[0];
    for (const xf of xfs ? figli(xfs, 'xf') : []) {
      const id = Number(attr(xf, 'numFmtId') || 0);
      xfData.push(formatoData(id, codici[id]));
    }
  }
  const fogli = [];
  for (const sh of tutti(wb, 'sheet')) {
    const percorso = rels[attrR(sh, 'id')];
    if (!percorso || !idx.out[percorso]) continue; // fogli di grafici o mancanti
    const doc = await xmlDi(buf, idx, percorso);
    if (!doc || doc.documentElement.localName !== 'worksheet') continue;
    fogli.push({
      nome: attr(sh, 'name') || 'Foglio', nascosto: /hidden/i.test(attr(sh, 'state') || ''),
      righe: leggiFoglio(doc, sst, xfData, s1904),
    });
  }
  if (!fogli.length) throw new ErroreFile('Nel file non c\'è nessun foglio con dei dati.');
  return { fogli, sistema1904: s1904 };
}

function leggiFoglio(doc, sst, xfData, s1904) {
  const righe = [];
  let rAuto = 0;
  for (const row of tutti(doc, 'row')) {
    const r = attr(row, 'r') ? Number(attr(row, 'r')) - 1 : rAuto;
    rAuto = r + 1;
    if (r > 1048575) continue;
    const riga = righe[r] || (righe[r] = []);
    let cAuto = 0;
    for (const c of figli(row, 'c')) {
      const ref = attr(c, 'r');
      const col = ref ? colNumero(ref.replace(/\d+/g, '')) : cAuto;
      cAuto = col + 1;
      const t = attr(c, 't') || 'n';
      const vEl = figli(c, 'v')[0], fEl = figli(c, 'f')[0];
      const f = fEl && fEl.textContent ? fEl.textContent : null;
      const raw = vEl ? vEl.textContent : null;
      let cella = null;
      if (t === 's') { const s = sst[Number(raw)]; if (s != null && s !== '') cella = { v: s, t: 's' }; }
      else if (t === 'inlineStr') { const is = figli(c, 'is')[0]; const s = is ? testoSi(is) : ''; if (s !== '') cella = { v: s, t: 's' }; }
      else if (t === 'str') { if (raw != null && raw !== '') cella = { v: raw, t: 's' }; }
      else if (t === 'b') { if (raw != null) cella = { v: raw === '1' || raw === 'true', t: 'b' }; }
      else if (t === 'e') cella = null;
      else if (t === 'd') {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw || '');
        if (m) cella = { v: { y: +m[1], m: +m[2], d: +m[3] }, t: 'd' };
      } else if (raw != null && raw !== '') {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          const s = Number(attr(c, 's') || 0);
          const dt = xfData[s] ? dataDaSeriale(n, s1904) : null;
          cella = dt ? { v: dt, t: 'd', n } : { v: n, t: 'n' };
        }
      }
      if (cella && f) cella.f = f;
      if (!cella && f) cella = { v: null, t: 'vuota', f };
      if (cella) riga[col] = cella;
    }
  }
  // celle unite: il valore in alto a sinistra vale per tutta l'area
  for (const m of tutti(doc, 'mergeCell')) {
    const ref = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(attr(m, 'ref') || '');
    if (!ref) continue;
    const c1 = colNumero(ref[1]), r1 = +ref[2] - 1, c2 = colNumero(ref[3]), r2 = +ref[4] - 1;
    const v = righe[r1]?.[c1];
    if (!v || (r2 - r1 + 1) * (c2 - c1 + 1) > 10000) continue;
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      if (r === r1 && c === c1) continue;
      (righe[r] || (righe[r] = []))[c] = { ...v, f: undefined, unita: true };
    }
  }
  for (let i = 0; i < righe.length; i++) if (!righe[i]) righe[i] = [];
  return righe;
}
