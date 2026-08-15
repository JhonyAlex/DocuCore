import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '@/contexts/ProjectContext'
import { fetchConfiguredAssetTypes, fetchConfiguredStatuses, fetchDynamicFieldDefinitions, fetchPreventivePlans } from '@/lib/api'
import type { ConfigCard } from '@/types'

const configCards: ConfigCard[] = [
  { title: 'Tipos de activo', description: 'Máquinas, extintores, vehículos, documentos…', footer: 'Gestionar tipos →', iconBgClass: 'bg-brand-50 dark:bg-brand-900/30 text-brand-600', iconKey: 'box' },
  { title: 'Campos dinámicos', description: 'Define campos personalizados por tipo de activo.', footer: 'Gestionar campos →', iconBgClass: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600', iconKey: 'lines' },
  { title: 'Estados', description: 'Activo, fuera de servicio, en revisión, vencido…', footer: 'Gestionar estados →', iconBgClass: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600', iconKey: 'smile' },
  { title: 'Usuarios y permisos', description: 'Gestiona roles, accesos y responsabilidades.', footer: 'Próxima fase', iconBgClass: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600', iconKey: 'users' },
  { title: 'Alertas y notificaciones', description: 'Reglas de aviso, correo y canales externos.', footer: 'Por proyecto', iconBgClass: 'bg-red-50 dark:bg-red-900/30 text-red-600', iconKey: 'bell' },
  { title: 'Integraciones', description: 'API, webhooks, Teams, Slack, n8n…', footer: 'Próximamente', iconBgClass: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600', iconKey: 'grid2', footerClass: 'text-slate-500' },
]

const configIcons: Record<string, ReactNode> = {
  box: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>,
  lines: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h10M4 17h16" /></svg>,
  smile: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>,
  users: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  bell: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
  grid2: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4z" /><path d="M4 12h16M12 4v16" /></svg>,
}

export default function ConfigView() {
  const navigate = useNavigate()
  const { projectId } = useProject()
  if (projectId === null) throw new Error('ConfigView requires a project scope')
  const [dynamicCount, setDynamicCount] = useState<number | null>(null)
  const [assetTypeCount, setAssetTypeCount] = useState<number | null>(null)
  const [statusCount, setStatusCount] = useState<number | null>(null)
  const [preventivePlanCount, setPreventivePlanCount] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      fetchDynamicFieldDefinitions(projectId, { includeInactive: true }),
      fetchConfiguredAssetTypes(projectId, true),
      fetchConfiguredStatuses(projectId, true),
      fetchPreventivePlans(projectId, { includeInactive: true }),
    ]).then(([fields, types, statuses, plans]) => {
      setDynamicCount(fields.filter((field) => field.isActive).length)
      setAssetTypeCount(types.filter((type) => type.isActive !== false).length)
      setStatusCount(statuses.filter((status) => status.isActive !== false).length)
      setPreventivePlanCount(plans.filter((plan) => plan.isActive).length)
    }).catch(() => {
      setDynamicCount(null)
      setAssetTypeCount(null)
      setStatusCount(null)
      setPreventivePlanCount(null)
    })
  }, [projectId])

  return (
    <section className="fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Tipos de activo, campos dinámicos, preventivos y permisos</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/projects/${projectId}/config/preventives`)}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigate(`/projects/${projectId}/config/preventives`) }}
          className="cursor-pointer rounded-xl border border-slate-200 bg-white p-5 transition hover:border-brand-500/40 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30">✓</div>
          <h3 className="font-semibold">Preventivos</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Catálogo de tareas y plantillas de planes periódicos.</p>
          <div className="mt-3 text-xs font-medium text-brand-600">
            {preventivePlanCount === null ? 'Gestionar preventivos →' : `${preventivePlanCount} plantillas de plan activas →`}
          </div>
        </div>

        {configCards.map((card) => {
          const isInteractive = card.title === 'Campos dinámicos' || card.title === 'Tipos de activo' || card.title === 'Estados'
          const handleNavigate = () => {
            if (card.title === 'Campos dinámicos') navigate(`/projects/${projectId}/config/dynamic-fields`)
            if (card.title === 'Tipos de activo') navigate(`/projects/${projectId}/config/asset-types`)
            if (card.title === 'Estados') navigate(`/projects/${projectId}/config/statuses`)
          }

          return (
            <div
              role={isInteractive ? 'button' : undefined}
              tabIndex={isInteractive ? 0 : undefined}
              key={card.title}
              onClick={handleNavigate}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                handleNavigate()
              }}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:border-brand-500/40 transition cursor-pointer"
            >
              <div className={`w-10 h-10 rounded-lg ${card.iconBgClass} flex items-center justify-center mb-3`}>
                {configIcons[card.iconKey]}
              </div>
              <h3 className="font-semibold">{card.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{card.description}</p>
              <div className={`text-xs ${card.footerClass ?? 'text-brand-600'} mt-3 font-medium`}>
                {card.title === 'Campos dinámicos' && dynamicCount !== null
                  ? `${dynamicCount} campos definidos →`
                  : card.title === 'Tipos de activo' && assetTypeCount !== null
                    ? `${assetTypeCount} tipos configurados →`
                    : card.title === 'Estados' && statusCount !== null
                      ? `${statusCount} estados configurados →`
                      : card.footer}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
