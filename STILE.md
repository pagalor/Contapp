# Rationes: guida allo stile

Questa guida descrive l'aspetto di Rationes. Si ispira al Material 3 Expressive di Google (forme molto arrotondate, titoli grandi, gruppi di pulsanti collegati, liste a blocchi, animazioni a molla), ma l'identità viene dal logo: capsule colorate, una penna e il verde acqua del cappello Mercedes di F1 del GP del Messico, con il verde, il bianco e il rosso della bandiera messicana. Va letta insieme a CLAUDE.md prima di toccare l'interfaccia. I mockup di riferimento sono le immagini nella cartella `design/` (i caratteri nelle immagini possono essere quelli di sistema: fa fede questa guida).

## Principi

1. **Il colore ha sempre un significato.** Verde acqua per la struttura e le azioni, verde e rosso solo per il denaro, ambra per avvisi, target e budget, viola per i soldi buttati. Tutto il resto è neutro, con grigi leggermente tinti di verde acqua.
2. **Il verde acqua è il colore dell'app.** Riquadro di riepilogo, navigazione, pulsante principale e fondo del logo. Non va mai usato per dire "entrata": per quello c'è il verde, più giallo e più chiaro, ben distinto.
3. **La capsula è la forma ricorrente.** Le barre del logo (arrotondate alle due estremità) tornano in grafici, indicatori, pulsanti e navigazione.
4. **I numeri sono protagonisti.** Importi grandi, carattere dei titoli, cifre tabellari.
5. **Niente risorse esterne.** Caratteri e icone stanno nel repository (regola 4 di CLAUDE.md).

## File

- `palette.css`: tutte le variabili di colore e di forma, temi chiaro e scuro. Va integrato all'inizio di `style.css` (o caricato prima, aggiungendolo a `SHELL`).
- `fonts/`: i caratteri, da scaricare una volta da Google Fonts in formato `woff2` (licenza SIL Open Font License, va copiato anche il file della licenza):
  - **Bricolage Grotesque** (variabile, pesi 600–800): titoli di pagina, titoli delle sezioni, importi grandi.
  - **Figtree** (variabile, pesi 400–700): tutto il resto.
  - Dichiarati con `@font-face` e `font-display: swap`, con ripiego sui caratteri di sistema. Aggiungere i file a `SHELL`.
  - Gli importi usano sempre `font-variant-numeric: tabular-nums`. Verificare che entrambi i caratteri abbiano le cifre tabellari; se uno non le ha, per gli importi in tabelle e righe si usa l'altro.

## Colori

Le variabili già usate dall'app mantengono il nome e cambiano valore. Le principali:

| Variabile | Uso | Chiaro | Scuro |
| --- | --- | --- | --- |
| `--bg` | sfondo dell'app | `#F3F7F7` | `#071315` |
| `--surface` | riquadri, righe, finestre | `#FFFFFF` | `#0D1F22` |
| `--surface-2` | pulsanti tonali, campi, binari delle barre | `#E4EEEF` | `#15292D` |
| `--text`, `--text-2`, `--text-3` | testo principale, secondario, solo etichette brevi | `#0B2427` … | `#ECF4F4` … |
| `--primary` / `--on-primary` | azione principale (verde acqua) | `#046C75` / bianco | `#5CC6CE` / `#032C30` |
| `--hero` | riquadro di riepilogo, navigazione su telefono, fondo del logo | `#055A63` | `#0A4950` |
| `--hero-in`, `--hero-out`, `--hero-pos`, `--hero-neg` | entrate, uscite e saldi sul verde acqua (anche nel logo) | `#4FD67E`, `#FF7484`, `#A9EDBE`, `#FFB3BC` | uguali |
| `--in` / `--in-bar` | entrate: testo / barre | `#13783A` / `#22A653` | `#5EDC88` / `#4FD67E` |
| `--out` / `--out-bar` | uscite: testo / barre | `#C21A33` / `#EE4358` | `#FF7A88` / `#FF7484` |
| `--sal-pos`, `--sal-neg` | saldo di un periodo (testo) | come entrate / uscite | come entrate / uscite |
| `--sal-pos-bar`, `--sal-neg-bar` | saldo nei grafici | `#74D394` / `#FF9AA6` | `#A9EDBE` / `#FFB3BC` |
| `--cal-in-1…5`, `--cal-out-1…5` | sfondo delle caselle del calendario | da `#EEF9F1` a `#66CF88`, da `#FDEEF0` a `#EE6E81` | da `#10261A` a `#267A44`, da `#2A1519` a `#8E2F42` |
| `--warn`, `--warn-bar`, `--warn-bg` | avvisi e target | `#9A5800`, `#F5A524`, `#FFEBCC` | `#F5B041`, `#F5A524`, `#3A2A0D` |
| `--butt`, `--butt-bar`, `--butt-bg` | soldi buttati | viola | viola |
| `--saldo` | saldo dei fondi | neutro (`--text`) | neutro |
| `--bud-ok`, `--bud-warn`, `--bud-over` | budget | grigio, ambra, ambra intenso | idem |
| `--g-<gruppo>` | gruppi dei fondi | oro, blu, azzurro, lavanda, arancio, grigio | uguali |

