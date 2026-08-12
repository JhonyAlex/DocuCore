import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import OpenSeadragon from 'openseadragon'
import FloorPlanMarker from '@/components/FloorPlanMarker'
import type { EditableFloorPlanMarker } from '@/hooks/useFloorPlanEditor'
import { denormalizeImagePoint, normalizeImagePoint, type NormalizedPoint } from '@/lib/floorPlanCoordinates'
import { lodForZoom, type FloorPlanLod } from '@/lib/floorPlanPresentation'

export interface FloorPlanViewerActions {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  focus: (marker: EditableFloorPlanMarker) => void
}

export interface FloorPlanOverlayAnchor {
  x: number
  y: number
}

interface FloorPlanViewerProps {
  dziUrl: string
  width: number
  height: number
  markers: EditableFloorPlanMarker[]
  actionsRef: MutableRefObject<FloorPlanViewerActions | null>
  onReady?: (actions: FloorPlanViewerActions) => void
  onEmptyQuickClick?: (point: NormalizedPoint, anchor: FloorPlanOverlayAnchor) => void
  onSelectMarker?: (marker: EditableFloorPlanMarker, anchor: FloorPlanOverlayAnchor) => void
  onMarkerDragStart?: (markerId: number) => void
  onMarkerDrag?: (markerId: number, point: NormalizedPoint) => void
  onMarkerDragEnd?: (markerId: number) => void
  readOnly?: boolean
  initialFocusMarker?: EditableFloorPlanMarker | null
  highlightedAssetId?: number | null
  className?: string
}

type Overlay = { element: HTMLDivElement; root: Root; tracker: OpenSeadragon.MouseTracker | null; dragging: boolean }
const noopReady = (_actions: FloorPlanViewerActions) => undefined
const noopEmptyQuickClick = (_point: NormalizedPoint, _anchor: FloorPlanOverlayAnchor) => undefined
const noopSelectMarker = (_marker: EditableFloorPlanMarker, _anchor: FloorPlanOverlayAnchor) => undefined
const noopMarkerDragStart = (_markerId: number) => undefined
const noopMarkerDrag = (_markerId: number, _point: NormalizedPoint) => undefined
const noopMarkerDragEnd = (_markerId: number) => undefined
type LatestViewerValues = {
  markers: EditableFloorPlanMarker[]
  onEmptyQuickClick: (point: NormalizedPoint, anchor: FloorPlanOverlayAnchor) => void
  onSelectMarker: (marker: EditableFloorPlanMarker, anchor: FloorPlanOverlayAnchor) => void
  onMarkerDragStart: (markerId: number) => void
  onMarkerDrag: (markerId: number, point: NormalizedPoint) => void
  onMarkerDragEnd: (markerId: number) => void
  readOnly: boolean
  width: number
  height: number
}

function clientPoint(event: MouseEvent | TouchEvent | PointerEvent): { x: number; y: number } | null {
  if ('changedTouches' in event && event.changedTouches.length > 0) return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
  if ('touches' in event && event.touches.length > 0) return { x: event.touches[0].clientX, y: event.touches[0].clientY }
  return 'clientX' in event ? { x: event.clientX, y: event.clientY } : null
}

