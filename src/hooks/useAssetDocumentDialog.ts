import { useEffect, useRef, useState } from 'react'
import { fetchDocument, type ApiDocument } from '@/lib/api'

// Mantiene la ficha del activo debajo del modal de documento y evita que el
// Escape del modal anidado cierre también la ficha.
export default function useAssetDocumentDialog(assetId: number | undefined) {
  const [createOpen, setCreateOpen] = useState(false)
  const [document, setDocument] = useState<ApiDocument | null>(null)
  const [openingId, setOpeningId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const openRef = useRef(false)
  const requestRef = useRef(0)

  useEffect(() => {
    requestRef.current += 1
    openRef.current = false
    setCreateOpen(false)
    setDocument(null)
    setOpeningId(null)
    setError(null)
  }, [assetId])

  const openAssociated = async (documentId: number) => {
    if (openingId !== null) return
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    openRef.current = true
    setError(null)
    setOpeningId(documentId)
    try {
      const next = await fetchDocument(documentId)
      if (requestId === requestRef.current) setDocument(next)
    } catch {
      if (requestId === requestRef.current) {
        openRef.current = false
        setError('No se pudo abrir el documento. Inténtalo de nuevo.')
      }
    } finally {
      if (requestId === requestRef.current) setOpeningId(null)
    }
  }

  const openCreate = () => {
    openRef.current = true
    setCreateOpen(true)
  }

  const close = () => {
    requestRef.current += 1
    openRef.current = false
    setCreateOpen(false)
    setDocument(null)
    setOpeningId(null)
  }

  return { createOpen, document, openingId, error, openRef, openAssociated, openCreate, close }
}
