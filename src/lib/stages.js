// ============================================================
// Fasi del flusso di lavoro (bacheca Progress).
// I colori delle fasi sono riusati in Pipe e Tree come indicatori,
// senza entrare in conflitto con la sfumatura per profondità.
// ============================================================
export const STAGES = [
  { id: 'note',          label: 'Note',          color: '#5c6773' },
  { id: 'idee',          label: 'Idee',          color: '#8fa3b8' },
  { id: 'progettazione', label: 'Progettazione', color: '#b18cf2' },
  { id: 'incorso',       label: 'In corso',      color: '#f2b344' },
  { id: 'revisione',     label: 'Revisione',     color: '#4fb8f0' },
  { id: 'completato',    label: 'Completato',    color: '#34d27e' },
]

export const DEFAULT_STAGE = 'idee'

// nota: il fallback usa esplicitamente DEFAULT_STAGE (non STAGES[0]) così le viste
// senza fase impostata restano in "Idee" anche se "Note" è la prima colonna in bacheca.
export function stageOf(vista) {
  return STAGES.find(s => s.id === vista?.stage) || STAGES.find(s => s.id === DEFAULT_STAGE) || STAGES[0]
}
