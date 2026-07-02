// ============================================================
// Fasi del flusso di lavoro (bacheca Progress).
// I colori delle fasi sono riusati in Pipe e Tree come indicatori,
// senza entrare in conflitto con la sfumatura per profondità.
// ============================================================
export const STAGES = [
  { id: 'idee',          label: 'Idee',          color: '#8fa3b8' },
  { id: 'progettazione', label: 'Progettazione', color: '#b18cf2' },
  { id: 'incorso',       label: 'In corso',      color: '#f2b344' },
  { id: 'revisione',     label: 'Revisione',     color: '#4fb8f0' },
  { id: 'completato',    label: 'Completato',    color: '#34d27e' },
]

export const DEFAULT_STAGE = 'idee'

export function stageOf(vista) {
  return STAGES.find(s => s.id === vista?.stage) || STAGES[0]
}
