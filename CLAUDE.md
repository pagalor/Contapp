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
js/main.js              avvio, router (hash), avvisi sui target e sui budget, registrazione del service worker e controllo degli aggiornamenti (avviso "Aggiorna" anche con l'app aperta)
js/store.js             archivio locale (IndexedDB e memoria) e stato "dirty" per la sincronizzazione; `saveAuto` per i movimenti rigenerabili dei piani rateali
js/model.js             logica di dominio: totali, categorie, fondi, saldi, target, tag, debiti, pagamenti a rate, migrazioni
js/expr.js              parser degli importi con espressioni e formattazione dei numeri (it-IT)
js/sync.js              autenticazione Supabase, pull e push, gestione della frase segreta; senza connessione la sessione resta salvata
js/crypto.js            PBKDF2, AES-GCM, HMAC per gli id, conservazione delle chiavi
js/catstats.js          entrate/uscite per categoria (torta, percentuali, dettaglio con sottocategorie), torte per categoria di un tag; usato da Mese e Riepilogo. Si vede solo la torta: toccando il centro (`.donut-hit`, un solo ascolto sul documento) si apre l'elenco delle voci
js/charts.js            grafici SVG fatti a mano: barre, linea, aree impilate nel tempo (con selezione interattiva del punto), anello (si anima quando compare scorrendo la pagina)
js/datepick.js           scelta di date, mesi e anni: calendari (`dayPicker`, `monthPicker`, `yearPicker`) e campi (`dateInput`, `monthInput`, `yearInput`, `setPick`), usati in tutta l'app al posto dei selettori del browser
js/ui.js                toast (con pulsante d'azione), finestre (`modal`, `confirmBox`, `promptBox`), tooltip dei grafici (`data-tip`), download, debounce
js/dialogs.js           finestre condivise: movimento (nuovo e modifica, con "Pagato a rate" e la scelta della data con `dayPicker` di datepick.js), ripartizione su più fondi, trasferimento, correzione saldo, editor dei tag, movimento ricorrente, pagamento a rate (con i modelli precompilati), saldo del residuo e annullamento per reso; `bindAmount` (campo importo con espressioni) usato anche da Budget
js/view-mese.js         pagina Mese: elenco (entrate e uscite in due riquadri separati o in un unico elenco ordinato per data, scelta ricordata sul dispositivo) e calendario (caselle colorate in base al saldo del giorno), ricerca, trasferimenti (righe con la stessa grafica dei movimenti, Da e A espliciti), avvisi, categorie in fondo. I movimenti sono di sola lettura: toccandone uno (elenco o calendario) si aprono le voci extra (tag, nota, duplica…), e solo la matita apre la finestra di modifica (`movDialog`), la stessa del "+ Aggiungi". Tenendo premuto su un movimento (circa 0,4 s) lo si trascina, ma solo tra quelli dello stesso giorno e dello stesso riquadro (entrate, uscite, giorno del calendario, «Senza giorno»); a fine trascinamento `ord` dei movimenti di quel giorno viene rinumerato (0, 1, 2…)
js/view-riepilogo.js    pagina Riepilogo: statistiche (medie al mese, risparmio), saldo accumulato interattivo, barre con tabella mensile o annuale espandibile, proiezione a fine anno, torte per categoria, confronto con l'anno prima (categorie a scomparsa), spese più grandi, tag, soldi buttati
js/view-patrimonio.js   pagina Patrimonio: saldi per fondo (in ordine decrescente), mesi di autonomia, andamento (interattivo, con intervallo di date personalizzabile), rilevazioni manuali e storiche; contiene anche la finestra della rilevazione manuale (`snapDialog`) e i formati di data `fmtDate`/`fmtDateShort`
js/view-conti.js        pagina Fondi (configurazione) e dettaglio di un fondo con i suoi movimenti, trasferimenti e correzioni (route #conti, #conto/<id>)
js/view-debiti.js       pagina Debiti e crediti (con il riquadro del residuo delle rate, che porta a #rate); contiene anche la finestra di un debito o credito con i rimborsi
js/view-rate.js         pagina Pagamenti a rate (elenco dei piani; la finestra di modifica è in dialogs.js)
js/view-ricorrenti.js   pagina Movimenti ricorrenti (elenco; la finestra di modifica è in dialogs.js)
js/view-budget.js       pagina Budget (elenco, finestra per creare e modificare `budgetDialog`, con la mediana mensile proposta)
js/budgetui.js          riga con barra di un budget (speso, disponibile, segno del periodo, elenco dei movimenti), condivisa da Mese e Budget
js/view-altro.js        pagina Altro: sincronizzazione e cifratura, import/export (backup JSON, CSV di movimenti e patrimonio), movimenti ricorrenti, budget, pagamenti a rate (impostazione "Conta gli acquisti a rate"), categorie e sottocategorie, tema, installazione come app, versione
js/demo.js              modalità demo: attivazione con ?demo, avviso in cima, dati di esempio generati da codice
supabase.sql            tabella, permessi, RLS e trigger da eseguire una volta su Supabase
```

**Route** (il router è in `main.js`, funzione `route()`; un hash vuoto o sconosciuto apre Mese del mese attuale):

| Hash | Pagina | Voce evidenziata nella navigazione | Titolo della scheda |
| --- | --- | --- | --- |
| `#mese[/AAAA-MM[/idDaEvidenziare]]` | Mese (senza data: il mese attuale; con l'id il movimento lampeggia e, se si era nel calendario, si torna all'elenco) | Mese | Mese |
| `#cerca/<testo>` | Mese con la ricerca già compilata (cerca in tutti i movimenti) | Mese | Cerca |
| `#tag/<nome>` | Mese con la ricerca `#nome`: movimenti con quel tag, con uscite ed entrate per categoria | Mese | Tag |
| `#riepilogo[/<anno o tutto>]` | Riepilogo (senza anno: l'anno attuale, o l'ultimo che ha movimenti) | Riepilogo | Riepilogo |
| `#patrimonio` | Patrimonio | Patrimonio | Patrimonio |
| `#conti` | Fondi (configurazione) | Patrimonio | Fondi |
| `#conto/<id>` | Dettaglio di un fondo | Patrimonio | Fondo |
| `#debiti` | Debiti e crediti | Debiti | Debiti e crediti |
| `#rate` | Pagamenti a rate (si apre da Debiti e da Altro) | Debiti | Pagamenti a rate |
| `#ricorrenti` | Movimenti ricorrenti (si apre da Altro) | Altro | Movimenti ricorrenti |
| `#budget` | Budget di spesa (si apre da Altro) | Altro | Budget |
| `#altro` | Altro | Altro | Altro |

Il titolo della scheda è «<titolo> · Rationes» (con «(demo)» in modalità demo). A ogni cambio di pagina si torna in cima.

**Navigazione**: cinque voci, nell'ordine **Mese, Riepilogo, Patrimonio, Debiti, Altro** (`index.html`). Sopra i 900 px sono una barra laterale a sinistra con il logo e il nome; sotto, una barra in basso con icona e testo. Due pallini sulle voci: sul **Patrimonio** un pallino ambra quando almeno un fondo è sotto il target (il suo `title` elenca quanto manca a ciascuno); su **Altro** il pallino della sincronizzazione (`#sync-ind`, stato in `data-state` con il messaggio nel `title`): nascosto se la sincronizzazione non è configurata o non si è entrati (`off`), poi `ok` (verde), `pending` e `syncing` (modifiche da inviare o invio in corso), `locked` (ambra: manca la frase segreta), `offline`, `error` (rosso).

**Preferenze solo di questo dispositivo** (`localStorage`, mai sincronizzate; ogni accesso è in `try/catch`):

| Chiave | Cosa ricorda |
| --- | --- |
| `contabilita.meseView` | Mese: `lista` (predefinito) o `cal` (calendario) |
| `contabilita.meseElenco` | Mese, vista Elenco: `split` (predefinito, entrate e uscite in due riquadri) o `all` (un solo elenco ordinato per data) |
| `contabilita.riepilogo-periodo` | Riepilogo «Tutti gli anni»: intervallo `{ from, to }` in `AAAA-MM` |
| `contabilita.patrimonio-periodo` | Patrimonio, grafico Andamento: intervallo `{ from, to }` in `AAAA-MM-GG` |
| `contabilita.debitiFiltro` | Debiti: `aperti` (predefinito), `saldati` o `tutti` |
| `contabilita.theme` | Tema: `auto`, `light`, `dark` |
| `contabilita.demo`, `contabilita.demo.dati` | Modalità demo (vedi sotto) |
| `contabilita.sync.cfg`, `.session`, `.lastPull`, `.lastOk`, `.prevUser` | Configurazione Supabase, sessione e ultimi esiti della sincronizzazione |

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
| `budg` | Budget di spesa. `su` (`cat`, `sub`, `tag` oppure `tot` = tutte le uscite del mese), `rif` (id della categoria o sottocategoria, nome del tag; `null` per `tot`), `val`, `espr` (importo in vigore adesso), `periodo` (`mese` o `anno`; `tot` è solo mensile), `riporto` (`true`/`false`, predefinito `false`), `valori: [{ da (AAAA-MM), val, espr }]` (ogni modifica dell'importo, vedi sotto), `ord` |
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
- **Target**: un fondo è "sotto il target" se `obiettivo − saldo > 0` (`M.sottoTarget`). L'avviso compare in tre punti: un riquadro ambra nella pagina Mese (con un pulsante per fondo che apre il trasferimento per reintegrare), un pallino sulla voce Patrimonio, un toast quando il fondo scende sotto la soglia (con «Vedi», che apre il fondo). Al primo controllo dopo l'avvio si prende solo nota dello stato, senza toast. Con il calcolo automatico spento non c'è nessun target. È "oltre il target" se `saldo − obiettivo > 0` (`M.oltreTarget`): solo un riquadro verde nella pagina Mese, con un link per fondo; niente pallino né toast.
- **Movimenti senza fondo** con data successiva alla partenza (`M.senzaConto`): vengono segnalati e non entrano nei saldi. La segnalazione compare in tre punti: nella riga del movimento («Scegli il fondo»), in un riquadro nella pagina Mese (solo per i movimenti del mese mostrato e non durante la ricerca) e in un elenco a scomparsa nel Patrimonio (i primi 30). Non sono segnalati i movimenti senza importo né quelli che non servono un fondo (`M.fondoNonServe`: l'uscita «Acquisto a rate» del prezzo, che nella riga dice «A rate»).
- **Andamento del patrimonio** (`M.serieAuto`): un punto alla data di partenza, uno per ogni fine mese successiva e uno per oggi. Le rilevazioni (`snap`) con data precedente alla partenza (tutte, se il calcolo automatico è spento) completano il grafico per il periodo prima; da quel giorno in poi contano solo i saldi calcolati. Le fasce del grafico sono i gruppi dei fondi (`--g-<gruppo>`). Il grafico compare con almeno due punti; il pulsante «Trasferimento» solo con il calcolo automatico attivo.
- **Ricerca** (campo in cima a Mese): parte da 2 caratteri e cerca in tutti i movimenti, non solo nel mese. Un testo che comincia con `#` cerca il tag esatto (senza distinguere maiuscole); altrimenti cerca nella descrizione, nella nota, nel nome di categoria e sottocategoria, nei tag, nei nomi dei fondi e nell'importo (virgola o punto). I risultati vanno dal più recente, al massimo 400; toccandone uno si apre il mese con il movimento evidenziato. Dalla ricerca si può aggiungere un tag a tutti i risultati. Le route `#cerca/…` e `#tag/…` sono la stessa pagina con il campo già compilato.
- **Movimenti: duplicare, spostare, rendere ricorrenti**: «Duplica» e «Salva e duplica» creano un movimento normale (`M.copiaMov`: senza `ricId`, `rataId`, `rataN`, `rataRuolo`) con `ord` = adesso. Per spostare un movimento in un altro mese si apre la finestra di modifica e si cambia la data (calendario con le frecce): cambiano `y`, `m` e `d` insieme, e dopo il salvataggio un toast con «Vai» apre il nuovo mese; «Senza giorno» lascia `d` a `null` nel mese mostrato. «Rendi ricorrente» precompila una ricorrenza mensile dallo stesso movimento (`ricSeedFromMov`), con la prima ripetizione il mese dopo; non è offerto ai movimenti già generati da una ricorrenza o da un piano né a quelli senza importo.
- **Calendario del mese**: ogni giorno somma entrate e uscite che contano (non `escl`); lo sfondo della casella è verde se il saldo del giorno è positivo, rosso se negativo, con intensità proporzionale al saldo più alto in valore assoluto del mese; il saldo si scrive nella casella solo se quel giorno ci sono sia entrate sia uscite. Su telefono gli importi sono abbreviati (da 100 € senza decimali, da 1.000 € in «k»). I movimenti senza giorno stanno nel riquadro «Senza giorno». Entrando in un mese diverso dall'attuale non c'è nessun giorno selezionato; nel mese attuale è selezionato oggi.
- **Numeri del Riepilogo**: le medie al mese dividono per i soli mesi con almeno un movimento; «Risparmio» è saldo ÷ entrate (– se non ci sono entrate); «Saldo accumulato» somma i saldi mese dopo mese (solo i mesi con movimenti); «Le spese più grandi» sono le 10 uscite maggiori del periodo (esclusi gli `escl`). «Soldi buttati» è registrato per anno: in «Tutti gli anni» con un intervallo di date contano solo gli anni compresi per intero. L'intervallo di «Tutti gli anni» (Dal/Al, mesi) si ricorda sul dispositivo; se Dal è dopo Al vengono scambiati.
- **Regole dei suggerimenti**: `RULES` (categoria) e `SUB_RULES` (sottocategoria) in `model.js` usano solo parole generiche e marchi diffusi in tutta Italia. Le categorie predefinite sono: uscite Ristoranti e bar, Spesa, Trasporti, Viaggi, Svago e sport, Shopping, Regali, Abbonamenti digitali, Telefonia, Cura personale e salute, Istruzione, Tasse e burocrazia, Altro; entrate Famiglia, Interessi, Regali ricevuti, Vendite, Vincite, Rimborsi, Altro. Si creano al primo avvio senza categorie (`M.ensureCategories`); «Interessi e commissioni» si crea solo quando serve a un piano rateale.
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
  - **Annulla per reso** (`M.resoPiano`): chiude il piano e alla data scelta registra sul fondo il rimborso, proposto = quanto pagato finora (modificabile per i resi parziali). In modalità `acquisto` è un'entrata con `escl` e l'uscita del prezzo si riduce a capitale pagato − rimborso (si elimina se arriva a zero); in modalità `rate` è un'entrata normale nella stessa categoria del piano (una categoria di uscita: la finestra del movimento la mostra comunque; nei budget riduce la spesa).
  - **Riapri** (`M.riapriPiano`, anche "Annulla" nel toast della chiusura): toglie i movimenti della chiusura, ricrea l'uscita del prezzo dopo un reso e riprende a generare le rate.
  - **Avvisi**: nella pagina Mese le rate dei piani aperti in scadenza da oggi ai prossimi 7 giorni (`M.rateInScadenza`); in Debiti un riquadro con il residuo totale.
  - **Interfaccia**: modelli precompilati "PayPal 3 rate" (3 rate mensili, la prima alla data di acquisto, senza interessi, creditore PayPal), "PayPal 6/12/24 rate" (prima rata un mese dopo, importo da inserire) e "Personalizzato". Nella finestra del movimento, per le uscite, "Pagato a rate…" apre un piano con i dati già inseriti e il modello PayPal 3 rate: salvando il piano il movimento non viene creato (o viene eliminato, se esisteva) perché i movimenti li genera il piano.
- **Budget di spesa** (`M.budgetStato` e funzioni vicine, in `model.js`):
  - *Cosa conta*: le uscite del periodo che rientrano nel budget, con le stesse regole dei totali (`counts`: niente `escl`, niente movimenti senza importo; trasferimenti, correzioni e debiti non sono mai uscite). Un movimento senza giorno vale per il suo mese. Un budget su una categoria include tutte le sue sottocategorie; uno su una sottocategoria conta solo i movimenti con quella `sub`; un tag si confronta senza distinguere maiuscole. Pagamenti a rate: contano secondo la modalità del piano ("all'acquisto": il prezzo nel mese d'acquisto e gli interessi, non le rate di capitale, che hanno `escl`; "rata per rata": ogni rata nel suo mese). Il rimborso di un reso in modalità "rata per rata" (entrata con `rataRuolo` `reso`, `M.rimborsoReso`) si sottrae dalla spesa del periodo in cui arriva (`M.valBudget`), che non scende mai sotto zero.
  - *Importo nel tempo*: `val`/`espr` sono sempre l'ultimo importo; `valori` li conserva tutti. Una modifica vale **da un mese in poi** (`M.budgetConValore`) e i mesi prima restano valutati con l'importo di allora. La prima voce di `valori` è anche l'inizio del budget: prima di quel mese non si valuta niente. Un budget senza `valori` (o con `da` vuoto) vale da sempre. Per i budget annuali la modifica vale per l'anno intero (conta l'importo in vigore a dicembre) e `da` è sempre gennaio.
  - *Riporto*: se `riporto` è attivo, l'avanzo (o lo sforamento, che diventa negativo) del periodo prima si somma al disponibile del successivo, a catena dall'inizio del budget. Per i budget annuali il riporto passa da un anno all'altro.
  - *Disponibile e stato*: disponibile = importo + riporto. Stato (`budgetStato`): `sforato` se speso > disponibile; solo per il periodo in corso, `vicino` se ha usato almeno l'80% (`BUDGET_SOGLIA`), `ritmo` se la % usata supera di oltre 15 punti la % di periodo trascorsa (a giorni) e ha già usato almeno il 25%; altrimenti `ok`. I periodi conclusi sono solo rispettati o sforati. `inLinea` = disponibile × periodo trascorso: quanto sarebbe "in linea" a oggi (si mostra per i budget annuali).
  - *Colori*: ambra per `ritmo` e `vicino` (`--bud-warn`), ambra più intensa con la parte oltre il limite tratteggiata e «Sforato di X» per `sforato` (`--bud-over`). Mai il rosso, che nell'app indica le uscite. Il segno sulla barra è il punto del periodo.
  - *Avvisi*: `checkBudgets` in `main.js`, come per i target: un toast quando un budget del periodo in corso passa a `vicino` o a `sforato`. Al primo controllo si prende solo nota dello stato.
  - *Mese*: riquadro «Budget» con una barra per ogni budget (anche per mesi passati o futuri); toccandolo si apre l'elenco dei movimenti che lo compongono. Un budget annuale mostra l'anno intero.
  - *Riepilogo*: per ogni budget, in quanti periodi conclusi del periodo mostrato è stato rispettato e lo scostamento medio tra speso e disponibile (`M.budgetRiepilogo`). Contano solo i periodi con almeno un movimento.
  - *Proposta alla creazione*: `M.medianaMensile` = spesa mediana (in euro interi) degli ultimi 12 mesi conclusi con movimenti; per un budget annuale si propone la mediana × 12.
  - Un budget su una categoria o sottocategoria eliminata resta nell'elenco della pagina Budget (da modificare o eliminare) ma non compare in Mese, Riepilogo e avvisi. Esiste al massimo un budget `tot`.
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
- **Dati di esempio**: al primo avvio (archivio della demo vuoto) `demo.prepara()` carica i record di `demo.genera(oggi)` con `store.importRecords`. Sono inventati, con nomi generici, deterministici (numeri pseudo-casuali con seme fisso) e con date relative a oggi: movimenti con giorno e fondo da gennaio dell'anno scorso a oggi (così confronto con l'anno prima e proiezione hanno un anno intero), 5 fondi con saldi iniziali e data di partenza più un fondo archiviato senza saldo, due target (sul conto deposito, poco sopra il saldo di oggi: «sotto il target»; sul conto corrente, qualche centinaio di euro sotto il saldo: «oltre il target»), trasferimenti, due movimenti senza fondo e uno senza giorno nel mese corrente (per vedere le segnalazioni e «Senza giorno»), il tag "Vacanza a Lisbona", tre debiti e crediti con rimborsi, tre movimenti ricorrenti (due attivi e un abbonamento terminato; i loro movimenti li crea `M.generaRicorrenti()`), quattro pagamenti a rate (una lavatrice con anticipo e interessi, contata all'acquisto, e uno smartphone in 3 rate a tasso zero con PayPal, contato rata per rata, con la prossima rata entro una settimana; poi due già conclusi: delle cuffie con tutte le rate pagate e un monitor annullato per reso da `prepara()` con `M.resoPiano`; i movimenti li crea `M.generaRate()`), sei budget (`preparaBudget()`: Ristoranti, che questo mese risulta sforato perché da questo mese l'importo scende sotto la spesa già fatta, Spesa con riporto, Viaggi annuale, Trasporti «vicino al limite», Tutte le uscite con importo tarato sul «ritmo troppo veloce» e Svago che parte il mese prossimo, quindi «Parte da…»; gli importi si calcolano sui dati di oggi, e il «ritmo» si vede solo nella prima metà del mese, quando la quota usata può superare di 25 punti quella del mese trascorso), una rilevazione manuale (con `M.salvaRilevazione`), due rilevazioni storiche e alcune voci di soldi buttati. Categorie e sottocategorie in più hanno id `cat-demo-…` e `sub-demo-…`. Poi `main.js` esegue `M.migrate()` come sempre.
- **Avviso**: una barra sempre visibile in cima ("Versione demo: i dati sono di esempio") con "Ricomincia" (con conferma: chiude e cancella `contabilita-demo` e ricarica, così i dati di esempio ripartono da capo) ed "Esci dalla demo" (toglie la scelta e `?demo` dall'indirizzo e ricarica l'app normale; l'archivio della demo resta sul dispositivo).
- **Aggiornamenti**: la demo usa gli stessi file dell'app normale (stesso indirizzo, stesso service worker), quindi ogni modifica pubblicata su `main` arriva anche alla demo, con lo stesso avviso "Aggiorna". In più i dati di esempio si rigenerano a ogni nuova versione: all'avvio, prima di aprire l'archivio, `demo.controllaVersione()` chiede al service worker che ha servito la pagina il suo `VERSION` e lo confronta con quello dei dati (`localStorage`, chiave `contabilita.demo.dati`). Se è diverso svuota `contabilita-demo`, `prepara()` rigenera i dati con il codice nuovo e un toast lo spiega; le modifiche fatte nella demo si perdono. Se i dati sono stati generati prima che il service worker fosse attivo (valore `?`), si registra solo la versione, senza rigenerare.
- **Ogni nuova funzione va mostrata anche nella demo**: se aggiungi una funzione che ha bisogno di dati (un nuovo `kind`, un nuovo campo, una nuova pagina) o cambi il modello dei dati, aggiorna anche `demo.genera()` (o `demo.prepara()`, se servono le funzioni del modello) e prova la demo da zero con Ricomincia. Basta aumentare `VERSION`, come a ogni rilascio, perché chi ha già la demo riceva i dati nuovi.

## Interfaccia

**Ordine entrate e uscite**: ovunque le entrate vengono sempre prima delle uscite (totali, colonne, riquadri, pulsanti di scelta del tipo, categorie, caselle del calendario). Fa eccezione solo la finestra «Debito o credito» (Mi deve / Devo), che non è un tipo di movimento.

**Stile minimale e monocromatico**. Il colore ha sempre un significato: verde per le entrate (`--in`), rosso per le uscite (`--out`), ambra per gli avvisi (`--warn`), blu per il saldo dei fondi (`--saldo`), viola per i soldi buttati (`--butt`). Il saldo di un periodo ha un colore dinamico (`saldoCls` in `expr.js`): verde se positivo (`--sal-pos`), un rosso diverso da quello delle uscite se negativo (`--sal-neg`), neutro se zero. I gruppi dei fondi hanno i loro colori (`--g-<gruppo>`). I budget usano tre grigi/ambra propri: `--bud-ok` (grigio), `--bud-warn` (ambra: ritmo troppo veloce e vicino al limite), `--bud-over` (ambra intenso: sforato), mai il rosso. Gli avvisi usano `--warn` su `--warn-bg`; gli indicatori positivi/negativi `--pos`/`--neg`.

**Layout e temi**:
- Le variabili CSS sono definite in `:root`, con il tema scuro tramite `prefers-color-scheme` oppure `data-theme` (`light`/`dark`, scelto in Altro → Aspetto; con «Come il sistema» l'attributo manca).
- Desktop: barra laterale sopra i 900 px. Telefono: barra in basso.
- Punti di rottura usati: 900 px (barra laterale), 1000 px e 1200 px (colonne affiancate: `.two`, `.three`), 760 px (torta fissa accanto alle voci quando è aperta), 560 px e 520 px (telefono: barra degli strumenti in colonna, righe compatte), `pointer: coarse` (bersagli da 44 px), `prefers-reduced-motion` (niente animazioni).
- Le righe dei movimenti cambiano disposizione con una container query sulla larghezza del riquadro (`container: ledger`), non dello schermo.
- Font di sistema e numeri tabellari (`tabular-nums`).
- Il colore della barra del browser (`meta theme-color`) segue il tema scelto (`applyTheme` in `view-altro.js`); `theme_color` e `background_color` del manifest (`#17181c`, il fondo del logo) valgono solo per la schermata di avvio dell'app installata.

**Date, mesi e anni**: non si usano mai i selettori del browser (`<input type="date">`, `type="month"`): dove serve una data c'è un pulsante che mostra il valore («12 novembre 2026», «Novembre 2026», «2026») e apre il calendario di `datepick.js`, sempre uguale: per le date i giorni del mese con le frecce ‹ › per cambiare mese e, dove la data si può togliere, un pulsante come «Senza giorno» o «Nessuna data»; per i mesi dodici mesi con le frecce per cambiare anno; per gli anni dodici anni per volta. Si scrive nella pagina con `dateInput`, `monthInput` o `yearInput` (un input nascosto con il valore `AAAA-MM-GG`, `AAAA-MM` o `AAAA`, più il pulsante) e si legge come un input normale: l'input nascosto lancia `input` e `change` quando si sceglie. Dal codice il valore si cambia con `setPick(input, valore)`, non con `.value =` (il pulsante non si aggiornerebbe); `min` e `max` rendono non scegliibili i giorni o i mesi fuori intervallo. Un solo ascolto sul documento apre i calendari. Dove c'erano: titolo del mese in Mese, Dal/Al del Riepilogo (mesi) e del Patrimonio (giorni), data di partenza dei Fondi, trasferimento, ricorrenti, rate (acquisto, prima scadenza, anticipo, saldo e reso), debiti (data e rimborsi), rilevazione manuale, budget («Vale dal» in mesi o in anni) e finestra del movimento.

**Testi**: nell'interfaccia si parla di **fondi**, non di "conti". Nelle righe la colonna si chiama "Pagato con" per le uscite e "Ricevuto su" per le entrate. Nel codice id e route restano `conto`, `conti`, `cont`.

## Finestre e pannelli

**Finestre** (tutte `<dialog>` modali create da `ui.modal()`, che le toglie dalla pagina alla chiusura; toccando fuori si chiudono; l'opzione `sheet` a tutto schermo esiste ma oggi non è usata). Regole comuni: nessuna finestra salva finché non si preme il pulsante principale, «Annulla» e × chiudono senza lasciare tracce; gli errori di compilazione sono toast brevi che portano il cursore sul campo; ogni eliminazione chiede conferma e, dove ha senso, lascia un toast con «Annulla» che ripristina il record; i campi importo accettano espressioni (`bindAmount`: attivo mostra la formula, a riposo il risultato).

| Finestra | Funzione (file) | Da dove si apre | Cosa fa |
| --- | --- | --- | --- |
| Movimento | `movDialog` (dialogs.js) | Mese: «+ Aggiungi entrata/uscita» (riquadri separati), «+ Aggiungi movimento» (elenco unico e pannello del giorno del calendario), matita di una riga | Crea o modifica un movimento. **Selettore Entrata/Uscita** (Entrata prima; compare solo se la finestra si apre dall'elenco unico o dal calendario, nei riquadri separati il tipo è già deciso). Importo con tastierino `+ − × ÷ ( )` e anteprima «= risultato»; descrizione con suggerimenti; **Data** (un campo che mostra per esempio «12 novembre 2026» o «Novembre 2026 · senza giorno»: toccandolo si apre il calendario con le frecce ‹ › per cambiare mese, i giorni del mese, «Senza giorno» e «Annulla»; non c'è più un campo «Mese» a parte); categoria e sottocategoria (suggerite, finché non si sceglie a mano); «Pagato con»/«Ricevuto su» (anche «Dividi tra più fondi…»); tag, nota, «Escludi dai totali». Pulsanti: «Aggiungi/Salva», «Aggiungi e duplica» (salva e riapre la finestra precompilata) o, in modifica, «Salva e duplica» (salva e crea una copia), «Rendi ricorrente…», «Pagato a rate…» (solo uscite), «Elimina» (solo in modifica). «Rendi ricorrente…» e «Pagato a rate…» non compaiono sui movimenti generati da ricorrenze o piani |
| Dividi tra più fondi | `splitEditor` | Dalla finestra del movimento, o dalla riga con la ripartizione che non torna | Righe fondo + importo, «+ Aggiungi un fondo», controllo «Mancano X da assegnare»; la somma deve coincidere con il totale |
| Trasferimento | `transferDialog` | Mese: «+ Aggiungi trasferimento» e righe dei trasferimenti, «Reintegra» del riquadro target; Patrimonio: «Trasferimento»; dettaglio fondo: «Reintegra», «Trasferisci qui», «Trasferisci da qui» | Da, A (fondi diversi), importo, data, nota; «Elimina» in modifica |
| Correggi il saldo | `adjustDialog` | Dettaglio fondo: «Correggi il saldo» | Scrivi il saldo reale: registra un `rett` con la differenza (data di oggi) |
| Rilevazione manuale | `snapDialog` (view-patrimonio.js) | Patrimonio: «Rilevazione manuale»; riga di «Rilevazioni storiche» | Data e saldo di ogni fondo (segnaposto = calcolo automatico di quel giorno), totale, confronto per fondo, scelta `auto`/`manuale` quando c'è una differenza, «Elimina» (toglie anche le correzioni generate) |
| Debito o credito | `editor` (view-debiti.js) | Debiti: «Nuovo», tocco su una voce | «Mi deve dei soldi»/«Devo dei soldi», persona (suggerita), importo, per cosa, data, fondo (solo con il calcolo automatico), nota; in modifica l'elenco dei rimborsi (data, importo, fondo), «+ Registra un rimborso», «Segna come saldato» e il residuo |
| Movimento ricorrente | `ricDialog` | Ricorrenti: «Nuovo» e tocco su una voce; Altro; finestra del movimento e voci extra di una riga («Rendi ricorrente») | Tipo (Entrata o Uscita), descrizione, importo, categoria, fondo, prima scadenza (calendario), «Si ripete ogni» N settimane/mesi/anni, ultima scadenza facoltativa, nota; frase che spiega le scadenze; salvando aggiunge subito le scadenze già passate |
| Pagamento a rate | `rateDialog` | Rate: «Nuovo» e tocco su un piano; finestra del movimento («Pagato a rate…») | Modello (solo per i nuovi), descrizione, prezzo, categoria/sottocategoria, data di acquisto, creditore; numero di rate, importo, ultima rata, prima scadenza, ripetizione, fondo; anticipo facoltativo (importo, data, fondo); riepilogo del costo; «Come contarlo nelle uscite» (All'acquisto / Rata per rata); tag, nota. In modifica: riga di stato, «Salda il residuo…», «Annulla per reso…» oppure «Riapri il piano», «Elimina» |
| Salda il residuo / Annulla per reso | `chiusuraDialog` | Dalla finestra di un piano aperto | Data (calendario, oggi o passata), importo proposto (residuo o quanto pagato), fondo; chiude il piano; toast con «Annulla» che lo riapre |
| Budget | `budgetDialog` (view-budget.js) | Budget: «Nuovo» e tocco su un budget | «Su cosa» (categoria, sottocategoria, tag, tutte le uscite), periodo Al mese/All'anno, importo (proposto dalla mediana dei 12 mesi), «Vale dal» mese o anno (solo se l'importo cambia), riporto; «Elimina» in modifica |
| Conferma | `confirmBox` (ui.js) | Eliminazioni, uscita dall'account, disattivazione del calcolo automatico, importazione… | Messaggio + «Annulla»/pulsante d'azione (rosso se pericoloso) |
| Testo da inserire | `promptBox` (ui.js) | Ricerca: «Aggiungi un tag a tutti» | Un campo di testo |
| Calendario dei giorni, dei mesi, degli anni | `dayPicker`, `monthPicker`, `yearPicker` (datepick.js) | Ogni pulsante di data, mese o anno (`dateInput`, `monthInput`, `yearInput`), il titolo del mese in Mese e il campo Data della finestra Movimento | Giorni del mese con le frecce ‹ › per cambiare mese (lunedì per primo; oggi e giorno scelto evidenziati; i giorni fuori da `min`/`max` non si toccano); mesi con le frecce per cambiare anno; anni dodici per volta. Un pulsante in più toglie la data («Senza giorno», «Nessuna data», «Dall'inizio»…) dove la data è facoltativa; «Annulla» chiude senza cambiare. Scegliere chiude la finestra |

**Altri elementi trasversali**:
- **Toast** (`#toast`, in basso, sopra la barra su telefono): messaggio breve, 3,5 secondi, con un pulsante d'azione facoltativo («Annulla», «Vai», «Vedi», «Aggiorna»). Ne esiste uno alla volta.
- **Tooltip dei grafici** (`data-tip`): al passaggio del mouse sulle fette delle torte e sulle barre; sul telefono al tocco. Si nasconde allo scorrimento.
- **Avviso «Aggiorna»**: toast di 60 secondi quando un service worker nuovo è pronto; il controllo si ripete al ritorno della pagina visibile, al ritorno della rete e ogni 30 minuti.
- **Barra della demo**: fissa in cima, solo in modalità demo.
- **Pannelli che si aprono sulla pagina** (non sono finestre): le voci extra di un movimento (tag, nota, «Escludi», Duplica, Rendi ricorrente, Elimina), il dettaglio di una categoria sotto la torta, l'elenco di voci aperto dal centro della torta, la tabella «Mese per mese» o «Anno per anno» sotto il grafico, le categorie del confronto con l'anno prima, le torte di un tag, l'elenco dei movimenti di un budget, il menu ⋯ di un fondo, il pannello delle sottocategorie, le sezioni `<details>` «Rilevazioni storiche» e «movimenti senza fondo».

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

## Inventario dell'interfaccia

Elenco, pagina per pagina, di ogni elemento visibile. Serve a sapere cosa esiste prima di toccare l'interfaccia e a non perdere per sbaglio un pezzo durante un ridisegno: se aggiungi, togli o sposti un elemento, aggiorna anche questo elenco. Le finestre sono descritte nella tabella «Finestre e pannelli» (qui si indica solo quando si aprono).

### Elementi comuni a tutte le pagine

- **Barra di navigazione**: logo e nome «Rationes» (solo sopra i 900 px) e le voci Mese, Riepilogo, Patrimonio, Debiti, Altro, ciascuna con icona. La voce della pagina corrente è evidenziata (anche per le sottopagine: Fondi e dettaglio fondo → Patrimonio; Rate → Debiti; Ricorrenti e Budget → Altro; Cerca e Tag → Mese). Pallino ambra sul Patrimonio (fondo sotto il target); pallino di stato della sincronizzazione su Altro.
- **Toast** in basso, con pulsante d'azione facoltativo.
- **Barra della demo** in cima, solo in modalità demo: «Versione demo: i dati sono di esempio», «Ricomincia», «Esci dalla demo».
- **Messaggio d'errore a tutta pagina** se l'archivio locale non si apre (navigazione privata).
- **Intestazione di pagina** (`page-head`): titolo e, a destra, i pulsanti principali. Fondi e il dettaglio di un fondo hanno sopra il titolo un link «Patrimonio» per tornare indietro.

### Mese (`#mese`, `#cerca`, `#tag`)

**Intestazione**
- Frecce «Mese precedente» e «Mese successivo».
- Titolo «Mese Anno» (per esempio «Marzo 2026»): toccandolo si apre il calendario dei mesi (con le frecce per cambiare anno).
- Pulsante «Oggi» (solo se non si è nel mese attuale).
- Tre totali del mese: **Entrate** (verde), **Uscite** (rosso), **Saldo** (colore dinamico, con segno). Valgono anche durante la ricerca e restano quelli del mese.

**Barra degli strumenti**
- Campo di ricerca «Cerca in tutti i movimenti, oppure #tag» (dal secondo carattere sostituisce il contenuto della pagina).
- Interruttore **Elenco / Calendario** (ricordato sul dispositivo).

**Avvisi** (fasce colorate sotto gli strumenti; compaiono solo se servono)
- «Sotto il target» / «N fondi sotto il target» (ambra): un pulsante per fondo con il nome e «−importo»; tocco → finestra Trasferimento per reintegrare.
- «Oltre il target» / «N fondi oltre il target» (verde): un link per fondo con «+importo» → dettaglio del fondo.
- «Una rata in scadenza» / «N rate in scadenza nei prossimi 7 giorni»: un link per rata con descrizione, importo e data («oggi» oppure giorno, numero e mese in forma breve) → pagina Rate.
- «Un movimento di questo mese non indica il fondo» (non durante la ricerca).

**Riquadro Budget** (solo se ci sono budget validi nel mese; assente durante la ricerca)
- Titolo «Budget» e link «Gestisci» → pagina Budget.
- Una riga per budget (grafica condivisa `budgetui.js`): nome (per esempio «🛒 Spesa»), sotto l'importo («400,00 € al mese», «all'anno», più «+/− X riportati»), a destra la cifra spesa e «su X» disponibili; barra con il riempimento, la parte oltre il limite tratteggiata, la tacca del limite e il segno del punto del periodo (solo per il periodo in corso); riga di stato («Nei limiti», «Rispettato», «Ritmo troppo veloce», «Vicino al limite», «Sforato di X») con «Disponibile X» e, per gli annuali in corso, «In linea a oggi: X».
- Toccando una riga si apre l'elenco dei movimenti che la compongono (data, descrizione, importo; i rimborsi dei resi in verde con «−»), ognuno è un link al movimento.
- Legenda «Il segno sulla barra indica a che punto è il periodo.»

**Vista Elenco**
- Sopra i riquadri il selettore «Entrate e uscite: Separate | Insieme» (ricordato sul dispositivo). Con **Insieme** c'è un solo riquadro «Movimenti» (con il numero dei movimenti) con entrate e uscite in ordine di data, distinte dal colore dell'importo, e un solo pulsante «+ Aggiungi movimento» in fondo; nella finestra Movimento, aperta da qui e dal calendario, compare il selettore Entrata/Uscita.
- Se l'archivio è vuoto: riquadro «Non ci sono ancora movimenti…» con il pulsante «Importa lo storico» (→ Altro).
- Due riquadri, **Entrate** e **Uscite**. Intestazione con il numero di movimenti; su schermo largo anche la riga delle colonne (Giorno, Importo, Descrizione, Categoria, «Ricevuto su» o «Pagato con»).
- **Riga di un movimento**: giorno (– se manca); importo (sottolineato a puntini se è un'espressione, con la formula al passaggio del mouse); descrizione («Senza descrizione» in tenue); categoria con pallino colorato, emoji, nome e « · sottocategoria»; fondo (nomi uniti da «+»; «Scegli il fondo» in ambra con pallino se manca; «A rate» per l'acquisto di un piano; «—» altrimenti; in rosso se la ripartizione non torna); **matita** per modificare (con un puntino se c'è una nota). Barrata e attenuata se esclusa dai totali. Sotto, la riga dei tag: «↻ Ricorrente» (→ Ricorrenti), «▤ Acquisto a rate / Anticipo / Rata / Interessi della rata / Saldo delle rate / Reso» (→ Rate) e i `#tag` (→ pagina del tag).
- **Voci extra** (si aprono toccando la riga, o con Invio o Spazio da tastiera): avviso «La ripartizione sui conti non torna con l'importo» con «Correggi»; editor dei tag (chip con ×, campo «Aggiungi un tag…» con suggerimenti, Invio o virgola per aggiungere); **Nota**; casella «Escludi dai totali di entrate e uscite»; pulsanti «Duplica», «Rendi ricorrente» (non per movimenti generati o senza importo), «Elimina» (con conferma e «Annulla»).
- **Riordino**: tenendo premuto circa 0,4 secondi un movimento lo si trascina tra quelli dello stesso giorno e dello stesso riquadro (la pagina scorre da sola vicino ai bordi; vibrazione sul telefono).
- Pulsanti «+ Aggiungi entrata» e «+ Aggiungi uscita» sotto ciascun riquadro → finestra Movimento, senza il selettore Entrata/Uscita (il tipo l'ha già scelto chi preme il pulsante; vale anche per la matita delle righe).
- **Trasferimenti tra fondi** (riquadro, se il calcolo automatico è attivo o ci sono trasferimenti nel mese): nota «non contano come entrate o uscite»; righe con giorno, importo, nota («Trasferimento» se manca), **Da** e **A**; tocco → finestra Trasferimento; «+ Aggiungi trasferimento».
- **Entrate per categoria** e **Uscite per categoria** (in quest'ordine): vedi «Torta per categoria» sotto.

**Vista Calendario**
- Griglia da lunedì a domenica; ogni giorno è una casella con il numero, le entrate («+», verde), le uscite («−», rosso) e, se ci sono entrambe, il saldo del giorno. Sfondo verde o rosso con intensità proporzionale al saldo. Evidenziati il giorno di oggi e quello selezionato. Su telefono gli importi sono abbreviati.
- **Pannello del giorno** sotto la griglia: data per esteso con il saldo del giorno; i movimenti del giorno con la stessa riga dell'elenco (senza il giorno, con le voci extra e il riordino); «Nessun movimento in questo giorno»; un solo pulsante «+ Aggiungi movimento» (già con quel giorno; il tipo si sceglie nella finestra). Senza un giorno selezionato: «Tocca un giorno per vedere i movimenti.»
- **Senza giorno** (riquadro con il conteggio) per i movimenti senza giorno.
- Poi, come nell'elenco: trasferimenti e categorie del mese.

**Torta per categoria** (in Mese, Riepilogo e nelle torte di un tag)
- Anello colorato con il totale in euro interi al centro e una freccia ▾/▴; si anima la prima volta che compare. Al passaggio del mouse o al tocco su una fetta: nome, importo e percentuale. Nessun dato → «Nessun dato.»
- Toccando il centro (o Invio/Spazio) si apre l'elenco delle voci: per ogni categoria emoji, nome, importo, percentuale e barra. Su schermo largo la torta resta fissa accanto all'elenco.
- Toccando una voce si apre il dettaglio: tabella per sottocategoria (se ce ne sono: numero di movimenti, percentuale, importo, «Senza sottocategoria») e «Voci principali» (fino a 12 descrizioni raggruppate, con numero di volte e totale; ognuna è un link alla ricerca).

**Ricerca / pagina di un tag** (con almeno 2 caratteri nel campo)
- Riga di sintesi «N movimenti: entrate X, uscite Y» e pulsante «Aggiungi un tag a tutti» (→ richiesta di testo).
- Per un tag (`#nome`): riquadri «Entrate per categoria» e «Uscite per categoria» (torte).
- Elenco dei risultati, dal più recente, con intestazione per ogni mese («Marzo 2026»); ogni risultato è un link al movimento nel suo mese con giorno, descrizione (e nota), categoria · sottocategoria, fondi, tag e importo con segno (barrato se escluso). Oltre 400 risultati: «Mostro i 400 più recenti: affina la ricerca…».
- Il riquadro Budget è nascosto; gli avvisi restano (tranne quello dei movimenti senza fondo).

### Riepilogo (`#riepilogo`)

- **Barra dei periodi**: un chip per ogni anno con movimenti e «Tutti gli anni» (scorre in orizzontale; quello attivo è portato in vista). Con «Tutti gli anni»: i pulsanti **Dal** e **Al** (mese, scelti dal calendario dei mesi; senza scelta dicono «Dall'inizio» e «Fino alla fine») e il chip «Tutto il periodo» per azzerarli.
- Senza dati: «Nessun movimento in questo periodo.»
- **Statistiche principali**: Entrate, Uscite, Saldo. **Statistiche secondarie**: Entrate medie al mese, Uscite medie al mese, Saldo medio al mese, Risparmio (%), Soldi buttati.
- **Proiezione a fine anno** (solo anno in corso): stima delle uscite; Uscite finora, Ritmo al mese, Stima a fine anno; frase di confronto con la spesa dell'anno prima. Con meno di un mese di dati: «Troppo presto per una stima…».
- **Saldo accumulato**: spiegazione, riga di lettura («Mese Anno · saldo accumulato») e grafico a linea interattivo (mouse, tocco, frecce sinistra/destra, Esc).
- **Entrate e uscite per mese** (per anno in «Tutti gli anni»): legenda Entrate/Uscite/Saldo, grafico a barre raggruppate, pulsante **Espandi ▾ / Comprimi ▴** che apre la tabella Mese (o Anno) | Entrate | Uscite | Saldo; le righe dei mesi portano alla pagina Mese, quelle degli anni al Riepilogo dell'anno.
- **Entrate per categoria** e **Uscite per categoria**: torte (vedi sopra).
- **Rispetto al {anno prima}** (solo per un anno singolo, se l'anno prima ha movimenti nel periodo): frase del periodo confrontato, tabella Entrate/Uscite con i due anni e la variazione (verde/rosso), e due elenchi a scomparsa «Entrate per categoria ▾» e «Uscite per categoria ▾».
- **Budget** (se ce ne sono con periodi conclusi): tabella con nome (e «Mensile»/«Annuale»), «Rispettato» («N su M mesi/anni») e «Scostamento medio» («X sotto», «X oltre» in ambra, «In pari»).
- **Le spese più grandi**: le 10 uscite maggiori (link al movimento, mese, categoria, importo).
- **Tag**: una riga per tag (`#tag`, numero di movimenti, uscite); toccandola si apre sotto di essa il riepilogo per categoria (torte) con il pulsante «Vedi i movimenti» (→ pagina del tag). Senza tag, un testo che spiega come aggiungerli.
- **Soldi buttati**: per un anno, elenco modificabile (importo con espressioni, descrizione, × per eliminare con «Annulla»), «+ Aggiungi voce» e Totale; in «Tutti gli anni», una tabella per anno (numero di voci e totale).

### Patrimonio (`#patrimonio`)

- **Intestazione**: pulsanti «Trasferimento» (solo con il calcolo automatico attivo), «Rilevazione manuale» e «Fondi» (in evidenza se il calcolo automatico non è attivo).
- **Calcolo automatico spento**: riquadro «Calcolo automatico non ancora attivo» con la spiegazione e il pulsante «Configura i fondi».
- **Riquadro principale** (calcolo attivo): «Patrimonio oggi» con il totale dei fondi; variazione «dalla partenza del {data}» (verde/rosso); ripartizione per gruppo (pallino, nome, importo); riga «Contando anche i crediti, i debiti, le rate da pagare» con il patrimonio netto (link a Debiti, solo se esistono); **Mesi di autonomia** (valore, anni se da 24 mesi in su, e la spiegazione «Senza entrate, con uscite medie di X al mese…»; assente se non ci sono uscite).
- **Movimenti senza fondo**: sezione a scomparsa «N movimenti non hanno il fondo indicato…» con i primi 30 (data, descrizione, importo; link al movimento).
- **Gruppi dei fondi** in ordine di importo decrescente: intestazione con pallino, nome e totale; **scheda di fondo** (→ dettaglio): nome, saldo, e se c'è un target barra di avanzamento, «Target X» e stato («▼ X sotto il target», «▲ X oltre il target», «Al target»). I fondi archiviati compaiono solo se hanno ancora un saldo.
- **Andamento** (con almeno due punti): pulsanti **Dal** / **Al** (date, scelte dal calendario; senza scelta dicono «Dall'inizio» e «Fino a oggi») e «Tutto il periodo»; riga di lettura (data · Totale · variazione dal primo punto); legenda dei gruppi con il valore del punto scelto; grafico ad aree impilate interattivo (mouse, tocco, frecce) con il marcatore «calcolo automatico» alla data di partenza se esistono rilevazioni storiche. Se l'intervallo ha meno di due punti: «Nel periodo scelto ci sono meno di due rilevazioni: allarga le date.»
- **Rilevazioni storiche** (sezione a scomparsa con il conteggio): spiegazione e tabella Data (con l'etichetta «saldi allineati alla rilevazione» o «solo confronto») | Totale | Variazione; ogni riga apre la finestra Rilevazione.

### Fondi (`#conti`)

- Link «Patrimonio», titolo «Fondi».
- **Situazione di partenza**: spiegazione, pulsante «Data di partenza» (apre il calendario; scegliendo una data si attiva il calcolo automatico), «Disattiva il calcolo automatico» (con conferma), e, se esiste una rilevazione, il link «Usa come saldi iniziali i valori della rilevazione del {data}» (con conferma).
- **I tuoi fondi**: tabella con Nome, Gruppo (Contanti e monete, Conto corrente, Conto deposito, Portafoglio digitale, Crypto, Altro), Saldo iniziale e Target (campi che accettano espressioni); per ogni riga il pulsante **⋯** apre «Archiviato (non compare più tra i fondi selezionabili)» ed «Elimina fondo» (rifiutato, con un toast, se il fondo è già usato); «+ Nuovo fondo».
- **Fondi proposti per i nuovi movimenti**: «Per le uscite» e «Per le entrate» (elenco dei fondi o «Nessuno»).

### Dettaglio di un fondo (`#conto/<id>`)

- Link «Patrimonio», nome del fondo, pulsante «Modifica fondi» (→ Fondi). Fondo inesistente: «Questo fondo non esiste più.» con «Torna al patrimonio».
- Senza calcolo automatico: riquadro con «Configura i fondi».
- **Riquadro del saldo**: «Saldo attuale», riga del target (sotto, oltre o al target) e pulsanti **Reintegra** (solo se sotto il target), **Trasferisci qui**, **Trasferisci da qui**, **Correggi il saldo** (→ finestre).
- **Movimenti** del fondo dal più recente: data (giorno e mese in evidenza, anno piccolo), descrizione (i trasferimenti mostrano la nota e «Da»/«A» con l'altro fondo; debiti e correzioni una seconda riga con «Debiti e crediti» o «Correzione»), importo con segno e «Saldo» progressivo. Ogni riga è un link: movimento e trasferimento → il loro mese; debito → Debiti; correzione → conferma di eliminazione. In fondo «Saldo iniziale al {data}: X».

### Debiti e crediti (`#debiti`)

- **Intestazione**: titolo e «Nuovo» (→ finestra).
- **Statistiche**: Ti devono (verde), Devi (rosso), Saldo.
- **Riquadro dei pagamenti a rate** (→ Rate): senza piani «Pagamenti a rate — Acquisti pagati a rate…»; con piani «Rate ancora da pagare», numero dei piani in corso, prossima rata e residuo totale.
- **Filtro**: chip «Da saldare», «Saldati», «Tutti» (ricordato sul dispositivo).
- **Elenco per persona**: intestazione con il nome e «ti deve X» / «gli devi X» / «in pari»; voci con etichetta «Ti deve»/«Devi», descrizione, data e fondo, importo residuo (e «di X» se parziale) oppure «Saldato», barra dei rimborsi; tocco → finestra. Elenco vuoto: testo con un esempio (la cena da 68 €).

### Pagamenti a rate (`#rate`)

- **Intestazione**: titolo e «Nuovo» (→ finestra Pagamento a rate); nota introduttiva.
- **Statistiche** (se ci sono piani aperti): Ancora da pagare, Nei prossimi 30 giorni, Costo dei finanziamenti.
- **Piani in corso**, per prossima scadenza: emoji della categoria, descrizione e creditore, «Pagate N di M, ne mancano K · prossima: data, importo», costo del finanziamento («Nessun costo di finanziamento») e modalità («contato all'acquisto» / «contato rata per rata»), importo ancora da pagare «di X» e barra di avanzamento; tocco → finestra. Senza piani: testo con un esempio (telefono da 300 € in 3 rate PayPal).
- **Conclusi** (saldati, annullati per reso o tutti pagati): stesse voci, con l'importo pagato e lo stato («saldato il…», «annullato per reso il…», «tutte pagate»).

### Movimenti ricorrenti (`#ricorrenti`)

- **Intestazione**: titolo e «Nuovo» (→ finestra Movimento ricorrente); nota introduttiva.
- **Statistiche** (se ci sono ricorrenze attive): Entrate fisse al mese (circa), Uscite fisse al mese (circa).
- **Elenco delle attive**, per prossima scadenza: emoji della categoria, descrizione, frase («Ogni mese, il 5», «Ogni 2 settimane», «Ogni anno, il 3 mar»…) e fondo, importo con segno e «prossima: data». Senza ricorrenze: testo con un esempio (Netflix).
- **Terminati**: ricorrenze arrivate all'ultima scadenza, con «terminata».

### Budget (`#budget`)

- **Intestazione**: titolo e «Nuovo» (→ finestra Budget); nota introduttiva.
- **Elenco** in un riquadro: una riga per budget con la grafica dei budget del riquadro di Mese (senza elenco dei movimenti); tocco → finestra. Un budget non ancora iniziato mostra «Parte da {mese anno}»; uno con categoria o sottocategoria eliminata «Categoria o sottocategoria eliminata: modificalo o eliminalo». Nessun budget: testo con esempi (400 € al mese per la spesa, 1.500 € all'anno per i viaggi).

### Altro (`#altro`)

- **Sincronizzazione** (riquadro che cambia con lo stato):
  - in demo: solo un messaggio;
  - non configurata: «URL del progetto», «Chiave pubblica», «Collega»;
  - collegata ma senza accesso: Email, Password, «Accedi», «Crea account», «Scollega progetto»;
  - verifica in corso / errore di rete: «Riprova» ed «Esci»;
  - da creare: «Crea la frase segreta» (due campi, «Attiva la cifratura»);
  - da sbloccare: «Sblocca i dati cifrati» (un campo, «Sblocca», «Ho dimenticato la frase» → conferma → «Nuova frase segreta» con «Sostituisci e cifra»);
  - attiva: account, riga di stato con pallino (data dell'ultima sincronizzazione), «Sincronizza ora», «Esci» (con conferma che indica le modifiche non ancora inviate).
- **Dati**: «Importa file» (backup JSON, con conferma), «Esporta backup completo» (`rationes-backup-AAAA-MM-GG.json`), «Esporta movimenti per Excel» (`rationes-movimenti-….csv`, con anche i trasferimenti), «Esporta patrimonio per Excel» (`rationes-patrimonio-….csv`).
- **Movimenti ricorrenti**: breve descrizione e «Gestisci i movimenti ricorrenti (N)» (→ Ricorrenti).
- **Pagamenti a rate**: descrizione, scelta «Conta gli acquisti a rate» (all'acquisto / rata per rata), nota di spiegazione e «Gestisci i pagamenti a rate (N)» (→ Rate).
- **Budget**: breve descrizione e «Gestisci i budget (N)» (→ Budget).
- **Categorie**: due colonne, Entrate e Uscite. Ogni categoria: selettore del colore, emoji (un solo simbolo), nome, numero di movimenti, pulsante **↳N** (apre le sottocategorie: nome modificabile, numero di movimenti, ×, «+ Nuova sottocategoria») e **×** (elimina, con conferma: i movimenti passano in «Altro», o nella prima altra categoria dello stesso tipo, senza sottocategoria). «+ Nuova categoria di entrata» / «+ Nuova categoria di uscita».
- **Aspetto**: scelta «Tema» (Come il sistema, Chiaro, Scuro) e, se l'app non è già installata, «Installa come app» (o le istruzioni per Android e Windows).
- **Riga finale**: «Rationes, versione N. I dati sono salvati su questo dispositivo [e sincronizzati, cifrati, sul tuo progetto Supabase]».

### Modalità demo

- Barra fissa in cima con «Ricomincia» (conferma, poi cancella l'archivio della demo e ricarica) ed «Esci dalla demo».
- Toast quando i dati di esempio vengono rigenerati dopo un aggiornamento dell'app.
- In Altro, al posto di sincronizzazione e cifratura, un messaggio; le altre pagine sono identiche a quelle dell'app.
