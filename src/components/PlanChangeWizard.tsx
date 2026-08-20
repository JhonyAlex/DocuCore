import { useEffect, useRef, useState } from 'react'
import { ApiError, createBillingCheckoutSession, initiatePlanChange, previewPlanChange, type PlanChangeMemberPreview, type PlanChangePreview, type PlanKey } from '@/lib/api'
import { PLAN_CATALOG } from '../../shared/planCatalog'

type Step = 'overview' | 'select' | 'confirm' | 'done'

interface PlanChangeWizardProps {
  targetPlanKey: PlanKey
  activeProjectsCount: number
  onClose: () => void
}

/**
 * Downgrade/upgrade wizard (§5, §6, §17): impact → selection → confirmation →
 * Stripe. The chosen "keep" project and members are persisted server-side
 * (PlanTransition), never in browser memory. A downgrade resolves BOTH
 * dimensions — projects and member seats — in the same wizard.
 */
export default function PlanChangeWizard({ targetPlanKey, activeProjectsCount, onClose }: PlanChangeWizardProps) {
  const [step, setStep] = useState<Step>('overview')
  const [preview, setPreview] = useState<PlanChangePreview | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    previewPlanChange(targetPlanKey)
      .then((data) => {
        if (cancelled) return
        setPreview(data)
        if (data.affectedProjects.length === 1) setSelectedId(data.affectedProjects[0].id)
        if (!data.requiresSelection) setStep('confirm')
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [targetPlanKey])

  const requiresProjectSelection = preview?.requiresProjectSelection ?? (targetPlanKey === 'STARTER' && activeProjectsCount > PLAN_CATALOG.STARTER.maxActiveProjects)
  const requiresMemberSelection = preview?.requiresMemberSelection ?? false
  const maxActiveMembers = preview?.maxActiveMembers ?? 0

  const selectableProjects = preview?.affectedProjects ?? []
  const selectableMembers: PlanChangeMemberPreview[] = preview?.affectedMembers ?? []

  const selectedOwnerPresent = !requiresMemberSelection || selectableMembers.some((m) => selectedMemberIds.includes(m.id) && m.role === 'OWNER')

  const memberSelectionValid = !requiresMemberSelection || (selectedMemberIds.length === maxActiveMembers && selectedOwnerPresent)
  const selectionValid = (!requiresProjectSelection || selectedId !== null) && memberSelectionValid

  const toggleMember = (id: number) => {
    setSelectedMemberIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= maxActiveMembers) return prev
      return [...prev, id]
    })
  }

  const proceed = async () => {
    // Guard against a rapid double click: `busy` state is async, so a second
    // click in the same tick would otherwise start a duplicate checkout. The
    // server-side deterministic transition id is the authoritative guard; this
    // is the cheap UI-level one.
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await initiatePlanChange({
        targetPlanKey,
        selectedProjectId: selectedId ?? undefined,
        selectedMemberIds: requiresMemberSelection ? selectedMemberIds : undefined,
      })
      // The decision is persisted (transitionId). Walk straight into Stripe
      // checkout carrying that id; when the webhook confirms the plan, the
      // persisted PENDING transition is applied transactionally.
      const checkout = await createBillingCheckoutSession(targetPlanKey, {
        transitionId: result.transitionId,
        selectedProjectId: result.selectedProjectId,
        selectedMemberIds: requiresMemberSelection ? selectedMemberIds : undefined,
      })
      if (checkout.checkoutUrl) {
        setStep('done')
        window.location.href = checkout.checkoutUrl
      }
    } catch (reason) {
      const code = reason instanceof ApiError ? reason.code : null
      setError(
        code === 'PLAN_COMPLIANCE_REQUIRED'
          ? 'Debes seleccionar qué proyecto deseas conservar activo.'
          : code === 'MEMBER_SELECTION_REQUIRED' || code === 'INVALID_MEMBER_SELECTION'
            ? 'Debes seleccionar los usuarios que conservarán acceso.'
            : code === 'OWNER_REQUIRED'
              ? 'Debes conservar al menos una persona propietaria activa.'
              : reason instanceof Error
                ? reason.message
                : 'No se pudo iniciar el cambio de plan.',
      )
      setBusy(false)
      busyRef.current = false
    }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-5 dark:border-brand-900/60 dark:bg-brand-950/20">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
          Cambio a {targetPlanKey === 'STARTER' ? 'Starter' : 'Pro'}
        </h4>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Cerrar">
          ✕
        </button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      {step === 'overview' && (
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
          Detectando el impacto del cambio…
          {preview && (
            <> Tienes {preview.activeProjects} proyecto(s) activo(s) y {preview.activeMembers} usuario(s) activo(s).</>
          )}
        </p>
      )}

      {step === 'select' && preview && (
        <div className="mt-4 space-y-4">
          {requiresProjectSelection && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                El plan Starter permite <strong>1 proyecto activo</strong>. Elige cuál conservar; los demás quedarán
                archivados por límite de plan (solo lectura, sin perder datos).
              </p>
              {selectableProjects.map((project) => (
                <label key={project.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  <input
                    type="radio"
                    name="keep-project"
                    checked={selectedId === project.id}
                    onChange={() => setSelectedId(project.id)}
                  />
                  <span>
                    <span className="block text-xs font-semibold">{project.name}</span>
                    <span className="block text-[11px] text-slate-500">{project.code}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {requiresMemberSelection && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                El plan Starter permite <strong>{maxActiveMembers} usuarios activos</strong>. Actualmente tienes{' '}
                <strong>{preview.activeMembers}</strong>. Selecciona exactamente {maxActiveMembers} que conservarán
                acceso; el resto quedará bloqueado por límite de plan (sin borrar sus datos ni roles).
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Debes conservar al menos una persona propietaria activa.
              </p>
              {selectableMembers.map((member) => {
                const checked = selectedMemberIds.includes(member.id)
                const disabled = !checked && selectedMemberIds.length >= maxActiveMembers
                return (
                  <label key={member.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 ${disabled ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleMember(member.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{member.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">{member.email} · {member.role}</span>
                    </span>
                  </label>
                )
              })}
              <p className="text-[11px] text-slate-500">
                Seleccionados: {selectedMemberIds.length} de {maxActiveMembers}
              </p>
            </div>
          )}
        </div>
      )}

      {step === 'confirm' && (
        <div className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
          <p>
            Al confirmar se procederá a Stripe para contratar{' '}
            <strong>{targetPlanKey === 'STARTER' ? 'Starter' : 'Pro'}</strong>.
          </p>
          {requiresProjectSelection && selectedId && (
            <p>
              Conservarás activo el proyecto:{' '}
              <strong>{selectableProjects.find((p) => p.id === selectedId)?.name ?? ''}</strong>.
            </p>
          )}
          {requiresMemberSelection && (
            <p>
              Conservarán acceso:{' '}
              <strong>{selectableMembers.filter((m) => selectedMemberIds.includes(m.id)).map((m) => m.name).join(', ')}</strong>.
              El resto quedará bloqueado por límite de plan.
            </p>
          )}
          <p>Los demás datos no se eliminarán.</p>
        </div>
      )}

      {step === 'done' && (
        <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">Transición guardada. Redirigiendo a Stripe…</p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        {step === 'overview' && (
          <button type="button" onClick={() => setStep(requiresProjectSelection || requiresMemberSelection ? 'select' : 'confirm')} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
            Continuar
          </button>
        )}
        {step === 'select' && (
          <>
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium dark:border-slate-700">Cancelar</button>
            <button
              type="button"
              disabled={!selectionValid || busy}
              onClick={() => setStep('confirm')}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Continuar
            </button>
          </>
        )}
        {step === 'confirm' && (
          <>
            <button type="button" onClick={() => setStep(requiresProjectSelection || requiresMemberSelection ? 'select' : 'overview')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium dark:border-slate-700">Atrás</button>
            <button type="button" disabled={busy || !selectionValid} onClick={() => void proceed()} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy ? 'Guardando…' : 'Confirmar y continuar a Stripe'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