Regole:

- **Verde e rosso.** Sono un verde foglia e un rosso cremisi, come la bandiera del Messico, scelti con la stessa luminosità perché nessuno dei due "pesi" più dell'altro. Il verde è spostato verso il giallo per distinguersi bene dal verde acqua.
- **Testo e barre sono separati.** Per il testo servono tonalità più profonde, per i grafici più luminose: gli importi usano `--in` e `--out`, i grafici `--in-bar` e `--out-bar`. Sul verde acqua si usano le versioni `--hero-*`, più chiare.
- **Saldi.** Il saldo è una tinta più chiara di entrate (positivo) o uscite (negativo), come la terza barra del logo.
- **Saldo dei fondi neutro.** Il saldo dei fondi non è più blu: è neutro, perché non è né un'entrata né un'uscita. Il saldo di un periodo è verde o rosso secondo il segno.
- **Riquadro verde acqua.** Dentro il riquadro di riepilogo e nella navigazione si usano sempre i colori `--hero-*`, gli stessi del logo, in entrambi i temi.
- **Calendario.** Lo sfondo delle caselle usa una delle cinque tinte `--cal-in-N` o `--cal-out-N`, scelta in proporzione al saldo più grande del mese (come oggi l'intensità). Il testo resta `--text`, leggibile su tutte le tinte.
- **Categorie.** Il colore scelto dall'utente non colora il testo: colora lo sfondo dell'icona come tinta, `color-mix(in srgb, <colore> var(--cat-mix), var(--surface))`, con l'emoji sopra. Il pallino colorato accanto al nome non serve più.
- **Contrasto.** Tutte le coppie testo/sfondo della palette superano il rapporto 4,5:1, tranne `--text-3` (circa 3,5:1), che va usato solo per etichette brevi e non per informazioni importanti.

## Forme

- **Scala dei raggi:** `--r-xs` 6 px, `--r-s` 12 px, `--r-m` 20 px, `--r-l` 28 px, `--r-pill` capsula.
- **Gruppi collegati** (Elenco/Calendario, frecce del mese, Entrate/Uscite/Saldo, filtri): elementi accostati con 2 px di spazio. Angoli esterni grandi, angoli interni `--r-xs`. L'elemento selezionato è pieno (`--primary`), gli altri tonali (`--surface-2`).
- **Liste a blocchi** (movimenti, fondi, budget, debiti, impostazioni): ogni riga è un blocco `--surface` separato da 2 px. Il primo e l'ultimo blocco hanno gli angoli esterni `--r-m`, gli altri `--r-xs`. Niente linee divisorie.
- **Capsula colorata come indicatore:** una capsula verticale di 8 × 20–36 px accanto al titolo di una sezione o dentro un avviso ne dice il significato (verde entrate, rossa uscite, ambra avviso). È la firma visiva dell'app.
- **Icone delle categorie:** quadrati 32–40 px con raggio `--r-s`, con la tinta della categoria e l'emoji.

## Tipografia

| Ruolo | Carattere | Dimensione (telefono / desktop) |
| --- | --- | --- |
| Titolo della pagina ("Ottobre", "Patrimonio") | Bricolage 800, spaziatura −1 px | 38 / 48 px; l'anno in grigio, 18 / 24 px |
| Importo principale (saldo, patrimonio) | Bricolage 700 | 32 / 40 px |
| Titolo di sezione | Bricolage 700 | 18 / 22 px |
| Testo delle righe | Figtree 600 | 16 px |
| Sottotitoli delle righe | Figtree 400, `--text-2` | 13 px |
| Importi nelle righe | Figtree 700, colore del significato | 16 px |

## Struttura

- **Barra in alto**, su tutte le pagine:
  - a sinistra l'icona della sincronizzazione (su desktop anche il testo "Sincronizzato 2 min fa"). Neutra quando è tutto a posto, animata durante la sincronizzazione, ambra con un problema o se manca la frase segreta. Sostituisce il pallino `#sync-ind` sulla voce Altro.
  - al centro il logo e il nome.
  - a destra l'account.
- **Pannello della sincronizzazione**, che si apre dall'icona: stato, dispositivi collegati, cifratura attiva, "Sincronizza ora". Senza sincronizzazione configurata porta alle impostazioni.
- **Pannello dell'account**, che si apre dall'avatar: sostituisce la voce Altro della navigazione. È un elenco a blocchi con le stesse sezioni della pagina Altro (Sincronizzazione e cifratura, Dati, Movimenti ricorrenti, Pagamenti a rate, Budget, Categorie, Aspetto, versione). Ogni voce apre la sua pagina o la sezione corrispondente. La route `#altro` continua a funzionare.
- **Navigazione:** quattro voci (Mese, Riepilogo, Patrimonio, Debiti).
  - Telefono: barra `--hero` (verde acqua) sospesa in basso con angoli a capsula. La voce attiva è una capsula bianca con icona e nome in verde acqua, le altre solo icona con etichetta accessibile. Il pallino ambra resta sul Patrimonio.
  - Desktop (da 900 px): barra laterale; la voce attiva è una capsula `--primary`.
- **Pulsante "Nuovo"** (solo telefono): capsula `--primary` con l'icona della penna, in basso a destra sopra la navigazione. Apre la finestra del movimento (uscita).
- **Barra della demo:** fascia `--warn-bg` in cima, sopra la barra in alto.

## Componenti

- **Riquadro di riepilogo** (`--hero` verde acqua, raggio `--r-l`): l'importo principale e accanto le capsule del logo calcolate sui dati. Nel Mese: entrate, uscite, saldo. Nel Riepilogo: mese per mese. Nel Patrimonio: l'andamento.
- **Totali del mese** (desktop): gruppo collegato Entrate | Uscite | Saldo; il saldo nel blocco verde acqua.
- **Avvisi** (target, rate, movimenti senza fondo): blocchi con la capsula del significato, titolo, una riga di dettaglio e un pulsante d'azione. Su desktop affiancati.
- **Budget:** barra a capsula su binario `--surface-2`. Riempimento `--bud-ok`, `--bud-warn` o `--bud-over`, con la parte sforata tratteggiata e la tacca del periodo `--text`. Mai il rosso.
- **Righe dei movimenti:**
  - telefono: blocchi con icona della categoria, descrizione, "giorno, categoria, fondo" e importo senza segno, colorato secondo il riquadro;
  - desktop: stessa riga in tabella, con colonne Giorno, Importo, Descrizione, Categoria, Pagato con/Ricevuto su e matita;
  - entrate e uscite restano in due sezioni separate, ciascuna con capsula, conteggio e totale.
- **Pulsanti:** principale (`--primary`, capsula), tonale (`--surface-2`), testo (sottolineato, per "Gestisci" e simili). Altezza 40–52 px, almeno 44 px con `pointer: coarse`.
- **Campi:** sfondo `--surface`, raggio capsula per la ricerca, `--r-s` per i campi delle finestre, bordo solo con il focus (2 px `--primary`).
- **Finestre:** sfondo `--bg`, raggio `--r-l`, contenuto a blocchi. Sul telefono si aprono dal basso (l'opzione `sheet` di `ui.modal`). Pulsante principale a destra, "Annulla" tonale.
- **Toast:** capsula `--hero` con testo bianco, con il pulsante d'azione in grassetto.
- **Calendario:** caselle con raggio `--r-s`, sfondo `--cal-in-N` / `--cal-out-N` in base al saldo del giorno. Oggi è un cerchio `--primary` sul numero.

## Gruppi espandibili (come le notifiche dei Pixel)

Le liste lunghe non si mostrano per intero: stanno in gruppi che si aprono con un tocco, come le notifiche raggruppate dei telefoni Pixel. Riferimento: `design/mese-gruppi-chiusi.png` e `design/mese-uscite-aperte.png`.

- **Gruppo chiuso:** un riquadro `--surface` con raggio `--r-l`. In alto la capsula del significato, il titolo, il totale (se c'è) e a destra il contatore a capsula con la freccia ("36 ˅"). Sotto, un'anteprima di al massimo 4 voci, una riga ciascuna: descrizione in grassetto, dettaglio in `--text-2` troncato con i puntini, importo a destra. Se ce ne sono di più, in fondo "e altri N".
- **Gruppo aperto:** toccando un punto qualsiasi del gruppo chiuso (o il contatore) il riquadro diventa `--surface-2` e dentro compaiono le righe complete, ciascuna un blocco `--surface` separato dagli altri da 2 px. Il contatore diventa "36 ˄" e lo richiude.
- **Dettagli della riga:** ogni riga ha a destra un piccolo pulsante a capsula con la freccia, che apre le voci extra (tag, nota, Escludi, Duplica, Elimina…), come la freccia di ogni notifica. Il tocco sulla riga fa la stessa cosa. La matita per modificare resta dove è oggi.
- **Gruppo con un solo elemento:** mostra direttamente la riga completa, senza contatore. Un gruppo vuoto mostra il suo messaggio di oggi (per esempio "Nessun movimento") e il pulsante per aggiungere.
- **Animazione:** l'altezza cambia con una molla (circa 400 ms), la freccia ruota di 180°, le righe compaiono in cascata (30 ms l'una dall'altra). Con `prefers-reduced-motion` tutto è istantaneo.
- **Memoria:** lo stato aperto o chiuso di ogni gruppo si ricorda sul dispositivo, nella chiave `localStorage` `contabilita.gruppi` (oggetto `{ idGruppo: true/false }`, accesso in `try/catch`, da aggiungere alla tabella delle preferenze di CLAUDE.md). Predefinito: chiuso sotto i 900 px, aperto su desktop.
- **Apertura automatica:** il gruppo si apre da solo quando:
  - si arriva con un movimento da evidenziare (`#mese/AAAA-MM/id`);
  - si aggiunge o si modifica un elemento che vi appartiene;
  - si inizia un trascinamento per riordinare (il riordino funziona solo a gruppo aperto).

  Durante la ricerca i risultati sono sempre aperti.
- **Accessibilità:** l'intestazione è un pulsante con `aria-expanded` e `aria-controls`, che si apre con Invio e Spazio. Il contatore ha un'etichetta del tipo "36 uscite, mostra tutto".
- **Dove si usa:**
  - **Mese:** Avvisi (sotto o oltre il target, rate in scadenza, movimenti senza fondo, riuniti in un gruppo), Budget, Entrate, Uscite (nella vista Separate; nella vista Insieme un solo gruppo "Movimenti"), Trasferimenti, "Senza giorno" del calendario.
  - **Riepilogo:** Le spese più grandi, Tag, Budget, Soldi buttati, le categorie del confronto con l'anno prima.
  - **Patrimonio:** ogni gruppo di fondi, i movimenti senza fondo, le rilevazioni storiche.
  - **Altre pagine:** in Debiti ogni persona (intestazione con nome e saldo, anteprima delle voci); in Pagamenti a rate i gruppi "In corso" e "Conclusi"; in Movimenti ricorrenti "Attivi" e "Terminati".
  - **Su desktop** il componente è lo stesso: a gruppo aperto le righe diventano la tabella con le colonne.
- **Dove non si usa:** riquadro di riepilogo, grafici, torte (hanno già il loro elenco a scomparsa), finestre, pannelli dell'account e della sincronizzazione.

## Grafici

- **Barre:** capsule (raggio pari a metà della larghezza), accostate senza spazio quando sono gruppi entrate/uscite, come nel logo.
- **Torte ad anello:** segmenti con estremità arrotondate e 2–3 gradi di spazio tra uno e l'altro. Restano l'interazione di oggi e il totale al centro con Bricolage.
- **Linee** (saldo accumulato, andamento): spessore 3 px con estremità tonde. Il punto selezionato è un cerchio con bordo `--bg`. Le aree impilate del patrimonio usano i colori dei gruppi al 35% di opacità con la linea piena sopra.
- **Etichette e tooltip:** tooltip come piccoli riquadri `--hero` con raggio `--r-s`.

## Movimento

- **Animazioni "a molla":** si fanno con `transition-timing-function: linear(…)`, che approssima una molla (durata 350–450 ms per gli spostamenti, 200 ms per gli effetti di colore).
- **Pressione dei pulsanti:** alla pressione l'angolo dei pulsanti si stringe leggermente (da capsula a `--r-m`), poi torna com'era.
- **Pannelli e finestre:** entrano scorrendo dal bordo da cui partono.
- **Riduzione del movimento:** con `prefers-reduced-motion` tutto diventa istantaneo, come oggi.

## Tema scuro

Lo sfondo è quasi nero con una punta di verde acqua, le superfici sono verde acqua molto scuro, il riquadro di riepilogo e la navigazione sono verde acqua profondo e le azioni verde acqua chiaro. Si usano gli stessi token: nessun colore scritto a mano nei componenti. Il `meta theme-color` segue `--bg`.

## Cosa non cambia

Dati, sincronizzazione, cifratura, route, nomi interni `contabilita`, testi e funzioni. Lo stile cambia solo l'aspetto e la posizione di sincronizzazione e impostazioni. Ogni elemento dell'"Inventario dell'interfaccia" di CLAUDE.md deve restare raggiungibile.
