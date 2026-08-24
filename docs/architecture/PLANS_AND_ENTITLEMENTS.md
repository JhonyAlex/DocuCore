# PLANS_AND_ENTITLEMENTS.md — Planes, límites y cumplimiento

Autoridad única de la lógica comercial de planes y límites de proyectos **y
usuarios**. Ninguna ruta debe volver a duplicar estas reglas; si una nueva
superficie necesita decidir "¿puede esta cuenta crear/restaurar/proyecto?" o
"¿puede invitar/reactivar a un miembro?", llama al motor de este documento.

## Fuente de verdad

- Código: `server/lib/entitlements.ts` (motor), `server/lib/billingPlanChange.ts` (API),
  `shared/planCatalog.ts` (catálogo público puro: nombres, precios y capacidades).
- Datos: `Workspace.planKey`, `Workspace.billingStatus`, `Project.status`,
  `Project.archivedByPlan`, `Project.planLockedAt`, `WorkspaceMember.status`,
  `Workspace.graceEndsAt`, `Workspace.planComplianceStartedAt`, tabla `PlanTransition`.

## Estados de cumplimiento (`complianceStatus`)

| Estado | Significado | Escrituras |
|---|---|---|
| `COMPLIANT` | El plan puede sostener los proyectos y usuarios activos | permitidas según estado de facturación |
| `PLAN_ACTION_REQUIRED` | Exceso de proyectos **o** de usuarios activos (herencia o transición no aplicada) | bloqueadas hasta resolver qué conservar |
| `BLOCKED_FOR_PAYMENT` | `PAST_DUE` o `PENDING_VERIFICATION` | bloqueadas |
| `SUSPENDED` | suspensión administrativa (prevalece sobre el plan) | bloqueadas |
| `NO_PLAN` | prueba expirada o sin plan contratado | bloqueadas; lectura/descarga/exportación permitidas |

`PLAN_ACTION_REQUIRED` se dispara tanto por exceso de proyectos como por exceso
de usuarios. La comprobación de escritura (`assertWorkspaceWriteAllowed`) bloquea
todas las mutaciones operativas en ese estado y devuelve `402 PLAN_ACTION_REQUIRED`.

## Capacidad

- **Trial**: 14 días, hasta 15 proyectos activos y 15 usuarios activos.
- **Starter**: máximo **1 proyecto ACTIVE** y **3 WorkspaceMember ACTIVE**.
- **Pro**: máximo 15 proyectos activos y 15 usuarios activos.

`resolveEntitlement` resuelve el plan efectivo a partir de `billingStatus`,
`planKey` y `stripePriceId`. Un workspace `ACTIVE` sin plan explícito hereda el
comportamiento histórico de Pro (15/15).

> Un **platform admin** operando dentro de un workspace normal consume el
> entitlement del workspace, nunca capacidad infinita (§1.2). Su privilegio es
> diagnóstico/administrativo, no comercial.

## Plazas de usuario (seats)

Una **plaza** representa un `WorkspaceMember` con `status = ACTIVE`. No cuentan
`ProjectMember`, invitaciones pendientes/caducadas/revocadas, miembros
retirados, `SUSPENDED` ni `PLAN_LOCKED`. Una persona en varios proyectos del
mismo workspace consume **una** plaza; en dos workspaces consume una en cada uno.
El rol de proyecto no cambia el consumo.

Estados de `WorkspaceMember.status`:

- `ACTIVE`: accede según sus roles y consume plaza.
- `SUSPENDED`: suspensión administrativa/manual; no accede, no consume plaza, **no**
  se reactiva automáticamente por un upgrade de plan.
- `PLAN_LOCKED`: quedó fuera del límite en un downgrade; conserva identidad, rol
  y todas sus `ProjectMember`/`ProjectRole`; no accede, no consume plaza; se
  reactiva cuando existe capacidad (acción explícita de OWNER/ADMIN).

Los seats funcionan como plazas tradicionales: un Starter puede cambiar qué 3
usuarios están `ACTIVE` con el tiempo, sin superar nunca el límite y sin borrar
información histórica. Un workspace jamás queda sin al menos un OWNER `ACTIVE`.

## Archivo manual vs archivo por plan

- Archivo manual: `status=ARCHIVED`, `archivedByPlan=false`. Siempre restaurable
  (si hay capacidad).
- Archivo por límite de plan: `status=ARCHIVED`, `archivedByPlan=true`,
  `planLockedAt=<fecha>`. **Los datos nunca se borran.** En Starter no es
  restaurable; al volver a Pro vuelve a ser elegible.

## Ventana de gracia (30 días)

Al entrar en vigor Starter y bloquear proyectos por límite:
`graceEndsAt = effectiveAt + 30 días`.

