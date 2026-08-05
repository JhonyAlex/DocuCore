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
- ✅ `pnpm install` pasa
- ✅ `pnpm lint` pasa
- ✅ `pnpm build` pasa

**Próxima fase**: Fase 2 — Réplica visual completa (las 9 vistas en React)

## Vistas

| Vista | Estado | Validada |
|-------|--------|----------|
| Panel general (dashboard) | Pendiente | No |
| Proyectos | Pendiente | No |
| Activos e ítems | Pendiente | No |
| Documentos | Pendiente | No |
| Calendario | Pendiente | No |
| Planos | Pendiente | No |
| Ubicaciones | Pendiente | No |
| Historial | Pendiente | No |
| Configuración | Pendiente | No |

## Módulos

| Módulo | Estado |
|--------|--------|
| Shell (sidebar + topbar + theme) | Pendiente |
| Navegación | Pendiente |
| Datos demostrativos | Pendiente |
| CRUD Activos → PostgreSQL | Pendiente |
| Docker | Pendiente |

## Errores conocidos

Ninguno (fase 1 limpia).

## Último commit estable

Pendiente de primer commit estructurado.

## Próximo paso exacto

Implementar el shell de la aplicación (Sidebar, Topbar, Layout) y las 9 vistas en React con datos mock, replicando exactamente el HTML de referencia. Ver `docs/progress/CURRENT_STATUS.md` para detalle.

## Archivos protegidos

- `docs/reference/docucore-prototype.html` — **NUNCA MODIFICAR**
- `docs/reference/REFERENCE.md` — solo actualizar con autorización
- `docs/reference/DESIGN_SYSTEM.md` — solo actualizar con autorización
