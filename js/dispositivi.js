// Dispositivi collegati alla sincronizzazione (kind 'disp', un record per dispositivo con id fisso disp-<idDispositivo>).
// Ogni dispositivo scrive soltanto il proprio record: passa da store.save e quindi da push() cifrato come ogni altro kind.
// data: { nome, tipo ('telefono' | 'tablet' | 'computer'), visto (ms dell'ultima sincronizzazione riuscita), creato (ms) }
import * as store from './store.js';
import * as sync from './sync.js';
import { attiva as DEMO, ID_DISPOSITIVO as ID_DEMO } from './demo.js';

const LS_ID = 'contabilita.deviceId'; // solo su questo dispositivo, mai sincronizzato
const ORA = 60 * 60 * 1000;

let idMem = null; // se localStorage non è disponibile l'id vale finché la pagina resta aperta
// Id casuale di questo dispositivo, creato al primo avvio. Se la chiave si perde il dispositivo compare come nuovo.
export function idDispositivo() {
  if (DEMO) return ID_DEMO; // in demo il dispositivo in uso è quello creato da demo.genera()
  if (idMem) return idMem;
  try { idMem = localStorage.getItem(LS_ID); } catch {}
  if (!idMem) {
    idMem = store.newId();
    try { localStorage.setItem(LS_ID, idMem); } catch {}
  }
  return idMem;
}
export const idRecord = (id = idDispositivo()) => 'disp-' + id;

// Tipo e nome proposti, solo generici: mai il modello né il nome dell'utente
export function proposta() {
  const ua = navigator.userAgent || '';
  const piatt = navigator.userAgentData?.platform || navigator.platform || '';
  const tocco = (navigator.maxTouchPoints || 0) > 1;
  if (/iPad/.test(ua) || (/Mac/.test(piatt + ua) && tocco)) return { tipo: 'tablet', nome: 'Tablet' };
  if (/iPhone|iPod/.test(ua)) return { tipo: 'telefono', nome: 'iPhone' };
  if (/Android/i.test(ua + piatt)) {
    const mobile = navigator.userAgentData ? navigator.userAgentData.mobile : /Mobile/.test(ua);
    return mobile ? { tipo: 'telefono', nome: 'Telefono Android' } : { tipo: 'tablet', nome: 'Tablet' };
  }
  if (/Win/i.test(piatt + ua)) return { tipo: 'computer', nome: 'PC Windows' };
  if (/Mac/i.test(piatt + ua)) return { tipo: 'computer', nome: 'Mac' };
  if (/Linux|X11|CrOS/i.test(piatt + ua)) return { tipo: 'computer', nome: 'PC Linux' };
  return /Mobi/.test(ua) ? { tipo: 'telefono', nome: 'Telefono' } : { tipo: 'computer', nome: 'Computer' };
}

// Elenco per il pannello: questo dispositivo per primo (anche se il record non esiste ancora), poi gli altri dal più recente
export function elenco() {
  const mio = idRecord();
  const altri = store.all('disp').filter((r) => r.id !== mio)
    .sort((a, b) => (b.data.visto || 0) - (a.data.visto || 0));
  const r = store.get(mio);
  const questo = { id: mio, questo: true, data: r ? r.data : { ...proposta(), visto: null, creato: null } };
  return [questo, ...altri.map((x) => ({ id: x.id, questo: false, data: x.data }))];
}

// Rinomina questo dispositivo (gli altri non si toccano). Un nome vuoto torna a quello proposto.
export function rinomina(nome) {
  nome = (nome || '').trim().slice(0, 40) || proposta().nome;
  const id = idRecord();
  if (store.get(id)) store.patch(id, { nome });
  else store.save('disp', id, { ...proposta(), nome, visto: lastOkMs(), creato: Date.now() });
}

// Toglie un altro dispositivo dall'elenco: non lo scollega, e se torna a sincronizzare ricompare
export function togli(id) {
  if (id !== idRecord()) store.remove(id);
}

const lastOkMs = () => { const t = Date.parse(sync.lastOk() || ''); return Number.isFinite(t) ? t : null; };

// Dopo una sincronizzazione riuscita aggiorna "visto", al massimo una volta all'ora
// (altrimenti ogni ciclo da 60 secondi creerebbe un invio). Se il record manca, o un altro dispositivo
// l'ha tolto dall'elenco, si ricrea.
function dopoSync(st) {
  if (st.state !== 'ok') return;
  const t = lastOkMs();
  if (!t) return;
  const id = idRecord();
  const r = store.get(id);
  if (!r) store.save('disp', id, { ...proposta(), visto: t, creato: Date.now() });
  else if (t - (r.data.visto || 0) >= ORA) store.patch(id, { visto: t });
}

// Da chiamare una volta all'avvio (non in demo)
export function avvia() {
  if (DEMO) return;
  idDispositivo();
  // rimandato di un ciclo: il salvataggio cambia di nuovo lo stato (pending) e non va fatto mentre gli ascoltatori ricevono 'ok'
  sync.onStatus((st) => setTimeout(() => dopoSync(st), 0));
}
