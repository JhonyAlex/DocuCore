import { useEffect, useRef, useState } from 'react'
import {
  downloadDocument,
  fetchDocumentAttachmentPreview,
  fetchDocumentPreview,
  type ApiDocument,
  type ApiDocumentDetail,
  type ApiDocumentVersion,
} from '@/lib/api'
import { isExcelMimeType, isPdfMimeType, isTextMimeType, isViewableMimeType } from '@/lib/documentPreview'
import type { ActivePreviewItem } from '@/components/document/DocumentPreviewPane'

interface UseDocumentPreviewOptions {
  projectId: number
  document: ApiDocument | null
  currentVersion: ApiDocumentVersion | null | undefined
  onError?: (message: string) => void
}

export function useDocumentPreview({ projectId, document, currentVersion, onError }: UseDocumentPreviewOptions) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewOpenRef = useRef(false)
  const [preview, setPreview] = useState<{ objectUrl: string | null; text: string | null; blob: Blob | null } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const [historyPreview, setHistoryPreview] = useState<{
    name?: string
    version: number
    mimeType: string
    objectUrl: string | null
    text: string | null
    blob: Blob | null
  } | null>(null)
  const [previewingTarget, setPreviewingTarget] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const historyPreviewUrlRef = useRef<string | null>(null)
  const previewRequestRef = useRef(0)

  const documentId = document?.id
  const versionNumber = currentVersion?.version

  // Carga de la vista previa para la versión vigente
  useEffect(() => {
    if (!documentId || !versionNumber) return
    let active = true
    setPreview(null)
    setPreviewError(false)
    setPreviewLoading(true)

    fetchDocumentPreview(projectId, documentId)
      .then((blob) => {
        if (!active) return
        setPreviewLoading(false)
        if (isTextMimeType(blob.type)) {
          void blob.text().then((text) => { if (active) setPreview({ objectUrl: null, text, blob: null }) })
        } else if (isPdfMimeType(blob.type) || isExcelMimeType(blob.type)) {
          setPreview({ objectUrl: null, text: null, blob })
        } else {
          setPreview({ objectUrl: URL.createObjectURL(blob), text: null, blob: null })
        }
      })
      .catch(() => {
        if (active) {
          setPreviewLoading(false)
          setPreviewError(true)
        }
      })

    return () => {
      active = false
    }
  }, [documentId, projectId, versionNumber])

  // Limpieza del object URL de la versión vigente
  useEffect(() => {
    previewUrlRef.current = preview?.objectUrl ?? null
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [preview])

  // Limpieza al desmontar
  useEffect(() => () => {
    previewRequestRef.current += 1
    if (historyPreviewUrlRef.current) URL.revokeObjectURL(historyPreviewUrlRef.current)
  }, [])

  const openPreview = () => {
    setHistoryPreview(null)
    previewOpenRef.current = true
    setPreviewOpen(true)
  }

  const closePreview = () => {
    previewRequestRef.current += 1
    if (historyPreviewUrlRef.current) URL.revokeObjectURL(historyPreviewUrlRef.current)
    historyPreviewUrlRef.current = null
    setHistoryPreview(null)
    previewOpenRef.current = false
    setPreviewOpen(false)
  }

  const openVersionPreview = async (historicalVersion: ApiDocumentDetail['versions'][number]) => {
    if (!document || previewingTarget !== null) return
    const targetKey = `v-${historicalVersion.version}`
    const requestId = previewRequestRef.current + 1
    previewRequestRef.current = requestId
    setPreviewingTarget(targetKey)

    try {
      let objectUrl: string | null = null
      let text: string | null = null
      let blob: Blob | null = null

      if (isViewableMimeType(historicalVersion.mimeType)) {
        const previewBlob = await fetchDocumentPreview(projectId, document.id, historicalVersion.version)
        if (requestId !== previewRequestRef.current) return
        if (isTextMimeType(previewBlob.type)) text = await previewBlob.text()
        else if (isPdfMimeType(previewBlob.type) || isExcelMimeType(previewBlob.type)) blob = previewBlob
        else objectUrl = URL.createObjectURL(previewBlob)
      }

      if (requestId !== previewRequestRef.current) {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        return
      }

      if (historyPreviewUrlRef.current) URL.revokeObjectURL(historyPreviewUrlRef.current)
      historyPreviewUrlRef.current = objectUrl
      setHistoryPreview({
        name: document.name,
        version: historicalVersion.version,
        mimeType: historicalVersion.mimeType,
        objectUrl,
        text,
        blob,
      })
      previewOpenRef.current = true
      setPreviewOpen(true)
    } catch {
      if (requestId === previewRequestRef.current) {
        onError?.(`No se pudo abrir la vista previa de la versión ${historicalVersion.version}.`)
      }
    } finally {
      if (requestId === previewRequestRef.current) setPreviewingTarget(null)
    }
  }

  const openAttachmentPreview = async (targetVersion: number, attachment: { id: number; originalName: string; mimeType: string }) => {
    if (!document || previewingTarget !== null) return
    const targetKey = `v-${targetVersion}-att-${attachment.id}`
    const requestId = previewRequestRef.current + 1
    previewRequestRef.current = requestId
    setPreviewingTarget(targetKey)

    try {
      let objectUrl: string | null = null
      let text: string | null = null
      let blob: Blob | null = null

      if (isViewableMimeType(attachment.mimeType)) {
        const previewBlob = await fetchDocumentAttachmentPreview(projectId, document.id, targetVersion, attachment.id)
        if (requestId !== previewRequestRef.current) return
        if (isTextMimeType(previewBlob.type)) text = await previewBlob.text()
        else if (isPdfMimeType(previewBlob.type) || isExcelMimeType(previewBlob.type)) blob = previewBlob
        else objectUrl = URL.createObjectURL(previewBlob)
      }

      if (requestId !== previewRequestRef.current) {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        return
      }

      if (historyPreviewUrlRef.current) URL.revokeObjectURL(historyPreviewUrlRef.current)
      historyPreviewUrlRef.current = objectUrl
      setHistoryPreview({
        name: `${document.name} · ${attachment.originalName}`,
        version: targetVersion,
        mimeType: attachment.mimeType,
        objectUrl,
        text,
        blob,
      })
      previewOpenRef.current = true
      setPreviewOpen(true)
    } catch {
      if (requestId === previewRequestRef.current) {
        onError?.(`No se pudo abrir la vista previa de ${attachment.originalName}.`)
      }
    } finally {
      if (requestId === previewRequestRef.current) setPreviewingTarget(null)
    }
  }

  const activePreviewItem: ActivePreviewItem | null = currentVersion && document
    ? {
        title: document.name,
        version: currentVersion.version,
        mimeType: currentVersion.mimeType,
        isHistorical: false,
        objectUrl: preview?.objectUrl ?? null,
        text: preview?.text ?? null,
        blob: preview?.blob ?? null,
        downloadAction: () => void downloadDocument(projectId, document.id),
      }
    : null

  const modalPreview = historyPreview ?? (currentVersion && preview && document
    ? {
        name: document.name,
        version: currentVersion.version,
        mimeType: currentVersion.mimeType,
        objectUrl: preview.objectUrl,
        text: preview.text,
        blob: preview.blob,
      }
    : null)

  return {
    previewOpen,
    previewOpenRef,
    previewLoading,
    previewError,
    previewingTarget,
    activePreviewItem,
    modalPreview,
    openPreview,
    closePreview,
    openVersionPreview,
    openAttachmentPreview,
  }
}