function syncMarkerOverlays({ viewer, overlays, markers, width, height, lod, highlightedAssetId, latest }: {
  viewer: OpenSeadragon.Viewer
  overlays: Map<number, Overlay>
  markers: EditableFloorPlanMarker[]
  width: number
  height: number
  lod: FloorPlanLod
  highlightedAssetId: number | null
  latest: MutableRefObject<LatestViewerValues>
}) {
  const active = new Set(markers.map((marker) => marker.id))
  for (const [markerId, overlay] of overlays) {
    if (!active.has(markerId)) {
      viewer.removeOverlay(overlay.element)
      overlay.tracker?.destroy()
      setTimeout(() => overlay.root.unmount(), 0)
      overlays.delete(markerId)
    }
  }
  const pointForEvent = (event: MouseEvent | TouchEvent | PointerEvent, overlay: Overlay, fallback: OpenSeadragon.Point): { point: NormalizedPoint; anchor: FloorPlanOverlayAnchor } => {
    const hostBox = viewer.element.getBoundingClientRect()
    const fromClient = clientPoint(event)
    const client = fromClient ?? { x: overlay.element.getBoundingClientRect().left + fallback.x, y: overlay.element.getBoundingClientRect().top + fallback.y }
    const viewerPoint = new OpenSeadragon.Point(client.x - hostBox.left, client.y - hostBox.top)
    const imagePoint = viewer.viewport.viewportToImageCoordinates(viewer.viewport.pointFromPixel(viewerPoint))
    return { point: normalizeImagePoint(imagePoint.x, imagePoint.y, latest.current.width, latest.current.height), anchor: { x: viewerPoint.x, y: viewerPoint.y } }
  }
  for (const marker of markers) {
    let overlay = overlays.get(marker.id)
    if (!overlay) {
      const element = document.createElement('div')
      element.className = 'floor-plan-overlay'
      overlay = { element, root: createRoot(element), tracker: null, dragging: false }
      overlays.set(marker.id, overlay)
      viewer.addOverlay({ element, location: new OpenSeadragon.Point(0, 0), placement: OpenSeadragon.Placement.BOTTOM })
    }
    if (!overlay.tracker) {
      const currentOverlay = overlay
      currentOverlay.tracker = new OpenSeadragon.MouseTracker({
        element: currentOverlay.element,
        preProcessEventHandler: (event) => { event.stopPropagation = true },
        clickHandler: (event) => {
          if (!event.quick || currentOverlay.dragging) return
          const current = latest.current.markers.find((candidate) => candidate.id === marker.id)
          if (!current) return
          const interaction = pointForEvent(event.originalEvent, currentOverlay, event.position)
          latest.current.onSelectMarker(current, interaction.anchor)
        },
        dragHandler: (event) => {
          if (latest.current.readOnly) return
          const current = latest.current.markers.find((candidate) => candidate.id === marker.id)
          if (!current) return
          if (!currentOverlay.dragging) {
            currentOverlay.dragging = true
            latest.current.onMarkerDragStart(marker.id)
          }
          latest.current.onMarkerDrag(marker.id, pointForEvent(event.originalEvent, currentOverlay, event.position).point)
        },
        dragEndHandler: (event) => {
          if (latest.current.readOnly) return
          if (!currentOverlay.dragging) return
          latest.current.onMarkerDrag(marker.id, pointForEvent(event.originalEvent, currentOverlay, event.position).point)
          currentOverlay.dragging = false
          latest.current.onMarkerDragEnd(marker.id)
        },
      })
    }
    const point = denormalizeImagePoint(marker, width, height)
    viewer.updateOverlay(overlay.element, viewer.viewport.imageToViewportCoordinates(point.x, point.y), OpenSeadragon.Placement.BOTTOM)
    overlay.root.render(<FloorPlanMarker marker={marker} lod={lod} highlighted={marker.assetId === highlightedAssetId} onSelect={() => latest.current.onSelectMarker(marker, { x: 24, y: 24 })} />)
  }
}

