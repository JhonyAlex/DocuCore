import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import OpenSeadragon from 'openseadragon'
import FloorPlanMarker from '@/components/FloorPlanMarker'
import type { EditableFloorPlanMarker } from '@/hooks/useFloorPlanEditor'
import { denormalizeImagePoint, normalizeImagePoint } from '@/lib/floorPlanCoordinates'
import { lodForZoom, type FloorPlanLod } from '@/lib/floorPlanPresentation'

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
  editMode: boolean
  placementAssetId: number | null
  actionsRef: MutableRefObject<FloorPlanViewerActions | null>
  onReady: (actions: FloorPlanViewerActions) => void
  onPlace: (point: { x: number; y: number }) => void
  onSelectMarker: (marker: EditableFloorPlanMarker) => void
}

type Overlay = { element: HTMLDivElement; root: Root; tracker: OpenSeadragon.MouseTracker | null }
type LatestViewerValues = Pick<FloorPlanViewerProps, 'markers' | 'onSelectMarker'>

function syncMarkerOverlays({
  viewer,
  overlays,
  markers,
  width,
  height,
  editMode,
  lod,
  latest,
  onSelectMarker,
}: {
  viewer: OpenSeadragon.Viewer
  overlays: Map<number, Overlay>
  markers: EditableFloorPlanMarker[]
  width: number
  height: number
  editMode: boolean
  lod: FloorPlanLod
  latest: MutableRefObject<LatestViewerValues>
  onSelectMarker: (marker: EditableFloorPlanMarker) => void
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
  for (const marker of markers) {
    let overlay = overlays.get(marker.id)
    if (!overlay) {
      const element = document.createElement('div')
      element.className = 'floor-plan-overlay'
      overlay = { element, root: createRoot(element), tracker: null }
      overlays.set(marker.id, overlay)
      viewer.addOverlay({ element, location: new OpenSeadragon.Point(0, 0), placement: OpenSeadragon.Placement.BOTTOM })
    }
    if (!overlay.tracker) {
      overlay.tracker = new OpenSeadragon.MouseTracker({
        element: overlay.element,
        preProcessEventHandler: (event) => { event.stopPropagation = true },
        clickHandler: (event) => {
          if (!event.quick) return
          const current = latest.current.markers.find((candidate) => candidate.id === marker.id)
          if (current) latest.current.onSelectMarker(current)
        },
      })
    }
    const point = denormalizeImagePoint(marker, width, height)
    viewer.updateOverlay(overlay.element, viewer.viewport.imageToViewportCoordinates(point.x, point.y), OpenSeadragon.Placement.BOTTOM)
    overlay.root.render(<FloorPlanMarker marker={marker} editMode={editMode} lod={lod} onSelect={() => onSelectMarker(marker)} />)
  }
}

export default function FloorPlanViewer({ dziUrl, width, height, markers, editMode, placementAssetId, actionsRef, onReady, onPlace, onSelectMarker }: FloorPlanViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null)
  const homeZoomRef = useRef(1)
  const relativeZoomRef = useRef(1)
  const suppressZoomSyncRef = useRef(false)
  const overlaysRef = useRef(new Map<number, Overlay>())
  const pointForRef = useRef<(clientX: number, clientY: number) => { x: number; y: number }>(() => ({ x: 0, y: 0 }))
  const [ready, setReady] = useState(false)
  const [lod, setLod] = useState<FloorPlanLod>('dot')
  const latest = useRef({ markers, editMode, placementAssetId, onPlace, onSelectMarker, width, height })
  latest.current = { markers, editMode, placementAssetId, onPlace, onSelectMarker, width, height }

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
    const pointFor = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect()
      const viewportPoint = viewer.viewport.pointFromPixel(new OpenSeadragon.Point(clientX - rect.left, clientY - rect.top))
      const imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint)
      return normalizeImagePoint(imagePoint.x, imagePoint.y, latest.current.width, latest.current.height)
    }
    pointForRef.current = pointFor
    viewer.addHandler('open', () => { homeZoomRef.current = viewer.viewport.getZoom(true); relativeZoomRef.current = 1; setLod('dot'); setReady(true) })
    viewer.addHandler('zoom', () => {
      if (suppressZoomSyncRef.current) return
      setLod((current) => { relativeZoomRef.current = viewer.viewport.getZoom(true) / homeZoomRef.current; const next = lodForZoom(relativeZoomRef.current); return current === next ? current : next })
    })
    const actions: FloorPlanViewerActions = {
      zoomIn: () => { suppressZoomSyncRef.current = true; relativeZoomRef.current *= 1.25; viewer.viewport.zoomBy(1.25); setLod(lodForZoom(relativeZoomRef.current)); setTimeout(() => { suppressZoomSyncRef.current = false }, 250) },
      zoomOut: () => { suppressZoomSyncRef.current = true; relativeZoomRef.current *= 0.8; viewer.viewport.zoomBy(0.8); setLod(lodForZoom(relativeZoomRef.current)); setTimeout(() => { suppressZoomSyncRef.current = false }, 250) },
      fit: () => { suppressZoomSyncRef.current = true; relativeZoomRef.current = 1; viewer.viewport.goHome(); setLod('dot'); setTimeout(() => { suppressZoomSyncRef.current = false }, 250) },
      focus: (marker) => { suppressZoomSyncRef.current = true; relativeZoomRef.current = 2.6; const point = denormalizeImagePoint(marker, latest.current.width, latest.current.height); viewer.viewport.panTo(viewer.viewport.imageToViewportCoordinates(point.x, point.y), true); viewer.viewport.zoomTo(homeZoomRef.current * 2.6, undefined, true); setLod('detail'); setTimeout(() => { suppressZoomSyncRef.current = false }, 250) },
    }
    actionsRef.current = actions
    onReady(actions)
    return () => {
      actionsRef.current = null
      for (const overlay of overlays.values()) { overlay.tracker?.destroy(); setTimeout(() => overlay.root.unmount(), 0) }
      overlays.clear()
      viewer.destroy()
      viewerRef.current = null
    }
  }, [actionsRef, dziUrl, onReady])

  useEffect(() => {
    // En edición el lienzo no secuestra el puntero de los marcadores. La navegación
    // sigue disponible en modo Ver y el zoom permanece en los controles explícitos.
    viewerRef.current?.setMouseNavEnabled(!editMode)
  }, [editMode])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !viewer.world.getItemCount()) return
    syncMarkerOverlays({ viewer, overlays: overlaysRef.current, markers, width, height, editMode, lod, latest, onSelectMarker })
  }, [editMode, height, lod, markers, onSelectMarker, ready, width])

  return <div
    ref={hostRef}
    data-testid="floor-plan-viewer"
    className={`relative h-[600px] bg-slate-100 dark:bg-slate-950 ${editMode && placementAssetId !== null ? 'cursor-crosshair' : ''}`}
    onClickCapture={(event) => {
      if (!latest.current.editMode || latest.current.placementAssetId === null || (event.target as HTMLElement).closest('.floor-plan-overlay')) return
      latest.current.onPlace(pointForRef.current(event.clientX, event.clientY))
    }}
  />
}
