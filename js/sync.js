// Sincronizzazione con Supabase usando direttamente le API REST (niente librerie da scaricare).
// Strategia: prima scarica le modifiche arrivate dagli altri dispositivi, poi invia le proprie.
// In caso di conflitto vince la modifica più recente (controllato anche lato server).
import * as store from './store.js';
import * as K from './crypto.js';

const LS_CFG = 'contabilita.sync.cfg';
const LS_SES = 'contabilita.sync.session';
const LS_PULL = 'contabilita.sync.lastPull';
const LS_LAST = 'contabilita.sync.lastOk';
const LS_PREV_USER = 'contabilita.sync.prevUser';

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let status = { state: 'off', msg: '' };
let keys = null;          // chiavi di cifratura sbloccate su questo dispositivo
let cryptoState = 'unknown'; // unknown | setup | locked | ready
export const getCryptoState = () => cryptoState;
const listeners = new Set();
export const onStatus = (fn) => { listeners.add(fn); fn(status); return () => listeners.delete(fn); };
function setStatus(state, msg = '') {
  status = { state, msg, last: read(LS_LAST) };
  for (const fn of listeners) fn(status);
}
export const getStatus = () => status;

export const config = () => read(LS_CFG);
export const session = () => read(LS_SES);
export const lastOk = () => read(LS_LAST);

export function setConfig(url, key) {
  url = (url || '').trim().replace(/\/+$/, '');
  key = (key || '').trim();
  if (!/^https:\/\/.+/.test(url)) throw new Error("L'URL del progetto deve iniziare con https://");
  if (key.length < 20) throw new Error('La chiave non sembra valida');
  write(LS_CFG, { url, key });
  refreshState();
}

async function authCall(path, body) {
  const cfg = config();
  const res = await fetch(cfg.url + '/auth/v1/' + path, {
    method: 'POST',
    headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(translateAuthError(json));
  return json;
}

function translateAuthError(j) {
  const m = (j.error_description || j.msg || j.message || j.error || '').toString();
  if (/invalid login credentials/i.test(m)) return 'Email o password non corretti.';
  if (/email not confirmed/i.test(m)) return "Devi prima confermare l'email: apri il link che Supabase ti ha inviato.";
  if (/already registered|already exists/i.test(m)) return 'Esiste già un account con questa email: usa Accedi.';
  if (/password should be at least/i.test(m)) return 'La password deve avere almeno 6 caratteri.';
  if (/signups not allowed/i.test(m)) return 'Le registrazioni sono disattivate su questo progetto Supabase.';
  return m || 'Richiesta non riuscita.';
}

function saveSession(j) {
  write(LS_SES, {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in || 3600) * 1000,
    user: { id: j.user?.id, email: j.user?.email },
  });
}

export async function signIn(email, password) {
  const j = await authCall('token?grant_type=password', { email, password });
  saveSession(j);
  await onNewUser(j.user?.id);
  refreshState();
  syncNow();
}

export async function signUp(email, password) {
  const j = await authCall('signup', { email, password });
  if (j.access_token) {
    saveSession(j);
    await onNewUser(j.user?.id);
    refreshState();
    syncNow();
    return { confirmed: true };
  }
  return { confirmed: false };
}

// Se l'account cambia, tutti i dati locali vanno inviati al nuovo account
async function onNewUser(uid) {
  keys = null; cryptoState = 'unknown';
  const prev = read(LS_PREV_USER);
  if (prev && prev !== uid) await store.markAllDirty();
  if (prev !== uid) write(LS_PULL, null);
  write(LS_PREV_USER, uid);
}

export async function signOut() {
  write(LS_SES, null);
  keys = null; cryptoState = 'unknown';
  await K.clearKeys();
  refreshState();
}

export function forgetConfig() {
  keys = null; cryptoState = 'unknown';
  K.clearKeys();
  write(LS_SES, null);
  write(LS_CFG, null);
  write(LS_PULL, null);
  refreshState();
}

async function refreshToken() {
  const ses = session();
  if (!ses?.refresh_token) throw new Error('Sessione scaduta: accedi di nuovo.');
  try {
    const j = await authCall('token?grant_type=refresh_token', { refresh_token: ses.refresh_token });
    saveSession(j);
  } catch (e) {
    if (navigator.onLine) { write(LS_SES, null); refreshState(); }
    throw new Error('Sessione scaduta: accedi di nuovo.');
  }
}

async function api(path, opts = {}, retry = true) {
  const cfg = config();
  let ses = session();
  if (!ses) throw new Error('Non hai effettuato l’accesso.');
  if (ses.expires_at - 60000 < Date.now()) { await refreshToken(); ses = session(); }
  const res = await fetch(cfg.url + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: cfg.key,
      Authorization: 'Bearer ' + ses.access_token,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401 && retry) { await refreshToken(); return api(path, opts, false); }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    if (res.status === 404 || /relation .* does not exist|could not find the table/i.test(j.message || '')) {
      throw new Error('Tabella "records" non trovata: esegui lo script SQL nel progetto Supabase.');
    }
    throw new Error(j.message || `Errore del server (${res.status})`);
  }
  return res;
}

