import { fetchAssetSuggestions, type ApiAssetSuggestionField, type ApiAssetSuggestionRow } from '@/lib/api'

export interface SuggestRow {
  value: string
  hint: string
}

// UX-04: mapea una fila de sugerencias de la API a { value, hint } para el
// campo indicado. El hint muestra los valores actuales de los otros dos campos
// como contexto junto a la sugerencia.
export function mapAssetSuggestion(field: ApiAssetSuggestionField, row: ApiAssetSuggestionRow): SuggestRow {
  switch (field) {
    case 'code':
      return { value: row.code ?? '', hint: [row.name, row.initials].filter(Boolean).join(' · ') }
    case 'name':
      return { value: row.name ?? '', hint: [row.code, row.initials].filter(Boolean).join(' · ') }
    case 'initials':
      return { value: row.initials ?? '', hint: [row.code, row.name].filter(Boolean).join(' · ') }
  }
}

// Construye la función onSearch de SuggestInput para un campo del formulario de
// activo. `excludeId` evita sugerir el valor del propio activo al editarlo.
export function buildAssetSuggestionSearch(field: ApiAssetSuggestionField, excludeId: number | undefined, projectId: number): (query: string) => Promise<SuggestRow[]> {
  return async (query: string) => {
    const response = await fetchAssetSuggestions(projectId, field, query, excludeId)
    return response.map((row) => mapAssetSuggestion(field, row))
  }
}
