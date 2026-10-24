# Rationes: documento di progetto

**Rationes** (in latino «i conti») è un'app personale di contabilità che sostituisce un file Excel. Tiene traccia di entrate e uscite mese per mese e del patrimonio, diviso tra più "fondi" (contanti, conti, crypto…). Funziona su Windows e Android come PWA installabile, offline, con sincronizzazione cifrata end-to-end tra i dispositivi.

Questo documento descrive com'è fatta l'app e le regole da rispettare quando la si modifica. Va letto prima di ogni intervento.

**Nome e nomi interni**: l'app si chiamava "Contabilità". Il nuovo nome compare solo nei testi visibili (titolo, manifest, intestazioni, pagina Altro, messaggi, nomi dei file esportati). I nomi interni restano `contabilita` e **non vanno cambiati**, altrimenti l'app installata perde i dati locali o viene vista come un'app diversa: i database IndexedDB `contabilita` e `contabilita-keys`, le chiavi `contabilita.*` di `localStorage`, il prefisso `contabilita-vN` di `VERSION`, il formato dei backup `contabilita-v1`, il valore di controllo `contabilita-ok` della cifratura, la tabella e la configurazione Supabase, `start_url` e `scope` del manifest.

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
sw.js                   service worker: cache dei file, numero di VERSION (lo comunica alla pagina che lo chiede con il messaggio 'versione')
manifest.webmanifest    dati per l'installazione come app (nome, colori #17181c del fondo del logo, icone)
icons/                  logo di Rationes:
  icon-192.png            icona "any" 192 px, anche apple-touch-icon e logo nella barra laterale
  icon-512.png            icona "any" 512 px
  icon-maskable-512.png   icona "maskable" (Android ritaglia il bordo)
  icon-monochrome-512.png icona "monochrome" (sagoma bianca su trasparente)
  favicon.svg             favicon vettoriale
  favicon-32.png          favicon 32 px
  favicon-16.png          favicon 16 px
