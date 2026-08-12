import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFloorPlanMarker, deleteFloorPlanMarker, updateFloorPlanMarker, type ApiFloorPlan, type ApiFloorPlanMarker, type ApiFloorPlanAsset } from '@/lib/api'
import { clampNormalized, type NormalizedPoint } from '@/lib/floorPlanCoordinates'

export type EditableFloorPlanMarker = ApiFloorPlanMarker

function copy(markers: EditableFloorPlanMarker[]): EditableFloorPlanMarker[] { return markers.map((marker) => ({ ...marker })) }
function same(left: EditableFloorPlanMarker[], right: EditableFloorPlanMarker[]): boolean {
  return left.length === right.length && left.every((marker, index) => marker.id === right[index].id && marker.x === right[index].x && marker.y === right[index].y)
}

export function useFloorPlanEditor(plan: ApiFloorPlan | null) {
  const source = useMemo(() => plan?.markers ?? [], [plan])
  const [markers, setMarkers] = useState<EditableFloorPlanMarker[]>(source)
  const [past, setPast] = useState<EditableFloorPlanMarker[][]>([])
  const [future, setFuture] = useState<EditableFloorPlanMarker[][]>([])

  useEffect(() => {
    setMarkers(copy(plan?.markers ?? []))
    setPast([])
    setFuture([])
  }, [plan]) // Se resetea solo al cargar/cambiar un plano persistido.

  const commit = useCallback((next: EditableFloorPlanMarker[]) => {
    setMarkers((current) => {
      if (same(current, next)) return current
      setPast((history) => [...history, copy(current)])
      setFuture([])
      return copy(next)
    })
  }, [])

  const place = useCallback((asset: ApiFloorPlanAsset, point: NormalizedPoint) => {
    if (!plan || markers.some((marker) => marker.assetId === asset.id)) return
    const id = -(Date.now() + Math.floor(Math.random() * 1000))
    commit([...markers, {
      id, floorPlanId: plan.id, assetId: asset.id, x: clampNormalized(point.x), y: clampNormalized(point.y),
      createdAt: '', updatedAt: '', asset,
    }])
  }, [commit, markers, plan])

  const remove = useCallback((markerId: number) => commit(markers.filter((marker) => marker.id !== markerId)), [commit, markers])
  const move = useCallback((markerId: number, point: NormalizedPoint) => commit(markers.map((marker) => marker.id === markerId ? { ...marker, x: clampNormalized(point.x), y: clampNormalized(point.y) } : marker)), [commit, markers])
  const undo = useCallback(() => setPast((history) => {
    const previous = history.at(-1)
    if (!previous) return history
    setMarkers((current) => { setFuture((next) => [...next, copy(current)]); return copy(previous) })
    return history.slice(0, -1)
  }), [])
  const redo = useCallback(() => setFuture((history) => {
    const next = history.at(-1)
    if (!next) return history
    setMarkers((current) => { setPast((previous) => [...previous, copy(current)]); return copy(next) })
    return history.slice(0, -1)
  }), [])

  const dirty = useMemo(() => !same(source, markers), [markers, source])
  const save = useCallback(async () => {
    if (!plan) return
    const original = new Map(source.map((marker) => [marker.id, marker]))
    const draft = new Map(markers.map((marker) => [marker.id, marker]))
    for (const marker of source) if (!draft.has(marker.id)) await deleteFloorPlanMarker(plan.id, marker.id)
    for (const marker of markers) {
      if (marker.id < 0) await createFloorPlanMarker(plan.id, { assetId: marker.assetId, x: marker.x, y: marker.y })
      else {
        const previous = original.get(marker.id)
        if (previous && (previous.x !== marker.x || previous.y !== marker.y)) await updateFloorPlanMarker(plan.id, marker.id, { x: marker.x, y: marker.y })
      }
    }
  }, [markers, plan, source])

  return { markers, dirty, canUndo: past.length > 0, canRedo: future.length > 0, place, move, remove, undo, redo, save }
}
