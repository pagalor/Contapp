# Rationes: documento di progetto

**Rationes** (in latino «i conti») è un'app personale di contabilità che sostituisce un file Excel. Tiene traccia di entrate e uscite mese per mese e del patrimonio, diviso tra più "fondi" (contanti, conti, crypto…). Funziona su Windows e Android come PWA installabile, offline, con sincronizzazione cifrata end-to-end tra i dispositivi.

Questo documento descrive com'è fatta l'app e le regole da rispettare quando la si modifica. Va letto prima di ogni intervento.

**Nome e nomi interni**: l'app si chiamava "Contabilità". Il nuovo nome compare solo nei testi visibili (titolo, manifest, intestazioni, pannello dell'account, messaggi, nomi dei file esportati). I nomi interni restano `contabilita` e **non vanno cambiati**, altrimenti l'app installata perde i dati locali o viene vista come un'app diversa: i database IndexedDB `contabilita` e `contabilita-keys`, le chiavi `contabilita.*` di `localStorage`, il prefisso `contabilita-vN` di `VERSION`, il formato dei backup `contabilita-v1`, il valore di controllo `contabilita-ok` della cifratura, la tabella e la configurazione Supabase, `start_url` e `scope` del manifest.

## Architettura in breve

- **App statica**, senza build e senza dipendenze: HTML, CSS e JavaScript a moduli ES, serviti così come sono.
- **Hosting**: GitHub Pages, dal ramo `main` del repository, cartella radice. Ogni push su `main` pubblica la nuova versione.
- **Dati locali**: IndexedDB (database `contabilita`, object store `records`). Tutto viene caricato in memoria all'avvio.
- **Offline**: il service worker `sw.js` mette in cache i file dell'app.
- **Sincronizzazione**: Supabase, usato solo tramite le API REST (PostgREST e Auth) con `fetch`, senza librerie. Su ogni dispositivo si inseriscono a mano URL e chiave pubblica; nel codice non c'è nessuna chiave.
- **Cifratura end-to-end**: i dati vengono cifrati sul dispositivo prima dell'invio. Sul server non arriva mai niente in chiaro.
- **Nessuna risorsa esterna**: niente CDN, statistiche o servizi di terze parti. I caratteri (Bricolage Grotesque per titoli e numeri grandi, Figtree per il testo) sono file locali in `fonts/`. L'unica destinazione di rete è il progetto Supabase dell'utente.
- **Stile**: le regole grafiche sono in `STILE.md`; i colori stanno in `palette.css` (temi chiaro e scuro), tutto il resto in `style.css`.
- **Lingua**: interfaccia, messaggi e commenti nel codice sono in italiano.

## File

