import { useCallback, useRef, useState } from 'react'
import { changeAssetStatus, deleteAsset, fetchAsset, updateAsset, type ApiAsset } from '@/lib/api'
import { toUserWriteError } from '@/lib/apiErrors'
import type { AssetFormValues } from '@/components/AssetFormModal'

// LOC-02: control de la ficha del activo (AssetModal) y de su formulario de
// edición desde una vista que muestra activos sin lista propia (Ubicaciones).
// La vista aporta el refresco posterior (detalle, catálogo, sesión…) a través
// de onAssetChanged y recibe el activo completo por fetchAsset, porque la ficha
// exige todos los campos (nextEvents, documentos, contadores…).
export function useAssetFicha(options: {
  onAssetChanged: () => void | Promise<void>
}) {
  const { onAssetChanged } = options
  const [asset, setAsset] = useState<ApiAsset | null>(null)
  const [formMode, setFormMode] = useState<'edit' | null>(null)
  const latestRequest = useRef(0)

  const open = useCallback((id: number) => {
    const requestId = latestRequest.current + 1
    latestRequest.current = requestId
    fetchAsset(id)
      .then((next) => { if (requestId === latestRequest.current) setAsset(next) })
      .catch(() => { if (requestId === latestRequest.current) setAsset(null) })
  }, [])

  // Cierra la ficha invalidando cualquier fetch pendiente, para que un refetch
  // de documentos no reabra el modal después de cerrarlo.
  const close = useCallback(() => {
    latestRequest.current += 1
    setAsset(null)
    setFormMode(null)
  }, [])

  const refresh = useCallback(() => {
    if (asset) open(asset.id)
  }, [asset, open])

  const toUserError = (writeError: unknown) => toUserWriteError(writeError, {
    conflict: 'Ya existe un activo con ese código o número de serie.',
    notFound: 'El activo ya no está disponible. Actualiza la lista e inténtalo de nuevo.',
    validation: 'Revisa los campos obligatorios e inténtalo de nuevo.',
    fallback: 'No se pudo guardar el activo. Inténtalo de nuevo.',
  })

  const changeStatus = useCallback(async (statusId: number) => {
    if (!asset) throw new Error('El activo ya no está disponible. Actualiza la lista e inténtalo de nuevo.')
    try {
      const updated = await changeAssetStatus(asset.id, statusId)
      setAsset(updated)
      await onAssetChanged()
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }, [asset, onAssetChanged])

  const remove = useCallback(async (target: { id: number }) => {
    try {
      await deleteAsset(target.id)
      close()
      await onAssetChanged()
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }, [close, onAssetChanged])

  const save = useCallback(async (values: AssetFormValues) => {
    if (!asset) throw new Error('El activo ya no está disponible. Actualiza la lista e inténtalo de nuevo.')
    try {
      const updated = await updateAsset(asset.id, values)
      setAsset(updated)
      setFormMode(null)
      await onAssetChanged()
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }, [asset, onAssetChanged])

  // Tras vincular o crear un documento la ficha recarga el activo completo
  // (documentos actualizados) y la vista refresca lo que dependa de él.
  const documentsChanged = useCallback(() => {
    refresh()
    void onAssetChanged()
  }, [refresh, onAssetChanged])

  return {
    asset,
    formMode,
    open,
    close,
    closeForm: () => setFormMode(null),
    onEdit: () => setFormMode('edit'),
    changeStatus,
    remove,
    save,
    documentsChanged,
  }
}
