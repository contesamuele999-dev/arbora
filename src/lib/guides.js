// Guida comandi per ogni sezione dell'app.
export const GUIDES = {
  pipe: {
    titolo: 'Guida · Pipe',
    icona: '🌱',
    righe: [
      ['Visioni', 'Contenitori tinti col loro colore. Racchiudono le viste di un progetto.'],
      ['Nuova visione / vista', 'Usa i pulsanti ＋ o il pulsante flottante ＋ in basso a destra.'],
      ['Colore visione', 'Tocca il pallino colorato accanto al titolo della visione.'],
      ['Rinomina visione', 'Tocca la matita ✎ accanto al titolo.'],
      ['Aprire una vista', 'Tocca la card della vista: entri subito nell’editor.'],
      ['Anteprima', 'Tocca il pulsante 👁 sulla card per leggere senza aprire.'],
    ],
  },
  tree: {
    titolo: 'Guida · Tree',
    icona: '🌳',
    righe: [
      ['Albero', 'Tutte le viste in gerarchia: radice in alto a sinistra, figli indentati.'],
      ['Aprire il contenuto', 'Tocca un nodo: si apre il pannello rapido con il contenuto della vista.'],
      ['Modifica veloce', 'Nel pannello puoi modificare i blocchi al volo, senza aprire l’editor completo.'],
      ['Aggiungere un ramo', 'Tocca ＋ su un nodo per creare una vista figlia.'],
      ['Spostare un ramo', 'Trascina un nodo sopra un altro per renderlo suo figlio.'],
      ['Zoom', 'Usa i pulsanti ＋ － ⌂ in alto a destra.'],
    ],
  },
  progress: {
    titolo: 'Guida · Progress',
    icona: '📊',
    righe: [
      ['Bacheca', 'Le viste divise per fase: Idee, Progettazione, In corso, Revisione, Completato.'],
      ['Spostare una vista', 'Trascina la card nella colonna della fase desiderata.'],
      ['Evidenziazione', 'La colonna sotto il dito si illumina: al rilascio la vista finisce lì.'],
      ['Mobile', 'Trascinando verso i bordi la bacheca scorre da sola tra le sezioni.'],
      ['Cambia fase rapida', 'Tocca il pallino colorato sulla card per scegliere la fase da un elenco.'],
      ['Aprire una vista', 'Tocca il resto della card per aprirla nell’editor.'],
    ],
  },
  editor: {
    titolo: 'Guida · Editor',
    icona: '✍️',
    righe: [
      ['Blocchi', 'Ogni riga è un blocco markdown. Invio crea un nuovo blocco.'],
      ['Modifica / copia', 'Click (o tap) su una riga la modifica; doppio click (o doppio tap) la copia.'],
      ['Elimina riga', 'Tocca l’icona 🗑 sulla riga: finisce nel Cestino, recuperabile per 7 giorni.'],
      ['Cestino', 'Il pulsante 🗑 Cestino mostra le righe eliminate di recente, con ripristino.'],
      ['Formattazione', 'Toolbar: Titolo, **Grassetto**, *Corsivo*, sezione —. Scorciatoie: Ctrl+B e Ctrl+I sulla selezione.'],
      ['Collegamenti', 'Scrivi ((Nome vista)) o usa 🔗 per collegare (e creare) un’altra vista.'],
      ['Nidificare', 'Trascina un blocco a destra/sinistra, o usa Tab / Maiusc+Tab: le barre colorate mostrano i livelli.'],
      ['Incolla strutturato', 'Incollando testo su più righe con spazi/tab, viene diviso in righe con i livelli giusti.'],
      ['Copia foglio', 'Il pulsante ⧉ Copia foglio copia tutte le righe con i rientri.'],
      ['Selezione / sezioni', '☑ Seleziona → ☑ Tutte, ⤵ Sezione, poi ⧉ Copia · ✂ Taglia · 📌 Incolla (anche in un’altra vista).'],
      ['Cambia vista', 'Dentro una vista, swipe a destra/sinistra per passare alla vista precedente/successiva.'],
      ['Riordinare', 'Trascina un blocco in alto o in basso per spostarlo.'],
      ['Annulla / ripeti', 'Ctrl+Z e Ctrl+Y (o i pulsanti ↶ ↷).'],
      ['Focus', 'Il pulsante 🎯 nasconde la toolbar per scrivere senza distrazioni.'],
    ],
  },
}
