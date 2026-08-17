export interface DocumentIconDefinition {
  key: string
  label: string
  group: string
}

export const documentIconDefinitions: DocumentIconDefinition[] = [
  // Legal y Contratos
  { key: 'file-signature', label: 'Firma / Contrato', group: 'Legal y Contratos' },
  { key: 'file-text', label: 'Documento de texto', group: 'Legal y Contratos' },
  { key: 'scale', label: 'Báscula / Legal', group: 'Legal y Contratos' },
  { key: 'stamp', label: 'Sello / Registro', group: 'Legal y Contratos' },
  { key: 'scroll', label: 'Manuscrito', group: 'Legal y Contratos' },
  { key: 'briefcase', label: 'Comercial', group: 'Legal y Contratos' },

  // Calidad y Certificados
  { key: 'badge-check', label: 'Certificado / Aprobado', group: 'Calidad y Certificación' },
  { key: 'award', label: 'Premio / Certificación', group: 'Calidad y Certificación' },
  { key: 'shield-check', label: 'Seguridad certificada', group: 'Calidad y Certificación' },
  { key: 'file-check', label: 'Documento verificado', group: 'Calidad y Certificación' },
  { key: 'check-circle', label: 'Conformidad', group: 'Calidad y Certificación' },

  // Técnico y Manuales
  { key: 'book-open', label: 'Manual de instrucciones', group: 'Técnico y Manuales' },
  { key: 'book', label: 'Guía técnica', group: 'Técnico y Manuales' },
  { key: 'wrench', label: 'Mantenimiento / Taller', group: 'Técnico y Manuales' },
  { key: 'settings', label: 'Configuración técnica', group: 'Técnico y Manuales' },
  { key: 'file-code', label: 'Especificación técnica', group: 'Técnico y Manuales' },
  { key: 'cpu', label: 'Electrónica / Hardware', group: 'Técnico y Manuales' },
  { key: 'gauge', label: 'Calibración / Medida', group: 'Técnico y Manuales' },

  // Inspección y Actas
  { key: 'clipboard-list', label: 'Acta / Checklist', group: 'Inspección y Actas' },
  { key: 'clipboard-check', label: 'Inspección completada', group: 'Inspección y Actas' },
  { key: 'file-spreadsheet', label: 'Hoja de datos / Registro', group: 'Inspección y Actas' },
  { key: 'receipt', label: 'Factura / Justificante', group: 'Inspección y Actas' },
  { key: 'calendar', label: 'Planificación / Periodicidad', group: 'Inspección y Actas' },

  // Seguridad y Normativa
  { key: 'shield', label: 'Protección', group: 'Seguridad y Normativa' },
  { key: 'shield-alert', label: 'Aviso de seguridad', group: 'Seguridad y Normativa' },
  { key: 'circle-alert', label: 'Alerta / Advertencia', group: 'Seguridad y Normativa' },
  { key: 'lock', label: 'Confidencial', group: 'Seguridad y Normativa' },
  { key: 'flame', label: 'Prevención incendios', group: 'Seguridad y Normativa' },

  // General y Archivo
  { key: 'folder', label: 'Carpeta / Expediente', group: 'General y Archivo' },
  { key: 'files', label: 'Varios documentos', group: 'General y Archivo' },
  { key: 'tag', label: 'Etiqueta', group: 'General y Archivo' },
  { key: 'archive', label: 'Archivo histórico', group: 'General y Archivo' },
  { key: 'inbox', label: 'Bandeja de entrada', group: 'General y Archivo' },
]

export const DEFAULT_DOCUMENT_ICON_KEY = 'file-text'

export type DocumentIconKey = (typeof documentIconDefinitions)[number]['key']

const documentIconKeySet = new Set<string>(documentIconDefinitions.map((item) => item.key))

export function isDocumentIconKey(value: unknown): value is DocumentIconKey {
  return typeof value === 'string' && documentIconKeySet.has(value)
}
