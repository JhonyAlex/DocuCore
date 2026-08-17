import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BulkActionBar from '@/components/BulkActionBar'
import ConfirmDialog from '@/components/ConfirmDialog'
import DynamicFieldFormModal from '@/components/DynamicFieldFormModal'
import RowActionsMenu from '@/components/RowActionsMenu'
import { useSelection } from '@/hooks/useSelection'
import { useProject } from '@/contexts/ProjectContext'
import { archiveDynamicFieldDefinition, createDynamicFieldDefinition, fetchAssetTypes, fetchDynamicFieldDefinitions, updateDynamicFieldDefinition, type ApiAssetType, type ApiDynamicFieldDefinition, type DynamicFieldDefinitionInput } from '@/lib/api'

const typeLabels = { TEXT: 'Texto corto', TEXTAREA: 'Texto largo', NUMBER: 'Número', DATE: 'Fecha', SELECT: 'Selección única', MULTISELECT: 'Selección múltiple', BOOLEAN: 'Sí / No' }

export default function DynamicFieldsConfigView() {
  const navigate = useNavigate()
  const { project, projectId } = useProject()
  if (projectId === null) throw new Error('DynamicFieldsConfigView requires a project scope')
  const selection = useSelection<number>()
  const [fields, setFields] = useState<ApiDynamicFieldDefinition[]>([])
  const [types, setTypes] = useState<ApiAssetType[]>([])
  const [typeFilter, setTypeFilter] = useState(0)
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formField, setFormField] = useState<ApiDynamicFieldDefinition | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [archiveIds, setArchiveIds] = useState<number[]>([])
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextFields, nextTypes] = await Promise.all([fetchDynamicFieldDefinitions(projectId, { assetTypeId: typeFilter || undefined, includeInactive: showInactive }), fetchAssetTypes(projectId)])
      setFields(nextFields)
      setTypes(nextTypes)
    } catch {
      setError('No se pudieron cargar los campos dinámicos.')
    } finally {
      setLoading(false)
    }
  }, [projectId, showInactive, typeFilter])

  useEffect(() => { void load() }, [load])

  const submit = async (input: DynamicFieldDefinitionInput) => {
    setSaving(true)
    setFormError(null)
    try {
      if (formField) await updateDynamicFieldDefinition(projectId, formField.id, input)
      else await createDynamicFieldDefinition(projectId, input)
      setFormField(undefined)
      await load()
    } catch (writeError) {
      const message = writeError instanceof Error && writeError.message.includes('409') ? 'No se puede cambiar el tipo ni retirar una opción que ya tiene valores.' : 'No se pudo guardar el campo. Revisa la configuración.'
      setFormError(message)
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    setArchiving(true)
    setArchiveError(null)
    try {
      await Promise.all(archiveIds.map((id) => archiveDynamicFieldDefinition(projectId, id)))
      selection.clear()
      setArchiveIds([])
      await load()
    } catch {
      setArchiveError('No se pudieron archivar los campos seleccionados.')
    } finally {
      setArchiving(false)
    }
  }

  const ids = fields.map((field) => field.id)
  return (
    <section className="fade-in">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <button type="button" onClick={() => navigate(`/projects/${projectId}/config`)} className="mb-2 text-xs font-medium text-brand-600">← Configuración</button>
          <h1 className="text-2xl font-semibold tracking-tight">Campos dinámicos</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Características personalizadas del proyecto {project?.name ?? ''}</p>
        </div>
        <button type="button" onClick={() => { setFormError(null); setFormField(null) }} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">Nuevo campo</button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select aria-label="Filtrar por tipo de activo" value={typeFilter} onChange={(event) => { setTypeFilter(Number(event.target.value)); selection.clear() }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
          <option value="0">Todos los tipos de activo</option>
          {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={showInactive} onChange={(event) => { setShowInactive(event.target.checked); selection.clear() }} />
          Mostrar archivados
        </label>
      </div>
      <BulkActionBar selectedCount={selection.selectedCount} onClear={selection.clear}>
        <button type="button" onClick={() => setArchiveIds(selection.selectedIds)} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">Archivar</button>
      </BulkActionBar>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando campos…</div>
        ) : error ? (
          <div role="alert" className="p-8 text-center text-sm text-red-600">{error}</div>
        ) : fields.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500">No hay campos dinámicos con estos filtros.</p>
            <button type="button" onClick={() => setFormField(null)} className="mt-2 text-sm font-medium text-brand-600">Crear el primero</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="w-10 px-4 py-3 whitespace-nowrap"><input type="checkbox" aria-label="Seleccionar todos los campos" checked={selection.allSelected(ids)} ref={(node) => { if (node) node.indeterminate = selection.someSelected(ids) }} onChange={() => selection.toggleAll(ids)} /></th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Campo</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Tipo</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Tipos de activo</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Uso</th>
                  <th className="w-14 px-4 py-3 whitespace-nowrap" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {fields.map((field) => {
                  const assetTypesList = field.assetTypes.map((type) => type.name).join(', ')
                  return (
                    <tr key={field.id} className={!field.isActive ? 'opacity-55' : ''}>
                      <td className="px-4 py-3 whitespace-nowrap"><input type="checkbox" aria-label={`Seleccionar ${field.fieldName}`} checked={selection.isSelected(field.id)} onChange={() => selection.toggle(field.id)} /></td>
                      <td className="px-4 py-3 whitespace-nowrap"><div className="font-medium max-w-xs truncate" title={field.fieldName}>{field.fieldName}{field.required && <span className="ml-1 text-red-500">*</span>}</div><div className="text-xs text-slate-400 truncate">{field.groupName} · {field.key}</div></td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{typeLabels[field.fieldType]}</span></td>
                      <td className="max-w-xs px-4 py-3 text-xs text-slate-600 dark:text-slate-300 truncate whitespace-nowrap" title={assetTypesList}>{assetTypesList}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">{field.usageCount} activos</td>
                      <td className="px-4 py-3 whitespace-nowrap"><RowActionsMenu ariaLabel={`Acciones de ${field.fieldName}`} items={[{ label: 'Editar', onSelect: () => { setFormError(null); setFormField(field) } }, ...(field.isActive ? [{ label: 'Archivar', variant: 'danger' as const, onSelect: () => setArchiveIds([field.id]) }] : [])]} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {formField !== undefined && <DynamicFieldFormModal field={formField} types={types} busy={saving} error={formError} onClose={() => setFormField(undefined)} onSubmit={(input) => void submit(input)} />}
      <ConfirmDialog open={archiveIds.length > 0} title="Archivar campos dinámicos" message={<>Los campos dejarán de mostrarse en los activos, pero sus valores se conservarán para auditoría. ¿Archivar {archiveIds.length === 1 ? 'este campo' : `estos ${archiveIds.length} campos`}?</>} confirmLabel="Archivar" busy={archiving} busyLabel="Archivando…" error={archiveError} onConfirm={() => void archive()} onCancel={() => { setArchiveIds([]); setArchiveError(null) }} />
    </section>
  )
}
