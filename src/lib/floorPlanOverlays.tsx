import type { MutableRefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import OpenSeadragon from 'openseadragon'
import FloorPlanMarker from '@/components/FloorPlanMarker'
import type { EditableFloorPlanMarker } from '@/hooks/useFloorPlanEditor'
import { denormalizeImagePoint, normalizeImagePoint, type NormalizedPoint } from '@/lib/floorPlanCoordinates'
import type { FloorPlanLod } from '@/lib/floorPlanPresentation'

export interface FloorPlanOverlayAnchor {
  x: number
  y: number
}

export type FloorPlanOverlay = {
  element: HTMLDivElement
  root: Root
  dragging: boolean
  pointerId: number | null
  pointerStart: { x: number; y: number } | null
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerCancel: (event: PointerEvent) => void
}

export type FloorPlanLatestViewerValues = {
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

export function destroyFloorPlanOverlay(overlay: FloorPlanOverlay) {
  if (overlay.pointerId !== null && overlay.element.hasPointerCapture(overlay.pointerId)) overlay.element.releasePointerCapture(overlay.pointerId)
  overlay.pointerId = null
  overlay.pointerStart = null
  overlay.element.removeEventListener('pointerdown', overlay.onPointerDown)
  overlay.element.removeEventListener('pointermove', overlay.onPointerMove)
  overlay.element.removeEventListener('pointerup', overlay.onPointerUp)
  overlay.element.removeEventListener('pointercancel', overlay.onPointerCancel)
  setTimeout(() => overlay.root.unmount(), 0)
}

function clientPoint(event: MouseEvent | TouchEvent | PointerEvent): { x: number; y: number } | null {
  if ('changedTouches' in event && event.changedTouches.length > 0) return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
  if ('touches' in event && event.touches.length > 0) return { x: event.touches[0].clientX, y: event.touches[0].clientY }
  return 'clientX' in event ? { x: event.clientX, y: event.clientY } : null
}

export function syncFloorPlanMarkerOverlays({ viewer, overlays, markers, width, height, lod, highlightedAssetId, latest }: {
  viewer: OpenSeadragon.Viewer
  overlays: Map<number, FloorPlanOverlay>
  markers: EditableFloorPlanMarker[]
  width: number
  height: number
  lod: FloorPlanLod
  highlightedAssetId: number | null
  latest: MutableRefObject<FloorPlanLatestViewerValues>
}) {
  const active = new Set(markers.map((marker) => marker.id))
  for (const [markerId, overlay] of overlays) {
    if (!active.has(markerId)) {
      viewer.removeOverlay(overlay.element)
      destroyFloorPlanOverlay(overlay)
      overlays.delete(markerId)
    }
  }
  const pointForEvent = (event: MouseEvent | TouchEvent | PointerEvent, overlay: FloorPlanOverlay, fallback: OpenSeadragon.Point): { point: NormalizedPoint; anchor: FloorPlanOverlayAnchor } => {
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
      const currentOverlay: FloorPlanOverlay = {
        element,
        root: createRoot(element),
        dragging: false,
        pointerId: null,
        pointerStart: null,
        onPointerDown: () => undefined,
        onPointerMove: () => undefined,
        onPointerUp: () => undefined,
        onPointerCancel: () => undefined,
      }
      const currentMarker = () => latest.current.markers.find((candidate) => candidate.id === marker.id) ?? null
      const releasePointer = (event: PointerEvent) => {
        if (currentOverlay.pointerId !== event.pointerId) return
        if (currentOverlay.element.hasPointerCapture(event.pointerId)) currentOverlay.element.releasePointerCapture(event.pointerId)
        currentOverlay.pointerId = null
        currentOverlay.pointerStart = null
      }
      currentOverlay.onPointerDown = (event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        currentOverlay.pointerId = event.pointerId
        currentOverlay.pointerStart = { x: event.clientX, y: event.clientY }
        currentOverlay.dragging = false
        currentOverlay.element.setPointerCapture(event.pointerId)
      }
      currentOverlay.onPointerMove = (event) => {
        if (currentOverlay.pointerId !== event.pointerId) return
        event.stopPropagation()
        const current = currentMarker()
        if (!current || latest.current.readOnly) return
        const start = currentOverlay.pointerStart
        if (!currentOverlay.dragging && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 3) return
        if (!currentOverlay.dragging) {
          currentOverlay.dragging = true
          latest.current.onMarkerDragStart(marker.id)
        }
        latest.current.onMarkerDrag(marker.id, pointForEvent(event, currentOverlay, new OpenSeadragon.Point(event.offsetX, event.offsetY)).point)
      }
      currentOverlay.onPointerUp = (event) => {
        if (currentOverlay.pointerId !== event.pointerId) return
        event.stopPropagation()
        const current = currentMarker()
        if (currentOverlay.dragging && current && !latest.current.readOnly) {
          latest.current.onMarkerDrag(marker.id, pointForEvent(event, currentOverlay, new OpenSeadragon.Point(event.offsetX, event.offsetY)).point)
          currentOverlay.dragging = false
          latest.current.onMarkerDragEnd(marker.id)
        } else if (current) {
          latest.current.onSelectMarker(current, pointForEvent(event, currentOverlay, new OpenSeadragon.Point(event.offsetX, event.offsetY)).anchor)
        }
        releasePointer(event)
      }
      currentOverlay.onPointerCancel = (event) => {
        if (currentOverlay.pointerId !== event.pointerId) return
        event.stopPropagation()
        if (currentOverlay.dragging && !latest.current.readOnly) {
          currentOverlay.dragging = false
          latest.current.onMarkerDragEnd(marker.id)
        }
        releasePointer(event)
      }
      element.addEventListener('pointerdown', currentOverlay.onPointerDown)
      element.addEventListener('pointermove', currentOverlay.onPointerMove)
      element.addEventListener('pointerup', currentOverlay.onPointerUp)
      element.addEventListener('pointercancel', currentOverlay.onPointerCancel)
      overlay = currentOverlay
      overlays.set(marker.id, overlay)
      viewer.addOverlay({ element, location: new OpenSeadragon.Point(0, 0), placement: OpenSeadragon.Placement.BOTTOM })
    }
    const point = denormalizeImagePoint(marker, width, height)
    viewer.updateOverlay(overlay.element, viewer.viewport.imageToViewportCoordinates(point.x, point.y), OpenSeadragon.Placement.BOTTOM)
    overlay.root.render(<FloorPlanMarker marker={marker} lod={lod} highlighted={marker.assetId === highlightedAssetId} onSelect={() => latest.current.onSelectMarker(marker, { x: 24, y: 24 })} />)
  }
}
