import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssetCreateRequest } from '@/contexts/AssetCreateContext'
import { useTheme } from '@/hooks/useTheme'
import { searchGlobal, type ApiGlobalSearchResult, type ApiSearchAsset, type ApiSearchDocument, type ApiSearchEvent, type ApiSearchHistoryEntry, type ApiSearchLocation, type ApiSearchPlan, type ApiSearchSetting } from '@/lib/api'
import { getStatusChipClass } from '@/lib/assetMappers'
import { useProject } from '@/contexts/ProjectContext'

interface GlobalSearchModalProps {
  open: boolean
  onClose: () => void
}

interface SearchItem {
  id: string
  group: string
  title: string
  subtitle?: string
  badge?: string
  badgeClass?: string
  pulseDot?: string | null
  icon: ReactNode
  onSelect: () => void
}

const icons = {
  dashboard: (
    <svg className="w-4 h-4 text-brand-600 dark:text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  projects: (
    <svg className="w-4 h-4 text-brand-600 dark:text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  asset: (
    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  document: (
    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  calendar: (
    <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  plan: (
    <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  ),
  location: (
    <svg className="w-4 h-4 text-rose-600 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  history: (
    <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 14 14" />
    </svg>
  ),
  config: (
    <svg className="w-4 h-4 text-slate-600 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  plus: (
    <svg className="w-4 h-4 text-brand-600 dark:text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  theme: (
    <svg className="w-4 h-4 text-amber-500 dark:text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
}

export default function GlobalSearchModal({ open, onClose }: GlobalSearchModalProps) {
  const navigate = useNavigate()
  const { projectId } = useProject()
  const { requestCreate } = useAssetCreateRequest()
  const { toggle: toggleTheme } = useTheme()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiGlobalSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const searchSeqRef = useRef(0)
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults(null)
      setLoading(false)
      setSelectedIndex(0)
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Limpieza de controladores en desmontaje
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [])

  // Búsqueda diferida con debounce (200ms) y descarte de peticiones obsoletas
  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery)
    const trimmed = nextQuery.trim()

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!trimmed) {
      if (abortControllerRef.current) abortControllerRef.current.abort()
      setResults(null)
      setLoading(false)
      setSelectedIndex(0)
      return
    }

    setLoading(true)

    debounceRef.current = setTimeout(async () => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller
      const seq = ++searchSeqRef.current

      try {
        if (projectId === null) return
        const res = await searchGlobal(projectId, trimmed, controller.signal)
        if (seq === searchSeqRef.current) {
          setResults(res)
          setLoading(false)
          setSelectedIndex(0)
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return
        if (seq === searchSeqRef.current) {
          setLoading(false)
        }
      }
    }, 200)
  }

  // Lista estática de vistas para acceso directo
  const staticViews = useMemo(() => [
    { id: 'view-dashboard', title: 'Panel general', subtitle: 'Resumen e indicadores del proyecto', path: projectId ? `/projects/${projectId}/dashboard` : '/projects', icon: icons.dashboard },
    { id: 'view-assets', title: 'Activos', subtitle: 'Catálogo e inventario de maquinaria y equipos', path: projectId ? `/projects/${projectId}/assets` : '/projects', icon: icons.asset },
    { id: 'view-documents', title: 'Documentos', subtitle: 'Certificados, manuales y contratos', path: projectId ? `/projects/${projectId}/docs` : '/projects', icon: icons.document },
    { id: 'view-calendar', title: 'Calendario', subtitle: 'Mantenimientos, vencimientos y eventos', path: projectId ? `/projects/${projectId}/calendar` : '/projects', icon: icons.calendar },
    { id: 'view-plans', title: 'Planos', subtitle: 'Visor y marcadores interactivos', path: projectId ? `/projects/${projectId}/plans` : '/projects', icon: icons.plan },
    { id: 'view-locations', title: 'Ubicaciones', subtitle: 'Estructura de plantas, naves y áreas', path: projectId ? `/projects/${projectId}/locations` : '/projects', icon: icons.location },
    { id: 'view-projects', title: 'Proyectos', subtitle: 'Gestión y estado de proyectos', path: '/projects', icon: icons.projects },
    { id: 'view-history', title: 'Historial y auditoría', subtitle: 'Trazabilidad de cambios y acciones', path: projectId ? `/projects/${projectId}/history` : '/projects', icon: icons.history },
    { id: 'view-config', title: 'Configuración', subtitle: 'Ajustes generales del sistema', path: projectId ? `/projects/${projectId}/config` : '/projects', icon: icons.config },
    { id: 'view-config-statuses', title: 'Estados', subtitle: 'Estados operativos de los activos', path: projectId ? `/projects/${projectId}/config/statuses` : '/projects', icon: icons.config },
    { id: 'view-config-dynamic-fields', title: 'Campos dinámicos', subtitle: 'Definición de atributos personalizados', path: projectId ? `/projects/${projectId}/config/dynamic-fields` : '/projects', icon: icons.config },
    { id: 'view-config-asset-types', title: 'Tipos de activo', subtitle: 'Categorías e iconos de equipos', path: projectId ? `/projects/${projectId}/config/asset-types` : '/projects', icon: icons.config },
    { id: 'view-config-preventives', title: 'Mantenimiento preventivo', subtitle: 'Planes y plantillas preventivas', path: projectId ? `/projects/${projectId}/config/preventives` : '/projects', icon: icons.config },
  ], [projectId])

  // Lista estática de acciones rápidas
  const staticActions = useMemo(() => [
    {
      id: 'action-new-asset',
      title: 'Crear nuevo activo',
      subtitle: 'Registrar un nuevo equipo en el inventario',
      icon: icons.plus,
      run: () => {
        requestCreate()
        navigate(projectId ? `/projects/${projectId}/assets` : '/projects')
      },
    },
    {
      id: 'action-upload-doc',
      title: 'Subir nuevo documento',
      subtitle: 'Adjuntar certificado o manual técnico',
      icon: icons.plus,
      run: () => navigate(projectId ? `/projects/${projectId}/docs` : '/projects'),
    },
    {
      id: 'action-new-location',
      title: 'Crear nueva ubicación',
      subtitle: 'Añadir nave, planta o área',
      icon: icons.plus,
      run: () => navigate(projectId ? `/projects/${projectId}/locations` : '/projects'),
    },
    {
      id: 'action-toggle-theme',
      title: 'Cambiar tema claro / oscuro',
      subtitle: 'Alternar modo visual de la interfaz',
      icon: icons.theme,
      run: () => toggleTheme(),
    },
  ], [navigate, projectId, requestCreate, toggleTheme])

  // Agrupación y aplanamiento de items
  const items: SearchItem[] = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    const list: SearchItem[] = []

    // 1. Activos encontrados
    if (results?.assets && results.assets.length > 0) {
      results.assets.forEach((asset: ApiSearchAsset) => {
        const chipClass = getStatusChipClass({ name: asset.statusName, color: asset.statusColor })
        list.push({
          id: `asset-${asset.id}`,
          group: 'Activos',
          title: `${asset.code} · ${asset.name}`,
          subtitle: `SN: ${asset.serialNumber}${asset.locationName ? ` · ${asset.locationName}` : ''} (${asset.typeName})`,
          badge: asset.statusName,
          badgeClass: chipClass,
          pulseDot: asset.pulseDot,
          icon: icons.asset,
          onSelect: () => {
            onClose()
            navigate(`/projects/${projectId}/assets?assetId=${asset.id}`)
          },
        })
      })
    }

    // 2. Documentos encontrados
    if (results?.documents && results.documents.length > 0) {
      results.documents.forEach((doc: ApiSearchDocument) => {
        const assetPrefix = doc.assetCodes && doc.assetCodes.length > 0 ? `${doc.assetCodes.join(', ')} · ` : ''
        list.push({
          id: `doc-${doc.id}`,
          group: 'Documentos',
          title: `${assetPrefix}${doc.name}`,
          subtitle: `${doc.type}${doc.periodicity ? ` · Periodicidad: ${doc.periodicity}` : ''}`,
          badge: doc.type,
          badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
          icon: icons.document,
          onSelect: () => {
            onClose()
            navigate(`/projects/${projectId}/docs?documentId=${doc.id}`)
          },
        })
      })
    }

    // 3. Ubicaciones encontradas
    if (results?.locations && results.locations.length > 0) {
      results.locations.forEach((loc: ApiSearchLocation) => {
        list.push({
          id: `loc-${loc.id}`,
          group: 'Ubicaciones',
          title: `${loc.code} · ${loc.name}`,
          subtitle: loc.parentName ? `En: ${loc.parentName}` : 'Ubicación raíz',
          badge: 'Ubicación',
          badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
          icon: icons.location,
          onSelect: () => {
            onClose()
            navigate(`/projects/${projectId}/locations?locationId=${loc.id}`)
          },
        })
      })
    }

    // 4. Planos encontrados
    if (results?.plans && results.plans.length > 0) {
      results.plans.forEach((plan: ApiSearchPlan) => {
        list.push({
          id: `plan-${plan.id}`,
          group: 'Planos',
          title: plan.name,
          subtitle: `${plan.locationCode} · ${plan.locationName}`,
          badge: 'Plano',
          badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
          icon: icons.plan,
          onSelect: () => {
            onClose()
            navigate(`/projects/${projectId}/plans?planId=${plan.id}`)
          },
        })
      })
    }

    // 5. Eventos encontrados
    if (results?.events && results.events.length > 0) {
      results.events.forEach((event: ApiSearchEvent) => {
        const dateStr = new Date(event.date).toLocaleDateString('es-ES')
        const assetInfo = event.assetCode ? ` · ${event.assetCode} (${event.assetName})` : ''
        list.push({
          id: `event-${event.id}`,
          group: 'Calendario y Eventos',
          title: event.title,
          subtitle: `${dateStr}${assetInfo}`,
          badge: event.type,
          badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
          icon: icons.calendar,
          onSelect: () => {
            onClose()
            navigate(`/projects/${projectId}/calendar?view=month&date=${event.date.slice(0, 10)}`)
          },
        })
      })
    }

    // 6. Catálogos configurables del proyecto
    if (results?.settings && results.settings.length > 0) {
      results.settings.forEach((setting: ApiSearchSetting) => {
        list.push({
          id: `setting-${setting.id}`,
          group: 'Configuración',
          title: setting.title,
          subtitle: `${setting.kind} · ${setting.subtitle}`,
          badge: setting.kind,
          badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
          icon: icons.config,
          onSelect: () => {
            onClose()
            navigate(setting.path)
          },
        })
      })
    }

    // 7. Movimientos ya registrados que coinciden con la búsqueda
    if (results?.history && results.history.length > 0) {
      results.history.forEach((entry: ApiSearchHistoryEntry) => {
        list.push({
          id: `history-${entry.id}`,
          group: 'Historial',
          title: `${entry.action} · ${entry.entityId}`,
          subtitle: entry.detail,
          badge: 'Movimiento',
          badgeClass: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
          icon: icons.history,
          onSelect: () => {
            onClose()
            navigate(`/projects/${projectId}/history?search=${encodeURIComponent(entry.entityId)}`)
          },
        })
      })
    }

    // 8. Vistas coincidentes
    const matchingViews = trimmed
      ? staticViews.filter((v) => v.title.toLowerCase().includes(trimmed) || v.subtitle.toLowerCase().includes(trimmed))
      : staticViews.slice(0, 6)

    matchingViews.forEach((v) => {
      list.push({
        id: v.id,
        group: trimmed ? 'Vistas' : 'Navegación rápida',
        title: v.title,
        subtitle: v.subtitle,
        badge: 'Vista',
        badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        icon: v.icon,
        onSelect: () => {
          onClose()
          navigate(v.path)
        },
      })
    })

    // 9. Acciones rápidas coincidentes
    const matchingActions = trimmed
      ? staticActions.filter((a) => a.title.toLowerCase().includes(trimmed) || a.subtitle.toLowerCase().includes(trimmed))
      : staticActions

    matchingActions.forEach((a) => {
      list.push({
        id: a.id,
        group: trimmed ? 'Acciones' : 'Acciones sugeridas',
        title: a.title,
        subtitle: a.subtitle,
        badge: 'Acción',
        badgeClass: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
        icon: a.icon,
        onSelect: () => {
          onClose()
          a.run()
        },
      })
    })

    return list
  }, [projectId, query, results, staticViews, staticActions, onClose, navigate])

  // Mantener scroll del item activo a la vista
  useEffect(() => {
    const el = itemRefs.current.get(selectedIndex)
    if (el) {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Navegación por teclado global mientras el modal esté abierto
  useEffect(() => {
    if (!open) return
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }

      if (items.length === 0) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % items.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + items.length) % items.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        if (items[selectedIndex]) {
          items[selectedIndex].onSelect()
        }
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown, true)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown, true)
  }, [open, items, selectedIndex, onClose])

  if (!open) return null

  // Agrupar items para visualización ordenada
  const groupedItems = items.reduce<Record<string, { item: SearchItem; globalIndex: number }[]>>((acc, item, idx) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push({ item, globalIndex: idx })
    return acc
  }, {})

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Búsqueda global"
      data-testid="global-search-modal"
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 pt-16 md:pt-24"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex min-h-0 max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        {/* Cabecera del buscador */}
        <div className="shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <svg className="w-5 h-5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            id="global-search-input"
            type="text"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="global-search-results"
            placeholder="Buscar activos, documentos, ubicaciones, planos, eventos…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="flex-1 bg-transparent border-none text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none text-base"
          />
          {loading && (
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin shrink-0" title="Buscando…" />
          )}
          {query && !loading && (
            <button
              type="button"
              onClick={() => handleQueryChange('')}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md"
              title="Borrar texto"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          <kbd className="kbd bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 text-xs px-2 py-0.5 rounded">
            ESC
          </kbd>
        </div>

        {/* Lista de resultados */}
        <div
          id="global-search-results"
          role="listbox"
          className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-3 space-y-4"
        >
          {items.length === 0 && !loading && query.trim() !== '' && (
            <div className="py-12 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No se encontraron resultados para «<span className="text-slate-900 dark:text-white font-semibold">{query}</span>»
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Prueba buscando por código de activo, nombre de equipo, número de serie, título de documento o ubicación.
              </p>
            </div>
          )}

          {Object.entries(groupedItems).map(([groupName, groupEntries]) => (
            <div key={groupName} className="space-y-1">
              <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {groupName}
              </div>
              {groupEntries.map(({ item, globalIndex }) => {
                const isSelected = selectedIndex === globalIndex
                return (
                  <button
                    key={item.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(globalIndex, el)
                      else itemRefs.current.delete(globalIndex)
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => item.onSelect()}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                      isSelected
                        ? 'bg-brand-50/90 dark:bg-brand-950/40 text-brand-950 dark:text-brand-50 border border-brand-200/60 dark:border-brand-800/40'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-2">
                        <span>{item.title}</span>
                        {item.pulseDot && (
                          <span className={`pulse-dot ${item.pulseDot}`}>
                            <span className="relative w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    {item.badge && (
                      <span className={`chip shrink-0 text-xs px-2 py-0.5 rounded-md font-medium ${item.badgeClass ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Pie del buscador con indicaciones de atajos */}
        <div className="shrink-0 px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="kbd bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 rounded">↑</kbd>
              <kbd className="kbd bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 rounded">↓</kbd>
              para navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 rounded">↵</kbd>
              para seleccionar
            </span>
          </div>
          <span className="hidden sm:inline">
            {items.length} {items.length === 1 ? 'resultado' : 'resultados'}
          </span>
        </div>
      </div>
    </div>
  )
}
