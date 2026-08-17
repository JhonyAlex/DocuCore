import { useCallback, useRef, useState } from 'react'
import { changeAssetStatus, deleteAsset, fetchAsset, updateAsset, uploadAssetImages, type ApiAsset } from '@/lib/api'
import { toUserWriteError } from '@/lib/apiErrors'
import type { AssetFormValues } from '@/components/AssetFormModal'

// LOC-02: control de la ficha del activo (AssetModal) y de su formulario de
// edición desde una vista que muestra activos sin lista propia (Ubicaciones).
// La vista aporta el refresco posterior (detalle, catálogo, sesión…) a través
// de onAssetChanged y recibe el activo completo por fetchAsset, porque la ficha
// exige todos los campos (nextEvents, documentos, contadores…).
export function useAssetFicha(options: {
  projectId: number
  onAssetChanged: () => void | Promise<void>
}) {
  const { onAssetChanged, projectId } = options
  const [asset, setAsset] = useState<ApiAsset | null>(null)
  const [formMode, setFormMode] = useState<'edit' | null>(null)
  const assetIdRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    const id = assetIdRef.current
    if (!id) return
    try {
      const refreshed = await fetchAsset(projectId, id)
      setAsset(refreshed)
    } catch {
      // El activo pudo haberse eliminado; cerramos la ficha.
      setAsset(null)
      assetIdRef.current = null
    }
  }, [projectId])

  const open = useCallback(async (id: number) => {
    assetIdRef.current = id
    const loaded = await fetchAsset(projectId, id)
    setAsset(loaded)
  }, [projectId])

  const close = useCallback(() => {
    assetIdRef.current = null
    setAsset(null)
    setFormMode(null)
  }, [])

  const edit = useCallback(() => {
    if (asset) setFormMode('edit')
  }, [asset])

  const closeForm = useCallback(() => {
    setFormMode(null)
  }, [])

  const toUserError = (writeError: unknown) => toUserWriteError(writeError, {
    conflict: 'Ya existe un activo con ese código o número de serie.',
    notFound: 'El activo ya no está disponible. Actualiza la lista e inténtalo de nuevo.',
    validation: 'Revisa los campos obligatorios e inténtalo de nuevo.',
    fallback: 'No se pudo guardar el activo. Inténtalo de nuevo.',
  })

  const toUserDeleteError = (writeError: unknown) => toUserWriteError(writeError, {
    notFound: 'El activo ya no está disponible. Actualiza la lista e inténtalo de nuevo.',
    fallback: 'No se pudo eliminar el activo. Inténtalo de nuevo.',
  })

  const changeStatus = useCallback(async (statusId: number) => {
    if (!asset) return
    try {
      const updated = await changeAssetStatus(projectId, asset.id, statusId)
      setAsset(updated)
      await onAssetChanged()
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
  }, [asset, onAssetChanged, projectId])

  const remove = useCallback(async (target: { id: number }) => {
    try {
      await deleteAsset(projectId, target.id)
      close()
      await onAssetChanged()
    } catch (writeError) {
      throw new Error(toUserDeleteError(writeError))
    }
  }, [close, onAssetChanged, projectId])

  const save = useCallback(async (values: AssetFormValues, imageFiles: File[]) => {
    if (!asset) throw new Error('El activo ya no está disponible. Actualiza la lista e inténtalo de nuevo.')
    let saved: ApiAsset
    try {
      saved = await updateAsset(projectId, asset.id, values)
    } catch (writeError) {
      throw new Error(toUserError(writeError))
    }
    // IMG-01: las imágenes se suben tras guardar; si falla, el activo ya está
    // actualizado y el error invita a subirlas desde la ficha.
    if (imageFiles.length > 0) {
      try {
        saved = await uploadAssetImages(projectId, saved.id, imageFiles)
      } catch {
        throw new Error('El activo se actualizó, pero no se pudieron subir las imágenes. Puedes subirlas desde la ficha del activo.')
      }
    }
    setAsset(saved)
    setFormMode(null)
    await onAssetChanged()
  }, [asset, onAssetChanged, projectId])

  // IMG-01: la ficha entrega el activo ya actualizado tras subir/quitar imágenes.
  const replaceAsset = useCallback((next: ApiAsset) => {
    setAsset(next)
  }, [])

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
    closeForm,
    onEdit: edit,
    changeStatus,
    remove,
    save,
    replaceAsset,
    documentsChanged,
  }
}
