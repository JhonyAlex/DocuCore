# WORKSPACE_ACCESS.md — Acceso, roles, multi-workspace e invitaciones

## Modelo de membresía (dos niveles)

- **WorkspaceRole** (`WorkspaceMember`): `OWNER`, `ADMIN`, `MEMBER`.
- **ProjectRole** (`ProjectMember`): `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`.

La identidad (`User`) es global; la autorización siempre proviene de las
membresías. `User.isActive` representa identidad global y **no** debe usarse para
suspender a alguien de una sola empresa.

| Rol workspace | Puede |
|---|---|
| OWNER | cuenta, facturación, equipo, proyectos, invitaciones, roles, transferencias |
| ADMIN | equipo, crear/administrar/compartir proyectos, asignar roles |
| MEMBER | solo recibe acceso según sus `ProjectMemberships` |

| Rol proyecto | Puede |
|---|---|
| OWNER | administración completa (miembros, configuración, operación) |
| ADMIN | administración del proyecto; no puede dejarlo sin propietario |
| EDITOR | crear/editar información operativa; no administra usuarios ni configuración crítica |
| VIEWER | solo lectura + descarga/exportación; ninguna mutación |

La matriz está centralizada en `server/lib/projectScope.ts` (`projectCapabilities`).

## Aislamiento por workspace

- `GET /api/users` lista **solo** miembros del workspace activo; un admin de
  Workspace A nunca puede enumerar ni modificar usuarios de Workspace B.
- Crear/invitar un usuario desde un proyecto requiere también coherencia de
  `WorkspaceMember` (nunca solo `ProjectMember`).

## Multi-workspace

Una persona puede pertenecer a varios workspaces (su empresa, un cliente, otra
empresa como viewer). El contexto autoritativo es `User.activeWorkspaceId`
(cambio vía `POST /api/users/switch-workspace`); `getUserPrimaryWorkspace`
respeta ese contexto y, sin él, cae al primer membership activo. Cambiar de
workspace nunca filtra datos del anterior.

## Suspensión por workspace

`WorkspaceMember.status` (`ACTIVE`/`SUSPENDED`/`PLAN_LOCKED`):

- `ACTIVE`: accede según sus roles y consume plaza.
- `SUSPENDED`: suspensión administrativa/manual; solo en ese workspace; no accede,
  no consume plaza y **no** se reactiva automáticamente por un upgrade de plan.
- `PLAN_LOCKED`: quedó fuera del límite de plazas en un downgrade; conserva
  identidad, rol y todas sus `ProjectMemberships`; no accede, no consume plaza y
  se reactiva (OWNER/ADMIN) cuando existe capacidad.

Retirar a un miembro del workspace revoca sus `ProjectMemberships` de ese
workspace transaccionalmente pero **nunca** elimina la identidad global.

## Invitaciones

`WorkspaceInvitation` + `WorkspaceInvitationProjectRole`:

- El administrador **no** define la contraseña de otra persona.
- Token aleatorio, **hasheado** (`tokenHash`), expirable (7 días) y de un solo uso.
- Email ya registrado → al aceptar se añade `WorkspaceMember` si falta y se
  aplican las `ProjectMemberships`; **no** se duplica el `User`.
- Email nuevo → enlace de aceptación → registro (`/auth/register-invitee`, sin
  workspace) → verificación de email con `returnTo` → regreso automático al flujo
  de aceptación. El invitado nunca debe reabrir el primer correo.
- La **aceptación** verifica capacidad transaccionalmente: bloquea la fila
  `Workspace` con `FOR UPDATE` y, si no queda plaza, devuelve
  `WORKSPACE_MEMBER_LIMIT_REACHED`. Dos aceptaciones concurrentes por la última
  plaza conceden exactamente una.
- Los tokens nunca se persisten en claro; la API de creación devuelve el token
  una única vez.

## Catálogo de errores

`WORKSPACE_ACCESS_DENIED`, `INSUFFICIENT_PROJECT_ROLE`, `LAST_OWNER`,
`WORKSPACE_MEMBER_LIMIT_REACHED`, `MEMBER_PLAN_LOCKED`, `INVITATION_*`.
Ver también `PLANS_AND_ENTITLEMENTS.md` §"Códigos de error".
