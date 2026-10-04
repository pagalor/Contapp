// Archivio locale: tutti i record vivono in IndexedDB e in memoria.
// Ogni record: { id, kind, data, updated_at, deleted, dirty }
// kind: 'mov' (movimento), 'cat' (categoria), 'cont' (contenitore patrimonio),
//       'snap' (rilevazione patrimonio), 'butt' (soldi buttati)

const DB_NAME = 'contabilita';
let db;
const recs = new Map();
const listeners = new Set();

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('records', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function persist(list) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const st = tx.objectStore('records');
    for (const r of list) st.put(r);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function init() {
  db = await idb();
  const all = await new Promise((resolve, reject) => {
    const req = db.transaction('records').objectStore('records').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  for (const r of all) recs.set(r.id, r);
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(info) { for (const fn of listeners) fn(info); }

export const newId = () =>
  crypto.randomUUID ? crypto.randomUUID() :
  'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export function get(id) {
  const r = recs.get(id);
  return r && !r.deleted ? r : null;
}

export function all(kind) {
  const out = [];
  for (const r of recs.values()) if (r.kind === kind && !r.deleted) out.push(r);
  return out;
}

export const isEmpty = () => all('mov').length === 0 && all('snap').length === 0;

function stamp(prev) {
  const now = Date.now();
  return prev && prev.updated_at >= now ? prev.updated_at + 1 : now;
}

export function save(kind, id, data) {
  const prev = recs.get(id);
  const r = { id, kind, data, updated_at: stamp(prev), deleted: false, dirty: 1 };
  recs.set(id, r);
  persist([r]);
  emit({ local: true, ids: [id] });
  return r;
}

// Record "di base" (es. categorie predefinite): data minima, così qualsiasi versione
// già esistente su un altro dispositivo vince sempre l'unione.
export function saveDefault(kind, id, data) {
  if (recs.has(id)) return;
  const r = { id, kind, data, updated_at: 1, deleted: false, dirty: 1 };
  recs.set(id, r);
  persist([r]);
}

// Modifica parziale dei dati di un record esistente
export function patch(id, changes) {
  const prev = recs.get(id);
  if (!prev) return null;
  return save(prev.kind, id, { ...prev.data, ...changes });
}

export function remove(id) {
  const prev = recs.get(id);
  if (!prev || prev.deleted) return;
  const r = { ...prev, deleted: true, updated_at: stamp(prev), dirty: 1 };
  recs.set(id, r);
  persist([r]);
  emit({ local: true, ids: [id] });
}

// Importazione in blocco (backup o storico): sovrascrive i record con lo stesso id
export async function importRecords(list) {
  const now = Date.now();
  const out = list.map((x, i) => ({
    id: x.id, kind: x.kind, data: x.data, updated_at: now + i, deleted: !!x.deleted, dirty: 1,
  }));
  for (const r of out) recs.set(r.id, r);
  await persist(out);
  emit({ local: true, bulk: true });
  return out.length;
}

export function exportRecords() {
  return [...recs.values()].filter((r) => !r.deleted)
    .map(({ id, kind, data }) => ({ id, kind, data }));
}

// --- Sincronizzazione ---
export const dirtyList = () => [...recs.values()].filter((r) => r.dirty);

export async function markClean(sent) {
  const changed = [];
  for (const s of sent) {
    const cur = recs.get(s.id);
    if (cur && cur.dirty && cur.updated_at === s.updated_at) {
      cur.dirty = 0;
      changed.push(cur);
    }
  }
  if (changed.length) await persist(changed);
}

// Unisce i record arrivati dal server: vince la modifica più recente
export async function applyRemote(list) {
  const changed = [];
  for (const x of list) {
    const cur = recs.get(x.id);
    const ts = Number(x.updated_at);
    if (!cur || ts > cur.updated_at) {
      const r = { id: x.id, kind: x.kind, data: x.data, updated_at: ts, deleted: !!x.deleted, dirty: 0 };
      recs.set(r.id, r);
      changed.push(r);
    } else if (ts === cur.updated_at && cur.dirty) {
      cur.dirty = 0;
      changed.push(cur);
    }
  }
  if (changed.length) {
    await persist(changed);
    emit({ remote: true, ids: changed.map((r) => r.id) });
  }
  return changed.length;
}

export async function markAllDirty() {
  const list = [...recs.values()];
  for (const r of list) r.dirty = 1;
  await persist(list);
}
