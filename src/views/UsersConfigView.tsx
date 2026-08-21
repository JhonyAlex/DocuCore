import { useCallback, useEffect, useState } from 'react'
import { useProject } from '@/contexts/ProjectContext'
import { addProjectMember, fetchBillingStatus, fetchProjectMembers, fetchWorkspaceMembers, inviteWorkspaceMember, reactivateWorkspaceMember, removeProjectMember, setWorkspaceMemberStatus, updateProjectMember, type ApiProjectMember, type ApiProjectRole, type ApiWorkspaceMember } from '@/lib/api'
import type { ApiBillingStatus } from '@/types'

const roles: ApiProjectRole[] = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']
const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900'

function workspaceStatusLabel(status: ApiWorkspaceMember['workspaceStatus']): string {
  if (status === 'SUSPENDED') return 'Suspendido'
  if (status === 'PLAN_LOCKED') return 'Bloqueado por plan'
  return 'Activo'
}

export default function UsersConfigView() {
  const { projectId } = useProject()
  const [users, setUsers] = useState<ApiWorkspaceMember[]>([])
  const [members, setMembers] = useState<ApiProjectMember[]>([])
  const [billing, setBilling] = useState<ApiBillingStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<ApiProjectRole>('VIEWER')
  const [existingId, setExistingId] = useState('')
  const [existingRole, setExistingRole] = useState<ApiProjectRole>('VIEWER')
  const [notice, setNotice] = useState<string | null>(null)

  if (projectId === null) throw new Error('UsersConfigView requires a project scope')

  const load = useCallback(async () => {
    try {
      const [allUsers, projectMembers, billingStatus] = await Promise.all([fetchWorkspaceMembers(), fetchProjectMembers(projectId, { limit: 100 }), fetchBillingStatus()])
      setUsers(allUsers)
      setMembers(projectMembers.data)
      setBilling(billingStatus)
      setError(null)
    } catch {
      setError('No tienes permiso para gestionar los usuarios de este workspace.')
    }
  }, [projectId])

  useEffect(() => { void load() }, [load])

  const invite = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const invitation = await inviteWorkspaceMember({ email: inviteEmail, workspaceRole: 'MEMBER', projectAssignments: [{ projectId, role: inviteRole }] })
      setInviteEmail('')
      setNotice(`Invitación enviada a ${invitation.email}. La persona recibirá un correo electrónico para aceptarla y configurar su propia contraseña.`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo enviar la invitación.')
    } finally {
      setBusy(false)
    }
  }

  const addExisting = async () => {
    if (!existingId) return
    setBusy(true)
    try {
      await addProjectMember(projectId, { userId: Number(existingId), role: existingRole })
      setExistingId('')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo añadir el usuario.')
    } finally {
      setBusy(false)
    }
  }

  const setRole = async (userId: number, role: ApiProjectRole) => {
    setBusy(true)
    try { await updateProjectMember(projectId, userId, role); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cambiar el rol.') } finally { setBusy(false) }
  }

  const toggleWorkspaceStatus = async (user: ApiWorkspaceMember) => {
    setBusy(true)
    try { await setWorkspaceMemberStatus(user.id, user.workspaceStatus !== 'SUSPENDED'); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el usuario.') } finally { setBusy(false) }
  }

  const reactivatePlanLocked = async (user: ApiWorkspaceMember) => {
    setBusy(true)
    try { await reactivateWorkspaceMember(user.id); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo reactivar el usuario.') } finally { setBusy(false) }
  }

  const remove = async (userId: number) => {
    setBusy(true)
    try { await removeProjectMember(projectId, userId); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo retirar el acceso.') } finally { setBusy(false) }
  }

  const memberIds = new Set(members.map((member) => member.id))
  const activeCount = users.filter((user) => user.workspaceStatus === 'ACTIVE').length
  const maxActiveMembers = billing?.maxActiveMembers ?? 0
  const remainingSeats = billing?.remainingMemberSeats ?? Math.max(0, maxActiveMembers - activeCount)

  return (
    <section className="fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios y permisos</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          La identidad es global; el rol se asigna de forma independiente en cada proyecto. Las invitaciones no
          requieren definir la contraseña de otra persona.
        </p>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800"><h2 className="font-semibold">Miembros del proyecto</h2></div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold dark:bg-slate-800">{member.initials}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <p className="truncate text-xs text-slate-500">{member.email}</p>
                </div>
                <select aria-label={`Rol de ${member.name}`} value={member.role} disabled={busy} onChange={(event) => void setRole(member.id, event.target.value as ApiProjectRole)} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
                  {roles.map((role) => <option key={role}>{role}</option>)}
                </select>
                <button type="button" disabled={busy} onClick={() => void remove(member.id)} className="text-xs text-red-600 hover:underline disabled:opacity-50">Quitar</button>
              </div>
            ))}
            {members.length === 0 && <p className="p-5 text-sm text-slate-500">No hay miembros.</p>}
          </div>
          <div className="flex gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
            <select value={existingId} onChange={(event) => setExistingId(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              <option value="">Añadir miembro del workspace…</option>
              {users.filter((user) => !memberIds.has(user.id) && user.isActive && user.workspaceStatus === 'ACTIVE').map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
            </select>
            <select value={existingRole} onChange={(event) => setExistingRole(event.target.value as ApiProjectRole)} className="rounded border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
              {roles.map((role) => <option key={role}>{role}</option>)}
            </select>
            <button type="button" disabled={busy || !existingId} onClick={() => void addExisting()} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Añadir</button>
          </div>
        </div>

        <form onSubmit={(event) => void invite(event)} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Invitar usuario</h2>
          <p className="mt-1 text-xs text-slate-500">Envía una invitación; la persona configurará su propia contraseña al aceptar.</p>
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium">Correo
              <input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="nombre@empresa.com" className={inputClass} />
            </label>
            <label className="block text-sm font-medium">Rol en este proyecto
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as ApiProjectRole)} className={inputClass}>
                {roles.map((role) => <option key={role}>{role}</option>)}
              </select>
            </label>
          </div>
          <button disabled={busy} className="mt-5 w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Enviando…' : 'Enviar invitación'}</button>
        </form>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Miembros del workspace</h2>
            <p className="mt-1 text-xs text-slate-500">La suspensión solo afecta a este workspace; la identidad global se conserva.</p>
          </div>
          {billing && (
            <div className="text-right text-xs">
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                {activeCount} de {maxActiveMembers} usuarios activos
              </p>
              <p className="text-slate-500">
                {remainingSeats > 0
                  ? `${remainingSeats} ${remainingSeats === 1 ? 'plaza disponible' : 'plazas disponibles'}`
                  : 'Has alcanzado el límite del plan'}
                {' '}· Plan {billing.planName}
              </p>
            </div>
          )}
        </div>
        {billing && activeCount >= maxActiveMembers && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Has alcanzado el límite de {billing.planName}. Actualiza a Pro para ampliar plazas o libera una suspendiendo a un miembro.
          </p>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 dark:border-slate-800">
              <div>
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-slate-500">
                  {workspaceStatusLabel(user.workspaceStatus)}{user.workspaceStatus === 'ACTIVE' ? ` · ${user.role}` : ''}
                </p>
              </div>
              {user.workspaceStatus === 'PLAN_LOCKED' ? (
                <button type="button" disabled={busy || remainingSeats <= 0} onClick={() => void reactivatePlanLocked(user)} className="text-xs font-medium text-brand-600 disabled:opacity-50">
                  Reactivar
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => void toggleWorkspaceStatus(user)} className="text-xs font-medium text-brand-600 disabled:opacity-50">
                  {user.workspaceStatus === 'SUSPENDED' ? 'Reactivar' : 'Suspender'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
