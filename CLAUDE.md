# Contabilità: documento di progetto

App personale di contabilità che sostituisce un file Excel. Tiene traccia di entrate e uscite mese per mese e del patrimonio, diviso tra più "fondi" (contanti, conti, crypto…). Funziona su Windows e Android come PWA installabile, offline, con sincronizzazione cifrata end-to-end tra i dispositivi.

Questo documento descrive com'è fatta l'app e le regole da rispettare quando la si modifica. Va letto prima di ogni intervento.

## Architettura in breve

- **App statica**, senza build e senza dipendenze: HTML, CSS e JavaScript a moduli ES, serviti così come sono.
- **Hosting**: GitHub Pages, dal ramo `main` del repository, cartella radice. Ogni push su `main` pubblica la nuova versione.
- **Dati locali**: IndexedDB (database `contabilita`, object store `records`). Tutto viene caricato in memoria all'avvio.
- **Offline**: il service worker `sw.js` mette in cache i file dell'app.
- **Sincronizzazione**: Supabase, usato solo tramite le API REST (PostgREST e Auth) con `fetch`, senza librerie. Su ogni dispositivo si inseriscono a mano URL e chiave pubblica; nel codice non c'è nessuna chiave.
- **Cifratura end-to-end**: i dati vengono cifrati sul dispositivo prima dell'invio. Sul server non arriva mai niente in chiaro.
- **Nessuna risorsa esterna**: niente font, CDN, statistiche o servizi di terze parti. L'unica destinazione di rete è il progetto Supabase dell'utente.
- **Lingua**: interfaccia, messaggi e commenti nel codice sono in italiano.

## File

```
index.html              struttura della pagina e barra di navigazione
style.css               tutto lo stile (temi chiaro e scuro, telefono e desktop)
sw.js                   service worker: cache dei file, numero di VERSION
manifest.webmanifest    dati per l'installazione come app
icons/                  icone 192, 512 e maskable 512
js/main.js              avvio, router (hash), avvisi sui target, registrazione del service worker
js/store.js             archivio locale (IndexedDB e memoria) e stato "dirty" per la sincronizzazione
js/model.js             logica di dominio: totali, categorie, fondi, saldi, target, tag, debiti, migrazioni
js/expr.js              parser degli importi con espressioni e formattazione dei numeri (it-IT)
js/sync.js              autenticazione Supabase, pull e push, gestione della frase segreta
js/crypto.js            PBKDF2, AES-GCM, HMAC per gli id, conservazione delle chiavi
js/catstats.js          entrate/uscite per categoria (torta, percentuali, dettaglio con sottocategorie), riepilogo per categoria di un tag; usato da Mese e Riepilogo
js/charts.js            grafici SVG fatti a mano: barre, linea, aree impilate nel tempo (con selezione interattiva del punto), anello
js/ui.js                toast, finestre (dialog), conferme, tooltip, download, debounce
js/dialogs.js           finestre condivise: movimento (nuovo e modifica), ripartizione su più fondi, trasferimento, correzione saldo, editor dei tag, movimento ricorrente
js/view-mese.js         pagina Mese: elenco e calendario, ricerca, trasferimenti, avvisi, categorie in fondo. I movimenti sono di sola lettura: toccandone uno (elenco o calendario) si aprono le voci extra (tag, nota, duplica…), e solo la matita apre la finestra di modifica (`movDialog`), la stessa del "+ Aggiungi"
js/view-riepilogo.js    pagina Riepilogo: statistiche, grafici, torte per categoria, tag, soldi buttati
js/view-patrimonio.js   pagina Patrimonio: saldi per fondo, andamento (interattivo, con intervallo di date personalizzabile), rilevazioni storiche
js/view-conti.js        pagina Fondi (configurazione) e dettaglio di un fondo (route #conti, #conto/<id>)
js/view-debiti.js       pagina Debiti e crediti
js/view-ricorrenti.js   pagina Movimenti ricorrenti (elenco; la finestra di modifica è in dialogs.js)
js/view-altro.js        pagina Altro: sincronizzazione e cifratura, import/export, categorie, tema
supabase.sql            tabella, permessi, RLS e trigger da eseguire una volta su Supabase
```

