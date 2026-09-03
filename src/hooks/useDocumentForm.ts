import { useEffect, useRef, useState } from 'react'
import type { SelectedValue } from '@/components/SearchableMultiPicker'
import type { SearchableOption } from '@/components/SearchablePicker'
import {
  createDocument,
  createDocumentVersion,
  fetchAssets,
  fetchDocument,
  fetchDocumentTypes,
  searchLocations,
  updateDocument,
  type ApiDocument,
  type ApiDocumentDetail,
  type ApiDocumentType,
  type DocumentMetadataInput,
} from '@/lib/api'
import { calculateNextExpiry, type DocumentPeriodicity, type DocumentPeriodicityMode } from '@/lib/periodicity'

function dateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : ''
}

function toUtcDateInput(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

interface UseDocumentFormOptions {
  projectId: number
  document: ApiDocument | null
  initialAssetIds?: SelectedValue[]
  readOnly?: boolean
  onClose: () => void
  onChanged: () => void | Promise<void>
}

export function useDocumentForm({
  projectId,
  document,
  initialAssetIds = [],
  readOnly,
  onClose,
  onChanged,
}: UseDocumentFormOptions) {
  const [detail, setDetail] = useState<ApiDocumentDetail | null>(null)
  const [documentTypes, setDocumentTypes] = useState<ApiDocumentType[]>([])
  const [name, setName] = useState(document?.name ?? '')
  const [typeId, setTypeId] = useState<number | null>(document?.typeId ?? null)
  const [type, setType] = useState(document?.type ?? '')
  const [assets, setAssets] = useState<SelectedValue[]>(() => {
    const seeded = [
      ...(document?.assets ?? []).map((asset) => ({ id: asset.id, label: `${asset.code} · ${asset.name}` })),
      ...initialAssetIds,
    ]
    const seen = new Set<number>()
    return seeded.filter((value) => !seen.has(value.id) && seen.add(value.id))
  })
  const [locationId, setLocationId] = useState<number | null>(document?.location?.id ?? null)
  const [locationLabel, setLocationLabel] = useState<string | null>(
    document?.location ? `${document.location.code} · ${document.location.label || document.location.name}` : null,
  )
  const [issueDate, setIssueDate] = useState(dateInput(document?.currentVersion?.issueDate) || new Date().toISOString().slice(0, 10))
  const [expiryDate, setExpiryDate] = useState(dateInput(document?.currentVersion?.expiryDate))
  const [periodicity, setPeriodicity] = useState<DocumentPeriodicity | null>(document?.periodicity ?? null)
  const [periodicityMode, setPeriodicityMode] = useState<DocumentPeriodicityMode>(document?.periodicityMode ?? 'Subida')
  const [expiryTouched, setExpiryTouched] = useState(false)
  const mountedRef = useRef(false)
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const writeDisabled = saving || Boolean(readOnly)
  const [error, setError] = useState<string | null>(null)

  const [current, setCurrent] = useState<ApiDocument | null>(document)
  const currentExpiryRef = useRef<string | null>(document?.currentVersion?.expiryDate ?? null)

  useEffect(() => {
    let active = true
    fetchDocumentTypes(projectId)
      .then((types) => {
        if (!active) return
        setDocumentTypes(types)
        if (!document && types.length > 0) {
          setType(types[0].name)
          setTypeId(types[0].id)
        } else if (document) {
          const match = types.find((t) => (document.typeId && t.id === document.typeId) || t.name.toLowerCase() === document.type.toLowerCase())
          if (match) {
            setType(match.name)
            setTypeId(match.id)
          } else {
            setType(document.type)
            setTypeId(document.typeId ?? null)
          }
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [projectId, document])

  useEffect(() => {
    if (!document) return
    let active = true
    fetchDocument(projectId, document.id)
      .then((next) => active && setDetail(next))
      .catch(() => active && setError('No se pudo cargar el historial de versiones.'))
    return () => {
      active = false
    }
  }, [document, projectId])

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (!periodicity || expiryTouched) return
    const previous = currentExpiryRef.current ? new Date(currentExpiryRef.current) : null
    setExpiryDate(calculateNextExpiry(previous, toUtcDateInput(issueDate), periodicityMode, periodicity).toISOString().slice(0, 10))
  }, [periodicity, periodicityMode, issueDate, expiryTouched])

  const metadata = (): DocumentMetadataInput => ({
    name,
    type,
    typeId: typeId ?? undefined,
    projectId,
    assetIds: assets.map((asset) => asset.id),
    locationId: locationId ?? undefined,
    issueDate,
    expiryDate: expiryDate || undefined,
    periodicity: periodicity || undefined,
    periodicityMode: periodicity ? periodicityMode : undefined,
  })

  const searchAssets = async (query: string): Promise<SearchableOption[]> => {
    const res = await fetchAssets(projectId, { search: query || undefined, limit: 20 })
    return res.data.map((asset) => ({ value: String(asset.id), label: `${asset.code} · ${asset.name}`, hint: asset.location?.name }))
  }

  const searchLocationOptions = async (query: string): Promise<SearchableOption[]> => {
    const response = await searchLocations(projectId, query)
    return response.data.map((location) => ({
      value: String(location.id),
      label: `${location.code} · ${location.label || location.name}`,
      hint: location.name,
    }))
  }

  const save = async () => {
    if (readOnly) return
    setError(null)
    const isNew = !document
    if (isNew && files.length === 0) return setError('Selecciona al menos un fichero para subir el documento.')
    setSaving(true)
    try {
      if (isNew && files.length > 0) await createDocument(projectId, metadata(), files)
      if (!isNew && document) {
        await updateDocument(projectId, document.id, {
          name,
          type,
          typeId: typeId ?? undefined,
          assetIds: assets.map((asset) => asset.id),
          locationId,
          issueDate,
          expiryDate: expiryDate || undefined,
          periodicity: periodicity ? periodicity : undefined,
          periodicityMode: periodicity ? periodicityMode : undefined,
        })
      }
      await onChanged()
      onClose()
    } catch {
      setError('No se pudo guardar el documento. Revisa los datos e inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const uploadNewVersion = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return
    const nextFiles = Array.from(event.target.files ?? [])
    if (!document || nextFiles.length === 0) return
    setError(null)
    setSaving(true)
    try {
      let nextExpiry = expiryDate
      if (periodicity && !expiryTouched) {
        const previous = currentExpiryRef.current ? new Date(currentExpiryRef.current) : null
        nextExpiry = calculateNextExpiry(previous, toUtcDateInput(issueDate), periodicityMode, periodicity).toISOString().slice(0, 10)
      }
      await createDocumentVersion(projectId, document.id, { issueDate, expiryDate: nextExpiry || undefined }, nextFiles)
      const next = await fetchDocument(projectId, document.id)
      setCurrent(next)
      setDetail(next)
      currentExpiryRef.current = next.currentVersion?.expiryDate ?? null
      if (next.currentVersion) {
        setIssueDate(dateInput(next.currentVersion.issueDate))
        setExpiryDate(dateInput(next.currentVersion.expiryDate))
      }
      await onChanged()
    } catch {
      setError('No se pudo subir la nueva versión.')
    } finally {
      setSaving(false)
    }
  }

  return {
    detail,
    current,
    documentTypes,
    name,
    setName,
    typeId,
    setTypeId,
    type,
    setType,
    assets,
    setAssets,
    locationId,
    setLocationId,
    locationLabel,
    setLocationLabel,
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
    files,
    setFiles,
    saving,
    writeDisabled,
    error,
    setError,
    searchAssets,
    searchLocationOptions,
    save,
    uploadNewVersion,
  }
}