const metaId = () => 'meta-crypto-' + session().user.id;

async function pull() {
  const last = read(LS_PULL);
  // piccolo margine all'indietro: l'unione è idempotente, meglio rileggere che perdere qualcosa
  const since = last ? new Date(new Date(last).getTime() - 30000).toISOString() : null;
  const PAGE = 1000;
  let offset = 0, maxTs = last, n = 0;
  for (;;) {
    let q = `records?select=id,kind,data,updated_at,deleted,server_ts&kind=eq.enc&order=server_ts.asc,id.asc&limit=${PAGE}&offset=${offset}`;
    if (since) q += '&server_ts=gt.' + encodeURIComponent(since);
    const rows = await (await api(q)).json();
    if (rows.length) {
      const plain = [];
      for (const row of rows) {
        let inner;
        try { inner = await K.decrypt(keys, row.data); } catch {
          throw new Error('Impossibile decifrare i dati del cloud: la frase segreta di questo dispositivo non corrisponde.');
        }
        plain.push({ id: inner.id, kind: inner.kind, data: inner.data, updated_at: row.updated_at, deleted: row.deleted });
      }
      n += await store.applyRemote(plain);
      const ts = rows[rows.length - 1].server_ts;
      if (!maxTs || ts > maxTs) maxTs = ts;
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  if (maxTs) write(LS_PULL, maxTs);
  return n;
}

async function push() {
  const dirty = store.dirtyList();
  if (!dirty.length) return 0;
  const uid = session().user.id;
  for (let i = 0; i < dirty.length; i += 400) {
    const chunk = dirty.slice(i, i + 400);
    const body = [];
    for (const r of chunk) {
      // sul server finiscono solo: id opaco, contenuto cifrato, data della modifica e flag di eliminazione
      body.push({
        id: await K.opaqueId(keys, r.id), user_id: uid, kind: 'enc',
        data: await K.encrypt(keys, { id: r.id, kind: r.kind, data: r.deleted ? null : r.data }),
        updated_at: r.updated_at, deleted: !!r.deleted,
      });
    }
    await api('records?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(body),
    });
    await store.markClean(chunk.map((r) => ({ id: r.id, updated_at: r.updated_at })));
  }
  return dirty.length;
}

// ---------------------------------------------------------------- cifratura
async function fetchMeta() {
  const rows = await (await api(`records?select=data&id=eq.${encodeURIComponent(metaId())}`)).json();
  return rows[0]?.data || null;
}

// Determina se la cifratura va creata, sbloccata o è pronta
export async function checkCrypto() {
  if (!config() || !session()) { cryptoState = 'unknown'; return cryptoState; }
  if (!keys) keys = await K.loadKeys(session().user.id);
  if (keys) { cryptoState = 'ready'; return cryptoState; }
  const meta = await fetchMeta();
  cryptoState = meta ? 'locked' : 'setup';
  return cryptoState;
}

async function saveMeta(salt, check) {
  await api('records?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ id: metaId(), user_id: session().user.id, kind: 'meta',
      data: { v: 1, salt, iter: K.ITERATIONS, check }, updated_at: Date.now(), deleted: false }]),
  });
}

