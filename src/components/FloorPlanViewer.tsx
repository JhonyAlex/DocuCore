import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react'
import OpenSeadragon from 'openseadragon'
import type { EditableFloorPlanMarker } from '@/hooks/useFloorPlanEditor'
import { denormalizeImagePoint, normalizeImagePoint, type NormalizedPoint } from '@/lib/floorPlanCoordinates'
import { destroyFloorPlanOverlay, syncFloorPlanMarkerOverlays, type FloorPlanLatestViewerValues, type FloorPlanOverlay, type FloorPlanOverlayAnchor } from '@/lib/floorPlanOverlays'
import { lodForZoom, type FloorPlanLod } from '@/lib/floorPlanPresentation'

export type { FloorPlanOverlayAnchor } from '@/lib/floorPlanOverlays'

export interface FloorPlanViewerActions {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  focus: (marker: EditableFloorPlanMarker) => void
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

const noopReady = (_actions: FloorPlanViewerActions) => undefined
const noopEmptyQuickClick = (_point: NormalizedPoint, _anchor: FloorPlanOverlayAnchor) => undefined
const noopSelectMarker = (_marker: EditableFloorPlanMarker, _anchor: FloorPlanOverlayAnchor) => undefined
const noopMarkerDragStart = (_markerId: number) => undefined
const noopMarkerDrag = (_markerId: number, _point: NormalizedPoint) => undefined
const noopMarkerDragEnd = (_markerId: number) => undefined

function releaseCapturedPointer(element: Element, event: Event) {
  const pointerEvent = event as PointerEvent
  if (typeof pointerEvent.pointerId !== 'number' || !element.hasPointerCapture(pointerEvent.pointerId)) return
  element.releasePointerCapture(pointerEvent.pointerId)
}

function clearViewerPointerCaptures(viewer: OpenSeadragon.Viewer) {
  const trackers = [
    (viewer as OpenSeadragon.Viewer & { innerTracker: OpenSeadragon.MouseTracker }).innerTracker,
    (viewer as OpenSeadragon.Viewer & { outerTracker: OpenSeadragon.MouseTracker }).outerTracker,
  ]
  for (const tracker of trackers) {
    for (const pointerType of ['mouse', 'touch', 'pen']) {
      const points = tracker.getActivePointersListByType(pointerType)
      for (const point of points.asArray()) {
        if (!point.captured) continue
        // OpenSeadragon may tear down its tracker element while a pointer-up
        // callback is still queued. Avoid a console exception in that race.
        const element = tracker.element
        if (element?.hasPointerCapture(point.id)) element.releasePointerCapture(point.id)
        point.captured = false
      }
      points.captureCount = 0
    }
  }
}

export default function FloorPlanViewer({ dziUrl, width, height, markers, actionsRef, onReady = noopReady, onEmptyQuickClick = noopEmptyQuickClick, onSelectMarker = noopSelectMarker, onMarkerDragStart = noopMarkerDragStart, onMarkerDrag = noopMarkerDrag, onMarkerDragEnd = noopMarkerDragEnd, readOnly = false, initialFocusMarker = null, highlightedAssetId = null, className }: FloorPlanViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null)
  const homeZoomRef = useRef(1)
  const relativeZoomRef = useRef(1)
  const suppressZoomSyncRef = useRef(false)
  const overlaysRef = useRef(new Map<number, FloorPlanOverlay>())
  const initialFocusMarkerRef = useRef(initialFocusMarker)
  const isMountedRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [fullyLoaded, setFullyLoaded] = useState(false)
  const [lod, setLod] = useState<FloorPlanLod>('dot')
  const latest = useRef<FloorPlanLatestViewerValues>({ markers, onEmptyQuickClick, onSelectMarker, onMarkerDragStart, onMarkerDrag, onMarkerDragEnd, readOnly, width, height })
  latest.current = { markers, onEmptyQuickClick, onSelectMarker, onMarkerDragStart, onMarkerDrag, onMarkerDragEnd, readOnly, width, height }
  // Los callers suelen reconstruir el marcador al actualizar su estado. La
  // instancia OSD no debe reiniciarse por ese cambio de identidad.
  initialFocusMarkerRef.current = initialFocusMarker

  useLayoutEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

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
    setFullyLoaded(false)
    viewerRef.current = viewer
    const overlays = new Map<number, FloorPlanOverlay>()
    overlaysRef.current = overlays
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
      viewer.whenFullyLoaded(() => {
        if (viewerRef.current === viewer && isMountedRef.current) setFullyLoaded(true)
      })
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
    viewer.addHandler('canvas-release', (event) => {
      window.setTimeout(() => releaseCapturedPointer(event.tracker.element, event.originalEvent as Event), 0)
    })
    return () => {
      actionsRef.current = null
      viewerRef.current = null
      const dispose = () => {
        for (const overlay of overlays.values()) destroyFloorPlanOverlay(overlay)
        overlays.clear()
        if (!viewer.isDestroyed()) {
          clearViewerPointerCaptures(viewer)
          viewer.destroy()
        }
      }
      if (isMountedRef.current) {
        dispose()
        return
      }
      const destroyAfterRender = () => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            dispose()
          })
        })
      }
      // OSD invalidates a tiled image during destroy. When the component is
      // leaving the route, wait for in-flight tiles before that invalidation so
      // they cannot complete against a reset cache, then let its render loop
      // settle before releasing the instance.
      viewer.whenFullyLoaded(destroyAfterRender)
    }
  }, [actionsRef, dziUrl, onReady])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !viewer.world.getItemCount()) return
    syncFloorPlanMarkerOverlays({ viewer, overlays: overlaysRef.current, markers, width, height, lod, highlightedAssetId, latest })
  }, [height, highlightedAssetId, lod, markers, ready, width])

  return <div ref={hostRef} data-testid="floor-plan-viewer" data-floor-plan-loaded={fullyLoaded ? 'true' : 'false'} className={`relative h-[600px] bg-slate-100 dark:bg-slate-950 ${className ?? ''}`} />
}