js/main.js              avvio, router (hash), avvisi sui target, registrazione del service worker e controllo degli aggiornamenti (avviso "Aggiorna" anche con l'app aperta)
js/store.js             archivio locale (IndexedDB e memoria) e stato "dirty" per la sincronizzazione; `saveAuto` per i movimenti rigenerabili dei piani rateali
js/model.js             logica di dominio: totali, categorie, fondi, saldi, target, tag, debiti, pagamenti a rate, migrazioni
js/expr.js              parser degli importi con espressioni e formattazione dei numeri (it-IT)
js/sync.js              autenticazione Supabase, pull e push, gestione della frase segreta; senza connessione la sessione resta salvata
js/crypto.js            PBKDF2, AES-GCM, HMAC per gli id, conservazione delle chiavi
js/catstats.js          entrate/uscite per categoria (torta, percentuali, dettaglio con sottocategorie), torte per categoria di un tag; usato da Mese e Riepilogo. Si vede solo la torta: toccando il centro (`.donut-hit`, un solo ascolto sul documento) si apre l'elenco delle voci
js/charts.js            grafici SVG fatti a mano: barre, linea, aree impilate nel tempo (con selezione interattiva del punto), anello (si anima quando compare scorrendo la pagina)
js/ui.js                toast, finestre (dialog), conferme, tooltip, download, debounce
js/dialogs.js           finestre condivise: movimento (nuovo e modifica, con "Pagato a rate"), ripartizione su più fondi, trasferimento, correzione saldo, editor dei tag, movimento ricorrente, pagamento a rate (con i modelli precompilati), saldo del residuo e annullamento per reso
js/view-mese.js         pagina Mese: elenco e calendario (caselle colorate in base al saldo del giorno), ricerca, trasferimenti (righe con la stessa grafica dei movimenti, Da e A espliciti), avvisi, categorie in fondo. I movimenti sono di sola lettura: toccandone uno (elenco o calendario) si aprono le voci extra (tag, nota, duplica…), e solo la matita apre la finestra di modifica (`movDialog`), la stessa del "+ Aggiungi". Tenendo premuto su un movimento (circa 0,4 s) lo si trascina, ma solo tra quelli dello stesso giorno e dello stesso riquadro (entrate, uscite, giorno del calendario, «Senza giorno»); a fine trascinamento `ord` dei movimenti di quel giorno viene rinumerato (0, 1, 2…)
js/view-riepilogo.js    pagina Riepilogo: statistiche (medie al mese, risparmio), saldo accumulato interattivo, barre con tabella mensile o annuale espandibile, proiezione a fine anno, torte per categoria, confronto con l'anno prima (categorie a scomparsa), spese più grandi, tag, soldi buttati
js/view-patrimonio.js   pagina Patrimonio: saldi per fondo (in ordine decrescente), mesi di autonomia, andamento (interattivo, con intervallo di date personalizzabile), rilevazioni manuali e storiche
js/view-conti.js        pagina Fondi (configurazione) e dettaglio di un fondo con i suoi movimenti, trasferimenti e correzioni (route #conti, #conto/<id>)
js/view-debiti.js       pagina Debiti e crediti (con il riquadro del residuo delle rate, che porta a #rate)
js/view-rate.js         pagina Pagamenti a rate (elenco dei piani; la finestra di modifica è in dialogs.js)
js/view-ricorrenti.js   pagina Movimenti ricorrenti (elenco; la finestra di modifica è in dialogs.js)
js/view-altro.js        pagina Altro: sincronizzazione e cifratura, import/export (backup JSON, CSV di movimenti e patrimonio), movimenti ricorrenti, pagamenti a rate (impostazione "Conta gli acquisti a rate"), categorie e sottocategorie, tema, installazione come app, versione
js/demo.js              modalità demo: attivazione con ?demo, avviso in cima, dati di esempio generati da codice
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
| `#rate` | Pagamenti a rate (si apre da Debiti e da Altro) |
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
| `mov` | Movimento. `y, m, d` (giorno, `null` se ignoto), `tipo` (`in` oppure `out`), `val` (numero), `espr` (espressione, per esempio `=68-17-17`, oppure `null`), `desc`, `cat` (id categoria), `sub` (id sottocategoria, `null` se manca; vale solo se appartiene a `cat`), `catAuto`, `conti` (vedi sotto), `contoAuto`, `tags` (array), `note`, `escl` (escluso dai totali di entrate e uscite), `ord`. Facoltativi: `ricId` (generato da una ricorrenza), `rataId`, `rataN`, `rataRuolo` (generato da un piano rateale, vedi sotto) |
| `cat` | Categoria. `nome, tipo (in/out), colore, emoji, ord`. Le categorie predefinite hanno id stabili `cat-<chiave>` |
| `sub` | Sottocategoria di una categoria. `nome, cat (id della categoria), ord`. Le predefinite (per ora solo quelle di Shopping: Elettronica, Abbigliamento, Scarpe, Casa e arredamento, Sport, Altro) hanno id stabili `sub-<chiaveCategoria>-<chiave>` e si creano in `M.ensureSubcats()` (da `M.migrate()`) con `saveMissing` |
| `cont` | Fondo del patrimonio. `nome, gruppo, ord, archiviato, saldoIniziale, siEspr, obiettivo` (il target), `obEspr` |
| `snap` | Rilevazione del portafoglio: storica (importata dall'Excel) o manuale. `date, vals: { idFondo: { val, espr } }, note, scelta` (assente = storica; `auto` = solo confronto; `manuale` = i saldi ripartono dai valori rilevati) |
| `trasf` | Trasferimento tra fondi. `y, m, d, da, a, val, espr, note, ord` |
| `rett` | Correzione del saldo di un fondo. `date, c, delta, note, snapId` (`snapId` presente se l'ha creata una rilevazione manuale) |
| `debt` | Debito o credito. `tipo` (`credito` = mi devono, `debito` = devo), `persona, desc, val, espr, data, fondo, rimborsi: [{ data, val, espr, fondo }], note, ord` |
| `butt` | Voce di "soldi buttati". `y, espr, val, desc, ord` |
| `ric` | Movimento ricorrente. `tipo, desc, val, espr, cat, conti` (vuoto o un solo fondo), `sub` (facoltativa), `tags, note, escl, inizio` (prima scadenza, `AAAA-MM-GG`), `freq` (`sett`, `mese`, `anno`), `ogni` (ogni quante unità), `fine` (ultima scadenza o `null`), `da` (se presente, si generano solo scadenze successive), `ord` |
| `rate` | Piano rateale. `desc, cat, sub, tags`, `prezzo, prEspr` (prezzo del bene), `anticipo` (`{ val, espr, data, fondo }` oppure `null`; data e fondo mancanti = quelli dell'acquisto e delle rate), `nRate`, `importoRata, irEspr`, `ultimaRata, urEspr` (`null` = come le altre), `fondo` (da cui escono le rate), `creditore` (facoltativo), `dataAcquisto`, `primaScadenza`, `freq` e `ogni` (come nei ricorrenti), `modalita` (`acquisto` oppure `rate`; se manca vale l'impostazione generale), `chiuso`, `chiusura` (`{ tipo: 'saldo' \| 'reso', data, val, espr, fondo }` oppure `null`), `gen` (generazione dei movimenti automatici, se manca 1), `note`, `ord` |
| `cfg` | Record unico `cfg-patrimonio`. `inizio` (data di partenza del calcolo automatico, `AAAA-MM-GG`), `contoOut`, `contoIn` (fondi proposti), `modalitaRate` (impostazione generale dei pagamenti a rate: `acquisto`, predefinita, oppure `rate`) |

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
- **Confronti nel tempo** (Riepilogo di un anno, non in "Tutti gli anni"): `M.confrontoAnno(y, fino)` confronta entrate, uscite e ogni categoria con l'anno prima in percentuale (`M.variazione`; `null` se prima era zero). Per l'anno in corso si confronta lo stesso periodo, da gennaio al mese attuale compreso. Se l'anno prima non ha movimenti nel periodo il riquadro non compare. Per le uscite salire è rosso, per le entrate è verde. `M.proiezioneUscite()` stima le uscite a fine anno (solo anno in corso): uscite finora ÷ mesi trascorsi (a giorni) × 12; sotto un mese intero di dati non dà una stima.
- **Statistiche per tag**: la pagina di un tag (`#tag/<nome>`) mostra uscite ed entrate per categoria, con lo stesso dettaglio di Mese; nel Riepilogo toccando un tag si aprono le torte di uscite ed entrate per categoria del periodo (con un link ai suoi movimenti).
- **Target**: un fondo è "sotto il target" se `obiettivo − saldo > 0`. L'avviso compare in tre punti: un riquadro nella pagina Mese, un pallino sulla voce Patrimonio, un toast quando il fondo scende sotto la soglia.
- **Movimenti senza fondo** con data successiva alla partenza: vengono segnalati e non entrano nei saldi.
- **Suggerimenti automatici**: categoria e fondo sono proposti dalla scelta più frequente fatta per la stessa descrizione. Per la categoria, se non c'è uno storico, si usano delle regole testuali (`RULES` in `model.js`: id della categoria predefinita → parole della descrizione). Le regole usano solo parole generiche e marchi diffusi in tutta Italia, mai nomi che rivelino abitudini personali (la propria banca, l'azienda di autobus della propria città…). Il suggerimento si ferma quando l'utente sceglie a mano (`catAuto` o `contoAuto` diventano `false`).
- **Movimenti ricorrenti**: a ogni scadenza `M.generaRicorrenti()` crea un normale movimento (`mov`) con id fisso `mov-r-<idRicorrenza>-<AAAA-MM-GG>` e il campo `ricId`. Parte all'avvio, dopo ogni pull, quando la pagina torna visibile e ogni 10 minuti; recupera anche le scadenze perse ad app chiusa (un'app web non può scrivere in background). Il giorno 29–31 diventa l'ultimo giorno dei mesi più corti. I movimenti si creano con `store.saveMissing` (`updated_at = 1`, come `saveDefault`): se esistono già, anche eliminati, non vengono ricreati, e qualsiasi modifica fatta su un altro dispositivo vince. Modificare o eliminare una ricorrenza non tocca i movimenti già generati; cambiando `inizio`, `freq` o `ogni` si imposta `da` (ieri) per non rigenerare il passato a date diverse.
- **Pagamenti a rate** (`kind` `rate`, funzioni in `model.js`):
  - **Scadenze**: la rata `n` (da 1 a `nRate`) scade come la scadenza `n−1` di una ricorrenza che parte da `primaScadenza` (`M.rataDate`); vale `importoRata`, l'ultima `ultimaRata` se indicata. La prima scadenza può coincidere con la data di acquisto (PayPal "Paga in 3 rate"): allora la prima rata si genera subito.
  - **Costo del finanziamento** = anticipo + somma delle rate − prezzo (`M.costoFinanziamento`). Se è positivo sono interessi e commissioni; la quota di ogni rata è il costo ÷ `nRate` al centesimo, con la differenza sull'ultima (`M.quotaInteressi`). A costo zero la finestra propone `importoRata` = (prezzo − anticipo) ÷ `nRate` al centesimo e mette l'arrotondamento su `ultimaRata` (`M.rataSenzaInteressi`), finché non la scrivi a mano.
  - **Movimenti generati** (`M.generaRate()`, che parte insieme a `M.generaRicorrenti()`: all'avvio, dopo ogni pull, quando la pagina torna visibile e ogni 10 minuti, recuperando le scadenze perse): id fissi `mov-rata-<idPiano>-<n>` (`0` = anticipo), `…-<n>-int` (interessi), `…-acquisto`, con `rataId`, `rataN` e `rataRuolo` (`acquisto`, `anticipo`, `rata`, `interessi`, `saldo`, `reso`).
    - Modalità `acquisto`: alla data di acquisto un'uscita del prezzo nella categoria del piano, senza fondo (non tocca i saldi e non è segnalata come senza fondo, `M.fondoNonServe`); anticipo e rate escono dal fondo con `escl` (muovono il saldo ma non contano nei totali), tranne la quota di interessi di ogni rata, che è un'uscita normale dallo stesso fondo nella categoria predefinita "Interessi e commissioni" (`cat-interessi-commissioni`, creata con `saveDefault` la prima volta che serve; se eliminata si usa "Altro"). Il fondo si muove in tutto dell'importo della rata.
    - Modalità `rate`: anticipo e rate sono uscite normali nella categoria del piano, dal fondo. Niente uscita all'acquisto.
  - **Movimenti rigenerabili**: si scrivono con `store.saveAuto`, con `updated_at` = `gen` del piano (un numero piccolo, sotto `store.AUTO_TS`). Se il movimento esiste già (anche eliminato) con un `updated_at` pari o più grande non viene toccato: le modifiche e le eliminazioni fatte a mano (timestamp veri) vincono sempre, anche sugli altri dispositivi. Modificare o eliminare un piano non tocca i movimenti già generati. Cambiare modalità a un piano (dal piano stesso, `M.cambiaModalitaPiano`) o chiuderlo aumenta `gen`: i movimenti automatici non toccati a mano si rifanno (o si eliminano, se nella nuova situazione non servono). Cambiare l'impostazione generale vale solo per i nuovi piani, che salvano sempre la loro `modalita`.
  - **Residuo** (`M.statoPiano`, `M.rateTotali`): la somma delle rate (e dell'anticipo) non ancora scadute dei piani aperti con acquisto già fatto. Si sottrae nel patrimonio netto come i debiti, senza creare record `debt`.
  - **Salda il residuo** (`M.saldaPiano`): pagamento finale dal fondo alla data scelta (oggi o prima), con importo proposto = residuo a quella data; il piano si chiude e non genera più rate. In modalità `acquisto` la parte che supera il capitale ancora da restituire (prezzo − anticipo − capitale delle rate pagate) va in "Interessi e commissioni", il resto esce con `escl`; in modalità `rate` è un'uscita normale nella categoria del piano.
  - **Annulla per reso** (`M.resoPiano`): chiude il piano e alla data scelta registra sul fondo il rimborso, proposto = quanto pagato finora (modificabile per i resi parziali). In modalità `acquisto` è un'entrata con `escl` e l'uscita del prezzo si riduce a capitale pagato − rimborso (si elimina se arriva a zero); in modalità `rate` è un'entrata normale nella stessa categoria del piano (una categoria di uscita: la finestra del movimento la mostra comunque).
  - **Riapri** (`M.riapriPiano`, anche "Annulla" nel toast della chiusura): toglie i movimenti della chiusura, ricrea l'uscita del prezzo dopo un reso e riprende a generare le rate.
  - **Avvisi**: nella pagina Mese le rate dei piani aperti in scadenza da oggi ai prossimi 7 giorni (`M.rateInScadenza`); in Debiti un riquadro con il residuo totale.
  - **Interfaccia**: modelli precompilati "PayPal 3 rate" (3 rate mensili, la prima alla data di acquisto, senza interessi, creditore PayPal), "PayPal 6/12/24 rate" (prima rata un mese dopo, importo da inserire) e "Personalizzato". Nella finestra del movimento, per le uscite, "Pagato a rate…" apre un piano con i dati già inseriti e il modello PayPal 3 rate: salvando il piano il movimento non viene creato (o viene eliminato, se esisteva) perché i movimenti li genera il piano.
- **Patrimonio con debiti**: il patrimonio "netto" è il totale dei fondi + i crediti residui − i debiti residui − il residuo dei pagamenti a rate.
- **Mesi di autonomia** (Patrimonio): patrimonio netto ÷ uscite medie mensili (`M.autonomia`). La media (`M.usciteMedie`) usa gli ultimi 12 mesi conclusi, contando solo quelli con almeno un movimento; il mese in corso non conta. Senza uscite il dato non compare; da 24 mesi in su si indicano anche gli anni.

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

**Senza connessione**: lo stato diventa "offline" e le modifiche restano sul dispositivo. Il token si rinnova una volta sola alla volta e la sessione si elimina solo se il server rifiuta davvero il token (400, 401, 403): un errore di rete non chiede di accedere di nuovo.

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

## Modalità demo (`demo.js`)

Serve a far provare l'app ad altre persone senza toccare i dati veri.

- **Attivazione**: si apre l'app con `?demo` nell'indirizzo (per esempio `https://…/?demo`). La scelta resta sul dispositivo (`localStorage`, chiave `contabilita.demo`), così anche l'app installata dalla pagina demo riparte in demo. Il link normale resta invariato. `demo.attiva` dice se la demo è attiva.
- **Isolamento**: in demo `store.init()` apre il database `contabilita-demo` al posto di `contabilita`. Il database vero e `contabilita-keys` non vengono mai aperti.
- **Niente sincronizzazione**: `main.js` non chiama `sync.start()`, e in `sync.js` `config()` e `session()` restituiscono `null`, le chiamate di rete lanciano un errore e le funzioni che scrivono le impostazioni non fanno nulla. In Altro, al posto di sincronizzazione e cifratura, c'è un breve messaggio.
- **Dati di esempio**: al primo avvio (archivio della demo vuoto) `demo.prepara()` carica i record di `demo.genera(oggi)` con `store.importRecords`. Sono inventati, con nomi generici, deterministici (numeri pseudo-casuali con seme fisso) e con date relative a oggi: movimenti con giorno e fondo da gennaio dell'anno scorso a oggi (così confronto con l'anno prima e proiezione hanno un anno intero), 5 fondi con saldi iniziali e data di partenza, un target (sul conto deposito, poco sopra il saldo di oggi), trasferimenti, il tag "Vacanza a Lisbona", tre debiti e crediti con rimborsi, due movimenti ricorrenti (i loro movimenti li crea `M.generaRicorrenti()`), due pagamenti a rate (una lavatrice con anticipo e interessi, contata all'acquisto, e uno smartphone in 3 rate a tasso zero con PayPal, contato rata per rata, con la prossima rata entro una settimana; i movimenti li crea `M.generaRate()`), una rilevazione manuale (con `M.salvaRilevazione`), due rilevazioni storiche e alcune voci di soldi buttati. Categorie e sottocategorie in più hanno id `cat-demo-…` e `sub-demo-…`. Poi `main.js` esegue `M.migrate()` come sempre.
- **Avviso**: una barra sempre visibile in cima ("Versione demo: i dati sono di esempio") con "Ricomincia" (con conferma: chiude e cancella `contabilita-demo` e ricarica, così i dati di esempio ripartono da capo) ed "Esci dalla demo" (toglie la scelta e `?demo` dall'indirizzo e ricarica l'app normale; l'archivio della demo resta sul dispositivo).
- **Aggiornamenti**: la demo usa gli stessi file dell'app normale (stesso indirizzo, stesso service worker), quindi ogni modifica pubblicata su `main` arriva anche alla demo, con lo stesso avviso "Aggiorna". In più i dati di esempio si rigenerano a ogni nuova versione: all'avvio, prima di aprire l'archivio, `demo.controllaVersione()` chiede al service worker che ha servito la pagina il suo `VERSION` e lo confronta con quello dei dati (`localStorage`, chiave `contabilita.demo.dati`). Se è diverso svuota `contabilita-demo`, `prepara()` rigenera i dati con il codice nuovo e un toast lo spiega; le modifiche fatte nella demo si perdono. Se i dati sono stati generati prima che il service worker fosse attivo (valore `?`), si registra solo la versione, senza rigenerare.
- **Ogni nuova funzione va mostrata anche nella demo**: se aggiungi una funzione che ha bisogno di dati (un nuovo `kind`, un nuovo campo, una nuova pagina) o cambi il modello dei dati, aggiorna anche `demo.genera()` (o `demo.prepara()`, se servono le funzioni del modello) e prova la demo da zero con Ricomincia. Basta aumentare `VERSION`, come a ogni rilascio, perché chi ha già la demo riceva i dati nuovi.

## Interfaccia

**Stile minimale e monocromatico**. Il colore ha sempre un significato: verde per le entrate (`--in`), rosso per le uscite (`--out`), ambra per gli avvisi (`--warn`), blu per il saldo dei fondi (`--saldo`), viola per i soldi buttati (`--butt`). Il saldo di un periodo ha un colore dinamico (`saldoCls` in `expr.js`): verde se positivo (`--sal-pos`), un rosso diverso da quello delle uscite se negativo (`--sal-neg`), neutro se zero. I gruppi dei fondi hanno i loro colori (`--g-<gruppo>`).

**Layout e temi**:
- Le variabili CSS sono definite in `:root`, con il tema scuro tramite `prefers-color-scheme` oppure `data-theme`.
- Desktop: barra laterale sopra i 900 px. Telefono: barra in basso.
- Le righe dei movimenti cambiano disposizione con una container query sulla larghezza del riquadro (`container: ledger`), non dello schermo.
- Font di sistema e numeri tabellari (`tabular-nums`).
- Il colore della barra del browser (`meta theme-color`) segue il tema scelto (`applyTheme` in `view-altro.js`); `theme_color` e `background_color` del manifest (`#17181c`, il fondo del logo) valgono solo per la schermata di avvio dell'app installata.

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
6. **Usa le API dello store** (`save`, `patch`, `remove`, `saveDefault`, `saveMissing`, `saveAuto`). I record predefiniti usano `saveDefault`, che li crea con `updated_at = 1`, così qualsiasi versione già presente su un altro dispositivo vince.
7. **Testi in italiano**, chiari e senza gergo tecnico. Pulsanti e messaggi brevi.
8. **Prova su telefono e desktop**: almeno 390 px e 1360 px di larghezza, e il tema scuro se tocchi lo stile.
9. **Mai dati personali nel repository**: è pubblico. Niente storico, backup, file Excel o chiavi, e niente nomi che rivelino abitudini personali (fondi, banche, persone, servizi locali), nemmeno nelle regole dei suggerimenti o nei dati della demo.
10. **Non rinominare i nomi interni** `contabilita` (database, chiavi di `localStorage`, `VERSION`, formato dei backup, `start_url`, `scope`): vedi "Nome e nomi interni" in alto.
11. **Aggiorna la demo** insieme all'app: vedi "Modalità demo".

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
- Export in `.xlsx` vero, al posto del CSV.
- Budget mensili per categoria.