```
index.html              struttura della pagina: barra in alto (sincronizzazione, logo, account), navigazione a 4 voci, pulsante «Nuovo»
palette.css             colori (variabili CSS) dei temi chiaro e scuro: vedi STILE.md
style.css               tutto il resto dello stile (caratteri, componenti, telefono e desktop, animazioni)
STILE.md                guida dello stile: palette, caratteri, componenti, gruppi espandibili
sw.js                   service worker: cache dei file, numero di VERSION (lo comunica alla pagina che lo chiede con il messaggio 'versione')
manifest.webmanifest    dati per l'installazione come app (nome, colori #055A63 del fondo del logo, icone)
fonts/                  caratteri locali (woff2 variabili, sottoinsieme latin) con le loro licenze OFL:
  bricolage-grotesque.woff2  titoli e numeri grandi
  figtree.woff2              testo
icons/                  logo di Rationes:
  icon-192.png            icona "any" 192 px, anche apple-touch-icon
  icon-512.png            icona "any" 512 px
  icon-maskable-512.png   icona "maskable" (Android ritaglia il bordo)
  icon-monochrome-512.png icona "monochrome" (sagoma bianca su trasparente)
  favicon.svg             favicon vettoriale
  favicon-32.png          favicon 32 px
  favicon-16.png          favicon 16 px
                          (il logo della barra in alto è un SVG in linea in index.html, con i colori della palette)
js/main.js              avvio, router (hash), cronologia per i pulsanti «‹ indietro», avvisi sui target e sui budget, registrazione del service worker e controllo degli aggiornamenti (avviso "Aggiorna" anche con l'app aperta)
js/pannelli.js          pannelli della barra in alto: sincronizzazione (stato, «Sincronizza ora», voce «Sincronizzazione e cifratura») e account (voci che aprono le pagine delle impostazioni, versione); pulsante della sincronizzazione (`paintSync`); intestazione con il pulsante indietro (`titoloConRitorno`, `testataAccount`)
js/gruppi.js            gruppi espandibili (`gruppoHTML`, `apri`, `ricorda`): chiusi con un'anteprima, aperti con le righe complete; un solo ascolto sul documento
js/store.js             archivio locale (IndexedDB e memoria) e stato "dirty" per la sincronizzazione; `saveAuto` per i movimenti rigenerabili dei piani rateali
js/model.js             logica di dominio: totali, categorie, fondi, saldi, target, tag, debiti, pagamenti a rate, migrazioni
js/expr.js              parser degli importi con espressioni e formattazione dei numeri (it-IT)
js/sync.js              autenticazione Supabase, pull e push, gestione della frase segreta; senza connessione la sessione resta salvata
js/crypto.js            PBKDF2, AES-GCM, HMAC per gli id, conservazione delle chiavi
js/catstats.js          entrate/uscite per categoria (torta, percentuali, dettaglio con sottocategorie), torte per categoria di un tag; usato da Mese e Riepilogo. Si vede solo la torta: toccando il centro (`.donut-hit`, un solo ascolto sul documento) si apre l'elenco delle voci
js/charts.js            grafici SVG fatti a mano: barre a capsula, linea, aree impilate nel tempo (con selezione interattiva del punto), anello in stile Google Health (binario, estremità tonde, capsula con la percentuale maggiore, tre righe al centro; si anima quando compare scorrendo la pagina)
js/datepick.js           scelta di date, mesi e anni: calendari (`dayPicker`, `monthPicker`, `yearPicker`) e campi (`dateInput`, `monthInput`, `yearInput`, `setPick`), usati in tutta l'app al posto dei selettori del browser
js/ui.js                toast (con pulsante d'azione), finestre (`modal`, `confirmBox`, `promptBox`; su telefono fogli dal basso), finestra di scelta (`sceltaBox`) e apertura dei select con quella (`avviaSelect`, `apriSelect`), tooltip dei grafici (`data-tip`), download, debounce
js/dialogs.js           finestre condivise: movimento (nuovo e modifica, con "Pagato a rate" e la scelta della data con `dayPicker` di datepick.js), ripartizione su più fondi, trasferimento, correzione saldo, editor dei tag, movimento ricorrente, pagamento a rate (con i modelli precompilati e il pulsante «i» che spiega le due modalità), saldo del residuo e annullamento per reso; `bindAmount` (campo importo con espressioni) usato anche da Budget
js/view-mese.js         pagina Mese: riquadro del saldo del mese, gruppi espandibili (avvisi, budget, entrate, uscite o tutti i movimenti, trasferimenti), calendario (caselle colorate in base al saldo del giorno, gruppo del giorno scelto, «Senza giorno»), ricerca, categorie in fondo; `nuovoMovimento` per il pulsante «Nuovo». I movimenti sono di sola lettura: toccandone uno (elenco o calendario) si aprono le voci extra (tag, nota, duplica…), e solo la matita apre la finestra di modifica (`movDialog`), la stessa di «Nuovo». Tenendo premuto su un movimento (circa 0,4 s) lo si trascina, ma solo tra quelli dello stesso giorno e dello stesso gruppo (entrate, uscite, movimenti, giorno del calendario, «Senza giorno»); a fine trascinamento `ord` dei movimenti di quel giorno viene rinumerato (0, 1, 2…)
js/view-riepilogo.js    pagina Riepilogo: scelta del periodo (‹ anno ›), riquadro del saldo, statistiche (medie al mese, risparmio), proiezione a fine anno, saldo accumulato interattivo, barre con tabella mensile o annuale espandibile, torte per categoria, confronto con un anno passato a scelta (un gruppo), gruppi di budget, spese più grandi, tag e soldi buttati
js/view-patrimonio.js   pagina Patrimonio: riquadro del totale, ripartizione per gruppo (torta e legenda), un gruppo espandibile per ogni gruppo di fondi (in ordine decrescente), mesi di autonomia, andamento (interattivo, con intervallo di date personalizzabile), rilevazioni manuali e storiche; contiene anche la finestra della rilevazione manuale (`snapDialog`) e i formati di data `fmtDate`/`fmtDateShort`
js/view-conti.js        pagina Fondi (configurazione) e dettaglio di un fondo con i suoi movimenti, trasferimenti e correzioni (route #conti, #conto/<id>)
js/view-debiti.js       pagina Debiti e crediti (un gruppo per persona, con il riquadro del residuo delle rate, che porta a #rate); contiene anche la finestra di un debito o credito con i rimborsi
js/view-rate.js         pagina Pagamenti a rate (gruppi «In corso» e «Conclusi»; la finestra di modifica è in dialogs.js)
js/view-ricorrenti.js   pagina Movimenti ricorrenti (gruppi «Attivi» e «Terminati»; la finestra di modifica è in dialogs.js)
js/view-budget.js       pagina Budget (elenco, finestra per creare e modificare `budgetDialog`, con la mediana mensile proposta)
js/budgetui.js          riga con barra di un budget (icona, speso, disponibile, segno del periodo, elenco dei movimenti), condivisa da Mese e Budget
js/view-sync.js         pagina Sincronizzazione: collegamento a Supabase, accesso, frase segreta (crea, sblocca, dimenticata), stato, «Sincronizza ora», uscita; in demo solo un messaggio
js/view-categorie.js    pagina Categorie: categorie e sottocategorie di entrate e uscite, finestra del colore (`sceltaColore`, colori proposti in `COLORI`)
js/view-dati.js         pagina Importa ed esporta: backup JSON, CSV di movimenti e patrimonio
js/view-aspetto.js      pagina Aspetto: tema e installazione come app; `applyTheme` (attributo `data-theme` e `meta theme-color`)
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
| `#conti` | Fondi (configurazione; si apre dal Patrimonio e dal pannello dell'account) | Patrimonio | Fondi |
| `#conto/<id>` | Dettaglio di un fondo | Patrimonio | Fondo |
| `#debiti` | Debiti e crediti | Debiti | Debiti e crediti |
| `#rate` | Pagamenti a rate (si apre da Debiti, dal pannello dell'account e dagli avvisi di Mese) | Debiti | Pagamenti a rate |
| `#ricorrenti` | Movimenti ricorrenti (si apre dal pannello dell'account) | Account | Movimenti ricorrenti |
| `#budget` | Budget di spesa (si apre dal pannello dell'account e da «Gestisci» in Mese) | Account | Budget |
| `#sincronizzazione` | Sincronizzazione e cifratura (si apre dal pannello della sincronizzazione) | Sincronizzazione | Sincronizzazione |
| `#categorie` | Categorie e sottocategorie | Account | Categorie |
| `#dati` | Importa ed esporta | Account | Importa ed esporta |
| `#aspetto` | Tema e installazione come app | Account | Aspetto |
| `#altro` | Vecchio indirizzo della pagina Altro, che non esiste più: diventa `#mese` (con `history.replaceState`, senza una voce in più nella cronologia) e apre il pannello dell'account | Mese | Mese |

«Account» vuol dire che si evidenzia l'avatar nella barra in alto (anello verde acqua) e nessuna voce della navigazione; «Sincronizzazione» allo stesso modo il pulsante della sincronizzazione.

Il titolo della scheda è «<titolo> · Rationes» (con «(demo)» in modalità demo). A ogni cambio di pagina si torna in cima.

**Pulsante indietro** («‹» accanto al titolo delle sottopagine): torna alla schermata da cui si è arrivati e ne mostra il nome. `route()` scrive in `history.state` un numero progressivo `n` e `da: { titolo }` (il titolo della pagina precedente, per esempio «Marzo 2026» o il nome di un fondo); il pulsante fa `history.back()`. Le pagine aperte da un pannello hanno `daPan` (`account` o `sync`) e mostrano «‹ Account» o «‹ Sincronizzazione»: tornando indietro la pagina di partenza (che ha `riapri` con lo stesso pannello) riapre quel pannello, anche con il tasto indietro del browser. Se si arriva su una sottopagina da un link diretto o dopo un ricaricamento senza cronologia, il pulsante porta alla pagina madre (Fondi e dettaglio → Patrimonio, Rate → Debiti) oppure riapre il pannello predefinito della pagina (Sincronizzazione per `#sincronizzazione`, l'account per le altre). Tutto è in `pannelli.titoloConRitorno` e `main.js`; route e hash non cambiano.

**Barra in alto** (`.topbar`, sotto la barra della demo): a sinistra il pulsante della sincronizzazione (`#sync-ind`, una nuvola; da 900 px anche il testo, per esempio «Sincronizzato 2 min fa»; stato in `data-state` con il messaggio nel `title`: `off` nuvola semplice e «Non sincronizzato» se la sincronizzazione non è configurata o non si è entrati (in demo «Solo su questo dispositivo»), `ok` con la spunta e «Sincronizzato 2 min fa», `pending` con un puntino verde acqua, `syncing` animato, `locked`, `offline`, `error` in ambra con il punto esclamativo), al centro logo e «Rationes», a destra l'avatar (`#account-btn`). La nuvola apre il **pannello della sincronizzazione** (intestazione con l'icona, «Sincronizzazione», lo stato e la × per chiudere, come il pannello dell'account; account, cifratura, la voce **Sincronizzazione e cifratura** → `#sincronizzazione`, «Sincronizza ora» quando è attiva); l'avatar apre il **pannello dell'account**: Fondi (`#conti`), Categorie (`#categorie`), Movimenti ricorrenti (`#ricorrenti`), Pagamenti a rate (`#rate`), Budget (`#budget`), Importa ed esporta (`#dati`), Aspetto (`#aspetto`), e in fondo la riga con la versione. Ogni voce apre solo la sua pagina. I pannelli sono `ui.modal` che scendono dalla barra.

**Navigazione**: quattro voci, nell'ordine **Mese, Riepilogo, Patrimonio, Debiti** (`index.html`). Sopra i 900 px sono una barra laterale a sinistra (voce attiva piena `--primary`); sotto, una barra verde acqua sospesa in basso con angoli a capsula, icona e nome per ogni voce (la voce attiva ha una capsula chiara dietro l'icona). Sul **Patrimonio** un pallino ambra (`#target-ind`) quando almeno un fondo è sotto il target (il suo `title` elenca quanto manca a ciascuno).

**Pulsante «Nuovo»** (`#fab`, capsula verde acqua con la penna, in basso a destra, sopra la navigazione su telefono): solo nelle pagine Mese, Cerca e Tag, anche su desktop. Apre la finestra Movimento per un'uscita (con il selettore Entrata/Uscita) nel mese mostrato, o nel giorno scelto del calendario.

**Preferenze solo di questo dispositivo** (`localStorage`, mai sincronizzate; ogni accesso è in `try/catch`):

| Chiave | Cosa ricorda |
| --- | --- |
| `contabilita.meseView` | Mese: `lista` (predefinito) o `cal` (calendario) |
| `contabilita.meseElenco` | Mese, vista Elenco: `split` (predefinito, entrate e uscite in due riquadri) o `all` (un solo elenco ordinato per data) |
| `contabilita.riepilogo-periodo` | Riepilogo «Tutti gli anni»: intervallo `{ from, to }` in `AAAA-MM` |
| `contabilita.patrimonio-periodo` | Patrimonio, grafico Andamento: intervallo `{ from, to }` in `AAAA-MM-GG` |
| `contabilita.debitiFiltro` | Debiti: `aperti` (predefinito), `saldati` o `tutti` |
| `contabilita.gruppi` | Gruppi espandibili (`js/gruppi.js`): `{ idGruppo: true/false }`, aperto o chiuso; senza una scelta chiuso sotto i 900 px e aperto sopra |
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
| `cfg` | Record unico `cfg-patrimonio`. `inizio` (data di partenza del calcolo automatico, `AAAA-MM-GG`), `contoOut`, `contoIn` (fondi proposti), `modalitaRate` (modalità proposta per i nuovi pagamenti a rate, `acquisto`, predefinita, oppure `rate`: è quella dell'ultimo piano salvato) |

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
- **Sottocategorie**: ogni categoria può averne (si gestiscono in Account → Categorie, dal pulsante ↳). Il movimento conserva `cat` e in più `sub`: totali, torte e suggerimenti per categoria non cambiano, e dentro il dettaglio di una categoria compare la ripartizione per sottocategoria (`M.bySub`). Se si cambia categoria la sottocategoria si azzera; se una sottocategoria viene eliminata, i suoi movimenti restano nella categoria senza sottocategoria. La sottocategoria è proposta (`M.suggestSub`) dalla scelta più frequente per la stessa descrizione, poi da regole testuali.
- **Confronti nel tempo** (Riepilogo di un anno, non in "Tutti gli anni"): `M.confrontoAnno(y, fino, base)` confronta entrate, uscite e ogni categoria con l'anno `base` in percentuale (`M.variazione`; `null` se prima era zero). Si può confrontare con qualsiasi anno precedente che ha movimenti nel periodo: predefinito l'anno prima (o, se non ne ha, il più recente che ne ha); la scelta resta finché non si cambia pagina (variabile `baseScelta` di `view-riepilogo.js`, non si salva). Per l'anno in corso si confronta lo stesso periodo, da gennaio al mese attuale compreso. Se nessun anno precedente ha movimenti nel periodo il gruppo non compare. Per le uscite salire è rosso, per le entrate è verde. `M.proiezioneUscite()` stima le uscite a fine anno (solo anno in corso): uscite finora ÷ mesi trascorsi (a giorni) × 12; sotto un mese intero di dati non dà una stima.
- **Statistiche per tag**: la pagina di un tag (`#tag/<nome>`) mostra uscite ed entrate per categoria, con lo stesso dettaglio di Mese; nel Riepilogo toccando un tag si aprono le torte di uscite ed entrate per categoria del periodo (con un link ai suoi movimenti).
- **Target**: un fondo è "sotto il target" se `obiettivo − saldo > 0` (`M.sottoTarget`). L'avviso compare in tre punti: nel gruppo «Avvisi» della pagina Mese, nei colori del saldo negativo (`--sal-neg`), con un pulsante per fondo che apre il trasferimento per reintegrare (`transferDialog({ a, val })`); un pallino ambra sulla voce Patrimonio; un toast quando il fondo scende sotto la soglia (con «Vedi», che apre il fondo). Al primo controllo dopo l'avvio si prende solo nota dello stato, senza toast. Con il calcolo automatico spento non c'è nessun target. È "oltre il target" se `saldo − obiettivo > 0` (`M.oltreTarget`): solo un avviso nel gruppo «Avvisi» di Mese, nei colori del saldo positivo (`--sal-pos`), con un pulsante per fondo che apre il trasferimento per spostare l'eccedenza (`transferDialog({ da, val })`); niente pallino né toast.
- **Movimenti senza fondo** con data successiva alla partenza (`M.senzaConto`): vengono segnalati e non entrano nei saldi. La segnalazione compare in tre punti: nella riga del movimento («Scegli il fondo»), nel gruppo «Avvisi» della pagina Mese (solo per i movimenti del mese mostrato e non durante la ricerca) e nel gruppo «Movimenti senza fondo» del Patrimonio (i primi 30). Non sono segnalati i movimenti senza importo né quelli che non servono un fondo (`M.fondoNonServe`: l'uscita «Acquisto a rate» del prezzo, che nella riga dice «A rate»).
- **Andamento del patrimonio** (`M.serieAuto`): un punto alla data di partenza, uno per ogni fine mese successiva e uno per oggi. Le rilevazioni (`snap`) con data precedente alla partenza (tutte, se il calcolo automatico è spento) completano il grafico per il periodo prima; da quel giorno in poi contano solo i saldi calcolati. Le fasce del grafico sono i gruppi dei fondi (`--g-<gruppo>`). Il grafico compare con almeno due punti; il pulsante «Trasferimento» solo con il calcolo automatico attivo.
- **Ricerca** (campo in cima a Mese): parte da 2 caratteri e cerca in tutti i movimenti, non solo nel mese. Un testo che comincia con `#` cerca il tag esatto (senza distinguere maiuscole); altrimenti cerca nella descrizione, nella nota, nel nome di categoria e sottocategoria, nei tag, nei nomi dei fondi e nell'importo (virgola o punto). I risultati vanno dal più recente, al massimo 400; toccandone uno si apre il mese con il movimento evidenziato. Dalla ricerca si può aggiungere un tag a tutti i risultati. Le route `#cerca/…` e `#tag/…` sono la stessa pagina con il campo già compilato.
- **Movimenti: duplicare, spostare, rendere ricorrenti**: «Duplica» e «Salva e duplica» creano un movimento normale (`M.copiaMov`: senza `ricId`, `rataId`, `rataN`, `rataRuolo`) con `ord` = adesso. Per spostare un movimento in un altro mese si apre la finestra di modifica e si cambia la data (calendario con le frecce): cambiano `y`, `m` e `d` insieme, e dopo il salvataggio un toast con «Vai» apre il nuovo mese; «Senza giorno» lascia `d` a `null` nel mese mostrato. «Rendi ricorrente» precompila una ricorrenza mensile dallo stesso movimento (`ricSeedFromMov`), con la prima ripetizione il mese dopo; non è offerto ai movimenti già generati da una ricorrenza o da un piano né a quelli senza importo.
- **Calendario del mese**: ogni giorno somma entrate e uscite che contano (non `escl`); lo sfondo della casella è verde se il saldo del giorno è positivo, rosso se negativo, in 5 tinte (`--cal-in-1…5`, `--cal-out-1…5`) secondo il rapporto con il saldo più alto in valore assoluto del mese; il saldo si scrive nella casella solo se quel giorno ci sono sia entrate sia uscite. Su telefono gli importi sono abbreviati (da 100 € senza decimali, da 1.000 € in «k»). I movimenti senza giorno stanno nel gruppo «Senza giorno». Entrando in un mese diverso dall'attuale non c'è nessun giorno selezionato; nel mese attuale è selezionato oggi.
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
  - **Movimenti rigenerabili**: si scrivono con `store.saveAuto`, con `updated_at` = `gen` del piano (un numero piccolo, sotto `store.AUTO_TS`). Se il movimento esiste già (anche eliminato) con un `updated_at` pari o più grande non viene toccato: le modifiche e le eliminazioni fatte a mano (timestamp veri) vincono sempre, anche sugli altri dispositivi. Modificare o eliminare un piano non tocca i movimenti già generati. Cambiare modalità a un piano (dal piano stesso, `M.cambiaModalitaPiano`) o chiuderlo aumenta `gen`: i movimenti automatici non toccati a mano si rifanno (o si eliminano, se nella nuova situazione non servono). Ogni piano salva sempre la sua `modalita`; non c'è più un'impostazione generale nell'interfaccia: la finestra di un nuovo piano propone la modalità dell'ultimo piano salvato (`cfg.modalitaRate`, che si aggiorna al salvataggio se è diversa).
  - **Residuo** (`M.statoPiano`, `M.rateTotali`): la somma delle rate (e dell'anticipo) non ancora scadute dei piani aperti con acquisto già fatto. Si sottrae nel patrimonio netto come i debiti, senza creare record `debt`.
  - **Salda il residuo** (`M.saldaPiano`): pagamento finale dal fondo alla data scelta (oggi o prima), con importo proposto = residuo a quella data; il piano si chiude e non genera più rate. In modalità `acquisto` la parte che supera il capitale ancora da restituire (prezzo − anticipo − capitale delle rate pagate) va in "Interessi e commissioni", il resto esce con `escl`; in modalità `rate` è un'uscita normale nella categoria del piano.
  - **Annulla per reso** (`M.resoPiano`): chiude il piano e alla data scelta registra sul fondo il rimborso, proposto = quanto pagato finora (modificabile per i resi parziali). In modalità `acquisto` è un'entrata con `escl` e l'uscita del prezzo si riduce a capitale pagato − rimborso (si elimina se arriva a zero); in modalità `rate` è un'entrata normale nella stessa categoria del piano (una categoria di uscita: la finestra del movimento la mostra comunque; nei budget riduce la spesa).
  - **Riapri** (`M.riapriPiano`, anche "Annulla" nel toast della chiusura): toglie i movimenti della chiusura, ricrea l'uscita del prezzo dopo un reso e riprende a generare le rate.
  - **Avvisi**: nel gruppo «Avvisi» della pagina Mese le rate dei piani aperti in scadenza da oggi ai prossimi 7 giorni (`M.rateInScadenza`); in Debiti un riquadro con il residuo totale.
  - **Interfaccia**: modelli precompilati "PayPal 3 rate" (3 rate mensili, la prima alla data di acquisto, senza interessi, creditore PayPal), "PayPal 6/12/24 rate" (prima rata un mese dopo, importo da inserire) e "Personalizzato". Accanto a «Come contarlo nelle uscite» un pulsante «i» apre e chiude la spiegazione delle due modalità. Nella finestra del movimento, per le uscite, "Pagato a rate…" apre un piano con i dati già inseriti e il modello PayPal 3 rate: salvando il piano il movimento non viene creato (o viene eliminato, se esisteva) perché i movimenti li genera il piano.
- **Budget di spesa** (`M.budgetStato` e funzioni vicine, in `model.js`):
  - *Cosa conta*: le uscite del periodo che rientrano nel budget, con le stesse regole dei totali (`counts`: niente `escl`, niente movimenti senza importo; trasferimenti, correzioni e debiti non sono mai uscite). Un movimento senza giorno vale per il suo mese. Un budget su una categoria include tutte le sue sottocategorie; uno su una sottocategoria conta solo i movimenti con quella `sub`; un tag si confronta senza distinguere maiuscole. Pagamenti a rate: contano secondo la modalità del piano ("all'acquisto": il prezzo nel mese d'acquisto e gli interessi, non le rate di capitale, che hanno `escl`; "rata per rata": ogni rata nel suo mese). Il rimborso di un reso in modalità "rata per rata" (entrata con `rataRuolo` `reso`, `M.rimborsoReso`) si sottrae dalla spesa del periodo in cui arriva (`M.valBudget`), che non scende mai sotto zero.
  - *Importo nel tempo*: `val`/`espr` sono sempre l'ultimo importo; `valori` li conserva tutti. Una modifica vale **da un mese in poi** (`M.budgetConValore`) e i mesi prima restano valutati con l'importo di allora. La prima voce di `valori` è anche l'inizio del budget: prima di quel mese non si valuta niente. Un budget senza `valori` (o con `da` vuoto) vale da sempre. Per i budget annuali la modifica vale per l'anno intero (conta l'importo in vigore a dicembre) e `da` è sempre gennaio.
  - *Riporto*: se `riporto` è attivo, l'avanzo (o lo sforamento, che diventa negativo) del periodo prima si somma al disponibile del successivo, a catena dall'inizio del budget. Per i budget annuali il riporto passa da un anno all'altro.
  - *Disponibile e stato*: disponibile = importo + riporto. Stato (`budgetStato`): `sforato` se speso > disponibile; solo per il periodo in corso, `vicino` se ha usato almeno l'80% (`BUDGET_SOGLIA`), `ritmo` se la % usata supera di oltre 15 punti la % di periodo trascorsa (a giorni) e ha già usato almeno il 25%; altrimenti `ok`. I periodi conclusi sono solo rispettati o sforati. `inLinea` = disponibile × periodo trascorso: quanto sarebbe "in linea" a oggi (si mostra per i budget annuali).
  - *Colori*: ambra per `ritmo` e `vicino` (`--bud-warn`), ambra più intensa con la parte oltre il limite tratteggiata e «Sforato di X» per `sforato` (`--bud-over`). Mai il rosso, che nell'app indica le uscite. Il segno sulla barra è il punto del periodo.
  - *Avvisi*: `checkBudgets` in `main.js`, come per i target: un toast quando un budget del periodo in corso passa a `vicino` o a `sforato`. Al primo controllo si prende solo nota dello stato.
  - *Mese*: gruppo «Budget» con una barra per ogni budget (anche per mesi passati o futuri); toccandolo si apre l'elenco dei movimenti che lo compongono. Un budget annuale mostra l'anno intero.
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
- **Niente sincronizzazione**: `main.js` non chiama `sync.start()`, e in `sync.js` `config()` e `session()` restituiscono `null`, le chiamate di rete lanciano un errore e le funzioni che scrivono le impostazioni non fanno nulla. Nella pagina Sincronizzazione e nel pannello della sincronizzazione c'è solo un breve messaggio («Solo su questo dispositivo» sul pulsante della barra in alto).
- **Dati di esempio**: al primo avvio (archivio della demo vuoto) `demo.prepara()` carica i record di `demo.genera(oggi)` con `store.importRecords`. Sono inventati, con nomi generici, deterministici (numeri pseudo-casuali con seme fisso) e con date relative a oggi: movimenti con giorno e fondo da gennaio dell'anno scorso a oggi (così confronto con l'anno prima e proiezione hanno un anno intero), uno storico di due anni fa con i totali del mese senza giorno né fondo, come se fosse importato da un Excel (numeri pseudo-casuali con un seme a parte; serve a scegliere un anno diverso nel confronto del Riepilogo), 5 fondi con saldi iniziali e data di partenza, un sesto fondo fermo nello stesso gruppo dei contanti («Salvadanaio», così nel Patrimonio si vede un gruppo con più fondi, chiuso con l'anteprima e aperto) e un fondo archiviato senza saldo, due target (sul conto deposito, poco sopra il saldo di oggi: «sotto il target»; sul conto corrente, qualche centinaio di euro sotto il saldo: «oltre il target»), trasferimenti, due movimenti senza fondo e uno senza giorno nel mese corrente (per vedere le segnalazioni e «Senza giorno»), il tag "Vacanza a Lisbona", tre debiti e crediti con rimborsi, tre movimenti ricorrenti (due attivi e un abbonamento terminato; i loro movimenti li crea `M.generaRicorrenti()`), quattro pagamenti a rate (una lavatrice con anticipo e interessi, contata all'acquisto, e uno smartphone in 3 rate a tasso zero con PayPal, contato rata per rata, con la prossima rata entro una settimana; poi due già conclusi: delle cuffie con tutte le rate pagate e un monitor annullato per reso da `prepara()` con `M.resoPiano`; i movimenti li crea `M.generaRate()`), sei budget (`preparaBudget()`: Ristoranti, che questo mese risulta sforato perché da questo mese l'importo scende sotto la spesa già fatta, Spesa con riporto, Viaggi annuale, Trasporti «vicino al limite», Tutte le uscite con importo tarato sul «ritmo troppo veloce» e Svago che parte il mese prossimo, quindi «Parte da…»; gli importi si calcolano sui dati di oggi, e il «ritmo» si vede solo nella prima metà del mese, quando la quota usata può superare di 25 punti quella del mese trascorso), una rilevazione manuale (con `M.salvaRilevazione`), due rilevazioni storiche e alcune voci di soldi buttati. Categorie e sottocategorie in più hanno id `cat-demo-…` e `sub-demo-…`. Poi `main.js` esegue `M.migrate()` come sempre.
- **Avviso**: una barra sempre visibile in cima ("Versione demo: i dati sono di esempio") con "Ricomincia" (con conferma: chiude e cancella `contabilita-demo` e ricarica, così i dati di esempio ripartono da capo) ed "Esci dalla demo" (toglie la scelta e `?demo` dall'indirizzo e ricarica l'app normale; l'archivio della demo resta sul dispositivo).
- **Aggiornamenti**: la demo usa gli stessi file dell'app normale (stesso indirizzo, stesso service worker), quindi ogni modifica pubblicata su `main` arriva anche alla demo, con lo stesso avviso "Aggiorna". In più i dati di esempio si rigenerano a ogni nuova versione: all'avvio, prima di aprire l'archivio, `demo.controllaVersione()` chiede al service worker che ha servito la pagina il suo `VERSION` e lo confronta con quello dei dati (`localStorage`, chiave `contabilita.demo.dati`). Se è diverso svuota `contabilita-demo`, `prepara()` rigenera i dati con il codice nuovo e un toast lo spiega; le modifiche fatte nella demo si perdono. Se i dati sono stati generati prima che il service worker fosse attivo (valore `?`), si registra solo la versione, senza rigenerare.
- **Ogni nuova funzione va mostrata anche nella demo**: se aggiungi una funzione che ha bisogno di dati (un nuovo `kind`, un nuovo campo, una nuova pagina) o cambi il modello dei dati, aggiorna anche `demo.genera()` (o `demo.prepara()`, se servono le funzioni del modello) e prova la demo da zero con Ricomincia. Basta aumentare `VERSION`, come a ogni rilascio, perché chi ha già la demo riceva i dati nuovi.

## Interfaccia

**Ordine entrate e uscite**: ovunque le entrate vengono sempre prima delle uscite (totali, colonne, riquadri, pulsanti di scelta del tipo, categorie, caselle del calendario). Fa eccezione solo la finestra «Debito o credito» (Mi deve / Devo), che non è un tipo di movimento.

**Stile**: Material 3 Expressive con il verde acqua del logo, descritto in `STILE.md` (da leggere prima di toccare l'aspetto). Il colore ha sempre un significato: verde per le entrate (`--in`, `--in-bar` per barre e capsule), rosso per le uscite (`--out`, `--out-bar`), ambra **solo** per gli avvisi (`--warn` su `--warn-bg`: avvisi, pallino del Patrimonio, sincronizzazione bloccata o in errore, budget), viola per i soldi buttati (`--butt`), verde acqua (`--primary`, `--hero`) per pulsanti principali, voce attiva e riquadri di riepilogo. Il saldo di un fondo è neutro (`--saldo` = `--text`). Il saldo di un periodo ha un colore dinamico (`saldoCls` in `expr.js`) con i colori del logo: menta se positivo (`--sal-pos`), rosa se negativo (`--sal-neg`), neutro se zero; sul fondo chiaro i testi usano una tinta più scura per la leggibilità, `--sal-*-bar` è la tinta per barre e capsule, `--hero-pos`/`--hero-neg` quella sul verde acqua. `--pos`/`--neg` sono gli stessi colori dei saldi. Sotto il target usa i colori del saldo negativo, oltre il target quelli del positivo. I gruppi dei fondi hanno i loro colori (`--g-<gruppo>`; contanti in marrone, per non confondersi con l'ambra). Le categorie hanno un'icona quadrata con l'emoji su una tinta del loro colore (`color-mix` con `--cat-mix`). I budget usano tre colori propri: `--bud-ok` (grigio), `--bud-warn` (ambra: ritmo troppo veloce e vicino al limite), `--bud-over` (ambra intenso: sforato), mai il rosso. Nessun colore scritto a mano in `style.css` o nei JS: solo variabili (i colori delle categorie sono dati).

**Gruppi espandibili** (`js/gruppi.js`, come le notifiche raggruppate dei telefoni Pixel): quasi ogni elenco è un gruppo con capsula colorata, titolo, totale e contatore «N ˅». Chiuso mostra un'anteprima di 4 voci (descrizione, dettaglio, importo) e «e altri N»; toccando l'intestazione o l'anteprima si apre con l'altezza che cambia a molla e le righe in cascata, e si vedono le righe complete con i loro pulsanti. Con una sola voce il gruppo mostra la riga completa senza contatore; vuoto, un testo. Lo stato aperto/chiuso si ricorda per id (`contabilita.gruppi`); senza una scelta i gruppi sono chiusi sotto i 900 px e aperti sopra. Il codice apre un gruppo da solo con `G.apri(id)` o `G.ricorda(id, true)` (per esempio quando si evidenzia un movimento). Id usati: `mese-avvisi`, `mese-budget`, `mese-in`, `mese-out`, `mese-all`, `mese-trasf`, `mese-senza`, `mese-giorno`, `rie-cmp`, `rie-budget`, `rie-top`, `rie-tag`, `rie-butt`, `pat-senza`, `pat-g-<gruppo>`, `pat-storiche`, `conto-mov`, `debiti-p-<persona>`, `rate-aperti`, `rate-conclusi`, `ric-attivi`, `ric-terminati`. I gruppi «Conclusi» e «Terminati» sono attenuati (`gr-attenuato`).

**Avanzamento a riquadro pieno** (`.riempi`, come le schede di Google Health): dove c'è un avanzamento la scheda stessa è la barra, con `--p` (quota piena) e `--c` (colore); `--fill-mix` e `--track-mix` in `palette.css` regolano le due tinte, e `.oltre` rende più intensa la parte dopo `--p`. Si usa per le schede dei fondi con un target, i piani a rate in corso, i debiti con rimborsi e l'elenco delle categorie sotto le torte. I budget restano barre a capsula (portano la tacca del limite e il segno del periodo).

**Elenchi a scelta**: nessun `<select>` apre l'elenco del sistema. I select restano nel codice (si leggono e si scrivono con `.value`, lanciano `change`), ma in CSS hanno `pointer-events: none`: il tocco arriva all'elemento sotto, e `ui.avviaSelect` (agganciato una volta in `main.js`) trova il select in quel punto e apre `sceltaBox`, una finestra con il titolo (dall'`aria-label` o dalla label del campo), la × e le voci a blocchi (titoli dei gruppi per gli `optgroup`, la voce scelta con la spunta); scegliendo imposta il valore e lancia `input` e `change`. Da tastiera si apre con Invio, Spazio, Alt+↓ o F4. Il colore delle categorie si sceglie con una finestra dello stesso stile (`sceltaColore`), con cerchi al posto del selettore del sistema. Le date hanno i loro calendari (`datepick.js`).

**Interruttori**: al posto delle caselle di spunta si usa `<label class="sw-row"><span>testo<small>spiegazione</small></span><input type="checkbox" class="switch" role="switch"></label>` (come nelle impostazioni di Android: traccia a capsula, pallino con la × o la spunta). Restano normali `checkbox` per il codice, quindi si leggono con `.checked`.

**Layout e temi**:
- Le variabili CSS sono definite in `:root`, con il tema scuro tramite `prefers-color-scheme` oppure `data-theme` (`light`/`dark`, scelto in Account → Aspetto; con «Come il sistema» l'attributo manca). I colori sono in `palette.css`; `style.css` aggiunge raggi, ombre, `--nav-h`, i caratteri e la curva a molla `--spring`.
- Barra in alto sempre visibile. Desktop: barra laterale sopra i 900 px. Telefono: barra sospesa in basso; le finestre si aprono dal basso come fogli (sopra i 900 px al centro, con una breve animazione).
- Punti di rottura usati: 900 px (barra laterale, gruppi aperti per predefinito, fogli al centro, gruppi dei fondi affiancati), 1000 px e 1200 px (colonne affiancate: `.two`, `.three`), 760 px (torta fissa accanto alle voci quando è aperta), 620, 560, 520, 400 e 380 px (telefono: barra degli strumenti in colonna, righe compatte), `pointer: coarse` (bersagli da 44 px), `prefers-reduced-motion` (niente animazioni: gruppi, barre e finestre cambiano subito).
- Le righe dei movimenti cambiano disposizione con una container query sulla larghezza del gruppo (`container: ledger`, da 680 px tabella con le colonne e la matita), non dello schermo: sotto sono blocchi con icona della categoria, descrizione, riga «giorno, categoria, fondo», importo e i pulsanti matita e freccia.
- Caratteri locali: Figtree per il testo (`--font`), Bricolage Grotesque per titoli e numeri grandi (`--font-title`), con ripiego sui caratteri di sistema; numeri tabellari (`tabular-nums`).
- Il colore della barra del browser (`meta theme-color`) segue il tema scelto (`applyTheme` in `view-aspetto.js`, che legge `--bg`); `theme_color` e `background_color` del manifest (`#055A63`, il fondo del logo) valgono solo per la schermata di avvio dell'app installata.

**Date, mesi e anni**: non si usano mai i selettori del browser (`<input type="date">`, `type="month"`): dove serve una data c'è un pulsante che mostra il valore («12 novembre 2026», «Novembre 2026», «2026») e apre il calendario di `datepick.js`, sempre uguale: per le date i giorni del mese con le frecce ‹ › per cambiare mese e, dove la data si può togliere, un pulsante come «Senza giorno» o «Nessuna data»; per i mesi dodici mesi con le frecce per cambiare anno; per gli anni dodici anni per volta. Si scrive nella pagina con `dateInput`, `monthInput` o `yearInput` (un input nascosto con il valore `AAAA-MM-GG`, `AAAA-MM` o `AAAA`, più il pulsante) e si legge come un input normale: l'input nascosto lancia `input` e `change` quando si sceglie. Dal codice il valore si cambia con `setPick(input, valore)`, non con `.value =` (il pulsante non si aggiornerebbe); `min` e `max` rendono non scegliibili i giorni o i mesi fuori intervallo. Un solo ascolto sul documento apre i calendari. Dove ci sono: titolo del mese in Mese, Dal/Al del Riepilogo (mesi) e del Patrimonio (giorni), data di partenza dei Fondi, trasferimento, ricorrenti, rate (acquisto, prima scadenza, anticipo, saldo e reso), debiti (data e rimborsi), rilevazione manuale, budget («Vale dal» in mesi o in anni) e finestra del movimento.

**Testi**: nell'interfaccia si parla di **fondi**, non di "conti". Nelle righe la colonna si chiama "Pagato con" per le uscite e "Ricevuto su" per le entrate. Nel codice id e route restano `conto`, `conti`, `cont`.

## Finestre e pannelli

**Finestre** (tutte `<dialog>` modali create da `ui.modal()`, che le toglie dalla pagina alla chiusura; toccando fuori si chiudono; sotto i 900 px salgono dal basso come fogli alti quanto serve, sopra la tastiera (`--kb`); l'opzione `sheet` a tutto schermo esiste ma oggi non è usata; i due pannelli della barra in alto sono `modal` con la classe `panel`, che scendono sotto la barra). Regole comuni: nessuna finestra salva finché non si preme il pulsante principale, «Annulla» e × chiudono senza lasciare tracce; gli errori di compilazione sono toast brevi che portano il cursore sul campo; ogni eliminazione chiede conferma e, dove ha senso, lascia un toast con «Annulla» che ripristina il record; i campi importo accettano espressioni (`bindAmount`: attivo mostra la formula, a riposo il risultato).

| Finestra | Funzione (file) | Da dove si apre | Cosa fa |
| --- | --- | --- | --- |
| Movimento | `movDialog` (dialogs.js) | Pulsante «Nuovo» (Mese, Cerca, Tag), «+ Aggiungi movimento» del giorno scelto nel calendario, matita di una riga | Crea o modifica un movimento. **Selettore Entrata/Uscita** (Entrata prima; compare per i nuovi movimenti, che partono come uscita; dalla matita il tipo è già deciso). Importo con tastierino `+ − × ÷ ( )` e anteprima «= risultato»; descrizione con suggerimenti; **Data** (un campo che mostra per esempio «12 novembre 2026» o «Novembre 2026 · senza giorno»: toccandolo si apre il calendario con le frecce ‹ › per cambiare mese, i giorni del mese, «Senza giorno» e «Annulla»; non c'è più un campo «Mese» a parte); categoria e sottocategoria (suggerite, finché non si sceglie a mano); «Pagato con»/«Ricevuto su» (anche «Dividi tra più fondi…»); tag, nota, interruttore «Escludi dai totali». Pulsanti: «Aggiungi/Salva», «Aggiungi e duplica» (salva e riapre la finestra precompilata) o, in modifica, «Salva e duplica» (salva e crea una copia), «Rendi ricorrente…», «Pagato a rate…» (solo uscite), «Elimina» (solo in modifica). «Rendi ricorrente…» e «Pagato a rate…» non compaiono sui movimenti generati da ricorrenze o piani |
| Dividi tra più fondi | `splitEditor` | Dalla finestra del movimento, o dalla riga con la ripartizione che non torna | Righe fondo + importo, «+ Aggiungi un fondo», controllo «Mancano X da assegnare»; la somma deve coincidere con il totale |
| Trasferimento | `transferDialog` | Mese: «+ Aggiungi trasferimento» e righe dei trasferimenti, pulsanti dei fondi sotto o oltre il target negli avvisi; Patrimonio: «Trasferimento»; dettaglio fondo: «Reintegra», «Trasferisci qui», «Trasferisci da qui» | Da, A (fondi diversi), importo, data, nota; «Elimina» in modifica |
| Correggi il saldo | `adjustDialog` | Dettaglio fondo: «Correggi il saldo» | Scrivi il saldo reale: registra un `rett` con la differenza (data di oggi) |
| Rilevazione manuale | `snapDialog` (view-patrimonio.js) | Patrimonio: «Rilevazione manuale»; riga di «Rilevazioni storiche» | Data e saldo di ogni fondo (segnaposto = calcolo automatico di quel giorno), totale, confronto per fondo, scelta `auto`/`manuale` quando c'è una differenza, «Elimina» (toglie anche le correzioni generate) |
| Debito o credito | `editor` (view-debiti.js) | Debiti: «Nuovo», tocco su una voce | «Mi deve dei soldi»/«Devo dei soldi», persona (suggerita), importo, per cosa, data, fondo (solo con il calcolo automatico), nota; in modifica l'elenco dei rimborsi (data, importo, fondo), «+ Registra un rimborso», «Segna come saldato» e il residuo |
| Movimento ricorrente | `ricDialog` | Ricorrenti: «Nuovo» e tocco su una voce; finestra del movimento e voci extra di una riga («Rendi ricorrente») | Tipo (Entrata o Uscita), descrizione, importo, categoria, fondo, prima scadenza (calendario), «Si ripete ogni» N settimane/mesi/anni, ultima scadenza facoltativa, nota; frase che spiega le scadenze; salvando aggiunge subito le scadenze già passate |
| Pagamento a rate | `rateDialog` | Rate: «Nuovo» e tocco su un piano; finestra del movimento («Pagato a rate…») | Modello (solo per i nuovi), descrizione, prezzo, categoria/sottocategoria, data di acquisto, creditore; numero di rate, importo, ultima rata, prima scadenza, ripetizione, fondo; anticipo facoltativo (importo, data, fondo); riepilogo del costo; «Come contarlo nelle uscite» (All'acquisto / Rata per rata, proposta quella dell'ultimo piano, con il pulsante «i» che spiega la differenza); tag, nota. In modifica: riga di stato, «Salda il residuo…», «Annulla per reso…» oppure «Riapri il piano», «Elimina» |
| Salda il residuo / Annulla per reso | `chiusuraDialog` | Dalla finestra di un piano aperto | Data (calendario, oggi o passata), importo proposto (residuo o quanto pagato), fondo; chiude il piano; toast con «Annulla» che lo riapre |
| Budget | `budgetDialog` (view-budget.js) | Budget: «Nuovo» e tocco su un budget | «Su cosa» (categoria, sottocategoria, tag, tutte le uscite), periodo Al mese/All'anno, importo (proposto dalla mediana dei 12 mesi), «Vale dal» mese o anno (solo se l'importo cambia), interruttore del riporto; «Elimina» in modifica |
| Conferma | `confirmBox` (ui.js) | Eliminazioni, uscita dall'account, disattivazione del calcolo automatico, importazione… | Messaggio + «Annulla»/pulsante principale (rosso se pericoloso) |
| Testo da inserire | `promptBox` (ui.js) | Ricerca: «Aggiungi un tag a tutti» | Un campo di testo |
| Scelta | `sceltaBox` (ui.js) | Ogni `<select>` dell'app (categoria, sottocategoria, fondo, ripetizione, modello delle rate, «Su cosa» del budget, gruppo dei fondi, tema…) | Titolo e ×, voci a blocchi con i titoli dei gruppi, la scelta attuale con la spunta; toccando una voce si sceglie e si chiude |
| Colore | `sceltaColore` (view-categorie.js) | Categorie: il cerchio colorato di una categoria | Titolo e ×, anteprima della categoria (icona ed emoji nel colore), 24 colori in cerchi (quello attuale con la spunta, in forma di quadrato arrotondato; un colore fuori elenco resta come primo); toccando un colore si salva e si chiude |
| Calendario dei giorni, dei mesi, degli anni | `dayPicker`, `monthPicker`, `yearPicker` (datepick.js) | Ogni pulsante di data, mese o anno (`dateInput`, `monthInput`, `yearInput`), il titolo del mese in Mese e il campo Data della finestra Movimento | Giorni del mese con le frecce ‹ › per cambiare mese (lunedì per primo; oggi e giorno scelto evidenziati; i giorni fuori da `min`/`max` non si toccano); mesi con le frecce per cambiare anno; anni dodici per volta. Un pulsante in più toglie la data («Senza giorno», «Nessuna data», «Dall'inizio»…) dove la data è facoltativa; «Annulla» chiude senza cambiare. Scegliere chiude la finestra |

**Altri elementi trasversali**:
- **Toast** (`#toast`, capsula verde acqua in basso, sopra la barra e il pulsante «Nuovo» su telefono): messaggio breve, 3,5 secondi, con un pulsante d'azione facoltativo («Annulla», «Vai», «Vedi», «Aggiorna»). Ne esiste uno alla volta.
- **Tooltip dei grafici** (`data-tip`): al passaggio del mouse sulle fette delle torte e sulle barre; sul telefono al tocco. Si nasconde allo scorrimento.
- **Avviso «Aggiorna»**: toast di 60 secondi quando un service worker nuovo è pronto; il controllo si ripete al ritorno della pagina visibile, al ritorno della rete e ogni 30 minuti.
- **Barra della demo**: fascia ambra chiaro fissa in cima, sopra la barra in alto, solo in modalità demo.
- **Pannelli della barra in alto**: sincronizzazione e account (vedi «Barra in alto»).
- **Pannelli che si aprono sulla pagina** (non sono finestre): le voci extra di un movimento (tag, nota, «Escludi», Duplica, Rendi ricorrente, Elimina), il dettaglio di una categoria sotto la torta, l'elenco di voci aperto dal centro della torta, la tabella «Mese per mese» o «Anno per anno» sotto il grafico, le categorie del confronto con l'anno prima, le torte di un tag, l'elenco dei movimenti di un budget, il menu ⋯ di un fondo, il pannello delle sottocategorie, la spiegazione «i» delle modalità nella finestra delle rate, e i gruppi espandibili.

## Regole per ogni modifica

1. **A ogni rilascio aumenta `VERSION` in `sw.js`** (`contabilita-vN`). Se aggiungi un file, inseriscilo nella lista `SHELL`. Senza questi due passi gli utenti restano sulla versione vecchia o l'app non funziona offline.
2. **Compatibilità con i dati esistenti**:
   - I nuovi campi devono avere un valore predefinito ragionevole quando mancano.
   - Le conversioni di dati vanno in `M.migrate()`, che deve essere idempotente: viene eseguita a ogni avvio e dopo ogni pull.
   - Non cambiare mai il significato di campi esistenti.
3. **Mai dati in chiaro verso il server**: ogni nuovo `kind` passa automaticamente da `push()` cifrato. Non aggiungere altre chiamate che inviano contenuti.
4. **Niente dipendenze esterne**: niente script da CDN e niente Google Fonts (i caratteri sono file locali in `fonts/`, nella lista `SHELL`).
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

- **Barra in alto**: pulsante della sincronizzazione (nuvola, con il testo dello stato da 900 px; → pannello della sincronizzazione), logo e «Rationes», avatar (→ pannello dell'account; con l'anello verde acqua nelle pagine dell'account).
- **Navigazione**: Mese, Riepilogo, Patrimonio, Debiti, ciascuna con icona e nome (barra laterale da 900 px, barra sospesa in basso sotto). La voce della pagina corrente è evidenziata (anche per le sottopagine: Fondi e dettaglio fondo → Patrimonio; Rate → Debiti; Cerca e Tag → Mese; le pagine dell'account evidenziano l'avatar). Pallino ambra sul Patrimonio (fondo sotto il target).
- **Pulsante «Nuovo»** in basso a destra, solo in Mese, Cerca e Tag.
- **Toast** in basso, con pulsante d'azione facoltativo.
- **Barra della demo** in cima, solo in modalità demo: «Versione demo: i dati sono di esempio», «Ricomincia», «Esci dalla demo».
- **Messaggio d'errore a tutta pagina** se l'archivio locale non si apre (navigazione privata).
- **Intestazione di pagina** (`page-head`): titolo grande e, a destra, i pulsanti principali. Le sottopagine hanno accanto al titolo il pulsante «‹ indietro» con il nome della schermata precedente (vedi «Pulsante indietro»).
- **Gruppi espandibili** al posto dei riquadri con elenchi (vedi «Gruppi espandibili»).

### Pannello della sincronizzazione (dalla nuvola)

- Intestazione con l'icona della nuvola, «Sincronizzazione», sotto lo stato («Tutto aggiornato, ultima sincronizzazione …» oppure il messaggio di `sync.getStatus()`) e la × per chiudere; account; «Cifratura end-to-end attiva» quando le chiavi ci sono (in demo un messaggio); la voce a blocco **Sincronizzazione e cifratura** (→ `#sincronizzazione`, con un sottotitolo che dice cosa manca: collegare il progetto, accedere, la frase segreta); «Sincronizza ora» (solo se è attiva).

### Pannello dell'account (dall'avatar)

- Intestazione «Il tuo account» con lo stato (email collegata, demo, non configurato) e ×.
- Voci a blocchi, con icona, titolo, sottotitolo e freccia: **Fondi** (→ `#conti`), **Categorie** (→ `#categorie`), **Movimenti ricorrenti (N)** (→ `#ricorrenti`), **Pagamenti a rate (N)** (→ `#rate`), **Budget (N)** (→ `#budget`), **Importa ed esporta** (→ `#dati`), **Aspetto** (→ `#aspetto`).
- Riga finale: «Rationes, versione N. I dati sono salvati su questo dispositivo [e sincronizzati, cifrati, sul tuo progetto Supabase]».

### Mese (`#mese`, `#cerca`, `#tag`)

**Intestazione**
- Titolo «Mese Anno» grande (per esempio «Marzo 2026»): toccandolo si apre il calendario dei mesi (con le frecce per cambiare anno).
- A destra la lente (su telefono apre e chiude il campo di ricerca) e il gruppo collegato ‹ › («Mese precedente», «Mese successivo»).
- Pulsante «Oggi» sotto il titolo (solo se non si è nel mese attuale).
- **Riquadro verde acqua «Saldo del mese»**: saldo con segno (menta o rosa), entrate e uscite con la capsula del loro colore, e tre capsule verticali (entrate, uscite, saldo) in proporzione. Vale anche durante la ricerca e resta quello del mese.

**Barra degli strumenti**
- Campo di ricerca a capsula «Cerca in tutti i movimenti, oppure #tag» (dal secondo carattere sostituisce il contenuto della pagina; su telefono compare toccando la lente, o se c'è già un testo).
- Interruttore **Elenco / Calendario** (ricordato sul dispositivo).

**Gruppo «Avvisi»** (compare solo se serve; contatore con il numero degli avvisi; da 900 px avvisi affiancati)
- «Sotto il target» / «N fondi sotto il target» (rosa del saldo negativo): un pulsante per fondo con il nome e «−importo»; tocco → finestra Trasferimento verso quel fondo, con l'importo che manca.
- «Oltre il target» / «N fondi oltre il target» (menta del saldo positivo): un pulsante per fondo con «+importo»; tocco → finestra Trasferimento da quel fondo, con l'eccedenza.
- «Una rata in scadenza» / «N rate in scadenza nei prossimi 7 giorni»: un pulsante per rata con descrizione, importo e data («oggi» oppure giorno, numero e mese in forma breve) → pagina Rate.
- «Un movimento di questo mese non indica il fondo» (ambra; non durante la ricerca).

**Gruppo «Budget»** (solo se ci sono budget validi nel mese; assente durante la ricerca)
- Una riga per budget (grafica condivisa `budgetui.js`): icona (categoria, `#` per un tag, `∑` per tutte le uscite) e nome, sotto l'importo («400,00 € al mese», «all'anno», più «+/− X riportati»), a destra la cifra spesa e «su X» disponibili; barra a capsula con il riempimento, la parte oltre il limite tratteggiata, la tacca del limite e il segno del punto del periodo (solo per il periodo in corso); riga di stato («Nei limiti», «Rispettato», «Ritmo troppo veloce», «Vicino al limite», «Sforato di X») con «Disponibile X» e, per gli annuali in corso, «In linea a oggi: X».
- Toccando una riga si apre l'elenco dei movimenti che la compongono (data, descrizione, importo; i rimborsi dei resi in verde con «−»), ognuno è un link al movimento.
- Legenda «Il segno sulla barra indica a che punto è il periodo.» e, in fondo al gruppo, il pulsante «Gestisci» (→ Budget), con la stessa grafica dei pulsanti «+ Aggiungi» dei gruppi.

**Vista Elenco**
- Sopra i gruppi il selettore «Entrate e uscite: Separate | Insieme» (ricordato sul dispositivo). Con **Insieme** c'è un solo gruppo «Movimenti» con entrate e uscite in ordine di data, distinte dal colore dell'importo.
- Se l'archivio è vuoto: riquadro «Non ci sono ancora movimenti…» con il pulsante «Importa lo storico» (→ Importa ed esporta).
- Due gruppi, **Entrate** e **Uscite**, con totale e contatore; chiusi mostrano l'anteprima (descrizione, «giorno, categoria», importo). Da 680 px di larghezza del gruppo anche la riga delle colonne (Giorno, Importo, Descrizione, Categoria, «Ricevuto su» o «Pagato con»). Nessun pulsante per aggiungere: si usa «Nuovo».
- **Riga di un movimento**: icona della categoria (emoji su un quadrato del suo colore); giorno (– se manca); importo (sottolineato a puntini se è un'espressione, con la formula al passaggio del mouse); descrizione («Senza descrizione» in tenue); categoria con nome e « · sottocategoria»; fondo (nomi uniti da «+»; «Scegli il fondo» in ambra con pallino se manca; «A rate» per l'acquisto di un piano; «—» altrimenti; in rosso se la ripartizione non torna); **matita** per modificare (con un puntino se c'è una nota) e, su telefono, la **freccia** che apre le voci extra. Su telefono la riga è un blocco: icona, descrizione, sotto «giorno, categoria, fondo», importo a destra. Barrata e attenuata se esclusa dai totali. Sotto, la riga dei tag: «↻ Ricorrente» (→ Ricorrenti), «▤ Acquisto a rate / Anticipo / Rata / Interessi della rata / Saldo delle rate / Reso» (→ Rate) e i `#tag` (→ pagina del tag).
- **Voci extra** (si aprono toccando la riga o la freccia, o con Invio o Spazio da tastiera): avviso «La ripartizione sui conti non torna con l'importo» con «Correggi»; editor dei tag (chip con ×, campo «Aggiungi un tag…» con suggerimenti, Invio o virgola per aggiungere); **Nota**; interruttore «Escludi dai totali di entrate e uscite»; pulsanti «Duplica», «Rendi ricorrente» (non per movimenti generati o senza importo), «Elimina» (con conferma e «Annulla»).
- **Riordino**: tenendo premuto circa 0,4 secondi un movimento lo si trascina tra quelli dello stesso giorno e dello stesso gruppo (la pagina scorre da sola vicino ai bordi; vibrazione sul telefono).
- Gruppo **Trasferimenti tra fondi** (se il calcolo automatico è attivo o ci sono trasferimenti nel mese): nota «non contano come entrate o uscite»; righe con giorno, importo, nota («Trasferimento» se manca), **Da** e **A**; tocco → finestra Trasferimento; «+ Aggiungi trasferimento» in fondo.
- **Entrate per categoria** e **Uscite per categoria** (in quest'ordine): vedi «Torta per categoria» sotto.

**Vista Calendario**
- Griglia da lunedì a domenica; ogni giorno è una casella arrotondata con il numero, le entrate («+», verde), le uscite («−», rosso) e, se ci sono entrambe, il saldo del giorno. Sfondo in 5 tinte di verde o di rosso (`--cal-in-N`, `--cal-out-N`) secondo il saldo. Il numero di oggi è su un cerchio verde acqua; il giorno selezionato è evidenziato. Su telefono gli importi sono abbreviati.
- **Gruppo del giorno** sotto la griglia: data per esteso come titolo, saldo del giorno come totale, i movimenti del giorno con la stessa riga dell'elenco (senza il giorno, con le voci extra e il riordino); «Nessun movimento in questo giorno»; in fondo «+ Aggiungi movimento» (già con quel giorno; il tipo si sceglie nella finestra). Senza un giorno selezionato: «Tocca un giorno per vedere i movimenti.»
- Gruppo **Senza giorno** per i movimenti senza giorno.
- Poi, come nell'elenco: trasferimenti e categorie del mese.

**Torta per categoria** (in Mese, Riepilogo e nelle torte di un tag)
- Anello in stile Google Health: binario grigio, fette con spazi ed estremità tonde, capsula con la percentuale della categoria più grande; al centro «Entrate» o «Uscite», il totale in euro interi e «N categorie ▾/▴»; si anima la prima volta che compare. Al passaggio del mouse o al tocco su una fetta: nome, importo e percentuale. Nessun dato → «Nessun dato.»
- Toccando il centro (o Invio/Spazio) si apre l'elenco delle voci: per ogni categoria una scheda riempita in proporzione alla sua percentuale, nel colore della categoria, con icona, nome, importo e percentuale. Su schermo largo la torta resta fissa accanto all'elenco.
- Toccando una voce si apre il dettaglio: tabella per sottocategoria (se ce ne sono: numero di movimenti, percentuale, importo, «Senza sottocategoria») e «Voci principali» (fino a 12 descrizioni raggruppate, con numero di volte e totale; ognuna è un link alla ricerca).

**Ricerca / pagina di un tag** (con almeno 2 caratteri nel campo)
- Riga di sintesi «N movimenti: entrate X, uscite Y» e pulsante «Aggiungi un tag a tutti» (→ richiesta di testo).
- Per un tag (`#nome`): riquadri «Entrate per categoria» e «Uscite per categoria» (torte).
- Elenco dei risultati, dal più recente, con intestazione per ogni mese («Marzo 2026»); ogni risultato è un link al movimento nel suo mese con giorno, descrizione (e nota), categoria · sottocategoria, fondi, tag e importo con segno (barrato se escluso). Oltre 400 risultati: «Mostro i 400 più recenti: affina la ricerca…».
- Il gruppo Budget è nascosto; gli avvisi restano (tranne quello dei movimenti senza fondo).

### Riepilogo (`#riepilogo`)

- **Intestazione**: titolo «Riepilogo» e gruppo collegato ‹ periodo › («Periodo precedente», «Periodo successivo»; disattivati agli estremi). Il centro mostra l'anno o «Tutti gli anni» e apre la finestra «Periodo» con un chip per ogni anno con movimenti e «Tutti gli anni».
- Con «Tutti gli anni»: i pulsanti **Dal** e **Al** (mese, scelti dal calendario dei mesi; senza scelta dicono «Dall'inizio» e «Fino alla fine») e il chip «Tutto il periodo» per azzerarli.
- Senza dati: «Nessun movimento in questo periodo.»
- **Riquadro verde acqua** «Saldo del {anno}» («Saldo di tutti gli anni», «Saldo del periodo»): saldo con segno, entrate e uscite, tre capsule in proporzione (come in Mese).
- **Statistiche** in blocchi: Entrate medie al mese, Uscite medie al mese, Saldo medio al mese, Risparmio (%), Soldi buttati (sul viola chiaro).
- **Proiezione a fine anno** (solo anno in corso): stima delle uscite; Uscite finora, Ritmo al mese, Stima a fine anno; frase di confronto con la spesa dell'anno prima. Con meno di un mese di dati: «Troppo presto per una stima…».
- **Saldo accumulato**: spiegazione, riga di lettura («Mese Anno · saldo accumulato») e grafico a linea interattivo (mouse, tocco, frecce sinistra/destra, Esc).
- **Entrate e uscite per mese** (per anno in «Tutti gli anni»): legenda Entrate/Uscite/Saldo, grafico a barre a capsula, pulsante **Espandi ▾ / Comprimi ▴** che apre la tabella Mese (o Anno) | Entrate | Uscite | Saldo; le righe dei mesi portano alla pagina Mese, quelle degli anni al Riepilogo dell'anno.
- **Entrate per categoria** e **Uscite per categoria**: torte (vedi sopra).
- Gruppo **Rispetto al {anno}** (solo per un anno singolo, se un anno precedente ha movimenti nel periodo; predefinito l'anno prima): chiuso, l'anteprima di entrate, uscite e categorie di uscita con la variazione; aperto, la frase del periodo confrontato, i chip «Confronta con» (uno per ogni anno precedente con movimenti, se ce n'è più d'uno), la tabella Entrate/Uscite con i due anni e la variazione (verde/rosso) e le tabelle «Entrate per categoria» e «Uscite per categoria».
- Gruppo **Budget** (se ce ne sono con periodi conclusi): nome (e «Mensile»/«Annuale»), «Rispettato» («N su M mesi/anni») e «Scostamento medio» («X sotto», «X oltre» in ambra, «In pari»).
- Gruppo **Le spese più grandi**: le 10 uscite maggiori (link al movimento, mese, categoria, importo).
- Gruppo **Tag**: una riga per tag (`#tag`, numero di movimenti, uscite); toccandola si apre sotto di essa il riepilogo per categoria (torte) con il pulsante «Vedi i movimenti» (→ pagina del tag). Senza tag, un testo che spiega come aggiungerli.
- Gruppo **Soldi buttati**: per un anno, elenco modificabile (importo con espressioni, descrizione, × per eliminare con «Annulla»), «+ Aggiungi voce» in fondo e il totale nell'intestazione; in «Tutti gli anni», una riga per anno (numero di voci e totale).

### Patrimonio (`#patrimonio`)

- **Intestazione**: pulsanti «Trasferimento» (solo con il calcolo automatico attivo), «Rilevazione manuale» e «Fondi» (in evidenza se il calcolo automatico non è attivo).
- **Calcolo automatico spento**: riquadro «Calcolo automatico non ancora attivo» con la spiegazione e il pulsante «Configura i fondi».
- **Riquadro verde acqua** (calcolo attivo): «Patrimonio oggi» con il totale dei fondi; variazione in una capsula «dalla partenza del {data}» (menta/rosa); riga «Contando anche i crediti, i debiti, le rate da pagare» con il patrimonio netto (link a Debiti, solo se esistono); **Mesi di autonomia** (valore, anni se da 24 mesi in su, e la spiegazione «Senza entrate, con uscite medie di X al mese…»; assente se non ci sono uscite).
- **Ripartizione** (riquadro): torta ad anello dei gruppi di fondi (al centro «Fondi», il totale e «N gruppi»; al passaggio del mouse o al tocco nome, importo e percentuale) e accanto, da 620 px, la legenda a blocchi (capsula del colore, nome, importo, percentuale).
- Gruppo **Movimenti senza fondo** (ambra): nota e i primi 30 (descrizione, data, importo; link al movimento).
- **Un gruppo per ogni gruppo di fondi**, in ordine di importo decrescente (affiancati da 900 px): capsula del colore del gruppo, nome, totale, contatore se ci sono più fondi; chiuso mostra l'anteprima (nome, stato del target, saldo). Dentro, una **scheda per fondo** (→ dettaglio): nome, saldo e, se c'è un target, la scheda stessa riempita come una barra (rosa se sotto: la parte piena è quanto c'è rispetto al target; menta se oltre: il target pieno e l'eccedenza più intensa), «Target X» e stato («▼ X sotto il target», «▲ X oltre il target», «Al target»). I fondi archiviati compaiono solo se hanno ancora un saldo.
- **Andamento** (con almeno due punti): pulsanti **Dal** / **Al** (date, scelte dal calendario; senza scelta dicono «Dall'inizio» e «Fino a oggi») e «Tutto il periodo»; riga di lettura (data · Totale · variazione dal primo punto); legenda dei gruppi con il valore del punto scelto; grafico ad aree impilate interattivo (mouse, tocco, frecce) con il marcatore «calcolo automatico» alla data di partenza se esistono rilevazioni storiche. Se l'intervallo ha meno di due punti: «Nel periodo scelto ci sono meno di due rilevazioni: allarga le date.»
- Gruppo **Rilevazioni storiche**: spiegazione e tabella Data (con l'etichetta «saldi allineati alla rilevazione» o «solo confronto») | Totale | Variazione; ogni riga apre la finestra Rilevazione.

### Fondi (`#conti`)

- «‹ indietro» (Patrimonio, Account o la schermata di provenienza), titolo «Fondi».
- **Situazione di partenza**: spiegazione, pulsante «Data di partenza» (apre il calendario; scegliendo una data si attiva il calcolo automatico), «Disattiva il calcolo automatico» (con conferma), e, se esiste una rilevazione, il link «Usa come saldi iniziali i valori della rilevazione del {data}» (con conferma).
- **I tuoi fondi**: tabella con Nome, Gruppo (Contanti e monete, Conto corrente, Conto deposito, Portafoglio digitale, Crypto, Altro), Saldo iniziale e Target (campi che accettano espressioni); per ogni riga il pulsante **⋯** apre l'interruttore «Archiviato» («Non compare più tra i fondi selezionabili») ed «Elimina fondo» (rifiutato, con un toast, se il fondo è già usato); «+ Nuovo fondo».
- **Fondi proposti per i nuovi movimenti**: «Per le uscite» e «Per le entrate» (elenco dei fondi o «Nessuno»).

### Dettaglio di un fondo (`#conto/<id>`)

- «‹ indietro» (di solito Patrimonio), nome del fondo, pulsante «Modifica fondi» (→ Fondi). Fondo inesistente: «Questo fondo non esiste più.» con «Torna al patrimonio».
- Senza calcolo automatico: riquadro con «Configura i fondi».
- **Riquadro verde acqua del saldo**: «Saldo attuale · gruppo», riga del target (sotto, oltre o al target) e pulsanti **Reintegra** (solo se sotto il target), **Trasferisci qui**, **Trasferisci da qui**, **Correggi il saldo** (→ finestre).
- Gruppo **Movimenti** del fondo dal più recente: data (giorno e mese in evidenza, anno piccolo), descrizione (i trasferimenti mostrano la nota e «Da»/«A» con l'altro fondo; debiti e correzioni una seconda riga con «Debiti e crediti» o «Correzione»), importo con segno e «Saldo» progressivo. Ogni riga è un link: movimento e trasferimento → il loro mese; debito → Debiti; correzione → conferma di eliminazione. In fondo «Saldo iniziale al {data}: X».

### Debiti e crediti (`#debiti`)

- **Intestazione**: titolo e «Nuovo» (→ finestra).
- **Statistiche**: Ti devono (verde, con il numero di persone), Devi (rosso, con il numero di persone), Saldo.
- **Riquadro dei pagamenti a rate** (→ Rate): senza piani «Pagamenti a rate — Acquisti pagati a rate…»; con piani «Rate ancora da pagare», numero dei piani in corso, prossima rata e residuo totale.
- **Filtro**: chip «Da saldare», «Saldati», «Tutti» (ricordato sul dispositivo).
- **Un gruppo per persona**: titolo con il nome, totale «ti deve X» / «gli devi X» / «in pari», anteprima delle voci; voci con etichetta «Ti deve»/«Devi», descrizione, data e fondo, importo residuo (e «di X» se parziale) oppure «Saldato»; con dei rimborsi la voce è riempita per la parte già restituita; tocco → finestra. Elenco vuoto: testo con un esempio (la cena da 68 €).

### Pagamenti a rate (`#rate`)

- **Intestazione**: «‹ indietro» (Debiti, Account o la schermata di provenienza), titolo e «Nuovo» (→ finestra Pagamento a rate); nota introduttiva.
- **Statistiche** (se ci sono piani aperti): Ancora da pagare, Nei prossimi 30 giorni, Costo dei finanziamenti.
- Gruppo **In corso** (con il residuo totale), per prossima scadenza: icona della categoria, descrizione e creditore, «Pagate N di M, ne mancano K · prossima: data, importo», costo del finanziamento («Nessun costo di finanziamento») e modalità («contato all'acquisto» / «contato rata per rata»), importo ancora da pagare «di X»; la scheda è riempita per la parte già pagata; tocco → finestra. Senza piani: testo con un esempio (telefono da 300 € in 3 rate PayPal).
- Gruppo **Conclusi** (attenuato: saldati, annullati per reso o tutti pagati): stesse voci, con l'importo pagato e lo stato («saldato il…», «annullato per reso il…», «tutte pagate»).

### Movimenti ricorrenti (`#ricorrenti`)

- **Intestazione**: «‹ indietro», titolo e «Nuovo» (→ finestra Movimento ricorrente); nota introduttiva.
- **Statistiche** (se ci sono ricorrenze attive): Entrate fisse al mese (circa), Uscite fisse al mese (circa).
- Gruppo **Attivi**, per prossima scadenza: icona della categoria, descrizione, frase («Ogni mese, il 5», «Ogni 2 settimane», «Ogni anno, il 3 mar»…) e fondo, importo con segno e «prossima: data». Senza ricorrenze: testo con un esempio (Netflix).
- Gruppo **Terminati** (attenuato): ricorrenze arrivate all'ultima scadenza, con «terminata».

### Budget (`#budget`)

- **Intestazione**: «‹ indietro», titolo e «Nuovo» (→ finestra Budget); nota introduttiva.
- **Elenco** a blocchi: una riga per budget con la grafica dei budget di Mese (senza elenco dei movimenti); tocco → finestra. Un budget non ancora iniziato mostra «Parte da {mese anno}»; uno con categoria o sottocategoria eliminata «Categoria o sottocategoria eliminata: modificalo o eliminalo». Nessun budget: testo con esempi (400 € al mese per la spesa, 1.500 € all'anno per i viaggi).

### Sincronizzazione (`#sincronizzazione`)

- «‹ Sincronizzazione» (riapre il pannello della nuvola) e titolo. Un riquadro che cambia con lo stato:
  - in demo: solo un messaggio;
  - non configurata: «URL del progetto», «Chiave pubblica», «Collega»;
  - collegata ma senza accesso: Email, Password, «Accedi», «Crea account», «Scollega progetto»;
  - verifica in corso / errore di rete: «Riprova» ed «Esci»;
  - da creare: «Crea la frase segreta» (due campi, «Attiva la cifratura»);
  - da sbloccare: «Sblocca i dati cifrati» (un campo, «Sblocca», «Ho dimenticato la frase» → conferma → «Nuova frase segreta» con «Sostituisci e cifra»);
  - attiva: account, riga di stato con pallino (data dell'ultima sincronizzazione), «Sincronizza ora», «Esci» (con conferma che indica le modifiche non ancora inviate).

### Categorie (`#categorie`)

- «‹ Account», titolo e una nota su cosa si tocca. Due colonne (affiancate su schermo largo), **Entrate** e **Uscite**, con la capsula del colore; ogni categoria è un blocco con: **cerchio del colore** (→ finestra Colore), **emoji** in un quadrato tinto del colore della categoria (un solo simbolo), nome (campo a capsula), numero di movimenti in una capsula, pulsante **↳N** (apre sotto il blocco le sottocategorie: nome modificabile, numero di movimenti, ×, «+ Nuova sottocategoria»; aperto diventa verde acqua) e **×** (elimina, con conferma: i movimenti passano in «Altro», o nella prima altra categoria dello stesso tipo, senza sottocategoria). «+ Nuova categoria di entrata» / «+ Nuova categoria di uscita».

### Importa ed esporta (`#dati`)

- «‹ Account» e titolo. «Importa file» (backup JSON, con conferma), «Esporta backup completo» (`rationes-backup-AAAA-MM-GG.json`), «Esporta movimenti per Excel» (`rationes-movimenti-….csv`, con anche i trasferimenti), «Esporta patrimonio per Excel» (`rationes-patrimonio-….csv`).

### Aspetto (`#aspetto`)

- «‹ Account» e titolo. Scelta «Tema» (Come il sistema, Chiaro, Scuro) e, se l'app non è già installata, «Installa come app» (o le istruzioni per Android e Windows).

### Modalità demo

- Barra fissa in cima con «Ricomincia» (conferma, poi cancella l'archivio della demo e ricarica) ed «Esci dalla demo».
- Toast quando i dati di esempio vengono rigenerati dopo un aggiornamento dell'app.
- Nel pannello e nella pagina della sincronizzazione solo un messaggio (sul pulsante della barra in alto «Solo su questo dispositivo»); le altre pagine sono identiche a quelle dell'app.