Durante ese plazo OWNER/ADMIN puede intercambiar cuál es el único proyecto activo
(operación `swap`, atómica: nunca hay dos activos simultáneos). Tras el plazo:

- los bloqueados siguen almacenados y consultables, con documentos descargables
  y exportaciones disponibles;
- no se pueden reactivar mientras continúe Starter;
- actualizar a Pro los hace elegibles de nuevo.

## Transiciones de plan (`PlanTransition`)

El operador nunca decide vía memoria del navegador. `POST /api/billing/plan-change/initiate`
persiste un `PlanTransition` (PENDING) con `selectedProjectId` **y**
`selectedMemberIds`; cuando Stripe efectivamente lo hace entrar en vigencia,
`resolve`/webhook aplica la transición transaccionalmente (`applyPlanTransition`).
El ID persistente viaja a Stripe como identificador, no una lista arbitraria de
decisiones en metadata.

- Trial → Starter: impacto antes del pago, selección obligatoria si >1 proyecto o
  >3 usuarios, efectivo al terminar la prueba.
- Pro → Starter: mismo motor, resuelve **ambas** dimensiones (proyectos y
  usuarios) en el mismo wizard; downgrade externo (Customer Portal/Stripe) sin
  pasar por nuestra UI cae en `PLAN_ACTION_REQUIRED` explícito.
- Starter → Pro: capacidad sube a 15/15; **no** se reactivan automáticamente los
  bloqueados ni los suspendidos; se muestran como disponibles para restaurar.

## Downgrade externo vía Stripe (§11)

Cualquier cambio externo (Customer Portal, `subscription.updated/deleted`) que
deje STARTER con >1 proyecto ACTIVE o >3 miembros ACTIVE, o PRO con >15, termina
inmediatamente en un estado seguro:

- se conservan los datos;
- `computeCompliance` detecta el exceso y devuelve `PLAN_ACTION_REQUIRED`;
- la comprobación de escritura bloquea las mutaciones con `402 PLAN_ACTION_REQUIRED`
  (lectura, exportación y descarga siguen disponibles);
- el OWNER resuelve qué proyectos/usuarios conservar vía `resolve`.

## Concurrencia (§9)

Toda operación que modifica el número de proyectos activos **o de miembros
activos** (crear, restaurar, intercambio, aplicar transición, aceptar invitación,
reactivar miembro) bloquea la fila `Workspace` con `FOR UPDATE`
(`lockWorkspaceForEntitlement`) dentro de su transacción. Dos peticiones
concurrentes no pueden observar ambas la misma capacidad; la aceptación de una
invitación por la última plaza concede exactamente una.

## Códigos de error estables (§18)

`PROJECT_LIMIT_EXCEEDED`, `WORKSPACE_MEMBER_LIMIT_REACHED`,
`DOWNGRADE_PROJECT_LIMIT_EXCEEDED`, `DOWNGRADE_MEMBER_LIMIT_EXCEEDED`,
`PLAN_COMPLIANCE_REQUIRED`, `MEMBER_SELECTION_REQUIRED`, `INVALID_MEMBER_SELECTION`,
`OWNER_REQUIRED`, `MEMBER_PLAN_LOCKED`, `PLAN_ACTION_REQUIRED`,
`PLAN_LOCKED_PROJECT`, `PLAN_UPGRADE_REQUIRES_CHECKOUT`, `PLAN_UPGRADE_REQUIRED`,
`TRIAL_EXPIRED`, `PAST_DUE`, `WORKSPACE_SUSPENDED`, `INSUFFICIENT_PROJECT_ROLE`,
`WORKSPACE_ACCESS_DENIED`, `GRACE_PERIOD_EXPIRED`, `INVITATION_PENDING`,
`INVITATION_INVALID`, `INVITATION_EMAIL_MISMATCH`, `LAST_OWNER`, `NO_PLAN_CAPACITY`.

El middleware de errores (`server/middleware/error.ts`) propaga `code` y metadata.
El cliente (`src/lib/api.ts`) envuelve todo en `ApiError { status, code, metadata }`.

## Invariantes

1. Un workspace Starter nunca opera silenciosamente con >1 proyecto ACTIVE ni >3 miembros ACTIVE.
2. La finalización de prueba/suscripción nunca elimina proyectos, activos, documentos ni miembros.
3. Un proyecto plan-locked sigue consultable y exportable; un miembro plan-locked conserva sus asociaciones.
4. La selección del proyecto y los miembros conservados se persiste (`PlanTransition`), nunca en memoria del navegador.
5. Todo downgrade exige selección explícita cuando hay exceso de proyectos o de usuarios.
6. Un workspace conserva siempre al menos un OWNER ACTIVE.

