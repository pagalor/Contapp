// Pagina Aspetto (#aspetto): tema chiaro, scuro o di sistema e installazione come app.
import { $ } from './ui.js';
import { testataAccount } from './pannelli.js';

let root;

export function render(el) {
  root = el;
  el.innerHTML = `
    <section class="impost">
      ${testataAccount('Aspetto')}
      <section class="card">
        <label class="field inline"><span>Tema</span>
          <select id="theme">
            <option value="auto">Come il sistema</option><option value="light">Chiaro</option><option value="dark">Scuro</option>
          </select></label>
        <div id="install-box"></div>
      </section>
    </section>`;
  const theme = $('#theme', root);
  theme.value = localStorage.getItem('contabilita.theme') || 'auto';
  theme.addEventListener('change', () => {
    localStorage.setItem('contabilita.theme', theme.value);
    applyTheme();
  });
  paintInstall();
}

export function applyTheme() {
  const t = localStorage.getItem('contabilita.theme') || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
  // Il colore della barra del browser segue lo sfondo del tema in uso (--bg di palette.css)
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

// --- Installazione come app ---
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; paintInstall(); });
function paintInstall() {
  const box = root?.isConnected && $('#install-box', root);
  if (!box) return;
  if (matchMedia('(display-mode: standalone)').matches) { box.innerHTML = ''; return; }
  box.innerHTML = installEvt
    ? '<button class="btn ghost" data-install>Installa come app</button>'
    : '<p class="muted">Per installarla: su Android, menu di Chrome e poi "Aggiungi a schermata Home"; su Windows, l\'icona di installazione nella barra degli indirizzi di Edge o Chrome.</p>';
  const b = $('[data-install]', box);
  if (b) b.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; paintInstall(); };
}