**Route**:

| Hash | Pagina |
| --- | --- |
| `#mese/AAAA-MM[/idDaEvidenziare]` | Mese |
| `#cerca/<testo>` | Ricerca |
| `#tag/<nome>` | Movimenti con un tag, con uscite ed entrate per categoria |
| `#riepilogo/<anno or tutto>` | Riepilogo |
| `#patrimonio` | Patrimonio |
| `#conti` | Fondi (configurazione) |
| `#conto/<id>` | Dettaglio di un fondo |
| `#debiti` | Debiti e crediti |
| `#ricorrenti` | Movimenti ricorrenti (si apre da Altro) |
| `#altro` | Altro |

## Modello dei dati

Ogni dato è un record `{ id, kind, data, updated_at, deleted, dirty }`:

- `updated_at` è un timestamp in millisecondi e decide chi vince nei conflitti.
- `deleted` è un'eliminazione logica (tombstone).
- `dirty` indica che il record va ancora inviato al server.

Per modificare i dati si passa sempre da `store.save`, `store.patch` e `store.remove`, mai scrivendo direttamente.

| kind | Contenuto di `data` |
| --- | --- |
| `mov` | Movimento. `y, m, d` (giorno, `null` se ignoto), `tipo` (`in` oppure `out`), `val` (numero), `espr` (espressione, per esempio `=68-17-17`, oppure `null`), `desc`, `cat` (id categoria), `sub` (id sottocategoria, `null` se manca; vale solo se appartiene a `cat`), `catAuto`, `conti` (vedi sotto), `contoAuto`, `tags` (array), `note`, `escl` (escluso dai totali di entrate e uscite), `ord` |
| `cat` | Categoria. `nome, tipo (in/out), colore, emoji, ord`. Le categorie predefinite hanno id stabili `cat-<chiave>` |
| `sub` | Sottocategoria di una categoria. `nome, cat (id della categoria), ord`. Le predefinite (per ora solo quelle di Shopping: Elettronica, Abbigliamento, Scarpe, Casa e arredamento, Sport, Altro) hanno id stabili `sub-<chiaveCategoria>-<chiave>` e si creano in `M.ensureSubcats()` (da `M.migrate()`) con `saveMissing` |
| `cont` | Fondo del patrimonio. `nome, gruppo, ord, archiviato, saldoIniziale, siEspr, obiettivo` (il target), `obEspr` |
| `snap` | Rilevazione del portafoglio: storica (importata dall'Excel) o manuale. `date, vals: { idFondo: { val, espr } }, note, scelta` (assente = storica; `auto` = solo confronto; `manuale` = i saldi ripartono dai valori rilevati) |
| `trasf` | Trasferimento tra fondi. `y, m, d, da, a, val, espr, note, ord` |
| `rett` | Correzione del saldo di un fondo. `date, c, delta, note, snapId` (`snapId` presente se l'ha creata una rilevazione manuale) |
| `debt` | Debito o credito. `tipo` (`credito` = mi devono, `debito` = devo), `persona, desc, val, espr, data, fondo, rimborsi: [{ data, val, espr, fondo }], note, ord` |
| `butt` | Voce di "soldi buttati". `y, espr, val, desc, ord` |
| `ric` | Movimento ricorrente. `tipo, desc, val, espr, cat, conti` (vuoto o un solo fondo), `sub` (facoltativa), `tags, note, escl, inizio` (prima scadenza, `AAAA-MM-GG`), `freq` (`sett`, `mese`, `anno`), `ogni` (ogni quante unità), `fine` (ultima scadenza o `null`), `da` (se presente, si generano solo scadenze successive), `ord` |
| `cfg` | Record unico `cfg-patrimonio`. `inizio` (data di partenza del calcolo automatico, `AAAA-MM-GG`), `contoOut`, `contoIn` (fondi proposti) |

**Gruppi dei fondi** (`M.GRUPPI`): `contanti`, `corrente`, `deposito`, `digitale` (PayPal e simili), `crypto`, `altro`.

**Ripartizione dei movimenti sui fondi** (`mov.data.conti`):

| Valore | Significato |
| --- | --- |
| `[]` | Nessun fondo indicato |
| `[{ c }]` | Tutto l'importo da o verso un solo fondo |
| `[{ c, val, espr }, …]` | Importo diviso su più fondi; la somma deve coincidere con `val` |

## Regole di calcolo

- **Importi**: `expr.parseAmount` accetta numeri ed espressioni con `+ − × ÷ ( )`. Il separatore decimale è la virgola; il punto vale come decimale solo se non c'è una virgola. Si conserva l'espressione e si mostra il risultato; riaprendo la cella ricompare l'espressione.
- **Totali di entrate e uscite**: escludono i movimenti con `escl` o senza importo. Trasferimenti, correzioni e debiti non sono mai entrate o uscite.
- **Saldi dei fondi**: si attivano solo se `cfg.inizio` è impostato. Saldo = `saldoIniziale` + le variazioni con data **successiva** a `inizio`:
  - le ripartizioni dei movimenti;
  - i trasferimenti;
  - i prestiti e i rimborsi dei debiti con un fondo indicato;
  - le correzioni (queste contano anche se hanno data uguale a `inizio`).

  I saldi iniziali valgono quindi "a fine giornata" della data di partenza. Un movimento senza giorno vale come se fosse il 1° del mese (`M.recDate`). Il calcolo è in `M.ledgerEntries()` e `M.balances(asOf)`.
- **Rilevazione manuale** (Patrimonio → "Rilevazione manuale"): si scrive quanto c'è in ogni fondo a una data. Dalla data di partenza in poi l'app la confronta con il calcolo automatico a fine giornata (`M.confrontaRilevazione`) e l'utente sceglie: `auto` (la rilevazione resta solo un confronto) oppure `manuale` (`M.salvaRilevazione` registra una correzione `rett` con `snapId` per ogni fondo rilevato e diverso, così il saldo a quella data coincide con i valori scritti). I fondi lasciati vuoti non vengono rilevati né toccati. Riaprendo una rilevazione il confronto ignora le sue stesse correzioni (`senzaSnap`); modificarla o eliminarla ricrea o toglie le correzioni. Prima della data di partenza resta una fotografia storica.
- **Sottocategorie**: ogni categoria può averne (si gestiscono in Altro → Categorie, dal pulsante ↳). Il movimento conserva `cat` e in più `sub`: totali, torte e suggerimenti per categoria non cambiano, e dentro il dettaglio di una categoria compare la ripartizione per sottocategoria (`M.bySub`). Se si cambia categoria la sottocategoria si azzera; se una sottocategoria viene eliminata, i suoi movimenti restano nella categoria senza sottocategoria. La sottocategoria è proposta (`M.suggestSub`) dalla scelta più frequente per la stessa descrizione, poi da regole testuali.
- **Statistiche per tag**: la pagina di un tag (`#tag/<nome>`) mostra uscite ed entrate per categoria, con lo stesso dettaglio di Mese; nel Riepilogo toccando un tag si apre il riepilogo per categoria del periodo.
- **Target**: un fondo è "sotto il target" se `obiettivo − saldo > 0`. L'avviso compare in tre punti: un riquadro nella pagina Mese, un pallino sulla voce Patrimonio, un toast quando il fondo scende sotto la soglia.
- **Movimenti senza fondo** con data successiva alla partenza: vengono segnalati e non entrano nei saldi.
- **Suggerimenti automatici**: categoria e fondo sono proposti dalla scelta più frequente fatta per la stessa descrizione. Per la categoria, se non c'è uno storico, si usano delle regole testuali. Il suggerimento si ferma quando l'utente sceglie a mano (`catAuto` o `contoAuto` diventano `false`).
- **Movimenti ricorrenti**: a ogni scadenza `M.generaRicorrenti()` crea un normale movimento (`mov`) con id fisso `mov-r-<idRicorrenza>-<AAAA-MM-GG>` e il campo `ricId`. Parte all'avvio, dopo ogni pull, quando la pagina torna visibile e ogni 10 minuti; recupera anche le scadenze perse ad app chiusa (un'app web non può scrivere in background). Il giorno 29–31 diventa l'ultimo giorno dei mesi più corti. I movimenti si creano con `store.saveMissing` (`updated_at = 1`, come `saveDefault`): se esistono già, anche eliminati, non vengono ricreati, e qualsiasi modifica fatta su un altro dispositivo vince. Modificare o eliminare una ricorrenza non tocca i movimenti già generati; cambiando `inizio`, `freq` o `ogni` si imposta `da` (ieri) per non rigenerare il passato a date diverse.
- **Patrimonio con debiti**: il patrimonio "netto" è il totale dei fondi + i crediti residui − i debiti residui.

## Sincronizzazione (`sync.js`)

**Tabella Supabase `records`**: `id` (text, chiave primaria), `user_id`, `kind`, `data` (jsonb), `updated_at` (bigint), `deleted`, `server_ts`.

**Protezioni lato server**:
- RLS: ogni utente vede solo le proprie righe.
- `GRANT` al ruolo `authenticated` sulla tabella. Senza questi permessi le chiamate falliscono con "permission denied".
- Un trigger aggiorna `server_ts` e scarta gli aggiornamenti con `updated_at` più vecchio. Vince sempre l'ultima modifica.

**Ciclo di sincronizzazione**:
1. Pull: scarica le righe con `server_ts` più recente dell'ultimo pull, con 30 secondi di margine, a pagine da 1000.
2. Push: invia i record `dirty` in blocchi da 400, con un upsert `merge-duplicates`.

**Quando parte**:
- all'avvio;
- quando la pagina torna visibile;
- quando torna la connessione;
- ogni 60 secondi;
- 1,5 secondi dopo una modifica locale.

**Dopo un pull**: `main.js` aggiorna la vista, ma non mentre l'utente sta scrivendo in una riga, poi esegue `M.migrate()`.

## Cifratura end-to-end (`crypto.js`)

**Chiavi**:
- Dalla frase segreta si ricavano 512 bit con PBKDF2-SHA256 a 600.000 iterazioni e un salt casuale.
- I primi 256 bit diventano la chiave AES-GCM, gli altri 256 la chiave HMAC-SHA256.
- Le chiavi sono conservate non esportabili nel database IndexedDB `contabilita-keys`. La frase non viene mai salvata né inviata.

**Cosa arriva sul server per ogni record**:

| Campo | Valore |
| --- | --- |
| `id` | `opaqueId` = HMAC dell'id locale, così nemmeno gli id rivelano nomi |
| `kind` | `'enc'` |
| `data` | `{ iv, ct }`, cifratura AES-GCM di `{ id, kind, data }` |
| `updated_at`, `deleted` | In chiaro, servono alla sincronizzazione |

**Riga meta**: `id = 'meta-crypto-<user_id>'`, `kind = 'meta'`. Contiene salt, iterazioni e un valore di controllo cifrato, che serve a verificare la frase su un nuovo dispositivo.

**Stati della cifratura** (`sync.checkCrypto()`):

| Stato | Situazione | Funzione |
| --- | --- | --- |
| `setup` | Sul server non c'è ancora la frase | `createPassphrase` |
| `locked` | La frase esiste ma il dispositivo non ha le chiavi | `unlock` |
| `ready` | Le chiavi sono disponibili | Si sincronizza |

Con "Frase dimenticata", `resetCloud` cancella le righe sul server e le ricarica dal dispositivo con una nuova frase. Senza chiavi la sincronizzazione non parte.

## Interfaccia

**Stile minimale e monocromatico**. Il colore ha sempre un significato: verde per le entrate (`--in`), rosso per le uscite (`--out`), ambra per gli avvisi (`--warn`), blu per il saldo (`--saldo`), viola per i soldi buttati (`--butt`). I gruppi dei fondi hanno i loro colori (`--g-<gruppo>`).

**Layout e temi**:
- Le variabili CSS sono definite in `:root`, con il tema scuro tramite `prefers-color-scheme` oppure `data-theme`.
- Desktop: barra laterale sopra i 900 px. Telefono: barra in basso.
- Le righe dei movimenti cambiano disposizione con una container query sulla larghezza del riquadro (`container: ledger`), non dello schermo.
- Font di sistema e numeri tabellari (`tabular-nums`).

**Testi**: nell'interfaccia si parla di **fondi**, non di "conti". Nelle righe la colonna si chiama "Pagato con" per le uscite e "Ricevuto su" per le entrate. Nel codice id e route restano `conto`, `conti`, `cont`.

## Regole per ogni modifica

1. **A ogni rilascio aumenta `VERSION` in `sw.js`** (`contabilita-vN`). Se aggiungi un file, inseriscilo nella lista `SHELL`. Senza questi due passi gli utenti restano sulla versione vecchia o l'app non funziona offline.
2. **Compatibilità con i dati esistenti**:
   - I nuovi campi devono avere un valore predefinito ragionevole quando mancano.
   - Le conversioni di dati vanno in `M.migrate()`, che deve essere idempotente: viene eseguita a ogni avvio e dopo ogni pull.
   - Non cambiare mai il significato di campi esistenti.
3. **Mai dati in chiaro verso il server**: ogni nuovo `kind` passa automaticamente da `push()` cifrato. Non aggiungere altre chiamate che inviano contenuti.
4. **Niente dipendenze esterne**: niente script da CDN e niente Google Fonts.
5. **Aggancia gli event listener una sola volta**, sull'elemento contenitore della pagina, non a ogni ridisegno. In passato `bindBody` richiamato a ogni render faceva contare i clic due volte.
6. **Usa le API dello store** (`save`, `patch`, `remove`, `saveDefault`). I record predefiniti usano `saveDefault`, che li crea con `updated_at = 1`, così qualsiasi versione già presente su un altro dispositivo vince.
7. **Testi in italiano**, chiari e senza gergo tecnico. Pulsanti e messaggi brevi.
8. **Prova su telefono e desktop**: almeno 390 px e 1360 px di larghezza, e il tema scuro se tocchi lo stile.
9. **Mai dati personali nel repository**: è pubblico. Niente storico, backup, file Excel o chiavi.

## Provare in locale

Dalla cartella dell'app:

```
python -m http.server 8000
```

Poi apri `http://localhost:8000`. I moduli ES e il service worker non funzionano aprendo `index.html` con un doppio clic (indirizzo `file://`).

Per provare la sincronizzazione senza toccare i dati veri, serve un secondo progetto Supabase di prova, oppure un finto server che implementi gli endpoint usati da `sync.js`.

## Decisioni prese

- Lo storico 2021–2026 è stato importato dall'Excel una sola volta. I movimenti storici non hanno il giorno né il fondo, e non toccano i saldi perché sono precedenti alla data di partenza.
- Il blocco "Obiettivo" dell'Excel non è stato importato come target: i target si impostano nell'app.
- Le rilevazioni storiche restano per il grafico del periodo precedente al calcolo automatico.
- I prestiti pagati da un fondo non sono spese. Una cena pagata per altri si registra così: la propria quota come uscita, il resto come credito dallo stesso fondo.

## Idee per il futuro

- PIN o sblocco con impronta all'apertura.
- Cambio della frase segreta senza dover reimpostare il cloud.
- Movimenti ricorrenti, come gli abbonamenti mensili.
- Export in `.xlsx` vero, al posto del CSV.
- Budget mensili per categoria.
