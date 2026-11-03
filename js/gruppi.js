// Gruppi espandibili, come le notifiche raggruppate dei telefoni Pixel (STILE.md, "Gruppi espandibili").
// Chiuso: titolo, totale, contatore e un'anteprima di al massimo 4 voci. Aperto: le righe complete, a blocchi.
// Lo stato di ogni gruppo si ricorda sul dispositivo (localStorage "contabilita.gruppi": { idGruppo: true/false });
// senza una scelta il gruppo è chiuso sul telefono e aperto da 900 px in su.
import { esc } from './ui.js';

const KEY = 'contabilita.gruppi';
const ANTEPRIMA = 4;
const CHEV = '<svg class="gr-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 9.5l5.5 5.5 5.5-5.5"/></svg>';

function memoria() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export function ricorda(id, aperto) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...memoria(), [id]: !!aperto })); } catch {}
}
export function aperto(id) {
  const v = memoria()[id];
  return typeof v === 'boolean' ? v : matchMedia('(min-width: 900px)').matches;
}

// Markup di un gruppo.
// id: identificativo stabile (anche per la memoria); cls/attrs: classi e attributi in più della sezione;
// titolo, tono (in, out, warn, prim: colore della capsula), totale (HTML già formattato) e totCls;
// n: numero di voci; nomi: [singolare, plurale] per l'etichetta del contatore;
// anteprima: [{ desc, det, amt, cls }] (se ne mostrano 4); corpo: HTML delle righe complete;
// piede: HTML sotto le righe (per esempio il pulsante per aggiungere); vuoto: testo quando non ci sono voci;
// contatore: false toglie il numero dal pulsante (resta solo la freccia).
export function gruppoHTML({ id, cls = '', attrs = '', titolo, tono = '', totale = '', totCls = '', n, nomi = ['voce', 'voci'],
  anteprima = [], corpo = '', piede = '', vuoto = '', contatore = true }) {
  const multi = n > 1;
  const open = multi && aperto(id);
  const etichetta = `${n} ${n === 1 ? nomi[0] : nomi[1]}`;
  const testa = `<span class="cap ${tono}"></span><span class="gr-tit">${esc(titolo)}</span>${totale ? `<span class="gr-tot ${totCls}" data-gr-tot>${totale}</span>` : ''}`;
  const head = multi
    ? `<button type="button" class="gr-head" aria-expanded="${open}" aria-controls="gr-${id}-body" data-gr-label="${esc(etichetta)}"
        aria-label="${esc(`${titolo}: ${etichetta}, ${open ? 'mostra meno' : 'mostra tutto'}`)}">
        ${testa}<span class="gr-count${contatore ? '' : ' solo'}">${contatore ? n : ''}${CHEV}</span></button>`
    : `<div class="gr-head">${testa}</div>`;
  const prev = multi ? `<div class="gr-prev" aria-hidden="true"${open ? ' hidden' : ''}>${anteprima.slice(0, ANTEPRIMA).map((v) => `
      <div class="gr-pr"><b>${esc(v.desc)}</b><span class="gr-det">${esc(v.det || '')}</span><span class="gr-amt ${v.cls || ''}">${esc(v.amt || '')}</span></div>`).join('')}
      ${n > ANTEPRIMA ? `<div class="gr-more">e altri ${n - ANTEPRIMA}</div>` : ''}</div>` : '';
  const body = n
    ? `<div class="gr-body" id="gr-${id}-body"${multi && !open ? ' hidden' : ''}>${corpo}</div>`
    : `<p class="gr-vuoto muted">${esc(vuoto)}</p>`;
  const foot = piede ? `<div class="gr-foot"${multi && !open ? ' hidden' : ''}>${piede}</div>` : '';
  return `<section class="gruppo ${cls}${multi ? ' multi' : ''}${open ? ' aperto' : ''}" id="gr-${id}" data-gruppo="${id}" ${attrs}>${head}${prev}${body}${foot}</section>`;
}

// Mostra lo stato aperto o chiuso, senza animazione
function applica(sec, open) {
  sec.classList.toggle('aperto', open);
  const head = sec.querySelector(':scope > .gr-head');
  if (head?.dataset.grLabel) {
    head.setAttribute('aria-expanded', String(open));
    head.setAttribute('aria-label', `${sec.querySelector('.gr-tit')?.textContent}: ${head.dataset.grLabel}, ${open ? 'mostra meno' : 'mostra tutto'}`);
  }
  for (const el of sec.querySelectorAll(':scope > .gr-body, :scope > .gr-foot')) el.hidden = !open;
  const prev = sec.querySelector(':scope > .gr-prev');
  if (prev) prev.hidden = open;
}

// Apre o chiude con l'altezza che cambia "a molla" e, all'apertura, le righe in cascata
function cambia(sec, open, anima = true) {
  if (sec.classList.contains('aperto') === open) return;
  ricorda(sec.dataset.gruppo, open);
  if (!anima || matchMedia('(prefers-reduced-motion: reduce)').matches) { applica(sec, open); return; }
  const h0 = sec.offsetHeight;
  applica(sec, open);
  const h1 = sec.offsetHeight;
  sec.style.height = h0 + 'px';
  void sec.offsetHeight;
  sec.classList.add('gr-anim');
  sec.style.height = h1 + 'px';
  const fine = () => { sec.classList.remove('gr-anim'); sec.style.height = ''; };
  sec.addEventListener('transitionend', (e) => { if (e.target === sec && e.propertyName === 'height') fine(); }, { once: true });
  setTimeout(fine, 700);
  if (open) {
    const righe = [...sec.querySelectorAll(':scope > .gr-body .gr-riga, :scope > .gr-body .rows > *')].slice(0, 16);
    righe.forEach((r, i) => { r.style.setProperty('--i', i); r.classList.add('gr-entra'); });
    setTimeout(() => righe.forEach((r) => r.classList.remove('gr-entra')), 900);
  }
}

// Apre un gruppo (anche se non è ancora disegnato: vale per il prossimo disegno)
export function apri(id, anima = false) {
  const sec = document.getElementById('gr-' + id);
  if (sec?.classList.contains('multi')) cambia(sec, true, anima);
  else ricorda(id, true);
}

// Un solo ascolto sul documento, da agganciare una volta all'avvio: l'intestazione apre e chiude,
// un tocco sull'anteprima di un gruppo chiuso lo apre
export function avvia() {
  document.addEventListener('click', (e) => {
    const head = e.target.closest('.gruppo.multi > button.gr-head');
    const prev = !head && e.target.closest('.gruppo.multi:not(.aperto) > .gr-prev');
    const sec = (head || prev)?.closest('.gruppo');
    if (sec) cambia(sec, !sec.classList.contains('aperto'));
  });
}
