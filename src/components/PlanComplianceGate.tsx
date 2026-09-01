import { useEffect, useState } from 'react'
import { fetchBillingStatus, type PlanKey } from '@/lib/api'
import { useSession } from '@/contexts/SessionContext'
import PlanChangeWizard from '@/components/PlanChangeWizard'

/**
 * A plan can become effective outside the browser (trial expiry or Stripe's
 * scheduled downgrade). In that case the next OWNER/ADMIN session must make
 * the archival decision before any project write is possible.
 */
export default function PlanComplianceGate() {
  const { workspace, refreshSession } = useSession()
  const [activeProjectsCount, setActiveProjectsCount] = useState<number | null>(null)

  const canResolve = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN'

  useEffect(() => {
    let cancelled = false
    if (!canResolve) {
      setActiveProjectsCount(null)
      return () => { cancelled = true }
    }
    void fetchBillingStatus()
      .then((status) => {
        if (!cancelled && status.planKey === 'STARTER' && status.complianceStatus === 'PLAN_ACTION_REQUIRED') {
          setActiveProjectsCount(status.activeProjectsCount)
        }
      })
      .catch(() => { if (!cancelled) setActiveProjectsCount(null) })
    return () => { cancelled = true }
  }, [canResolve, workspace?.id])

  if (activeProjectsCount === null) return null

  const completed = () => {
    setActiveProjectsCount(null)
    void refreshSession()
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-12 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="plan-compliance-title" className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <h2 id="plan-compliance-title" className="text-base font-semibold">Elige el proyecto que seguirá activo</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Starter permite un único proyecto activo. Los demás se archivarán y conservarán toda su información en modo solo lectura.</p>
        <div className="mt-4">
          <PlanChangeWizard targetPlanKey={'STARTER' as PlanKey} activeProjectsCount={activeProjectsCount} mode="resolve" dismissible={false} onClose={() => undefined} onCompleted={completed} />
        </div>
      </div>
    </div>
  )
}