// Prima attivazione: crea la frase segreta per questo account
export async function createPassphrase(pass) {
  if ((await fetchMeta())) throw new Error('Su questo account esiste già una frase segreta: usa Sblocca.');
  const salt = K.newSalt();
  const k = await K.deriveKeys(pass, salt);
  await saveMeta(salt, await K.encrypt(k, K.CHECK));
  await K.storeKeys(session().user.id, k);
  keys = k; cryptoState = 'ready';
  write(LS_PULL, null);
  await store.markAllDirty();
  refreshState();
  return syncNow();
}

// Altro dispositivo: sblocca con la frase già creata
export async function unlock(pass) {
  const meta = await fetchMeta();
  if (!meta) throw new Error('Su questo account non c\'è ancora una frase segreta.');
  const k = await K.deriveKeys(pass, meta.salt, meta.iter);
  try {
    if ((await K.decrypt(k, meta.check)) !== K.CHECK) throw new Error();
  } catch { throw new Error('Frase segreta non corretta.'); }
  await K.storeKeys(session().user.id, k);
  keys = k; cryptoState = 'ready';
  write(LS_PULL, null);
  refreshState();
  return syncNow();
}

// Frase dimenticata: sostituisce i dati del cloud con quelli di questo dispositivo, con una nuova frase
export async function resetCloud(pass) {
  await api(`records?user_id=eq.${session().user.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  const salt = K.newSalt();
  const k = await K.deriveKeys(pass, salt);
  await saveMeta(salt, await K.encrypt(k, K.CHECK));
  await K.storeKeys(session().user.id, k);
  keys = k; cryptoState = 'ready';
  write(LS_PULL, null);
  await store.markAllDirty();
  refreshState();
  return syncNow();
}

let running = null;
let again = false;

export function syncNow() {
  if (!config() || !session()) { refreshState(); return Promise.resolve(); }
  if (running) { again = true; return running; }
  running = (async () => {
    if (!navigator.onLine) { setStatus('offline', 'Sei offline: le modifiche restano sul dispositivo.'); return; }
    try {
      if (cryptoState !== 'ready') {
        const st = await checkCrypto();
        if (st === 'setup') { setStatus('locked', 'Crea la frase segreta per attivare la sincronizzazione cifrata'); return; }
        if (st === 'locked') { setStatus('locked', 'Inserisci la frase segreta per sincronizzare'); return; }
      }
      setStatus('syncing', 'Sincronizzazione…');
      await pull();
      await push();
      write(LS_LAST, new Date().toISOString());
      setStatus('ok', 'Sincronizzato');
    } catch (e) {
      setStatus(navigator.onLine ? 'error' : 'offline', e.message || String(e));
    }
  })().finally(() => {
    running = null;
    if (again) { again = false; schedule(500); }
  });
  return running;
}

let timer = null;
export function schedule(ms = 1500) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

function refreshState() {
  if (!config()) setStatus('off', 'Sincronizzazione non configurata');
  else if (!session()) setStatus('off', 'Accedi per sincronizzare');
  else if (cryptoState === 'setup' || cryptoState === 'locked') setStatus('locked', cryptoState === 'setup' ? 'Crea la frase segreta per attivare la sincronizzazione cifrata' : 'Inserisci la frase segreta per sincronizzare');
  else if (store.dirtyList().length) setStatus('pending', 'Modifiche da inviare');
  else setStatus('ok', status.state === 'ok' ? status.msg : 'Pronto');
}

export function start() {
  refreshState();
  store.subscribe((info) => {
    if (info.local && config() && session()) {
      if (status.state !== 'syncing' && status.state !== 'locked') setStatus('pending', 'Modifiche da inviare');
      schedule();
    }
  });
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => setStatus('offline', 'Sei offline: le modifiche restano sul dispositivo.'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
  syncNow();
}