export default function FloorPlanViewer({ dziUrl, width, height, markers, actionsRef, onReady = noopReady, onEmptyQuickClick = noopEmptyQuickClick, onSelectMarker = noopSelectMarker, onMarkerDragStart = noopMarkerDragStart, onMarkerDrag = noopMarkerDrag, onMarkerDragEnd = noopMarkerDragEnd, readOnly = false, initialFocusMarker = null, highlightedAssetId = null, className }: FloorPlanViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null)
  const homeZoomRef = useRef(1)
  const relativeZoomRef = useRef(1)
  const suppressZoomSyncRef = useRef(false)
  const overlaysRef = useRef(new Map<number, Overlay>())
  const initialFocusMarkerRef = useRef(initialFocusMarker)
  const [ready, setReady] = useState(false)
  const [lod, setLod] = useState<FloorPlanLod>('dot')
  const latest = useRef({ markers, onEmptyQuickClick, onSelectMarker, onMarkerDragStart, onMarkerDrag, onMarkerDragEnd, readOnly, width, height })
  latest.current = { markers, onEmptyQuickClick, onSelectMarker, onMarkerDragStart, onMarkerDrag, onMarkerDragEnd, readOnly, width, height }
  // Los callers suelen reconstruir el marcador al actualizar su estado. La
  // instancia OSD no debe reiniciarse por ese cambio de identidad.
  initialFocusMarkerRef.current = initialFocusMarker

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const viewer = OpenSeadragon({
      element: host,
      tileSources: dziUrl,
      showNavigationControl: false,
      showNavigator: false,
      drawer: 'html',
      animationTime: 0.2,
      blendTime: 0.1,
      gestureSettingsMouse: { clickToZoom: false, scrollToZoom: true, dblClickToZoom: true, dragToPan: true },
      gestureSettingsTouch: { pinchToZoom: true, flickEnabled: true, dragToPan: true },
    })
    setReady(false)
    viewerRef.current = viewer
    const overlays = overlaysRef.current
    const focus = (marker: EditableFloorPlanMarker) => {
      suppressZoomSyncRef.current = true
      relativeZoomRef.current = 2.6
      const point = denormalizeImagePoint(marker, latest.current.width, latest.current.height)
      viewer.viewport.panTo(viewer.viewport.imageToViewportCoordinates(point.x, point.y), true)
      viewer.viewport.zoomTo(homeZoomRef.current * 2.6, undefined, true)
      setLod('detail')
      setTimeout(() => { suppressZoomSyncRef.current = false }, 250)
    }
    const actions: FloorPlanViewerActions = {
      zoomIn: () => { suppressZoomSyncRef.current = true; relativeZoomRef.current *= 1.25; viewer.viewport.zoomBy(1.25); setLod(lodForZoom(relativeZoomRef.current)); setTimeout(() => { suppressZoomSyncRef.current = false }, 250) },
      zoomOut: () => { suppressZoomSyncRef.current = true; relativeZoomRef.current *= 0.8; viewer.viewport.zoomBy(0.8); setLod(lodForZoom(relativeZoomRef.current)); setTimeout(() => { suppressZoomSyncRef.current = false }, 250) },
      fit: () => { suppressZoomSyncRef.current = true; relativeZoomRef.current = 1; viewer.viewport.goHome(); setLod('dot'); setTimeout(() => { suppressZoomSyncRef.current = false }, 250) },
      focus,
    }
    viewer.addHandler('open', () => {
      homeZoomRef.current = viewer.viewport.getZoom(true)
      relativeZoomRef.current = 1
      setLod('dot')
      setReady(true)
      actionsRef.current = actions
      onReady(actions)
      if (initialFocusMarkerRef.current) focus(initialFocusMarkerRef.current)
    })
    viewer.addHandler('zoom', () => {
      if (suppressZoomSyncRef.current) return
      setLod((current) => { relativeZoomRef.current = viewer.viewport.getZoom(true) / homeZoomRef.current; const next = lodForZoom(relativeZoomRef.current); return current === next ? current : next })
    })
    viewer.addHandler('canvas-click', (event) => {
      if (!event.quick) return
      const imagePoint = viewer.viewport.viewportToImageCoordinates(viewer.viewport.pointFromPixel(event.position))
      latest.current.onEmptyQuickClick(normalizeImagePoint(imagePoint.x, imagePoint.y, latest.current.width, latest.current.height), { x: event.position.x, y: event.position.y })
    })
    return () => {
      actionsRef.current = null
      for (const overlay of overlays.values()) { overlay.tracker?.destroy(); setTimeout(() => overlay.root.unmount(), 0) }
      overlays.clear()
      viewer.destroy()
      viewerRef.current = null
    }
  }, [actionsRef, dziUrl, onReady])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !viewer.world.getItemCount()) return
    syncMarkerOverlays({ viewer, overlays: overlaysRef.current, markers, width, height, lod, highlightedAssetId, latest })
  }, [height, highlightedAssetId, lod, markers, ready, width])

  return <div ref={hostRef} data-testid="floor-plan-viewer" className={`relative h-[600px] bg-slate-100 dark:bg-slate-950 ${className ?? ''}`} />
}
