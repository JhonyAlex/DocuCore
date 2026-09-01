import type { RefObject } from 'react'
import SearchablePicker, { type SearchableOption } from '@/components/SearchablePicker'
import SearchableMultiPicker, { type SelectedValue } from '@/components/SearchableMultiPicker'
import { PERIODICITIES, type DocumentPeriodicity, type DocumentPeriodicityMode } from '@/lib/periodicity'
import type { ApiDocumentType } from '@/lib/api'

interface DocumentFormFieldsProps {
  initialFocusRef: RefObject<HTMLInputElement>
  name: string
  setName: (name: string) => void
  typeId: number | null
  setTypeId: (id: number | null) => void
  type: string
  setType: (type: string) => void
  documentTypes: ApiDocumentType[]
  assets: SelectedValue[]
  setAssets: (assets: SelectedValue[]) => void
  onSearchAssets: (query: string) => Promise<SearchableOption[]>
  locationId: number | null
  locationLabel: string | null
  onSelectLocation: (option: SearchableOption | null) => void
  onSearchLocations: (query: string) => Promise<SearchableOption[]>
  issueDate: string
  setIssueDate: (date: string) => void
  expiryDate: string
  setExpiryDate: (date: string) => void
  periodicity: DocumentPeriodicity | null
  setPeriodicity: (periodicity: DocumentPeriodicity | null) => void
  periodicityMode: DocumentPeriodicityMode
  setPeriodicityMode: (mode: DocumentPeriodicityMode) => void
  expiryTouched: boolean
  setExpiryTouched: (touched: boolean) => void
  isNew: boolean
  files: File[]
  setFiles: (files: File[]) => void
  writeDisabled: boolean
}

const periodicityOptions = [
  { value: '', label: 'Sin periodicidad' },
  ...PERIODICITIES.map((value) => ({ value, label: value })),
]

export default function DocumentFormFields({
  initialFocusRef,
  name,
  setName,
  typeId,
  setTypeId,
  type,
  setType,
  documentTypes,
  assets,
  setAssets,
  onSearchAssets,
  locationId,
  locationLabel,
  onSelectLocation,
  onSearchLocations,
  issueDate,
  setIssueDate,
  expiryDate,
  setExpiryDate,
  periodicity,
  setPeriodicity,
  periodicityMode,
  setPeriodicityMode,
  expiryTouched,
  setExpiryTouched,
  isNew,
  files,
  setFiles,
  writeDisabled,
}: DocumentFormFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <label className="text-xs font-medium text-slate-700 dark:text-slate-300 sm:col-span-2">
          Nombre del documento *
          <input
            ref={initialFocusRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={writeDisabled}
            placeholder="Ej. Certificado de Inspección Anual"
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          />
        </label>

        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Tipo de documento
          <select
            id="doc-type"
            value={typeId !== null ? String(typeId) : type}
            onChange={(e) => {
              const selected = documentTypes.find((t) => String(t.id) === e.target.value || t.name === e.target.value)
              if (selected) {
                setType(selected.name)
                setTypeId(selected.id)
              } else {
                setType(e.target.value)
                setTypeId(null)
              }
            }}
            disabled={writeDisabled}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          >
            {documentTypes.map((dt) => (
              <option key={dt.id} value={String(dt.id)}>
                {dt.name}
              </option>
            ))}
            {type && !documentTypes.some((dt) => (typeId !== null && dt.id === typeId) || dt.name.toLowerCase() === type.toLowerCase()) && (
              <option value={type}>{type}</option>
            )}
          </select>
        </label>

        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Ubicación asociada
          <div className="mt-1">
            <SearchablePicker
              value={locationId === null ? null : String(locationId)}
              selectedLabel={locationLabel}
              ariaLabel="Ubicación asociada"
              placeholder="Buscar ubicación…"
              disabled={writeDisabled}
              allowClear
              clearLabel="Sin ubicación"
              onSearch={onSearchLocations}
              onSelect={onSelectLocation}
            />
          </div>
        </label>

        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
            Activos / máquinas asociados
          </label>
          <SearchableMultiPicker
            values={assets}
            ariaLabel="Activos asociados"
            placeholder="Buscar activos por código o nombre…"
            disabled={writeDisabled}
            onSearch={onSearchAssets}
            onChange={setAssets}
          />
        </div>

        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Fecha de emisión
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            disabled={writeDisabled}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          />
        </label>

        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Fecha de vencimiento (opcional)
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => {
              setExpiryDate(e.target.value)
              setExpiryTouched(true)
            }}
            disabled={writeDisabled}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          />
          {periodicity && !expiryTouched && (
            <span className="block mt-1 text-[11px] text-brand-600 dark:text-brand-400">
              ⚡ Calculado: {periodicity.toLowerCase()} ({periodicityMode === 'Calendario' ? 'según vencimiento' : 'según subida'})
            </span>
          )}
        </label>

        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Periodicidad de renovación
          <select
            value={periodicity ?? ''}
            onChange={(e) => {
              setPeriodicity(e.target.value === '' ? null : (e.target.value as DocumentPeriodicity))
              setExpiryTouched(false)
            }}
            disabled={writeDisabled}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          >
            {periodicityOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {periodicity && (
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Modo de cálculo
            <select
              value={periodicityMode}
              onChange={(e) => {
                setPeriodicityMode(e.target.value as DocumentPeriodicityMode)
                setExpiryTouched(false)
              }}
              disabled={writeDisabled}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
            >
              <option value="Calendario">Según calendario (vencimiento anterior)</option>
              <option value="Subida">Según subida (fecha de emisión)</option>
            </select>
          </label>
        )}

        {isNew && (
          <div className="sm:col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block">
              Ficheros a adjuntar *
              <input
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.txt,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain,image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                disabled={writeDisabled}
                className="mt-1.5 block w-full text-xs text-slate-500 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-brand-50 file:text-brand-700 dark:file:bg-brand-950/40 dark:file:text-brand-400 hover:file:bg-brand-100"
              />
            </label>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              PDF, Excel, imágenes (.png, .jpg, .webp, .gif) o texto plano. Puedes seleccionar varios archivos.
            </p>
            {files.length > 0 && (
              <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                ✓ {files.length} archivo(s) preparado(s) para subir
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
