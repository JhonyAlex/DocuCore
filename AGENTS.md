# DocuCore — AGENTS.md

## Propósito

DocuCore es una plataforma de gestión documental y de activos industriales. Convierte un prototipo HTML aprobado en una aplicación real: React + TypeScript + PostgreSQL + Docker, con fidelidad visual total al diseño original.

## Regla de fidelidad al HTML

> Ningún agente puede rediseñar, reinterpretar, simplificar o sustituir la interfaz del HTML de referencia sin autorización expresa del usuario.

> Antes de modificar una vista se debe abrir el HTML de referencia. Después de modificarla se debe ejecutar su comparación visual.

El HTML de referencia es un **contrato visual**. No es una inspiración. La aplicación debe verse como un espejo del HTML original.

## Referencia

- **Archivo protegido**: `docs/reference/docucore-prototype.html`
- **SHA-256**: `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112`
- **Tamaño**: 126104 bytes (1709 líneas)
- **Vistas identificadas**: 9 (dashboard, projects, items, docs, calendar, plans, locations, history, config)

## Arquitectura

```
DocuCore/
├── docs/reference/       # HTML protegido + docs de diseño
├── docs/progress/        # Estado y logs de sesión
├── src/                  # Frontend React + TypeScript
│   ├── components/       # Componentes compartidos
│   ├── views/            # Las 9 vistas
│   ├── layouts/          # Shell (sidebar + topbar)
│   ├── hooks/            # Custom hooks (theme, etc.)
│   ├── lib/              # API client, utils
│   ├── types/            # TypeScript types
│   └── data/             # Mock data (fase 2) → API (fase 3)
├── server/               # Express API + Prisma
├── prisma/               # Schema + migraciones + seed
├── tests/                # E2E + regresión visual (Playwright)
├── public/               # Assets estáticos (logo, avatar, plano)
├── docker-compose.yml
├── Dockerfile
├── AGENTS.md             # Este archivo
└── package.json
```

### Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v3 |
| Routing | React Router v6 |
| Backend | Express + Prisma + Zod |
| DB | PostgreSQL |
| Tests | Vitest (unit) + Playwright (E2E + visual) |
| Deploy | Docker + Docker Compose (Dokploy-ready) |

### Sistema de diseño (extraído del HTML)

- **Fuente**: Inter (vía `@fontsource/inter`, sin CDN)
- **Paleta brand**: 50 `#eef4ff` → 950 `#101c4e`, primario 500 `#3a64ff`
- **Dark mode**: estrategia `class` en `<html>`
- **Layout**: `flex h-screen`, sidebar `w-64`, topbar `h-16`
- **CSS custom**: scrollbar-thin, fade-in, pin hover, pulse-dot, kbd, chip, nav-link.active, cal-cell

## Comandos

```bash
pnpm install          # Instalar dependencias
pnpm dev             # Servidor de desarrollo (Vite)
pnpm build           # Build de producción (tsc + vite)
pnpm lint            # ESLint
pnpm typecheck       # TypeScript strict
pnpm test            # Vitest (unit)
pnpm test:e2e        # Playwright E2E
pnpm test:visual     # Playwright regresión visual
pnpm server          # Servidor Express (tsx watch)
pnpm db:migrate      # Prisma migrate dev
pnpm db:seed         # Seed de base de datos
docker compose up    # Levantar todo (DB + app)
```

## Convenciones

- TypeScript estricto, sin `any` sin justificación.
- Componentes pequeños y enfocados; sin bloques JSX gigantes.
- Separación: presentación / negocio / datos.
- Sin assets externos temporales; todo en `public/` o `src/assets/`.
- Commits convencionales: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.
- No modificar migraciones ya aplicadas.
- No desactivar lint ni pruebas.

## Fase actual

**Fase 1 — Recuperación e integridad**: COMPLETADA

- ✅ HTML protegido en `docs/reference/docucore-prototype.html`
- ✅ SHA-256 calculado y documentado
- ✅ Assets descargados localmente (logo, avatar, plano)
- ✅ Proyecto Vite + React + TS + Tailwind scaffoldeado
- ✅ `pnpm install` / `pnpm lint` / `pnpm build` pasan

**Fase 2 — Réplica visual completa**: COMPLETADA

- ✅ Shell: Sidebar + Topbar + Layout + ThemeToggle
- ✅ 9 vistas implementadas con datos mock
- ✅ Tipos centralizados en `src/types/index.ts`
- ✅ Datos mock centralizados en `src/data/mock.ts`
- ✅ Navegación con React Router v6
- ✅ Modal de activo funcional (6 pestañas)
- ✅ Calendario visual (grid mensual)
- ✅ Plano interactivo con marcadores arrastrables
- ✅ Modo claro/oscuro funcional
- ✅ `pnpm build` / `pnpm lint` / `pnpm typecheck` pasan

**Fase 3 — Funcionalidad real de Activos e ítems**: EN PROGRESO

- ✅ Prisma schema con 13 entidades (PostgreSQL)
- ✅ Migración inicial aplicada
- ✅ Seed reproducible (6 items, 5 proyectos, 5 tipos, 5 estados, 5 ubicaciones)
- ✅ Express API con Zod (GET/POST/PUT/PATCH /api/items)
- ✅ CRUD verificado: crear, editar, cambiar estado, filtrar, paginar
- ✅ Auditoría automática en operaciones de escritura
- ✅ API client en frontend (`src/lib/api.ts`)
- ✅ CSS class mapping (`src/lib/itemMappers.ts`) — fidelidad visual
- ✅ ItemsView conectada al API (lectura + filtros + paginación)
- 🔲 UI: botón "Nuevo ítem" → POST
- 🔲 UI: ItemModal "Editar" → PUT
- 🔲 UI: ItemModal "Dar de baja" → PATCH status

**Próxima fase**: Fase 4 — Calidad y despliegue (tests + Docker + Dokploy)

## Vistas

| Vista | Estado | Validada |
|-------|--------|----------|
| Panel general (dashboard) | Implementada (mock) | No |
| Proyectos | Implementada (mock) | No |
| Activos e ítems | Implementada (mock) | No |
| Documentos | Implementada (mock) | No |
| Calendario | Implementada (mock) | No |
| Planos | Implementada (mock) | No |
| Ubicaciones | Implementada (mock) | No |
| Historial | Implementada (mock) | No |
| Configuración | Implementada (mock) | No |

## Módulos

| Módulo | Estado |
|--------|--------|
| Shell (sidebar + topbar + theme) | Implementado |
| Navegación | Implementado |
| Datos demostrativos | Implementado (mock) |
| CRUD Activos → PostgreSQL | API implementada, UI lectura |
| Docker | Implementado (PostgreSQL) |

## Errores conocidos

Ninguno (fase 2 limpia).

## Último commit estable

Fase 2 — réplica visual completa (feat(ui): reproduce approved DocuCore views).

## Próximo paso exacto

Implementar el backend: Prisma schema con 13 entidades, Express API, migraciones y seed. Conectar la vista de Activos e ítems a PostgreSQL (CRUD real, filtros, paginación, modal dinámico, auditoría). Ver `docs/progress/CURRENT_STATUS.md` para detalle.

## Archivos protegidos

- `docs/reference/docucore-prototype.html` — **NUNCA MODIFICAR**
- `docs/reference/REFERENCE.md` — solo actualizar con autorización
- `docs/reference/DESIGN_SYSTEM.md` — solo actualizar con autorización
