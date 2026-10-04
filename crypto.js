// Cifratura end-to-end: i dati lasciano il dispositivo solo cifrati.
// - Dalla frase segreta si ricavano due chiavi con PBKDF2-SHA256 (600.000 iterazioni):
//   una AES-GCM a 256 bit per il contenuto, una HMAC-SHA256 per rendere opachi gli identificativi.
// - Le chiavi restano sul dispositivo (IndexedDB, non esportabili). La frase non viene mai salvata né inviata.

const ITER = 600000;
const te = new TextEncoder();
const td = new TextDecoder();

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function newSalt() { return b64(crypto.getRandomValues(new Uint8Array(16))); }

export async function deriveKeys(passphrase, saltB64, iterations = ITER) {
  const base = await crypto.subtle.importKey('raw', te.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations, hash: 'SHA-256' }, base, 512));
  const aes = await crypto.subtle.importKey('raw', bits.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const mac = await crypto.subtle.importKey('raw', bits.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  bits.fill(0);
  return { aes, mac };
}

export async function encrypt(keys, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keys.aes, te.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function decrypt(keys, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, keys.aes, unb64(box.ct));
  return JSON.parse(td.decode(pt));
}

// Identificativo opaco e stabile per il server (lo stesso su ogni dispositivo con la stessa frase)
export async function opaqueId(keys, id) {
  return 'e' + b64url(await crypto.subtle.sign('HMAC', keys.mac, te.encode(id))).slice(0, 32);
}

export const CHECK = 'contabilita-ok';
export const ITERATIONS = ITER;

// --- Conservazione delle chiavi sul dispositivo ---
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('contabilita-keys', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('k');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function storeKeys(uid, keys) {
  const d = await db();
  await new Promise((resolve, reject) => {
    const tx = d.transaction('k', 'readwrite');
    tx.objectStore('k').put({ uid, aes: keys.aes, mac: keys.mac }, 'keys');
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}
export async function loadKeys(uid) {
  const d = await db();
  const v = await new Promise((resolve, reject) => {
    const req = d.transaction('k').objectStore('k').get('keys');
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  return v && v.uid === uid ? { aes: v.aes, mac: v.mac } : null;
}
export async function clearKeys() {
  const d = await db();
  await new Promise((resolve) => {
    const tx = d.transaction('k', 'readwrite');
    tx.objectStore('k').delete('keys');
    tx.oncomplete = resolve; tx.onerror = resolve;
  });
}
